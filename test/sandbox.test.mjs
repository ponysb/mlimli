import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { getWorkspaceRoot, setWorkspaceRoot, resolveInWorkspace, resolveReadable } from '../core/paths.mjs';
import { getSandboxPolicy, setSandboxPolicy, withSandboxPolicy, normalizeSandboxPolicy } from '../core/sandbox-policy.mjs';
import { buildSandboxLaunch, cleanCommandEnv, sandboxStatus, spawnSandboxedCommand, selectedBackend, stopAllSandboxCommands, hasActiveSandboxCommands } from '../core/sandbox.mjs';
import { executeTool } from '../core/plugins.mjs';
import { coreTools } from '../core/tools.mjs';
import { windowsRuntimeConfig, windowsHelper, claimWindowsSandbox } from '../core/windows-sandbox.mjs';
import { SandboxRuntimeConfigSchema } from '@anthropic-ai/sandbox-runtime';

function workspace(context) {
  const oldRoot = getWorkspaceRoot(), oldPolicy = getSandboxPolicy();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-sandbox-test-'));
  const root = path.join(parent, 'project');
  setWorkspaceRoot(root); setSandboxPolicy({});
  context.after(() => { setWorkspaceRoot(oldRoot); setSandboxPolicy(oldPolicy); fs.rmSync(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  return { root, parent };
}
const tool = name => ({ ...coreTools.find(item => item.name === name), plugin: 'core' });

test('sandbox defaults cannot be weakened through invalid settings', () => {
  assert.equal(normalizeSandboxPolicy({}).mode, 'workspace-write');
  assert.equal(normalizeSandboxPolicy({}).networkAccess, false);
  for (const invalid of [{ mode: 'unknown' }, { backend: 'unknown' }, { networkAccess: 'false' }, { dockerImage: '--privileged' }, { dockerImage: 'image;id' }]) assert.throws(() => normalizeSandboxPolicy(invalid), { code: 'SANDBOX_CONFIG' });
  assert.equal(selectedBackend(normalizeSandboxPolicy({}), 'win32'), 'windows-native');
  assert.equal(selectedBackend(normalizeSandboxPolicy({}), 'linux'), 'bubblewrap');
  assert.equal(selectedBackend(normalizeSandboxPolicy({}), 'darwin'), 'seatbelt');
});

test('native network rules preserve deny-all and reject unsafe wildcard or malformed settings', () => {
  for (const allowedDomains of ['*', ['*'], ['https://example.com'], ['example.com:65536'], ['example.com:0'], [null]]) assert.throws(() => normalizeSandboxPolicy({ allowedDomains }), { code: 'SANDBOX_CONFIG' });
  const policy = normalizeSandboxPolicy({ backend: 'windows-native', networkAccess: true, allowedDomains: ['registry.npmjs.org:443', '*.github.com'] });
  const config = windowsRuntimeConfig({ root: 'C:\\Users\\owner\\project', home: 'C:\\Users\\owner', helper: 'C:\\trusted\\srt-win.exe', policy, entries: [{ source: 'C:\\Users\\owner\\project\\.env', hidden: true }, { source: 'C:\\Users\\owner\\project\\.git', hidden: false }] });
  assert.equal(SandboxRuntimeConfigSchema.safeParse(config).success, true);
  assert.deepEqual(config.network.allowedDomains, policy.allowedDomains);
  assert.equal(config.network.strictAllowlist, true);
  assert.deepEqual(config.filesystem.allowWrite, ['C:\\Users\\owner\\project']);
  assert.ok(config.filesystem.denyRead.includes('C:\\Users\\owner\\project\\.env'));
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

test('native Windows commands hold an exclusive kernel claim until cleanup', { skip: process.platform !== 'win32' }, async () => {
  const release = await claimWindowsSandbox();
  try { await assert.rejects(claimWindowsSandbox(), { code: 'SANDBOX_BUSY' }); }
  finally { await release(); }
  const next = await claimWindowsSandbox();
  await next();
});

test('unprovisioned native backend refuses execution and cleans up its broker', { skip: process.platform !== 'win32', timeout: 20000 }, async context => {
  workspace(context);
  const status = await sandboxStatus();
  if (status.available) { context.skip('native backend is provisioned; use the opt-in behavioral integration test'); return; }
  assert.equal(status.backend, 'windows-native');
  assert.match(status.setupCommand, /setup-windows-sandbox/);
  const result = await executeTool(tool('bash'), { command: 'echo escaped > native-escape.txt' }, { timeoutMs: 10000 });
  assert.equal(result.status, 'error');
  assert.equal(fs.existsSync(path.join(getWorkspaceRoot(), 'native-escape.txt')), false);
  assert.equal(hasActiveSandboxCommands(), false);
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

test('unavailable or incompatible backend fails closed without executing a host command', async context => {
  const { parent } = workspace(context);
  const target = path.join(parent, 'escaped.txt');
  const policy = normalizeSandboxPolicy({ backend: process.platform === 'darwin' ? 'bubblewrap' : 'seatbelt' });
  await assert.rejects(spawnSandboxedCommand(`echo escaped > "${target}"`, { policy }), { code: 'SANDBOX_UNAVAILABLE' });
  assert.equal(fs.existsSync(target), false);
  const status = await sandboxStatus({ policy });
  assert.equal(status.available, false); assert.equal(status.failClosed, true);
});

test('Docker launch isolates filesystem, credentials, processes and default network', () => {
  const policy = normalizeSandboxPolicy({ backend: 'docker' });
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
  setSandboxPolicy({ backend: process.env.MLI_SANDBOX_INTEGRATION, mode: 'read-only' });
  const denied = await executeTool(tool('bash'), { command: 'echo overwritten > allowed.txt' }, { timeoutMs: 15000 });
  assert.equal(denied.status, 'error'); assert.match(fs.readFileSync(path.join(root, 'allowed.txt'), 'utf8'), /allowed/);
});
