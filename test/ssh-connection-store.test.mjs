import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net, { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { withRunContext } from '../core/run-context.mjs';
import { coreTools } from '../core/tools.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-ssh-store-'));
process.env.MLI_AGENT_DATA_DIR = root;
const store = await import('../core/ssh-connection-store.mjs');
let testQueue = Promise.resolve();
function runSerial(callback) {
  const current = testQueue.then(callback, callback);
  testQueue = current.catch(() => {});
  return current;
}

test('SSH connection storage validates inputs, redacts key details, and pins only observed fingerprints', () => runSerial(() => {
  const connection = store.saveSshConnection({ name: 'dev', host: 'localhost', port: 2222, username: 'pony', authMode: 'key', privateKeyPath: path.join(root, 'id_ed25519') });
  assert.equal(connection.hostKeyFingerprint, null);
  assert.equal(JSON.stringify(store.listSshConnections()).includes('privateKeyPath'), false);
  assert.throws(() => store.saveSshConnection({ name: 'bad', host: 'host;touch /tmp/pwned', username: 'pony', authMode: 'agent' }), /主机名/);
  assert.throws(() => store.confirmSshHostKey(connection.id, 'SHA256:bad', 'SHA256:expected'), /不一致/);
  const pinned = store.confirmSshHostKey(connection.id, 'SHA256:expected', 'SHA256:expected');
  assert.equal(pinned.hostKeyFingerprint, 'SHA256:expected');
  assert.equal(store.setSshWorkspaceRoot(connection.id, '/home/pony/project').workspaceRoot, '/home/pony/project');
  const edited = store.saveSshConnection({ ...connection, host: 'other.example.com' });
  assert.equal(edited.hostKeyFingerprint, null);
  assert.equal(edited.workspaceRoot, null);
  store.confirmSshHostKey(connection.id, 'SHA256:new-host', 'SHA256:new-host');
  const disk = fs.readFileSync(store.sshConnectionStorePath(), 'utf8');
  assert.match(disk, /privateKeyPath/);
  assert.doesNotMatch(disk, /BEGIN OPENSSH PRIVATE KEY|passphrase|token/i);
  assert.equal(store.deleteSshConnection(connection.id), true);
  assert.equal(store.listSshConnections().some(item => item.id === connection.id), false);
}));

test('SSH connection storage file is user-private', () => runSerial(() => {
  const stat = fs.statSync(store.sshConnectionStorePath());
  assert.equal(stat.mode & 0o077, 0);
}));

