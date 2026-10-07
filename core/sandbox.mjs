import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { getWorkspaceRoot, DATA_ROOT, isInside } from './paths.mjs';
import { stopProcessTree } from './process-tree.mjs';
import { getSandboxPolicy, normalizeSandboxPolicy, setSandboxPolicy, toolSandboxPolicy, SandboxError, PRIVATE_DIRS, READ_ONLY_DIRS, privateFile } from './sandbox-policy.mjs';
import { windowsHelper, windowsSandboxStatus, windowsRuntimeConfig, claimWindowsSandbox } from './windows-sandbox.mjs';

const settingsFile = () => path.join(DATA_ROOT, '.security', 'sandbox.json');
const activeCommands = new Set();
export function hasActiveSandboxCommands() { return activeCommands.size > 0; }
export async function stopAllSandboxCommands() {
  return Promise.allSettled([...activeCommands].map(child => child.cleanupSandbox()));
}
export function initializeSandbox(config = {}) {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new SandboxError('沙箱配置损坏，已阻止启动；请修复 .security/sandbox.json', 'SANDBOX_CONFIG'); }
  const policy = setSandboxPolicy(saved ?? config.security?.sandbox ?? {});
  persist(policy); // Establish the protected directory before any command runs.
  return policy;
}
function persist(policy) {
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(policy, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  try { fs.renameSync(temporary, file); } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function updateSandbox(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['mode', 'backend', 'networkAccess', 'dockerImage', 'allowedDomains'].includes(key))) throw new SandboxError('沙箱设置包含无效字段', 'SANDBOX_CONFIG');
  const policy = normalizeSandboxPolicy({ ...getSandboxPolicy(), ...patch });
  persist(policy);
  setSandboxPolicy(policy);
  return policy;
}

export function selectedBackend(policy = getSandboxPolicy(), platform = process.platform) {
  if (policy.mode === 'off') return 'none';
  if (policy.backend !== 'auto') return policy.backend;
  return platform === 'linux' ? 'bubblewrap' : platform === 'darwin' ? 'seatbelt' : 'windows-native';
}

// Absolute executables from the trusted host PATH only; never use the workspace
// as an executable search directory (notably Windows' implicit cwd lookup).
export function findExecutable(name) {
  const suffixes = process.platform === 'win32' ? ['.exe'] : [''];
  for (const directory of String(process.env.PATH || '').split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    if (isInside(directory, getWorkspaceRoot())) continue;
    for (const suffix of suffixes) {
      const candidate = path.join(directory, name + suffix);
      try { fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate; } catch {}
    }
  }
  return null;
}

function probe(command, args, timeoutMs = 5000) {
  return new Promise(resolve => {
    const child = spawn(command, args, { windowsHide: true, cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { stopProcessTree(child, 'SIGKILL'); finish({ ok: false, message: '后端检测超时' }); }, timeoutMs);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { if (output.length < 2000) output += chunk.toString(); });
    child.on('error', error => finish({ ok: false, message: error.message }));
    child.on('close', code => finish({ ok: code === 0, message: output.trim().slice(0, 500) }));
  });
}

