import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { getWorkspaceRoot, setWorkspaceRoot, resolveInWorkspace, resolveReadable } from '../core/paths.mjs';
import { getSandboxPolicy, setSandboxPolicy, withSandboxPolicy, normalizeSandboxPolicy } from '../core/sandbox-policy.mjs';
import { buildSandboxLaunch, cleanCommandEnv, hostCommandEnv, windowsBrokerEnvironment, toolchainPaths, resetSandboxProbes, sandboxStatus, spawnSandboxedCommand, selectedBackend, autoBackends, srtRuntimeConfig, stopAllSandboxCommands, hasActiveSandboxCommands } from '../core/sandbox.mjs';
import { executeTool } from '../core/plugins.mjs';
import { coreTools, sandboxDenialHint } from '../core/tools.mjs';
import { windowsRuntimeConfig, windowsHelper, windowsHelperArchitecture, windowsReadableToolchains, claimWindowsSandbox, describeWindowsSandboxFailure } from '../core/windows-sandbox.mjs';
import { SandboxRuntimeConfigSchema } from '@anthropic-ai/sandbox-runtime';

function workspace(context) {
  const oldRoot = getWorkspaceRoot(), oldPolicy = getSandboxPolicy();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-sandbox-test-'));
  const root = path.join(parent, 'project');
  fs.mkdirSync(root, { recursive: true });
  setWorkspaceRoot(root); setSandboxPolicy({});
  context.after(() => { setWorkspaceRoot(oldRoot); setSandboxPolicy(oldPolicy); fs.rmSync(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  return { root, parent };
}
const tool = name => ({ ...coreTools.find(item => item.name === name), plugin: 'core' });

test('sandbox defaults cannot be weakened through invalid settings', () => {
  assert.equal(normalizeSandboxPolicy({}).mode, 'workspace-write');
  assert.equal(normalizeSandboxPolicy({}).networkAccess, true);
  assert.deepEqual(normalizeSandboxPolicy({}).allowedDomains, ['*']);
  for (const invalid of [{ mode: 'unknown' }, { backend: 'unknown' }, { networkAccess: 'false' }, { dockerImage: '--privileged' }, { dockerImage: 'image;id' }]) assert.throws(() => normalizeSandboxPolicy(invalid), { code: 'SANDBOX_CONFIG' });
  assert.equal(selectedBackend(normalizeSandboxPolicy({}), 'win32'), 'windows-native');
  assert.equal(selectedBackend(normalizeSandboxPolicy({}), 'linux'), 'bubblewrap');
  assert.equal(selectedBackend(normalizeSandboxPolicy({}), 'darwin'), 'seatbelt');
});

test('auto prefers Anthropic Sandbox Runtime and keeps the built-in profiles as fallback', () => {
  assert.deepEqual(autoBackends(normalizeSandboxPolicy({}), 'linux'), ['bubblewrap']);
  assert.deepEqual(autoBackends(normalizeSandboxPolicy({}), 'darwin'), ['seatbelt']);
  assert.deepEqual(autoBackends(normalizeSandboxPolicy({}), 'win32'), ['windows-native']);
  // Unrestricted networking uses the built-in profile; explicit domains use SRT.
  assert.deepEqual(autoBackends(normalizeSandboxPolicy({ networkAccess: true }), 'darwin'), ['seatbelt']);
  assert.deepEqual(autoBackends(normalizeSandboxPolicy({ networkAccess: true, allowedDomains: ['registry.npmjs.org:443'] }), 'linux'), ['srt', 'bubblewrap']);
});

test('Anthropic runtime config hides home and protected files but reopens the workspace and toolchains', () => {
  const policy = normalizeSandboxPolicy({ allowedDomains: ['example.com'] });
  const config = srtRuntimeConfig({ root: '/home/u/project', home: '/home/u', policy, writableHome: '/tmp/h', searchPath: '',
    entries: [{ source: '/home/u/project/.env', hidden: true }, { source: '/home/u/project/.git', hidden: false }] });
  assert.equal(SandboxRuntimeConfigSchema.safeParse(config).success, true);
  assert.deepEqual(config.network.allowedDomains, policy.allowedDomains);
  assert.deepEqual(config.filesystem.denyRead, ['/home/u', '/home/u/project/.env']);
  assert.ok(config.filesystem.allowRead.includes('/home/u/project'));
  assert.deepEqual(config.filesystem.allowWrite, ['/home/u/project', '/tmp/h']);
  assert.deepEqual(config.filesystem.denyWrite, ['/home/u/project/.git']);
  const readOnly = srtRuntimeConfig({ root: '/home/u/project', home: '/home/u', policy: { ...policy, mode: 'read-only' }, writableHome: '/tmp/h', entries: [] });
  assert.deepEqual(readOnly.filesystem.allowWrite, ['/tmp/h']);
  assert.throws(() => srtRuntimeConfig({ root: '/home/u', home: '/home/u', policy, writableHome: '/tmp/h', entries: [] }), { code: 'SANDBOX_PATH' });
});

test('Windows toolchain grants cover profile PATH tools but never the profile, MLI data or documents', { skip: process.platform !== 'win32' }, () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mli-profile-')));
  try {
    const dirs = ['AppData\\Local\\Programs\\Python\\Python312', 'AppData\\Roaming\\npm', 'AppData\\Local', 'Documents\\tools', '.ssh\\bin', 'AppData\\Roaming\\MoliCreation\\bin', 'AppData\\Roaming\\MoliCreation\\workspace\\bin'];
    for (const dir of dirs) fs.mkdirSync(path.join(home, dir), { recursive: true });
    const result = windowsReadableToolchains([...dirs.map(dir => path.join(home, dir)), home, 'C:\\Windows\\System32'].join(';'), {
      home, root: path.join(home, 'AppData\\Roaming\\MoliCreation\\workspace'), dataRoot: path.join(home, 'AppData\\Roaming\\MoliCreation') });
    assert.deepEqual(result, [path.join(home, dirs[0]), path.join(home, dirs[1])]);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('sandbox denials are explained instead of surfacing a bare access error', () => {
  const sandbox = { backend: 'windows-native', mode: 'workspace-write', networkAccess: false, allowedDomains: [] };
  assert.match(sandboxDenialHint(sandbox, 'fatal: Unable to create .git/index.lock: Permission denied'), /\.git 在沙箱中只读/);
  assert.match(sandboxDenialHint(sandbox, 'npm ERR! getaddrinfo ENOTFOUND registry.npmjs.org'), /默认禁止命令联网/);
  assert.equal(sandboxDenialHint({ ...sandbox, backend: 'host-fallback' }, 'Access is denied.'), null);
  assert.equal(sandboxDenialHint(sandbox, 'Error: test failed'), null);
});

test('host Windows launch passes the command to cmd /c exactly like Node shell: true', () => {
  const command = 'node -e "console.log(\'a b\')" && echo "done"';
  const launch = buildSandboxLaunch(command, {
    policy: normalizeSandboxPolicy({ mode: 'off' }), platform: 'win32', root: 'C:\\workspace', temporary: 'C:\\tmp',
  });
  assert.deepEqual(launch.args.slice(0, 3), ['/d', '/s', '/c']);
  // libuv quoting would turn " into \" which cmd.exe does not understand.
  assert.equal(launch.args[3], `"chcp 65001 >nul & ${command}"`);
  assert.equal(launch.windowsVerbatimArguments, true);
  assert.equal(launch.env.API_KEY, undefined);
});

test('host commands keep user context needed by npm/git but no secrets', () => {
  const source = { PATH: '/usr/bin', HOME: '/home/u', USER: 'u', LANG: 'zh_CN.UTF-8', MLI_API_KEY: 'secret', OPENAI_API_KEY: 'secret', NODE_OPTIONS: '--require x', HTTPS_PROXY: 'http://token@proxy' };
  const env = hostCommandEnv('linux', source, '/opt/node/bin:/usr/bin');
  assert.equal(env.HOME, '/home/u'); assert.equal(env.USER, 'u'); assert.equal(env.LANG, 'zh_CN.UTF-8');
  assert.equal(env.PATH, '/opt/node/bin:/usr/bin');
  for (const key of ['MLI_API_KEY', 'OPENAI_API_KEY', 'NODE_OPTIONS', 'HTTPS_PROXY']) assert.equal(env[key], undefined, key);
  const win = hostCommandEnv('win32', { SystemRoot: 'C:\\Windows', PATH: 'C:\\nodejs', USERPROFILE: 'C:\\Users\\u', APPDATA: 'C:\\Users\\u\\AppData\\Roaming', MLI_API_KEY: 'secret' });
  assert.equal(win.APPDATA, 'C:\\Users\\u\\AppData\\Roaming'); assert.equal(win.USERPROFILE, 'C:\\Users\\u'); assert.equal(win.MLI_API_KEY, undefined);
  assert.ok(win.PATH.split(';').includes('C:\\nodejs'));
});

test('auto backend never picks Docker; Linux bubblewrap keeps the real workspace path', () => {
  assert.ok(!autoBackends(normalizeSandboxPolicy({}), 'linux').includes('docker'));
  const launch = buildSandboxLaunch('pwd', { policy: normalizeSandboxPolicy({ backend: 'bubblewrap', allowedDomains: [] }), platform: 'linux', root: '/home/u/project', temporary: '/tmp/t', executable: '/usr/bin/bwrap', searchPath: '/usr/bin:/bin',
    entries: [{ relative: '.env', source: '/home/u/project/.env', directory: false, hidden: true }] });
  const bind = launch.args.indexOf('--bind');
  assert.deepEqual(launch.args.slice(bind, bind + 3), ['--bind', '/home/u/project', '/home/u/project']);
  assert.equal(launch.args[launch.args.indexOf('--chdir') + 1], '/home/u/project');
  assert.ok(launch.args.join(' ').includes('--ro-bind /dev/null /home/u/project/.env'));
  assert.ok(!launch.args.includes('/workspace'));
});

test('toolchain paths exclude home, workspace parents and credential locations', { skip: process.platform === 'win32' }, () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-toolchain-'));
  try {
    const home = fs.realpathSync(parent);
    for (const dir of ['.nvm/versions/node/v22/bin', '.local/bin', '.ssh/bin', 'project']) fs.mkdirSync(path.join(home, dir), { recursive: true });
    const result = toolchainPaths([`${home}/.nvm/versions/node/v22/bin`, `${home}/.local/bin`, `${home}/.ssh/bin`, home, `${home}/project/node_modules/.bin`].join(':'), { root: path.join(home, 'project'), home });
    assert.ok(result.includes(`${home}/.nvm/versions/node/v22`));
    assert.ok(result.includes(`${home}/.local/bin`) && !result.includes(`${home}/.local`));
    assert.ok(!result.some(item => item.includes('.ssh')));
    assert.ok(!result.includes(home)); assert.ok(!result.some(item => item.startsWith(path.join(home, 'project'))));
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

// Regression: the previous profile made dyld abort every shell (SIGABRT),
// so `auto` silently ran every command on the host.
test('macOS Seatbelt runs ordinary developer commands inside the sandbox', { skip: process.platform !== 'darwin', timeout: 60000 }, async context => {
  const { root } = workspace(context);
  resetSandboxProbes();
  const status = await sandboxStatus();
  assert.ok(['srt', 'seatbelt'].includes(status.backend), status.backend); assert.equal(status.available, true, status.reason);
  for (const command of ["printf 'bash-ok\\n'; pwd; node --version", 'ls -la >/dev/null && echo ls-ok', 'node -e "require(\'os\').userInfo(); console.log(process.cwd())"', 'echo hi > made.txt && cat made.txt', 'date >/dev/null && id -un >/dev/null && echo sys-ok']) {
    const result = await executeTool(tool('bash'), { command }, { timeoutMs: 20000 });
    assert.equal(result.status, 'ok', `${command}\n${result.content}`);
    assert.equal(result.sandbox.backend, status.backend, `${command} fell back: ${result.sandbox.reason}`);
  }
  assert.equal(fs.readFileSync(path.join(root, 'made.txt'), 'utf8').trim(), 'hi');
});

test('auto backend falls back to the host when the workspace has a hardlink, then recovers', { skip: process.platform === 'win32', timeout: 30000 }, async context => {
  const { root, parent } = workspace(context);
  resetSandboxProbes();
  const outside = path.join(parent, 'outside.txt'); fs.writeFileSync(outside, 'x');
  fs.linkSync(outside, path.join(root, 'linked.txt'));
  const fallback = await executeTool(tool('bash'), { command: 'echo fallback-ok' }, { timeoutMs: 20000 });
  assert.equal(fallback.status, 'ok', fallback.content); assert.match(fallback.content, /fallback-ok/);
  if (process.platform === 'darwin') {
    assert.equal(fallback.sandbox.backend, 'host-fallback'); assert.match(fallback.sandbox.reason, /硬链接/);
    fs.unlinkSync(path.join(root, 'linked.txt'));
    const recovered = await executeTool(tool('bash'), { command: 'echo isolated' }, { timeoutMs: 20000 });
    assert.ok(['srt', 'seatbelt'].includes(recovered.sandbox.backend), recovered.sandbox.reason);
  }
});

test('native network rules preserve deny-all and reject unsafe wildcard or malformed settings', () => {
  for (const allowedDomains of ['*', ['https://example.com'], ['example.com:65536'], ['example.com:0'], [null]]) assert.throws(() => normalizeSandboxPolicy({ allowedDomains }), { code: 'SANDBOX_CONFIG' });
  assert.deepEqual(normalizeSandboxPolicy({ allowedDomains: ['*'] }).allowedDomains, ['*']);
  const policy = normalizeSandboxPolicy({ backend: 'windows-native', networkAccess: true, allowedDomains: ['registry.npmjs.org:443', '*.github.com'] });
  const config = windowsRuntimeConfig({ root: 'C:\\Users\\owner\\project', home: 'C:\\Users\\owner', helper: 'C:\\trusted\\srt-win.exe', policy, entries: [{ source: 'C:\\Users\\owner\\project\\.env', hidden: true }, { source: 'C:\\Users\\owner\\project\\.git', hidden: false }] });
  assert.equal(SandboxRuntimeConfigSchema.safeParse(config).success, true);
  assert.deepEqual(config.network.allowedDomains, policy.allowedDomains);
  assert.equal(config.network.strictAllowlist, true);
  assert.equal(windowsRuntimeConfig({ root: 'C:\\Users\\owner\\project', home: 'C:\\Users\\owner', helper: 'C:\\trusted\\srt-win.exe', policy: normalizeSandboxPolicy({ backend: 'windows-native', networkAccess: true, allowedDomains: ['*'] }), entries: [] }).network.strictAllowlist, false);
  assert.deepEqual(config.filesystem.allowWrite, ['C:\\Users\\owner\\project']);
  assert.ok(config.filesystem.denyRead.includes('C:\\Users\\owner\\project\\.env'));
  assert.ok(!config.filesystem.denyWrite.includes('C:\\Users\\owner\\project\\.env'));
  assert.ok(config.filesystem.denyWrite.includes('C:\\Users\\owner\\project\\.git'));
  const offline = windowsRuntimeConfig({ root: 'C:\\project', home: 'C:\\Users\\owner', helper: 'C:\\trusted\\srt-win.exe', policy: { ...policy, networkAccess: false, mode: 'read-only' }, entries: [] });
  assert.deepEqual(offline.network.allowedDomains, []);
  assert.deepEqual(offline.filesystem.allowWrite, []);
  assert.ok(offline.filesystem.denyWrite.includes('C:\\project'));
  assert.throws(() => windowsRuntimeConfig({ root: 'C:\\Users\\owner', home: 'C:\\Users\\owner', helper: 'unused', policy, entries: [] }), { code: 'SANDBOX_PATH' });
});

test('switching to a backend without allowlist support cannot broaden network access', () => {
  assert.throws(() => buildSandboxLaunch('echo denied', { policy: normalizeSandboxPolicy({ backend: 'docker', networkAccess: true, allowedDomains: ['example.com'] }), platform: 'linux', root: '/project', temporary: '/tmp/trusted' }), { code: 'SANDBOX_CONFIG' });
});

test('published native Windows helper passes the pinned binary integrity check', { skip: process.platform !== 'win32' }, () => {
  assert.ok(fs.existsSync(windowsHelper().file));
});

test('32-bit compatibility client selects the native 64-bit Windows helper', () => {
  assert.equal(windowsHelperArchitecture('ia32', 'AMD64'), 'x64');
  assert.equal(windowsHelperArchitecture('ia32', 'ARM64'), 'arm64');
  assert.equal(windowsHelperArchitecture('ia32', ''), 'ia32');
});

test('native Windows commands hold an exclusive kernel claim until cleanup', { skip: process.platform !== 'win32' }, async () => {
  const release = await claimWindowsSandbox();
  try { await assert.rejects(claimWindowsSandbox(), { code: 'SANDBOX_BUSY' }); }
  finally { await release(); }
  const next = await claimWindowsSandbox();
  await next();
});

test('native Windows broker forces packaged Electron into Node mode', () => {
  const env = windowsBrokerEnvironment({
    SystemRoot: 'C:\\Windows', PATH: 'C:\\tools', USERPROFILE: 'C:\\Users\\owner',
    LOCALAPPDATA: 'C:\\Users\\owner\\AppData\\Local', APPDATA: 'C:\\Users\\owner\\AppData\\Roaming',
    ELECTRON_RUN_AS_NODE: '0', API_KEY: 'secret',
  });
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(env.LOCALAPPDATA, 'C:\\Users\\owner\\AppData\\Local');
  assert.equal(env.API_KEY, undefined);
});

test('native Windows broker keeps successful command stderr clean', { skip: process.platform !== 'win32', timeout: 30000 }, async context => {
  const { root } = workspace(context);
  const status = await sandboxStatus({ policy: normalizeSandboxPolicy({ backend: 'windows-native' }) });
  if (!status.available) { context.skip(status.reason); return; }
  const child = await spawnSandboxedCommand('echo broker-ok', { policy: normalizeSandboxPolicy({ backend: 'windows-native' }) });
  let output = '', error = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { error += chunk; });
  const [code] = await once(child, 'close');
  await child.cleanupSandbox();
  assert.equal(code, 0, error);
  assert.match(output, /broker-ok/);
  assert.doesNotMatch(error, /disk_cache|Gpu Cache|拒绝访问|Access is denied/i);
  assert.equal(fs.existsSync(path.join(root, 'broker-ok')), false);
});

// Regression: upstream reset() also revoked the broker's helper grant, so
// every session after the first failed with CreateProcessWithLogonW denied.
test('native broker keeps working across workspace switches and parallel commands', { skip: process.platform !== 'win32', timeout: 240000 }, async context => {
  const policy = normalizeSandboxPolicy({ backend: 'windows-native' });
  workspace(context);
  if (!(await sandboxStatus({ policy })).available) { context.skip('native backend is not provisioned'); return; }
  const run = async command => {
    const child = await spawnSandboxedCommand(command, { policy });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'close');
    await child.cleanupSandbox();
    return { code, output, failure: child.sandboxFailure };
  };
  for (let index = 0; index < 2; index++) {
    const { root } = workspace(context);
    const results = await Promise.all([run('echo one> one.txt'), run('echo two')]);
    for (const result of results) assert.equal(result.code, 0, `${result.output}\n${JSON.stringify(result.failure)}`);
    assert.equal(fs.readFileSync(path.join(root, 'one.txt'), 'utf8').trim(), 'one');
  }
  await stopAllSandboxCommands();
});

test('Windows launch errors are explained without blaming seclogon', () => {
  assert.match(describeWindowsSandboxFailure('srt_win_launch', 'CreateProcessWithLogonW(srt-sandbox): 拒绝访问。 (0x80070005) — ensure the Secondary Logon service (seclogon) is running.'), /无法打开沙箱 helper/);
  assert.match(describeWindowsSandboxFailure('seclogon_disabled', 'seclogon disabled'), /Secondary Logon/);
  assert.match(describeWindowsSandboxFailure('not_provisioned', ''), /安装沙箱/);
});

test('unprovisioned explicit native backend refuses execution with an actionable reason', { skip: process.platform !== 'win32', timeout: 60000 }, async context => {
  workspace(context);
  const status = await sandboxStatus();
  if (status.available) { context.skip('native backend is provisioned; use the opt-in behavioral integration test'); return; }
  assert.equal(status.backend, 'windows-native');
  assert.match(status.setupCommand, /setup-windows-sandbox/);
  assert.match(status.reason, /安装沙箱|seclogon|运行库/);
  setSandboxPolicy({ backend: 'windows-native' });
  resetSandboxProbes();
  const result = await executeTool(tool('bash'), { command: 'echo escaped > native-escape.txt' }, { timeoutMs: 30000 });
  assert.equal(result.status, 'error');
  assert.equal(result.errorDetails?.code, 'SANDBOX_UNAVAILABLE', result.content);
  assert.equal(result.canRetryWithoutSandbox, true);
  assert.equal(fs.existsSync(path.join(getWorkspaceRoot(), 'native-escape.txt')), false);
  assert.equal(hasActiveSandboxCommands(), false);
  await stopAllSandboxCommands();
});

test('auto falls back to the host when the native sandbox is not installed and says so', { skip: process.platform !== 'win32', timeout: 60000 }, async context => {
  workspace(context);
  resetSandboxProbes();
  const status = await sandboxStatus();
  if (status.available) { context.skip('native backend is provisioned'); return; }
  const result = await executeTool(tool('bash'), { command: 'echo fallback-ok' }, { timeoutMs: 30000 });
  assert.equal(result.status, 'ok', result.content);
  assert.equal(result.sandbox.backend, 'host-fallback');
  assert.ok(result.sandbox.reason);
  await stopAllSandboxCommands();
});

test('file reads, new writes and searches reject symlink escapes', async context => {
  const { root, parent } = workspace(context);
  const outside = path.join(parent, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'UNTRUSTED_ESCAPE_MARKER');
  fs.symlinkSync(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => resolveReadable('escape/secret.txt'), /符号链接/);
  assert.throws(() => resolveInWorkspace('escape/new/note.txt', { write: true }), /符号链接/);
  await assert.rejects(executeTool(tool('read_file'), { path: 'escape/secret.txt' }, {}), /符号链接/);
  const result = await executeTool(tool('grep'), { pattern: 'UNTRUSTED_ESCAPE_MARKER' }, {});
  assert.equal(result.content, '(无匹配)');
  assert.throws(() => resolveInWorkspace('../outside/secret.txt'), /越界/);
});

test('protected files and aliases cannot be read or overwritten by approved tools', async context => {
  const { root } = workspace(context);
  fs.mkdirSync(path.join(root, '.agent'));
  fs.writeFileSync(path.join(root, '.agent', 'rules.json'), '{"allow":[]}');
  fs.writeFileSync(path.join(root, '.env'), 'API_KEY=DO_NOT_EXPOSE');
  fs.writeFileSync(path.join(root, 'config.json'), 'DO_NOT_EXPOSE');
  fs.writeFileSync(path.join(root, 'service.env'), 'DO_NOT_EXPOSE');
  fs.writeFileSync(path.join(root, '.env.example'), 'API_KEY=');
  fs.symlinkSync(path.join(root, '.agent'), path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const name of ['.env', 'config.json', 'service.env', '.agent/rules.json', 'alias/rules.json']) {
    await assert.rejects(executeTool(tool('read_file'), { path: name }, {}), { code: 'SANDBOX_DENIED' });
    await assert.rejects(executeTool(tool('write_file'), { path: name, content: 'bypassed' }, {}), { code: 'SANDBOX_DENIED' });
  }
  assert.match((await executeTool(tool('read_file'), { path: '.env.example' }, {})).content, /API_KEY=/);
  assert.equal((await executeTool(tool('grep'), { pattern: 'DO_NOT_EXPOSE' }, {})).content, '(无匹配)');
  assert.equal(fs.readFileSync(path.join(root, '.agent', 'rules.json'), 'utf8'), '{"allow":[]}');
});

test('read-only isolation holds even in auto-all with an already approved write', async context => {
  const { root } = workspace(context);
  fs.writeFileSync(path.join(root, 'note.txt'), 'original');
  setSandboxPolicy({ mode: 'read-only' });
  await assert.rejects(executeTool(tool('write_file'), { path: 'note.txt', content: 'overwritten' }, { session: { id: 'auto', mode: 'auto-all' } }), { code: 'SANDBOX_DENIED' });
  // Misclassifying a tool as L0 still doesn't bypass the scoped path guard.
  await assert.rejects(executeTool({ name: 'bad-write', permission: 'L0', run: () => fs.writeFileSync(resolveInWorkspace('note.txt', { write: true }), 'overwritten') }, {}, {}), { code: 'SANDBOX_DENIED' });
  assert.equal(fs.readFileSync(path.join(root, 'note.txt'), 'utf8'), 'original');
  assert.match((await executeTool(tool('read_file'), { path: 'note.txt' }, {})).content, /original/);
  // A human using the file UI is outside the model tool execution scope.
  assert.equal(resolveInWorkspace('manual.txt', { write: true }), path.join(root, 'manual.txt'));
});

test('hardlink aliases cannot bypass private path policy', async context => {
  const { root, parent } = workspace(context);
  const secret = path.join(parent, 'outside-secret.txt'); fs.writeFileSync(secret, 'private');
  fs.linkSync(secret, path.join(root, 'alias.txt'));
  await assert.rejects(executeTool(tool('read_file'), { path: 'alias.txt' }, {}), /硬链接/);
  await assert.rejects(executeTool(tool('write_file'), { path: 'alias.txt', content: 'damage' }, {}), /硬链接/);
  assert.equal(fs.readFileSync(secret, 'utf8'), 'private');
});

test('explicitly selected unavailable backend fails closed without executing a host command', async context => {
  const { parent } = workspace(context);
  const target = path.join(parent, 'escaped.txt');
  const policy = normalizeSandboxPolicy({ backend: process.platform === 'darwin' ? 'bubblewrap' : 'seatbelt' });
  await assert.rejects(spawnSandboxedCommand(`echo escaped > "${target}"`, { policy }), { code: 'SANDBOX_UNAVAILABLE' });
  assert.equal(fs.existsSync(target), false);
  const status = await sandboxStatus({ policy });
  assert.equal(status.available, false); assert.equal(status.failClosed, true);
});

test('auto backend can use the authorized host shell when isolation is unavailable', async context => {
  const { root } = workspace(context);
  const target = path.join(root, 'auto-fallback.txt');
  const child = await spawnSandboxedCommand(`echo fallback > "${target}"`, { policy: normalizeSandboxPolicy({ backend: 'auto' }) });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  await child.cleanupSandbox();
  assert.equal(fs.readFileSync(target, 'utf8').trim(), 'fallback');
  assert.ok(['seatbelt', 'bubblewrap', 'docker', 'host-fallback', 'windows-native', 'host-network'].includes(child.sandbox.backend));
});

test('Docker launch isolates filesystem, credentials, processes and default network', () => {
  const policy = normalizeSandboxPolicy({ backend: 'docker', networkAccess: false, allowedDomains: [] });
  const command = 'echo "$(touch /outside)"; cat /workspace/.env';
  const launch = buildSandboxLaunch(command, { policy, platform: 'linux', root: '/project with spaces', temporary: '/trusted-temp', executable: '/usr/bin/docker', entries: [
    { relative: '.agent', source: '/project with spaces/.agent', directory: true, hidden: true },
    { relative: '.env', source: '/project with spaces/.env', directory: false, hidden: true },
    { relative: '.git', source: '/project with spaces/.git', directory: true, hidden: false },
  ] });
  assert.equal(launch.args.at(-1), command); // no host shell interpolates this string
  for (const flag of ['--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pull=never', '--init', '--pids-limit=128']) assert.ok(launch.args.includes(flag), flag);
  assert.equal(launch.args[launch.args.indexOf('--network') + 1], 'none');
  assert.ok(launch.args.includes('type=bind,source=/trusted-temp/empty,target=/workspace/.env,readonly'));
  assert.ok(launch.args.includes('type=bind,source=/project with spaces/.git,target=/workspace/.git,readonly'));
  assert.ok(!launch.args.some(arg => arg.includes('docker.sock') || arg.includes('privileged') && !arg.includes('no-new-privileges')));
  assert.ok(!launch.args.includes('--pid=host'));
});

test('child environment strips credentials and preload variables', () => {
  const env = cleanCommandEnv('win32', { SystemRoot: 'C:\\Windows', PATH: 'C:\\tools;.;relative', API_KEY: 'secret', NODE_OPTIONS: '--require evil.js', LD_PRELOAD: 'evil.so', HTTPS_PROXY: 'token' });
  for (const key of ['API_KEY', 'NODE_OPTIONS', 'LD_PRELOAD', 'HTTPS_PROXY']) assert.equal(env[key], undefined);
  assert.ok(!env.PATH.split(';').includes('.')); assert.ok(!env.PATH.includes('relative'));
});

test('explicitly disabled sandbox still cleans environment and observes timeout and cancellation', { timeout: 15000 }, async context => {
  const { root } = workspace(context);
  setSandboxPolicy({ mode: 'off' });
  const normal = await executeTool(tool('bash'), { command: 'echo lifecycle-ok' }, { timeoutMs: 1000 });
  assert.equal(normal.status, 'ok'); assert.match(normal.content, /lifecycle-ok/); assert.equal(normal.sandbox.backend, 'none');
  const command = process.platform === 'win32' ? 'ping -n 20 127.0.0.1 >nul & echo escaped > late.txt' : 'sleep 20; echo escaped > late.txt';
  const timed = await executeTool(tool('bash'), { command, timeout_ms: 150 }, { timeoutMs: 1000 });
  assert.equal(timed.status, 'error'); assert.match(timed.content, /超时/); assert.equal(fs.existsSync(path.join(root, 'late.txt')), false);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 150);
  try {
    const aborted = await executeTool(tool('bash'), { command }, { timeoutMs: 5000, signal: abort.signal });
    assert.equal(aborted.status, 'error'); assert.match(aborted.content, /已停止/);
  } finally { clearTimeout(timer); }
  assert.equal(fs.existsSync(path.join(root, 'late.txt')), false);
});

test('sandbox execution scopes do not leak into unrelated concurrent work', async context => {
  workspace(context);
  const work = withSandboxPolicy(normalizeSandboxPolicy({ mode: 'read-only' }), async () => {
    await Promise.resolve(); assert.throws(() => resolveInWorkspace('a.txt', { write: true }), { code: 'SANDBOX_DENIED' });
  });
  assert.doesNotThrow(() => resolveInWorkspace('b.txt', { write: true }));
  await work;
});

test('normal runtime shutdown waits for active sandbox command cleanup', { timeout: 10000 }, async context => {
  const { root } = workspace(context);
  const command = process.platform === 'win32' ? 'ping -n 20 127.0.0.1 >nul & echo escaped > late.txt' : 'sleep 20; echo escaped > late.txt';
  const child = await spawnSandboxedCommand(command, { policy: normalizeSandboxPolicy({ mode: 'off' }) });
  const closed = once(child, 'close');
  assert.equal(hasActiveSandboxCommands(), true);
  await stopAllSandboxCommands(); await closed;
  assert.equal(hasActiveSandboxCommands(), false);
  assert.equal(fs.existsSync(path.join(root, 'late.txt')), false);
});

// Opt in on a machine with the actual backend. These are behavioral escape
// attempts, not assertions that an argument list merely contains flags.
test('real sandbox blocks host reads, protected files, host writes, localhost and background processes', { timeout: 60000, skip: !process.env.MLI_SANDBOX_INTEGRATION }, async context => {
  const { root, parent } = workspace(context);
  setSandboxPolicy({ backend: process.env.MLI_SANDBOX_INTEGRATION });
  const status = await sandboxStatus(); assert.equal(status.available, true, status.reason);
  const native = selectedBackend() === 'windows-native';
  if (native) assert.equal(status.probe, 'process-and-wfp');
  const outside = path.join(parent, 'host-secret.txt'); fs.writeFileSync(outside, 'HOST_SECRET');
  fs.writeFileSync(path.join(root, '.env'), 'WORKSPACE_SECRET');
  const read = await executeTool(tool('bash'), { command: native ? 'type .env' : 'cat .env' }, { timeoutMs: 15000 });
  assert.ok(!read.content.includes('WORKSPACE_SECRET'));
  const escaped = await executeTool(tool('bash'), { command: native ? `type "${outside}"` : `cat '${outside.replaceAll('\\', '/')}'` }, { timeoutMs: 15000 });
  assert.ok(!escaped.content.includes('HOST_SECRET'));
  await executeTool(tool('bash'), { command: native ? `echo damaged > "${outside}"` : `echo damaged > '${outside.replaceAll('\\', '/')}'` }, { timeoutMs: 15000 });
  assert.equal(fs.readFileSync(outside, 'utf8'), 'HOST_SECRET');
  const server = http.createServer((req, res) => res.end('HOST_NETWORK_SECRET'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => new Promise(resolve => server.close(resolve)));
  const networkCommand = native ? `powershell.exe -NoProfile -Command "$c = New-Object Net.Sockets.TcpClient; try { $t = $c.ConnectAsync('127.0.0.1', ${server.address().port}); if (!$t.Wait(1000)) { exit 1 }; if ($c.Connected) { exit 0 }; exit 1 } catch { exit 1 }"` : `python3 -c 'import socket; print(socket.create_connection(("127.0.0.1", ${server.address().port}), 1))'`;
  const network = await executeTool(tool('bash'), { command: networkCommand }, { timeoutMs: 15000 });
  assert.equal(network.status, 'error');
  const allowed = await executeTool(tool('bash'), { command: 'echo allowed > allowed.txt' }, { timeoutMs: 15000 });
  assert.equal(allowed.status, 'ok'); assert.match(fs.readFileSync(path.join(root, 'allowed.txt'), 'utf8'), /allowed/);
  if (native) fs.writeFileSync(path.join(root, 'background.ps1'), 'Start-Sleep -Seconds 2; Set-Content background.txt survived');
  const background = native ? 'start "" /b powershell.exe -NoProfile -File background.ps1 >nul 2>&1 & echo foreground' : '(sleep 1; echo survived > background.txt) >/dev/null 2>&1 & echo foreground';
  await executeTool(tool('bash'), { command: background }, { timeoutMs: 15000 });
  await new Promise(resolve => setTimeout(resolve, native ? 2250 : 1250));
  assert.equal(fs.existsSync(path.join(root, 'background.txt')), false);
  if (native) {
    const timed = await executeTool(tool('bash'), { command: 'ping -n 20 127.0.0.1 >nul & echo escaped > timeout.txt', timeout_ms: 150 }, { timeoutMs: 1000 });
    assert.equal(timed.status, 'error'); assert.match(timed.content, /超时/);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(fs.existsSync(path.join(root, 'timeout.txt')), false);
    assert.equal(hasActiveSandboxCommands(), false);
  }
  setSandboxPolicy({ backend: process.env.MLI_SANDBOX_INTEGRATION, mode: 'read-only' });
  const denied = await executeTool(tool('bash'), { command: 'echo overwritten > allowed.txt' }, { timeoutMs: 15000 });
  assert.equal(denied.status, 'error'); assert.match(fs.readFileSync(path.join(root, 'allowed.txt'), 'utf8'), /allowed/);
});