test('SSH runtime rejects untrusted and changed host keys, then opens a real OpenSSH PTY after pinning', { timeout: 60000 }, async context => {
  const sshd = '/usr/sbin/sshd';
  if (!fs.existsSync(sshd) || process.platform !== 'darwin' && process.getuid?.() !== 0) return context.skip('real sshd integration needs macOS OpenSSH or root Linux');
  return runSerial(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-ssh-sshd-'));
  const configFile = path.join(temp, 'sshd_config');
  const hostKey = path.join(temp, 'host_ed25519');
  const replacementHostKey = path.join(temp, 'host_ed25519_replacement');
  const userKey = path.join(temp, 'user_ed25519');
  const authorizedKeys = path.join(temp, 'authorized_keys');
  const logFile = path.join(temp, 'sshd.log');
  const freePort = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
  const username = os.userInfo().username;
  function run(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'ignore' });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
    });
  }
  await run('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', hostKey]);
  await run('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', userKey]);
  fs.copyFileSync(`${userKey}.pub`, authorizedKeys);
  fs.chmodSync(authorizedKeys, 0o600);
  fs.writeFileSync(configFile, [
    `Port ${freePort}`, 'ListenAddress 127.0.0.1', `HostKey ${hostKey}`,
    'PidFile none', 'LogLevel VERBOSE', 'PubkeyAuthentication yes', 'PasswordAuthentication no',
    'KbdInteractiveAuthentication no', 'UsePAM no', `AuthorizedKeysFile ${authorizedKeys}`,
    'PermitRootLogin prohibit-password', 'StrictModes no', 'AllowAgentForwarding no', 'AllowTcpForwarding no', 'PermitTTY yes',
    'X11Forwarding no', 'PrintMotd no', 'Subsystem sftp internal-sftp',
  ].join('\n'));
  const children = [];
  let runtime;
  const spawnSshd = () => {
    const processHandle = spawn(sshd, ['-D', '-e', '-f', configFile], { stdio: ['ignore', 'ignore', fs.openSync(logFile, 'a')], detached: true });
    children.push(processHandle);
    return processHandle;
  };
  let child = spawnSshd();
  context.after(async () => {
    runtime?.shutdownSshRuntime();
    for (const processHandle of children) {
      try { process.kill(-processHandle.pid, 'SIGTERM'); } catch {}
      if (processHandle.exitCode === null) await Promise.race([once(processHandle, 'exit').catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
    }
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    try { await new Promise((resolve, reject) => { const socket = net.createConnection(freePort, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve(); }); socket.once('error', reject); }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  const connection = store.saveSshConnection({ name: 'sshd test', host: '127.0.0.1', port: freePort, username, authMode: 'key', privateKeyPath: userKey });
  runtime = await import('../core/ssh-runtime.mjs');
  const observed = await runtime.inspectSshHost(connection.id);
  assert.equal(observed.trusted, false);
  assert.throws(() => store.confirmSshHostKey(connection.id, 'SHA256:wrong', observed.fingerprint), /不一致/);
  assert.equal(await assert.rejects(runtime.connectSsh(connection.id), /请先检查并确认/), undefined);
  store.confirmSshHostKey(connection.id, observed.fingerprint, observed.fingerprint);
  await runtime.connectSsh(connection.id);
  const provider = await import('../core/ssh-workspace-provider.mjs');
  const projectRoot = path.join(temp, '远端 project');
  fs.mkdirSync(projectRoot);
  fs.writeFileSync(path.join(projectRoot, 'README.md'), 'remote source\n');
  fs.writeFileSync(path.join(projectRoot, '.env'), 'REMOTE_SECRET=hidden\n');
  fs.writeFileSync(path.join(projectRoot, 'large.txt'), 'x'.repeat(600 * 1024));
  fs.mkdirSync(path.join(projectRoot, 'src'));
  fs.writeFileSync(path.join(projectRoot, 'src', 'main.js'), 'const value = 1;\n');
  fs.mkdirSync(path.join(projectRoot, 'nested-secret'));
  fs.writeFileSync(path.join(projectRoot, 'nested-secret', '.env'), 'SHOULD_STAY=1\n');
  fs.mkdirSync(path.join(projectRoot, 'growing-tree'));
  fs.writeFileSync(path.join(projectRoot, 'growing-tree', 'safe.txt'), 'safe');
  fs.mkdirSync(path.join(projectRoot, 'linked-tree'));
  fs.symlinkSync(path.join(temp, 'outside.txt'), path.join(projectRoot, 'linked-tree', 'escape'));
  fs.symlinkSync(path.join(temp, 'outside.txt'), path.join(projectRoot, 'escape.txt'));
  fs.writeFileSync(path.join(temp, 'outside.txt'), 'outside');
  const realProjectRoot = fs.realpathSync(projectRoot);
  const checked = await provider.validateSshWorkspacePath(connection.id, realProjectRoot);
  assert.equal(checked.workspaceRoot, realProjectRoot);
  const browsed = await provider.browseSshWorkspacePath(connection.id, realProjectRoot);
  assert.deepEqual(browsed.entries.map(item => item.name), ['growing-tree', 'linked-tree', 'nested-secret', 'src']);
  await assert.rejects(provider.browseSshWorkspacePath(connection.id, realProjectRoot + '/escape.txt'), /符号链接|真实路径/);
  const selectedRoot = await provider.setSshWorkspaceRoot(connection.id, realProjectRoot);
  assert.equal(selectedRoot.workspaceRoot, realProjectRoot);
  const directory = await provider.listSshWorkspaceDirectory(connection.id, '');
  assert.deepEqual(directory.entries.map(item => item.name), ['growing-tree', 'linked-tree', 'nested-secret', 'src', 'large.txt', 'README.md']);
  assert.equal((await provider.readSshWorkspaceFile(connection.id, 'README.md')).content, 'remote source\n');
  await provider.writeSshWorkspaceFile(connection.id, 'README.md', 'updated remotely\n');
  assert.equal((await provider.readSshWorkspaceFile(connection.id, 'README.md')).content, 'updated remotely\n');
  const command = await provider.execSshCommand(connection.id, 'pwd && printf AGENT_REMOTE_OK');
  assert.equal(command.status, 'exited');
  assert.equal(command.code, 0);
  assert.match(command.stdout, /AGENT_REMOTE_OK/);
  const files = await provider.findSshWorkspaceFiles(connection.id, { pattern: '*.md' });
  assert.deepEqual(files, ['README.md']);
  await provider.renameSshWorkspaceItem(connection.id, 'src/main.js', 'app.js');
  await provider.createSshWorkspaceDirectory(connection.id, 'src/lib');
  await provider.moveSshWorkspaceItem(connection.id, 'src/app.js', 'src/lib');
  assert.equal((await provider.readSshWorkspaceFile(connection.id, 'src/lib/app.js')).content, 'const value = 1;\n');
  await assert.rejects(provider.deleteSshWorkspaceItem(connection.id, 'nested-secret'), /受保护/);
  assert.equal(fs.existsSync(path.join(projectRoot, 'nested-secret', '.env')), true);
  const sftp = await runtime.getSshSftpClient(connection.id);
  const originalReaddir = sftp.readdir.bind(sftp);
  sftp.readdir = (directory, callback) => {
    if (directory === path.posix.join(realProjectRoot, 'growing-tree')) return callback(null, [{ filename: 'safe.txt' }, { filename: '.env' }]);
    return originalReaddir(directory, callback);
  };
  try {
    await assert.rejects(provider.deleteSshWorkspaceItem(connection.id, 'growing-tree'), /受保护/);
    assert.equal(fs.readFileSync(path.join(projectRoot, 'growing-tree', 'safe.txt'), 'utf8'), 'safe');
  } finally { sftp.readdir = originalReaddir; }
  await assert.rejects(provider.deleteSshWorkspaceItem(connection.id, 'linked-tree'), /符号链接/);
  assert.equal(fs.existsSync(path.join(projectRoot, 'linked-tree')), true);
  await provider.deleteSshWorkspaceItem(connection.id, 'src/lib');
  assert.equal(fs.existsSync(path.join(projectRoot, 'src', 'lib')), false);
  const matches = await provider.searchSshWorkspaceFiles(connection.id, { pattern: 'AGENT_REMOTE_OK' });
  assert.deepEqual(matches, []);
  const remoteContext = { remoteWorkspace: { kind: 'ssh', connectionId: connection.id, remotePath: realProjectRoot, name: 'sshd test' } };
  const readTool = coreTools.find(tool => tool.name === 'read_file');
  const readResult = await withRunContext(remoteContext, () => readTool.run({ path: 'README.md' }));
  assert.match(readResult.content, /updated remotely/);
  const writeTool = coreTools.find(tool => tool.name === 'write_file');
  await withRunContext(remoteContext, () => writeTool.run({ path: 'agent.txt', content: 'written by agent' }));
  assert.equal(fs.readFileSync(path.join(projectRoot, 'agent.txt'), 'utf8'), 'written by agent');
  const bashTool = coreTools.find(tool => tool.name === 'bash');
  const bashResult = await withRunContext(remoteContext, () => bashTool.run({ command: 'printf AGENT_BASH_OK' }, { bashTimeoutMs: 5000 }));
  assert.match(bashResult.content, /AGENT_BASH_OK/);
  assert.equal(bashResult.status, 'ok');
  await assert.rejects(provider.readSshWorkspaceFile(connection.id, '.env'), /受保护/);
  await assert.rejects(provider.readSshWorkspaceFile(connection.id, 'escape.txt'), /符号链接/);
  await assert.rejects(provider.readSshWorkspaceFile(connection.id, 'large.txt'), /512 KB/);
  await assert.rejects(provider.readSshWorkspaceFile(connection.id, '../outside.txt'), /超出工作区/);
  for (const name of ['.env', '.gitattributes', '.git', 'agent.txt', 'escape.txt', 'filter-ran', 'filter.sh', 'large.txt', 'growing-tree', 'linked-tree', 'nested-secret', 'src/lib']) {
    fs.rmSync(path.join(projectRoot, name), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'src/main.js'), 'const value = 1;\n');
  const filterMarker = path.join(projectRoot, 'filter-ran');
  const filterScript = path.join(projectRoot, 'filter.sh');
  fs.writeFileSync(filterScript, `#!/bin/sh\ntouch '${filterMarker}'\ncat\n`, { mode: 0o700 });
  const gitInit = await provider.execSshCommand(connection.id, 'git init -q && git config user.email test@example.com && git config user.name Tester && git -c core.hooksPath=/dev/null add README.md src/main.js filter.sh && git -c core.hooksPath=/dev/null commit -qm init');
  assert.equal(gitInit.code, 0);
  const filterSetup = await provider.execSshCommand(connection.id, "git config filter.mli-test.clean './filter.sh'");
  assert.equal(filterSetup.code, 0);
  assert.equal(fs.existsSync(filterMarker), false, 'configuring test filter should not run it');
  fs.writeFileSync(path.join(projectRoot, '.git/info/attributes'), '* filter=mli-test\n');
  await provider.writeSshWorkspaceFile(connection.id, 'src/main.js', 'const value = 2;\n');
  const filterConfig = await provider.execSshCommand(connection.id, `git config --name-only --get-regexp '^filter\\..*\\.(clean|smudge|process)$'`);
  assert.match(filterConfig.stdout, /filter\.mli-test\.clean/);
  assert.equal(fs.existsSync(filterMarker), false, 'reading Git config should not run the filter');
  const safeStatus = await provider.execSshCommand(connection.id, `git -c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.pager=cat -c core.attributesFile=/dev/null -c filter.mli-test.clean= -C '${realProjectRoot}' status --short`);
  assert.equal(safeStatus.code, 0);
  assert.equal(fs.existsSync(filterMarker), false);
  let gitState = await provider.readSshGitInfo(connection.id);
  assert.equal(fs.existsSync(filterMarker), false);
  assert.deepEqual(gitState.changes.map(change => change.path), ['src/main.js']);
  let gitAction = await provider.runSshGitAction(connection.id, { action: 'diff', path: 'src/main.js' });
  assert.match(gitAction.diff, /const value = 2/);
  gitState = await provider.runSshGitAction(connection.id, { action: 'stage', paths: ['src/main.js'] });
  assert.equal(fs.existsSync(filterMarker), false);
  assert.equal(gitState.changes[0].indexStatus, 'M');
  gitState = await provider.runSshGitAction(connection.id, { action: 'commit', message: '远端更新' });
  assert.equal(gitState.changes.length, 0);
  gitState = await provider.runSshGitAction(connection.id, { action: 'branch-create', name: 'feature/remote-workspace' });
  assert.equal(gitState.branch, 'feature/remote-workspace');
  await provider.writeSshWorkspaceFile(connection.id, 'README.md', 'dirty before pull');
  await assert.rejects(provider.runSshGitAction(connection.id, { action: 'pull', remote: 'origin' }), /未提交.*变更/);
  await provider.writeSshWorkspaceFile(connection.id, 'README.md', 'updated remotely\n');
  const git = await provider.updateSshGitRemote(connection.id, { action: 'add', name: 'origin', url: 'https://github.com/org/repo.git' });
  assert.deepEqual(git.remotes, [{ name: 'origin', url: 'https://github.com/org/repo.git' }]);
  const selfHosted = await provider.updateSshGitRemote(connection.id, { action: 'set-url', name: 'origin', url: 'ssh://git@code.example:2222/team/repo.git' });
  assert.equal(selfHosted.remotes[0].url, 'ssh://git@code.example:2222/team/repo.git');
  await assert.rejects(provider.updateSshGitRemote(connection.id, { action: 'set-url', name: 'origin', url: 'https://user:token@git.example/team/repo.git' }), /不能包含密码/);
  const removed = await provider.updateSshGitRemote(connection.id, { action: 'remove', name: 'origin' });
  assert.deepEqual(removed.remotes, []);
  await assert.rejects(provider.setSshWorkspaceRoot(connection.id, '/'), /根目录.*设为工作区/);
  const linkedRoot = path.join(temp, 'project-link');
  fs.symlinkSync(projectRoot, linkedRoot);
  await assert.rejects(provider.setSshWorkspaceRoot(connection.id, linkedRoot), /符号链接/);
  const metrics = await provider.readSshServerMetrics(connection.id);
  assert.equal(typeof metrics.supported, 'boolean');
  const events = [];
  const dispose = runtime.onSshTerminalEvent(value => events.push(value));
  const terminal = runtime.startSshTerminal(connection.id, { cols: 100, rows: 30, cwd: realProjectRoot });
  const waitForEvent = async predicate => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const found = events.find(predicate);
      if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail(`SSH event timeout: ${JSON.stringify(events)}\n${fs.readFileSync(logFile, 'utf8')}`);
  };
  await waitForEvent(value => value.type === 'terminal_started' && value.terminalId === terminal.terminalId);
  runtime.writeSshTerminal(connection.id, terminal.terminalId, 'pwd\n');
  const workingDirectory = await waitForEvent(value => value.type === 'terminal_output' && value.text.includes(realProjectRoot));
  assert.match(workingDirectory.text, new RegExp(realProjectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  runtime.writeSshTerminal(connection.id, terminal.terminalId, 'printf "SSH_PTY_OK\\n"\n');
  await waitForEvent(value => value.type === 'terminal_output' && value.text.includes('SSH_PTY_OK'));
  runtime.writeSshTerminal(connection.id, terminal.terminalId, 'stty size\n');
  const initialSize = await waitForEvent(value => value.type === 'terminal_output' && /30\s+100/.test(value.text));
  assert.match(initialSize.text, /30\s+100/);
  runtime.resizeSshTerminal(connection.id, terminal.terminalId, 120, 40);
  runtime.writeSshTerminal(connection.id, terminal.terminalId, 'stty size\n');
  const resized = await waitForEvent(value => value.type === 'terminal_output' && /40\s+120/.test(value.text));
  assert.match(resized.text, /40\s+120/);
  runtime.writeSshTerminal(connection.id, terminal.terminalId, 'sleep 30\n');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(runtime.stopSshTerminal(connection.id, terminal.terminalId), true);
  await waitForEvent(value => value.type === 'terminal_exit' && value.terminalId === terminal.terminalId);
  runtime.closeSshConnection(connection.id);
  dispose();
  assert.deepEqual(runtime.listActiveSshConnections(), []);
  assert.equal(runtime.writeSshTerminal(connection.id, terminal.terminalId, 'echo SHOULD_NOT_RUN\n'), false);
  await run('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', replacementHostKey]);
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  await once(child, 'exit');
  fs.writeFileSync(configFile, fs.readFileSync(configFile, 'utf8').replace(hostKey, replacementHostKey));
  child = spawnSshd();
  const restartDeadline = Date.now() + 5000;
  while (Date.now() < restartDeadline) {
    try { await new Promise((resolve, reject) => { const socket = net.createConnection(freePort, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve(); }); socket.once('error', reject); }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  const changed = await runtime.inspectSshHost(connection.id);
  assert.equal(changed.changed, true);
  assert.notEqual(changed.fingerprint, observed.fingerprint);
  await assert.rejects(runtime.connectSsh(connection.id), /主机指纹校验失败/);
  assert.match(fs.readFileSync(logFile, 'utf8'), /Accepted publickey/);
  });
});