export async function sandboxStatus({ policy = getSandboxPolicy(), platform = process.platform } = {}) {
  const backend = selectedBackend(policy, platform);
  let available = false, reason = '';
  let setupCommand, setupSupported;
  if (backend === 'none') reason = '沙箱已关闭，命令使用宿主用户权限';
  else if (backend !== 'windows-native' && policy.networkAccess && policy.allowedDomains?.length) reason = '当前后端不支持域名白名单，请切换 Windows 原生后端或清空白名单';
  else if (backend === 'windows-native') {
    if (platform !== 'win32') reason = '原生 Windows 沙箱仅支持 Windows';
    else ({ available, reason, setupCommand, setupSupported } = await windowsSandboxStatus());
  }
  else if (backend === 'bubblewrap') {
    if (platform !== 'linux') reason = 'Bubblewrap 仅支持 Linux';
    else if (!findExecutable('bwrap')) reason = '未安装 bubblewrap，请安装后重新检测';
    else {
      const args = ['--unshare-all', '--die-with-parent'];
      for (const p of ['/usr', '/bin', '/lib', '/lib64']) if (fs.existsSync(p)) args.push('--ro-bind', p, p);
      args.push('--proc', '/proc', '--dev', '/dev', '--', '/bin/true');
      const result = await probe(findExecutable('bwrap'), args);
      available = result.ok; reason = result.ok ? 'Bubblewrap 命名空间隔离可用' : 'Bubblewrap 无法创建隔离环境：' + result.message;
    }
  } else if (backend === 'seatbelt') {
    if (platform !== 'darwin') reason = 'Seatbelt 仅支持 macOS';
    else {
    const result = await probe('/usr/bin/sandbox-exec', ['-p', '(version 1)(deny default)(allow process-exec)(allow file-read*)(allow sysctl-read)', '/usr/bin/true']);
      available = result.ok; reason = result.ok ? 'Seatbelt 可用' : 'Seatbelt 不可用：' + result.message;
    }
  } else {
    const executable = findExecutable('docker');
    if (!executable) reason = '未安装 Docker；Windows 请安装并启动 Docker Desktop（Linux 容器）';
    else {
      const engine = await probe(executable, ['--context', 'default', 'info', '--format', '{{.OSType}}']);
      if (!engine.ok) reason = 'Docker 引擎未就绪：' + engine.message;
      else if (engine.message !== 'linux') reason = '需要切换到 Linux 容器';
      else {
        const image = await probe(executable, ['--context', 'default', 'image', 'inspect', policy.dockerImage, '--format', '{{.Id}}']);
        available = image.ok;
        reason = image.ok ? 'Docker 引擎和沙箱镜像已就绪' : '沙箱镜像未构建；运行 node scripts/build-sandbox-image.mjs';
      }
    }
  }
  return { policy: { ...policy }, backend, available, reason, setupCommand, setupSupported, enforced: policy.mode !== 'off',
    commandCwd: backend === 'docker' || backend === 'bubblewrap' ? '/workspace' : getWorkspaceRoot(),
    scope: 'agent-shell', hostTools: 'trusted', failClosed: true };
}

// Children receive a deliberately small environment, not API credentials,
// NODE_OPTIONS, preload hooks, proxy tokens, or host configuration locations.
export function cleanCommandEnv(platform = process.platform, source = process.env) {
  const env = { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  if (platform === 'win32') {
    const system = source.SystemRoot || source.SYSTEMROOT || 'C:\\Windows';
    env.SystemRoot = system; env.WINDIR = system;
    const allowed = String(source.PATH || '').split(';').filter(directory => path.win32.isAbsolute(directory) && !isInside(directory, getWorkspaceRoot()));
    env.PATH = [path.win32.join(system, 'System32'), system, ...allowed].join(';');
    env.TEMP = source.TEMP || os.tmpdir(); env.TMP = env.TEMP;
  } else env.PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  return env;
}

function protectedEntries(root) {
  const entries = [];
  let visited = 0;
  const walk = (directory, relative = '') => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++visited > 250000) throw new SandboxError('工作区过大，无法完整检查保护路径', 'SANDBOX_PROTECTION');
      const name = item.name.toLowerCase(), rel = relative ? relative + '/' + item.name : item.name;
      if (item.isFile() && fs.statSync(path.join(directory, item.name)).nlink > 1) throw new SandboxError('工作区存在硬链接，无法保证宿主文件隔离：' + rel, 'SANDBOX_PROTECTION');
      if (PRIVATE_DIRS.includes(name) || READ_ONLY_DIRS.includes(name) || privateFile(name) || (!relative && name === 'config.json')) {
        entries.push({ relative: rel, source: path.join(root, rel), directory: item.isDirectory(), hidden: !READ_ONLY_DIRS.includes(name) });
      } else if (item.isDirectory()) walk(path.join(directory, item.name), rel);
      // Symlinks are resolved by the sandbox kernel; their external targets
      // aren't mounted. Never traverse them during host-side enumeration.
    }
  };
  walk(root);
  if (entries.length > 4096) throw new SandboxError('保护路径过多，已阻止执行', 'SANDBOX_PROTECTION');
  for (const item of entries) {
    if (fs.lstatSync(item.source).isSymbolicLink()) throw new SandboxError('保护路径不能是符号链接：' + item.relative, 'SANDBOX_PROTECTION');
    if (!item.directory && fs.statSync(item.source).nlink > 1) throw new SandboxError('敏感文件存在硬链接，已阻止执行：' + item.relative, 'SANDBOX_PROTECTION');
  }
  return entries;
}

const sbString = value => JSON.stringify(value);
export function seatbeltProfile(root, temporary, policy, entries) {
  const reads = ['/System', '/usr', '/bin', '/sbin', '/Library', '/dev', '/private/etc/ssl', '/private/etc/paths', '/private/etc/localtime', root, temporary];
  return [
    '(version 1)', '(deny default)', '(allow process-exec process-fork sysctl-read)',
    '(allow process-info* signal (target same-sandbox))',
    `(allow file-read* ${reads.map(p => `(subpath ${sbString(p)})`).join(' ')})`,
    `(allow file-write* (subpath ${sbString(temporary)})${policy.mode === 'workspace-write' ? ` (subpath ${sbString(root)})` : ''})`,
    '(deny file-read* (subpath "/Library/Keychains"))',
    ...entries.map(item => `(deny ${item.hidden ? 'file-read* file-write*' : 'file-write*'} (${item.directory ? 'subpath' : 'literal'} ${sbString(item.source)}))`),
    ...(policy.networkAccess ? ['(allow network*)'] : []),
  ].join('\n');
}

export function buildSandboxLaunch(command, { policy = getSandboxPolicy(), platform = process.platform, root = getWorkspaceRoot(), executable, temporary, entries = [] } = {}) {
  if (typeof command !== 'string' || !command.trim() || command.includes('\0') || command.length > 100000) throw new SandboxError('命令无效', 'SANDBOX_COMMAND');
  const backend = selectedBackend(policy, platform), env = cleanCommandEnv(platform);
  if (backend === 'windows-native') throw new SandboxError('原生 Windows 后端必须通过专用 broker 启动', 'SANDBOX_UNAVAILABLE');
  if (backend !== 'none' && policy.networkAccess && policy.allowedDomains?.length) throw new SandboxError('域名白名单仅由 Windows 原生后端执行；当前后端不支持，已阻止执行', 'SANDBOX_CONFIG');
  if (backend === 'none') return platform === 'win32'
    ? { backend, command: path.win32.join(env.SystemRoot, 'System32', 'cmd.exe'), args: ['/d', '/s', '/c', `"chcp 65001 >nul & ${command}"`], cwd: root, env, windowsVerbatimArguments: true }
    : { backend, command: '/bin/sh', args: ['-c', command], cwd: root, env };
  if (backend === 'docker') {
    if (root.includes(',') || temporary.includes(',')) throw new SandboxError('Docker 挂载路径不能包含逗号', 'SANDBOX_PATH');
    const container = 'mli-sandbox-' + crypto.randomUUID();
    const user = platform === 'win32' ? '1000:1000' : `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
    const args = ['--context', 'default', 'run', '--rm', '--pull=never', '--name', container, '--label', 'mli-agent.sandbox=true', '--init', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=128', '--memory=1g', '--cpus=2', '--user', user, '--network', policy.networkAccess ? 'bridge' : 'none',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777', '--workdir', '/workspace', '--env', 'HOME=/tmp', '--env', 'TMPDIR=/tmp',
      '--env', 'LANG=C.UTF-8', '--env', 'LC_ALL=C.UTF-8', '--mount', `type=bind,source=${root},target=/workspace${policy.mode === 'read-only' ? ',readonly' : ''}`];
    for (const item of entries) {
      const target = '/workspace/' + item.relative;
      if (item.hidden && item.directory) args.push('--tmpfs', `${target}:ro,nosuid,nodev,size=1m,mode=000`);
      else args.push('--mount', `type=bind,source=${item.hidden ? (platform === 'win32' ? path.win32 : path.posix).join(temporary, 'empty') : item.source},target=${target},readonly`);
    }
    args.push(policy.dockerImage, '/bin/sh', '-c', command);
    return { backend, command: executable, args, cwd: os.tmpdir(), env: dockerClientEnv(), container };
  }
  if (backend === 'bubblewrap') {
    if (platform !== 'linux') throw new SandboxError('Bubblewrap 仅支持 Linux', 'SANDBOX_UNAVAILABLE');
    const args = ['--die-with-parent', '--new-session', '--unshare-all', '--cap-drop', 'ALL'];
    if (policy.networkAccess) args.push('--share-net');
    for (const p of ['/usr', '/bin', '/sbin', '/lib', '/lib64']) if (fs.existsSync(p)) args.push('--ro-bind', p, p);
    for (const p of ['/etc/alternatives', '/etc/ssl', '/etc/ld.so.cache', '/etc/ld.so.conf', '/etc/ld.so.conf.d', '/etc/localtime', '/etc/passwd', '/etc/group', ...(policy.networkAccess ? ['/etc/resolv.conf'] : [])]) if (fs.existsSync(p)) args.push('--ro-bind', p, p);
    args.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/tmp/home', policy.mode === 'read-only' ? '--ro-bind' : '--bind', root, '/workspace');
    for (const item of entries) {
      const target = '/workspace/' + item.relative;
      if (item.hidden && item.directory) args.push('--tmpfs', target, '--remount-ro', target);
      else args.push('--ro-bind', item.hidden ? '/dev/null' : item.source, target);
    }
    args.push('--clearenv', '--setenv', 'PATH', env.PATH, '--setenv', 'HOME', '/tmp/home', '--setenv', 'TMPDIR', '/tmp', '--setenv', 'LANG', 'C.UTF-8', '--chdir', '/workspace', '--', '/bin/sh', '-c', command);
    return { backend, command: executable, args, cwd: os.tmpdir(), env };
  }
  if (platform !== 'darwin') throw new SandboxError('Seatbelt 仅支持 macOS', 'SANDBOX_UNAVAILABLE');
  return { backend, command: '/usr/bin/sandbox-exec', args: ['-p', seatbeltProfile(root, temporary, policy, entries), '/bin/sh', '-c', command], cwd: root,
    env: { ...env, HOME: temporary, TMPDIR: temporary } };
}

// The Docker CLI is a trusted broker. Its connection settings are never passed
// into the container, whose environment is separately specified above.
function dockerClientEnv() {
  const env = cleanCommandEnv();
  for (const key of ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) if (process.env[key]) env[key] = process.env[key];
  return env;
}

export async function spawnSandboxedCommand(command, { signal, policy = toolSandboxPolicy() ?? getSandboxPolicy() } = {}) {
  if (signal?.aborted) throw new SandboxError('任务已停止', 'ABORT_ERR');
  const backend = selectedBackend(policy);
  if (backend === 'windows-native') return spawnNativeWindowsCommand(command, { signal, policy });
  const executable = backend === 'docker' ? findExecutable('docker') : backend === 'bubblewrap' ? findExecutable('bwrap') : null;
  if ((backend === 'docker' || backend === 'bubblewrap') && !executable) throw new SandboxError(backend === 'docker'
    ? '沙箱不可用：请安装并启动 Docker Desktop，再运行 node scripts/build-sandbox-image.mjs；不会退回宿主 shell'
    : '沙箱不可用：请安装 bubblewrap；不会退回宿主 shell', 'SANDBOX_UNAVAILABLE');
  const root = fs.realpathSync(getWorkspaceRoot());
  // Reject drive/UNC device paths at the process boundary, not just in file tools.
  if (process.platform === 'win32' && (!/^[a-z]:\\/i.test(root) || root.startsWith('\\\\'))) throw new SandboxError('不支持设备或 UNC 工作区路径', 'SANDBOX_PATH');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-sandbox-'));
  fs.writeFileSync(path.join(temporary, 'empty'), '', { mode: 0o644 });
  let launch;
  try { launch = buildSandboxLaunch(command, { policy, root, executable, temporary, entries: backend === 'none' ? [] : protectedEntries(root) }); }
  catch (error) { fs.rmSync(temporary, { recursive: true, force: true }); throw error; }
  if (signal?.aborted) { fs.rmSync(temporary, { recursive: true, force: true }); throw new SandboxError('任务已停止', 'ABORT_ERR'); }
  const child = spawn(launch.command, launch.args, { cwd: launch.cwd, env: launch.env, windowsHide: true, windowsVerbatimArguments: launch.windowsVerbatimArguments === true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  activeCommands.add(child);
  let cleanupPromise, stopPromise;
  const cleanup = () => cleanupPromise ??= (async () => {
    try {
      await child.stopSandbox();
      fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } finally { activeCommands.delete(child); }
  })();
  child.sandbox = { backend, mode: policy.mode, networkAccess: policy.mode === 'off' || policy.networkAccess, cwd: backend === 'docker' || backend === 'bubblewrap' ? '/workspace' : root };
  child.stopSandbox = () => stopPromise ??= (async () => {
    // Wait for the named container to be removed before killing its CLI.
    if (launch.container) await probe(launch.command, ['--context', 'default', 'rm', '-f', launch.container]);
    if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    else if (child.pid && child.exitCode === null) {
      await probe(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F']);
    }
    if (launch.container) await probe(launch.command, ['--context', 'default', 'rm', '-f', launch.container]);
  })();
  // The caller owns abort/timeout handling; it must await cleanup before return.
  child.cleanupSandbox = cleanup;
  child.once('error', () => { cleanup().catch(() => {}); });
  child.once('close', () => { cleanup().catch(() => {}); });
  return child;
}

async function spawnNativeWindowsCommand(command, { signal, policy }) {
  if (typeof command !== 'string' || !command.trim() || command.includes('\0') || command.length > 24000) throw new SandboxError('Windows 命令无效或过长', 'SANDBOX_COMMAND');
  const helper = windowsHelper();
  const root = fs.realpathSync(getWorkspaceRoot());
  if (!/^[a-z]:\\/i.test(root)) throw new SandboxError('原生 Windows 沙箱不支持 UNC 或设备工作区路径', 'SANDBOX_PATH');
  const entries = protectedEntries(root);
  // Protect the native broker dependency from writes when developing MLI itself.
  if (isInside(helper.directory, root)) entries.push({ source: helper.directory, hidden: false });
  const config = windowsRuntimeConfig({ root, policy, entries, helper: helper.file });
  const release = await claimWindowsSandbox();
  if (signal?.aborted) { await release(); throw new SandboxError('任务已停止', 'ABORT_ERR'); }
  let child;
  try {
    const env = cleanCommandEnv();
    // Only the trusted JS broker sees these profile locations (DPAPI/state DB).
    for (const key of ['USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) if (process.env[key]) env[key] = process.env[key];
    env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    child = spawn(process.execPath, [fileURLToPath(new URL('./windows-sandbox-worker.mjs', import.meta.url))], { cwd: os.tmpdir(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  } catch (error) { await release(); throw error; }
  activeCommands.add(child);
  let stopPromise, cleanupPromise;
  const closed = once(child, 'close').catch(() => {});
  child.stopSandbox = () => stopPromise ??= (async () => {
    if (child.exitCode === null && !child.signalCode) {
      if (child.connected) child.send({ type: 'stop' }, () => {});
      let timer;
      const graceful = await Promise.race([closed.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 8000); })]);
      clearTimeout(timer);
      if (!graceful) {
        await probe(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F']);
        // Closing the helper's job kills the sandbox user descendants. ACLs
        // from an unclean broker are recovered by upstream at next initialize.
        child.kill();
        await closed;
      }
    }
  })();
  child.cleanupSandbox = () => cleanupPromise ??= (async () => {
    try { await child.stopSandbox(); }
    finally { await release(); activeCommands.delete(child); }
  })();
  child.sandbox = { backend: 'windows-native', mode: policy.mode, networkAccess: policy.networkAccess && policy.allowedDomains.length > 0, allowedDomains: [...policy.allowedDomains], cwd: root };
  child.once('close', () => { child.cleanupSandbox().catch(() => {}); });
  child.once('error', () => { child.cleanupSandbox().catch(() => {}); });
  child.send({ type: 'execute', command: `chcp 65001 >nul & ${command}`, config, root, id: crypto.randomUUID() }, error => { if (error) child.kill(); });
  if (signal?.aborted) child.stopSandbox().catch(() => {});
  return child;
}
