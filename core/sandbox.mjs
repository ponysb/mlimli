import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { getWorkspaceRoot, DATA_ROOT, isInside } from './paths.mjs';
import { stopProcessTree } from './process-tree.mjs';
import { getSandboxPolicy, normalizeSandboxPolicy, setSandboxPolicy, toolSandboxPolicy, SandboxError, PRIVATE_DIRS, READ_ONLY_DIRS, privateFile } from './sandbox-policy.mjs';
import { ensureWindowsSandboxComponents, windowsSandboxPreflight, windowsRuntimeConfig, windowsReadableToolchains, claimWindowsSandbox, requestWindowsSandboxRelease, describeWindowsSandboxFailure } from './windows-sandbox.mjs';
import { runBrokerCommand, shutdownSandboxBroker } from './sandbox-broker.mjs';

const settingsFile = () => path.join(DATA_ROOT, '.security', 'sandbox.json');
const require = createRequire(import.meta.url);
const activeCommands = new Set();
// `auto` may use the host shell when isolation cannot start. These failures
// happen before the target command exists, so no side effect is replayed.
const FALLBACK_CODES = ['SANDBOX_UNAVAILABLE', 'SANDBOX_PROTECTION', 'SANDBOX_PATH'];
// Backend probe results are reused so each command doesn't pay for (or, on
// Windows, serialize behind) a second sandbox launch.
const PROBE_TTL_MS = 5 * 60 * 1000;
const probes = new Map();
export function resetSandboxProbes() { probes.clear(); }
const DEFAULT_POSIX_PATH = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
// Non-secret variables that common toolchains need when a command runs with
// host permissions. Credentials, proxies and preload hooks stay excluded.
const HOST_ENV_KEYS = {
  posix: ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TERM', 'TZ', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'DISPLAY', 'WAYLAND_DISPLAY',
    'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT', 'GOPATH', 'GOROOT', 'CARGO_HOME', 'RUSTUP_HOME', 'NVM_DIR', 'PYENV_ROOT', 'VOLTA_HOME', 'BUN_INSTALL', 'PNPM_HOME', 'DEVELOPER_DIR', 'HOMEBREW_PREFIX'],
  win32: ['USERPROFILE', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
    'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432', 'ALLUSERSPROFILE', 'PUBLIC', 'SystemDrive', 'ComSpec', 'PATHEXT', 'OS', 'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION', 'PSModulePath', 'DriverData', 'JAVA_HOME', 'GOPATH', 'GOROOT', 'CARGO_HOME', 'RUSTUP_HOME', 'NVM_HOME', 'NVM_SYMLINK', 'PNPM_HOME'],
};
let loginPath;
export function hasActiveSandboxCommands() { return activeCommands.size > 0; }
export async function stopAllSandboxCommands() {
  const results = await Promise.allSettled([...activeCommands].map(child => child.cleanupSandbox()));
  // Releases the session ACLs and, on Windows, the cross-process claim.
  await shutdownSandboxBroker().catch(() => {});
  return results;
}
// System setup needs the Windows claim; an idle broker gives it up.
export { shutdownSandboxBroker };
export function initializeSandbox(config = {}) {
  let saved;
  try { saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new SandboxError('沙箱配置损坏，已阻止启动；请修复 .security/sandbox.json', 'SANDBOX_CONFIG'); }
  const policy = setSandboxPolicy(saved ?? config.security?.sandbox ?? {});
  persist(policy); // Establish the protected directory before any command runs.
  if (process.platform !== 'win32') loginPath ??= resolveLoginPath(); // Warm up; commands await the same promise.
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
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['enabled', 'mode', 'backend', 'networkAccess', 'dockerImage', 'allowedDomains'].includes(key))) throw new SandboxError('沙箱设置包含无效字段', 'SANDBOX_CONFIG');
  const policy = normalizeSandboxPolicy({ ...getSandboxPolicy(), ...patch });
  persist(policy);
  setSandboxPolicy(policy);
  resetSandboxProbes();
  return policy;
}

export function selectedBackend(policy = getSandboxPolicy(), platform = process.platform) {
  if (!policy.enabled || policy.mode === 'off') return 'none';
  if (policy.backend !== 'auto') return policy.backend;
  return autoBackends(policy, platform)[0];
}

// `auto` only picks backends that run commands at the real workspace path,
// so the host fallback sees the same paths. Docker (/workspace, needs a built
// image) is an explicit choice. Anthropic Sandbox Runtime comes first; the
// built-in Seatbelt/Bubblewrap profiles cover machines where it cannot start
// (Linux without socat/ripgrep) and unrestricted networking, which the
// runtime cannot express (it always enforces a domain allowlist).
export function autoBackends(policy = getSandboxPolicy(), platform = process.platform) {
  if (platform === 'win32') return ['windows-native'];
  const native = platform === 'darwin' ? 'seatbelt' : 'bubblewrap';
  if (!['darwin', 'linux'].includes(platform)) return [native];
  return srtNetworkSupported(policy) ? ['srt', native] : [native];
}
const unrestrictedNetwork = policy => policy.networkAccess && policy.allowedDomains?.includes('*');
const srtNetworkSupported = policy => !policy.networkAccess || (policy.allowedDomains?.length > 0 && !unrestrictedNetwork(policy));

// Absolute executables from the trusted host PATH only; never use the workspace
// as an executable search directory (notably Windows' implicit cwd lookup).
export function findExecutable(name, suffixes = process.platform === 'win32' ? ['.exe'] : ['']) {
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

const realOrNull = file => { try { return fs.realpathSync(file); } catch { return null; } };

// GUI-launched apps (Finder, desktop launchers) inherit a minimal PATH, so
// node/npm/brew from the user's shell profile would be missing. Resolve the
// login shell PATH once; any failure falls back to the process PATH.
function resolveLoginPath() {
  if (process.platform === 'win32') return Promise.resolve([]);
  return new Promise(resolve => {
    const shell = path.isAbsolute(process.env.SHELL || '') ? process.env.SHELL : process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';
    // `env` output is the same for sh/bash/zsh/fish; fish's $PATH is a list.
    const marker = `__MLI_ENV_${crypto.randomUUID().slice(0, 8)}__`;
    let output = '', done = false, child, timer;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    try {
      // detached: own session without a controlling terminal, so an
      // interactive profile cannot touch the CLI's TTY and can be killed as a group.
      child = spawn(shell, ['-ilc', `echo ${marker}; /usr/bin/env; echo ${marker}`], {
        cwd: os.homedir(), detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
        env: { HOME: os.homedir(), USER: process.env.USER || '', LOGNAME: process.env.LOGNAME || '', SHELL: shell, PATH: process.env.PATH || DEFAULT_POSIX_PATH.join(':'), TERM: 'dumb', LANG: 'C.UTF-8' },
      });
    } catch { finish([]); return; }
    timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} finish([]); }, 3000);
    child.stdout.on('data', chunk => { if (output.length < 65536) output += chunk; });
    child.on('error', () => finish([]));
    child.on('close', () => {
      const block = output.split(marker)[1] || '';
      const line = block.split('\n').findLast(entry => entry.startsWith('PATH=')) || '';
      finish(line.slice(5).trim().split(':').filter(directory => path.isAbsolute(directory)));
    });
  });
}

// Executable search path for commands: login shell PATH, process PATH and
// common install locations; never directories inside the workspace.
export async function commandSearchPath(root = getWorkspaceRoot()) {
  if (process.platform === 'win32') return null;
  loginPath ??= resolveLoginPath();
  const directories = [...await loginPath, ...String(process.env.PATH || '').split(':'), ...DEFAULT_POSIX_PATH];
  return [...new Set(directories.filter(directory => path.isAbsolute(directory) && !isInside(directory, root)))].join(':');
}

// Read-only toolchain directories (nvm, volta, bun, pyenv ...) outside the
// backend's system mounts. Only PATH directories and the install prefix above
// a `bin` or `shims` directory; never the home directory, a parent of the
// workspace, or prefixes known to hold credentials or personal data.
const UNSAFE_TOOL_PREFIXES = ['.cargo', '.local', '.config', 'library', 'desktop', 'documents', 'downloads'];
export function toolchainPaths(searchPath, { root = getWorkspaceRoot(), home = os.homedir(), covered = [] } = {}) {
  const usable = directory => path.dirname(directory) !== directory && path.resolve(directory) !== path.resolve(home)
    && !isInside(directory, root) && !isInside(root, directory)
    && !directory.split(path.sep).some(part => PRIVATE_DIRS.includes(part.toLowerCase()));
  const result = new Set();
  for (const entry of String(searchPath || '').split(':')) {
    const directory = path.isAbsolute(entry) ? realOrNull(entry) : null;
    if (!directory || !usable(directory) || covered.some(prefix => isInside(directory, prefix))) continue;
    result.add(directory);
    const parent = path.dirname(directory);
    if (['bin', 'shims'].includes(path.basename(directory)) && usable(parent) && !UNSAFE_TOOL_PREFIXES.includes(path.basename(parent).toLowerCase())) result.add(parent);
  }
  return [...result].sort((a, b) => a.length - b.length);
}

// One real command through the configured backend. Each command doesn't pay for (or,
// on Windows, serialize behind) a second launch: results are cached per policy and workspace.
async function runBackendProbe(policy) {
  const backend = selectedBackend(policy);
  let check;
  try { check = await spawnSandboxedCommandStrict(backend === 'windows-native' ? 'cd >nul' : 'cd . && pwd >/dev/null && ls -d . >/dev/null', { policy }); }
  catch (error) { return { ok: false, code: error.code || 'SANDBOX_UNAVAILABLE', message: error.message }; }
  let stderr = '', timer;
  check.stdout.resume();
  check.stderr.on('data', chunk => { if (stderr.length < 1000) stderr += chunk; });
  try {
    const outcome = await new Promise(resolve => {
      check.once('error', error => resolve({ message: error.message }));
      check.once('close', (code, exitSignal) => resolve(code === 0 ? { ok: true } : { message: `exit=${code}, signal=${exitSignal || 'none'}` }));
      // The first brokered command initializes the runtime (Windows: sandbox
      // profile creation, WFP probe, workspace ACLs), which can take a while.
      timer = setTimeout(() => { check.stopSandbox().catch(() => {}); resolve({ message: '探针超时' }); }, backend === 'windows-native' ? 120000 : backend === 'srt' ? 30000 : 10000);
    });
    if (outcome.ok) return { ok: true };
    const detail = check.sandboxFailure?.message || stderr.trim().slice(0, 500);
    return { ok: false, code: 'SANDBOX_UNAVAILABLE', message: `${backend} 沙箱执行探针失败：${outcome.message}${detail ? '；' + detail : ''}` };
  } finally { clearTimeout(timer); await check.cleanupSandbox().catch(() => {}); }
}

function probeBackend(policy, { fresh = false } = {}) {
  const key = JSON.stringify([selectedBackend(policy), policy.mode, policy.networkAccess, policy.allowedDomains, policy.dockerImage, getWorkspaceRoot()]);
  const cached = probes.get(key);
  if (!fresh && cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.result;
  const result = runBackendProbe(policy).then(value => {
    // A busy sandbox or a workspace hardlink says nothing lasting about the
    // backend; recheck on the next command instead of remembering it.
    if (['SANDBOX_BUSY', 'SANDBOX_PROTECTION'].includes(value.code) && probes.get(key)?.result === result) probes.delete(key);
    return value;
  });
  probes.set(key, { at: Date.now(), result });
  return result;
}

// The shared probe ignores a single caller's abort; that caller stops waiting.
function untilAborted(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new SandboxError('任务已停止', 'ABORT_ERR'));
  let onAbort;
  return Promise.race([promise, new Promise((_, reject) => { onAbort = () => reject(new SandboxError('任务已停止', 'ABORT_ERR')); signal.addEventListener('abort', onAbort, { once: true }); })])
    .finally(() => signal.removeEventListener('abort', onAbort));
}

const ALLOWLIST_BACKENDS = ['windows-native', 'srt'];
const USERNS_HINT = '系统禁止非特权用户命名空间（Ubuntu 23.10+ 的 AppArmor 默认如此）；需管理员为 bwrap 配置 AppArmor profile，或设置 sysctl kernel.apparmor_restrict_unprivileged_userns=0';
export function describeSrtFailure(code = '', message = '') {
  const text = `${code} ${message}`;
  if (/dependencies not available|not found/i.test(text)) return 'Anthropic 沙箱缺少系统依赖（Linux 需要 bubblewrap、socat 和 ripgrep，例如 sudo apt install bubblewrap socat ripgrep）';
  if (/uid map|user namespace|setting up uid|unprivileged/i.test(text)) return USERNS_HINT;
  if (/Cannot find (package|module)/i.test(text)) return '客户端缺少 @anthropic-ai/sandbox-runtime 组件，请重新安装客户端';
  return '';
}
const friendlyFailure = (backend, code, message) => (backend === 'windows-native' ? describeWindowsSandboxFailure(code, message) : describeSrtFailure(code, message));

// Tools the user relies on but the sandbox cannot see, e.g. Node/Python
// installed under the Windows profile or a home-directory toolchain.
const COMMON_TOOLS = ['node', 'npm', 'git', 'python', 'python3'];
async function invisibleTools(policy, backend) {
  const wanted = COMMON_TOOLS.filter(name => findExecutable(name) || (process.platform === 'win32' && findExecutable(name, ['.cmd'])));
  if (!wanted.length) return [];
  const command = backend === 'windows-native' ? `for %t in (${wanted.join(' ')}) do @where %t >nul 2>nul && echo found:%t` : wanted.map(name => `command -v ${name} >/dev/null 2>&1 && echo found:${name}`).join('; ');
  let child;
  try { child = await spawnSandboxedCommandStrict(command, { policy: { ...policy, backend } }); } catch { return []; }
  let output = '', timer;
  child.stdout.on('data', chunk => { if (output.length < 4000) output += chunk; });
  child.stderr.resume();
  try {
    await new Promise(resolve => { child.once('close', resolve); child.once('error', resolve); timer = setTimeout(() => { child.stopSandbox().catch(() => {}); resolve(); }, 30000); });
  } finally { clearTimeout(timer); await child.cleanupSandbox().catch(() => {}); }
  if (child.sandboxFailure) return [];
  const found = new Set([...output.matchAll(/found:(\S+)/g)].map(match => match[1].toLowerCase()));
  return wanted.filter(name => !found.has(name));
}

export async function sandboxStatus({ policy = getSandboxPolicy(), platform = process.platform } = {}) {
  const candidates = policy.enabled && policy.mode !== 'off' && policy.backend === 'auto' ? autoBackends(policy, platform) : [selectedBackend(policy, platform)];
  const skipped = [];
  let status;
  for (const backend of candidates) {
    status = await backendStatus(policy, backend, platform);
    if (status.available) break;
    skipped.push(candidates.length > 1 ? `${backend}：${status.reason}` : status.reason);
  }
  if (status.available && skipped.length) status.reason += `（已跳过不可用的 ${skipped.join('；')}）`;
  else if (!status.available && skipped.length > 1) status.reason = skipped.join('；');
  if (status.available && status.backend !== 'docker') {
    const missing = await invisibleTools(policy, status.backend);
    if (missing.length) {
      status.missingTools = missing;
      status.reason += `；注意：宿主已安装但沙箱内无法访问 ${missing.join('、')}${status.backend === 'windows-native' ? '（通常是装在用户目录且不在 PATH 中，或需要重新检测；建议改为机器级安装）' : '（工具位于沙箱禁止读取的目录）'}`;
    }
  }
  if (ALLOWLIST_BACKENDS.includes(status.backend) && policy.networkAccess && !policy.allowedDomains?.length) status.reason += '；已开启联网但域名白名单为空，命令仍然无法联网，请在下方添加允许的域名（如 registry.npmjs.org:443）';
  return status;
}

async function backendStatus(policy, backend, platform) {
  const effective = backend === 'none' ? policy : { ...policy, backend };
  let available = false, reason = '';
  let setupCommand, setupSupported, probeName, errorCode, repairable = false;
  if (backend === 'none') reason = '沙箱已关闭，命令使用宿主用户权限';
  else if (!ALLOWLIST_BACKENDS.includes(backend) && policy.networkAccess && policy.allowedDomains?.length && !unrestrictedNetwork(policy)) reason = `${backend} 后端不支持域名白名单，请切换自动/Anthropic 后端或清空白名单`;
  else if (backend === 'windows-native') {
    if (platform !== 'win32') reason = '原生 Windows 沙箱仅支持 Windows';
    else {
      // Provisioning first (read-only), then a real command through the
      // broker, which also proves WFP and the workspace ACLs.
      const windows = await windowsSandboxPreflight();
      ({ available, reason, setupCommand, setupSupported } = windows);
      probeName = windows.probe; errorCode = windows.errorCode || undefined;
      if (available) {
        const result = await probeBackend(effective, { fresh: true });
        available = result.ok; probeName = 'process-and-wfp';
        reason = result.ok ? 'Windows 原生沙箱已通过真实启动、WFP 网络隔离与工作区 ACL 检测（Alpha）' : result.message;
        if (!result.ok) errorCode = result.code;
      }
      repairable = setupSupported === true;
    }
  } else if (backend === 'srt') {
    if (!['darwin', 'linux'].includes(platform)) reason = 'Anthropic 沙箱（Seatbelt/Bubblewrap）后端仅支持 macOS 和 Linux';
    else if (!srtNetworkSupported(policy)) reason = 'Anthropic 沙箱只能按域名白名单联网；请配置白名单，或改用 Seatbelt/Bubblewrap 后端获得不受限网络';
    else {
      const result = await probeBackend(effective, { fresh: true });
      available = result.ok; reason = result.ok ? 'Anthropic Sandbox Runtime 可用（已通过真实命令检测）' : 'Anthropic 沙箱不可用：' + result.message;
      if (!result.ok) errorCode = result.code;
    }
  } else if (backend === 'bubblewrap') {
    if (platform !== 'linux') reason = 'Bubblewrap 仅支持 Linux';
    else if (!findExecutable('bwrap')) reason = '未安装 bubblewrap；安装后重新检测，或选择 Docker 后端';
    else {
      // Run a real shell command with the exact launch arguments, not a toy profile.
      const result = await probeBackend(effective, { fresh: true });
      available = result.ok; reason = result.ok ? 'Bubblewrap 命名空间隔离可用（已通过真实命令检测）' : 'Bubblewrap 无法创建隔离环境：' + result.message + (/uid map|namespace|Operation not permitted|Permission denied/i.test(result.message) ? '；' + USERNS_HINT : '');
      if (!result.ok) errorCode = result.code;
    }
  } else if (backend === 'seatbelt') {
    if (platform !== 'darwin') reason = 'Seatbelt 仅支持 macOS';
    else {
      const result = await probeBackend(effective, { fresh: true });
      available = result.ok; reason = result.ok ? 'Seatbelt 可用（已通过真实命令检测）' : 'Seatbelt 不可用：' + result.message;
      if (!result.ok) errorCode = result.code;
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
  if (['srt', 'bubblewrap', 'docker', 'seatbelt'].includes(backend)) repairable = !available;
  const diagnosticId = crypto.createHash('sha256').update(`${backend}|${reason}|${errorCode || ''}`).digest('hex').slice(0, 16);
  const runtime = {
    platform, arch: process.arch, node: process.versions.node,
    electron: process.versions.electron || null,
    cwd: getWorkspaceRoot(),
    packagePresent: (() => { try { require.resolve('@anthropic-ai/sandbox-runtime'); return true; } catch { return false; } })(),
  };
  const hostFallback = !policy.enabled || policy.mode === 'off' || (policy.backend === 'auto' && policy.enabled);
  return { policy: { ...policy }, backend, available, reason: policy.enabled ? reason : '沙箱未启用，命令使用宿主权限', setupCommand, setupSupported, probe: probeName, errorCode, repairable, diagnosticId, fallbacks: hostFallback ? ['host-auto', 'host-confirmed'] : ['host-confirmed'], hostFallback, runtime, enforced: policy.enabled && policy.mode !== 'off',
    commandCwd: backend === 'docker' ? '/workspace' : getWorkspaceRoot(),
    scope: 'agent-shell', hostTools: 'trusted', failClosed: !hostFallback && policy.enabled && policy.mode !== 'off' };
}

// Children receive a deliberately small environment, not API credentials,
// NODE_OPTIONS, preload hooks, proxy tokens, or host configuration locations.
export function cleanCommandEnv(platform = process.platform, source = process.env) {
  const env = { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  if (platform === 'win32') {
    const system = source.SystemRoot || source.SYSTEMROOT || 'C:\\Windows';
    env.SystemRoot = system; env.WINDIR = system;
    // Windows path semantics regardless of host OS (tests build win32 envs on Unix).
    const workspace = path.win32.resolve(getWorkspaceRoot()).toLowerCase();
    const insideWorkspace = directory => { const value = path.win32.resolve(directory).toLowerCase(); return value === workspace || value.startsWith(workspace.endsWith('\\') ? workspace : workspace + '\\'); };
    const allowed = String(source.PATH || source.Path || '').split(';').filter(directory => /^[a-z]:\\/i.test(directory) && !insideWorkspace(directory));
    env.PATH = [...new Set([path.win32.join(system, 'System32'), system, path.win32.join(system, 'System32', 'Wbem'), path.win32.join(system, 'System32', 'WindowsPowerShell', 'v1.0'), ...allowed])].join(';');
    env.TEMP = source.TEMP || os.tmpdir(); env.TMP = env.TEMP;
    env.PATHEXT = source.PATHEXT || '.COM;.EXE;.BAT;.CMD';
  } else env.PATH = DEFAULT_POSIX_PATH.join(':');
  return env;
}

// Host-permission commands (sandbox off or auto fallback) get the clean
// environment plus non-secret user context; without HOME/USERPROFILE/APPDATA,
// npm, git, pip and most toolchains break. Isolation adds nothing by hiding
// these from a process that already runs as the host user.
export function hostCommandEnv(platform = process.platform, source = process.env, searchPath) {
  const env = cleanCommandEnv(platform, source);
  for (const key of HOST_ENV_KEYS[platform === 'win32' ? 'win32' : 'posix']) if (source[key]) env[key] = source[key];
  if (platform !== 'win32') {
    if (searchPath) env.PATH = searchPath;
    env.HOME ||= os.homedir();
    // Keep the user's UTF-8 locale; C.UTF-8 is missing on some older Linux systems.
    const locale = [source.LC_ALL, source.LANG].find(value => /utf-?8/i.test(value || ''));
    if (locale) { env.LANG = locale; env.LC_ALL = locale; }
  }
  return env;
}

export function windowsBrokerEnvironment(source = process.env) {
  const env = cleanCommandEnv('win32', source);
  // Only the trusted JS broker sees these profile locations (DPAPI/state DB).
  for (const key of ['USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) if (source[key]) env[key] = source[key];
  // In packaged clients process.execPath is the Electron application. Keep
  // the broker in Node mode so Chromium never opens or competes for the
  // desktop profile's GPU/cache directories.
  env.ELECTRON_RUN_AS_NODE = '1';
  env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
  return env;
}

function protectedEntries(root) {
  const entries = [];
  let visited = 0;
  // Files can vanish or be unreadable while a build runs; that must not make
  // the whole command fail. An unreadable directory is equally unreadable to
  // the sandboxed command, so skipping it does not weaken the policy.
  const list = directory => { try { return fs.readdirSync(directory, { withFileTypes: true }); } catch (error) { if (['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR'].includes(error.code)) return []; throw error; } };
  const links = file => { try { return fs.statSync(file).nlink; } catch { return 1; } };
  const walk = (directory, relative = '') => {
    for (const item of list(directory)) {
      if (item.name === 'node_modules' && item.isDirectory()) continue;
      if (++visited > 250000) throw new SandboxError('工作区过大，无法完整检查保护路径', 'SANDBOX_PROTECTION');
      const name = item.name.toLowerCase(), rel = relative ? relative + '/' + item.name : item.name;
      if (item.isFile() && links(path.join(directory, item.name)) > 1) throw new SandboxError('工作区存在硬链接，无法保证宿主文件隔离：' + rel, 'SANDBOX_PROTECTION');
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
const ancestors = file => { const result = []; for (let current = path.dirname(file); current !== path.dirname(current); current = path.dirname(current)) result.push(current); return result; };
// Seatbelt matches resolved paths only; /etc, /var and /tmp are symlinks into /private.
const SEATBELT_SYSTEM_READS = ['/System', '/usr', '/bin', '/sbin', '/Library', '/dev', '/opt/homebrew', '/opt/local',
  '/private/etc/ssl', '/private/etc/paths', '/private/etc/paths.d', '/private/var/db/timezone', '/private/var/select'];
const SEATBELT_SYSTEM_FILES = ['/', '/etc', '/var', '/tmp', '/private/etc/localtime', '/private/etc/passwd', '/private/etc/group', '/private/var/db/xcode_select_link'];
const SEATBELT_NETWORK_FILES = ['/private/etc/hosts', '/private/etc/services', '/private/etc/protocols', '/private/etc/resolv.conf', '/private/var/run/resolv.conf'];
const SEATBELT_NETWORK_SERVICES = ['com.apple.dnssd.service', 'com.apple.trustd', 'com.apple.trustd.agent', 'com.apple.SecurityServer', 'com.apple.ocspd', 'com.apple.SystemConfiguration.configd'];
// Rules every process needs on current macOS. Without them dyld/libSystem
// aborts at startup (SIGABRT) before the command runs, which is why the
// previous profile failed on every machine.
export function seatbeltProfile(root, temporary, policy, entries, { toolchains = [], developerDir = null } = {}) {
  const reads = [...SEATBELT_SYSTEM_READS, ...(developerDir ? [developerDir] : []), ...toolchains, root, temporary];
  const metadata = [...new Set([root, temporary, ...toolchains].flatMap(ancestors))];
  const files = [...SEATBELT_SYSTEM_FILES, ...(policy.networkAccess ? SEATBELT_NETWORK_FILES : [])];
  const services = ['com.apple.system.opendirectoryd.libinfo', 'com.apple.system.notification_center', ...(policy.networkAccess ? SEATBELT_NETWORK_SERVICES : [])];
  return [
    '(version 1)', '(deny default)', '(allow process-exec process-fork sysctl-read)',
    '(allow process-info* signal (target same-sandbox))',
    `(allow file-read* ${reads.map(p => `(subpath ${sbString(p)})`).join(' ')} ${files.map(p => `(literal ${sbString(p)})`).join(' ')})`,
    // getcwd(), realpath() and module resolution stat every path component.
    `(allow file-read-metadata ${metadata.map(p => `(literal ${sbString(p)})`).join(' ')})`,
    `(allow file-write* (subpath ${sbString(temporary)})${policy.mode === 'workspace-write' ? ` (subpath ${sbString(root)})` : ''})`,
    '(allow file-write* file-ioctl (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (literal "/dev/dtracehelper") (regex #"^/dev/fd/[0-9]+$"))',
    `(allow mach-lookup ${services.map(name => `(global-name ${sbString(name)})`).join(' ')})`,
    '(allow ipc-posix-shm-read-data (ipc-posix-name "apple.shm.notification_center"))',
    '(deny file-read* (subpath "/Library/Keychains"))',
    ...entries.map(item => `(deny ${item.hidden ? 'file-read* file-write*' : 'file-write*'} (${item.directory ? 'subpath' : 'literal'} ${sbString(item.source)}))`),
    ...(policy.networkAccess ? ['(allow network*)'] : []),
  ].join('\n');
}

// Active Xcode / Command Line Tools location; /usr/bin/git, python3, clang and
// make are shims that execute from here.
function macDeveloperDir() {
  const link = realOrNull('/private/var/db/xcode_select_link');
  return link && !isInside(link, '/Library') && !isInside(link, '/usr') ? link : null;
}

// cmd.exe gets the command exactly as written. This is what Node's own
// `shell: true` does; letting libuv quote it would turn `"` into `\"`, which
// cmd does not understand.
export function windowsHostLaunch(command, env, root) {
  return { command: path.win32.join(env.SystemRoot, 'System32', 'cmd.exe'), args: ['/d', '/s', '/c', `"chcp 65001 >nul & ${command}"`], cwd: root, env, windowsVerbatimArguments: true };
}

export function buildSandboxLaunch(command, { policy = getSandboxPolicy(), platform = process.platform, root = getWorkspaceRoot(), executable, temporary, entries = [], searchPath } = {}) {
  if (typeof command !== 'string' || !command.trim() || command.includes('\0') || command.length > 100000) throw new SandboxError('命令无效', 'SANDBOX_COMMAND');
  const backend = selectedBackend(policy, platform), env = cleanCommandEnv(platform);
  if (platform !== 'win32' && searchPath) env.PATH = searchPath;
  if (backend === 'windows-native' || backend === 'srt') throw new SandboxError('Anthropic 沙箱后端必须通过专用 broker 启动', 'SANDBOX_UNAVAILABLE');
  if (backend !== 'none' && policy.networkAccess && policy.allowedDomains?.length && !unrestrictedNetwork(policy)) throw new SandboxError('域名白名单仅由 Windows 原生后端执行；当前后端不支持，已阻止执行', 'SANDBOX_CONFIG');
  if (backend === 'none') {
    const host = hostCommandEnv(platform, process.env, searchPath);
    return platform === 'win32' ? { backend, ...windowsHostLaunch(command, host, root) } : { backend, command: '/bin/sh', args: ['-c', command], cwd: root, env: host };
  }
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
    // Merged-/usr distributions make /bin, /lib ... symlinks; keep them links.
    for (const p of ['/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/libx32', '/opt']) {
      let stat; try { stat = fs.lstatSync(p); } catch { continue; }
      if (stat.isSymbolicLink()) args.push('--symlink', fs.readlinkSync(p), p);
      else args.push('--ro-bind', p, p);
    }
    for (const p of ['/etc/alternatives', '/etc/ssl', '/etc/pki', '/etc/ca-certificates', '/etc/ld.so.cache', '/etc/ld.so.conf', '/etc/ld.so.conf.d', '/etc/localtime', '/etc/passwd', '/etc/group', '/etc/nsswitch.conf', '/etc/gitconfig',
      ...(policy.networkAccess ? ['/etc/resolv.conf', '/etc/hosts', '/etc/services', '/etc/protocols', '/etc/gai.conf'] : [])]) args.push('--ro-bind-try', p, p);
    // resolv.conf is commonly a link into /run (systemd-resolved, NetworkManager).
    const resolver = policy.networkAccess ? realOrNull('/etc/resolv.conf') : null;
    if (resolver && resolver !== '/etc/resolv.conf') args.push('--ro-bind-try', resolver, resolver);
    args.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/tmp/home');
    // nvm/volta/bun/pyenv toolchains under the home directory, read-only.
    for (const directory of toolchainPaths(env.PATH, { root, covered: ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/opt'] })) args.push('--ro-bind-try', directory, directory);
    // Same path as on the host, so a host fallback, file tools and the model
    // all agree on where files are.
    args.push(policy.mode === 'read-only' ? '--ro-bind' : '--bind', root, root);
    for (const item of entries) {
      const target = path.posix.join(root, item.relative);
      if (item.hidden && item.directory) args.push('--tmpfs', target, '--remount-ro', target);
      else args.push('--ro-bind', item.hidden ? '/dev/null' : item.source, target);
    }
    args.push('--clearenv', '--setenv', 'PATH', env.PATH, '--setenv', 'HOME', '/tmp/home', '--setenv', 'TMPDIR', '/tmp', '--setenv', 'LANG', env.LANG, '--setenv', 'LC_ALL', env.LC_ALL, '--chdir', root, '--', '/bin/sh', '-c', command);
    return { backend, command: executable, args, cwd: os.tmpdir(), env };
  }
  if (platform !== 'darwin') throw new SandboxError('Seatbelt 仅支持 macOS', 'SANDBOX_UNAVAILABLE');
  const covered = [...SEATBELT_SYSTEM_READS];
  const profile = seatbeltProfile(root, temporary, policy, entries, { developerDir: macDeveloperDir(), toolchains: toolchainPaths(env.PATH, { root, covered }) });
  return { backend, command: '/usr/bin/sandbox-exec', args: ['-p', profile, '/bin/sh', '-c', command], cwd: root,
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
  const auto = policy.mode !== 'off' && policy.backend === 'auto';
  if (!auto) return spawnSandboxedCommandStrict(command, { signal, policy });
  // `auto` means isolation is opportunistic. The approval layer has already
  // authorized this Bash call, so an unusable optional backend must not make
  // the tool unusable. Explicit backend selections remain fail-closed.
  const fallback = async reason => {
    const host = await spawnSandboxedCommandStrict(command, { signal, policy: { ...policy, mode: 'off' } });
    host.sandbox = { ...host.sandbox, backend: 'host-fallback', requestedBackend: selectedBackend(policy), available: false, reason, fallback: 'host' };
    return host;
  };
  const reasons = [];
  for (const backend of autoBackends(policy)) {
    const candidate = { ...policy, backend };
    // A real command through the backend, cached, so a backend that starts but
    // cannot run a shell is detected before the user's command (which may have
    // side effects) is ever started inside it.
    const check = await untilAborted(probeBackend(candidate), signal);
    if (!check.ok) {
      if (!FALLBACK_CODES.includes(check.code)) throw new SandboxError(check.message, check.code);
      reasons.push(check.message);
      continue;
    }
    try {
      const child = await spawnSandboxedCommandStrict(command, { signal, policy: candidate });
      if (reasons.length) child.sandbox.reason = reasons.join('；');
      return child;
    } catch (error) {
      // Failures here happen before the command process exists.
      if (!FALLBACK_CODES.includes(error.code)) throw error;
      reasons.push(error.message);
    }
  }
  return fallback(reasons.join('；'));
}

async function spawnSandboxedCommandStrict(command, { signal, policy = toolSandboxPolicy() ?? getSandboxPolicy() } = {}) {
  if (signal?.aborted) throw new SandboxError('任务已停止', 'ABORT_ERR');
  const backend = selectedBackend(policy);
  // Anthropic's Windows runtime always routes through its allowlist proxy and
  // rejects an unrestricted `*` rule. In explicit unrestricted mode, use the
  // cleaned host shell so ordinary curl/PowerShell traffic is not intercepted.
  if (process.platform === 'win32' && backend === 'windows-native' && unrestrictedNetwork(policy)) {
    return spawnUnrestrictedWindowsCommand(command, { signal, policy });
  }
  if (backend === 'windows-native' || backend === 'srt') return spawnBrokeredCommand(command, { signal, policy, backend });
  const executable = backend === 'docker' ? findExecutable('docker') : backend === 'bubblewrap' ? findExecutable('bwrap') : null;
  if ((backend === 'docker' || backend === 'bubblewrap') && !executable) throw new SandboxError(backend === 'docker'
    ? '沙箱不可用：请安装并启动 Docker Desktop，再运行 node scripts/build-sandbox-image.mjs'
    : '沙箱不可用：请安装 bubblewrap；自动后端会按授权规则使用宿主 shell', 'SANDBOX_UNAVAILABLE');
  if (backend === 'seatbelt' && !fs.existsSync('/usr/bin/sandbox-exec')) throw new SandboxError('沙箱不可用：系统缺少 /usr/bin/sandbox-exec', 'SANDBOX_UNAVAILABLE');
  let root;
  try { root = fs.realpathSync(getWorkspaceRoot()); }
  catch (error) { throw new SandboxError(`工作区不可访问：${error.message}`, 'SANDBOX_PATH'); }
  // Reject drive/UNC device paths at the process boundary, not just in file tools.
  if (process.platform === 'win32' && (!/^[a-z]:\\/i.test(root) || root.startsWith('\\\\'))) throw new SandboxError('不支持设备或 UNC 工作区路径', 'SANDBOX_PATH');
  const searchPath = await commandSearchPath(root);
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mli-sandbox-')));
  fs.writeFileSync(path.join(temporary, 'empty'), '', { mode: 0o644 });
  let launch;
  try { launch = buildSandboxLaunch(command, { policy, root, executable, temporary, searchPath, entries: backend === 'none' ? [] : protectedEntries(root) }); }
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
  child.sandbox = { backend, mode: policy.mode, networkAccess: policy.mode === 'off' || policy.networkAccess, cwd: backend === 'docker' ? '/workspace' : root };
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

async function spawnUnrestrictedWindowsCommand(command, { signal, policy }) {
  if (signal?.aborted) throw new SandboxError('任务已停止', 'ABORT_ERR');
  const root = fs.realpathSync(getWorkspaceRoot());
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mli-host-network-')));
  const launchPolicy = { ...policy, mode: 'off', backend: 'none' };
  let launch;
  try {
    launch = buildSandboxLaunch(command, { policy: launchPolicy, platform: 'win32', root, temporary });
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  const child = spawn(launch.command, launch.args, { cwd: launch.cwd, env: launch.env, windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.sandbox = { backend: 'host-network', mode: policy.mode, networkAccess: true, allowedDomains: ['*'], cwd: root, reason: 'Windows 原生域名代理不支持不限制模式，已使用清理环境的宿主 shell' };
  let cleanupPromise;
  child.cleanupSandbox = () => cleanupPromise ??= Promise.resolve().then(() => {
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }).finally(() => activeCommands.delete(child));
  child.stopSandbox = async () => { if (child.pid && child.exitCode === null) child.kill(); };
  activeCommands.add(child);
  child.once('error', () => { child.cleanupSandbox().catch(() => {}); });
  child.once('close', () => { child.cleanupSandbox().catch(() => {}); });
  return child;
}

const sessionKey = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// The bundled Node of the desktop client / CLI lives under the per-user install.
const bundledToolDirectories = () => [path.join(path.dirname(process.execPath), 'resources', 'node'), path.join(path.dirname(process.execPath), 'node')].filter(directory => fs.existsSync(directory));
let srtHome;
// Writable HOME for brokered POSIX commands; the real home stays read-denied.
function sandboxHome() {
  if (srtHome && fs.existsSync(srtHome)) return srtHome;
  srtHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mli-srt-home-')));
  return srtHome;
}

export function srtRuntimeConfig({ root, policy, entries, home = os.homedir(), searchPath = '', writableHome }) {
  if (path.resolve(root) === path.resolve(home) || path.dirname(root) === root) throw new SandboxError('Anthropic 沙箱需要独立项目目录，不能把用户主目录或根目录作为工作区', 'SANDBOX_PATH');
  // Reads are allowed by default upstream; deny the home directory (keys,
  // tokens, browser data, MLI's own data) and reopen the workspace plus
  // home-installed toolchains (nvm, volta, pyenv ...). A protected path
  // inside the workspace is more specific than the reopen and stays denied.
  const toolchains = toolchainPaths(searchPath, { root, home }).filter(directory => isInside(directory, home));
  return {
    network: { allowedDomains: policy.networkAccess ? [...policy.allowedDomains] : [], deniedDomains: [] },
    filesystem: {
      denyRead: [home, ...entries.filter(item => item.hidden).map(item => item.source)],
      allowRead: [root, writableHome, ...toolchains],
      allowWrite: [...(policy.mode === 'workspace-write' ? [root] : []), writableHome],
      denyWrite: [...entries.filter(item => !item.hidden).map(item => item.source), ...(policy.mode === 'read-only' ? [root] : [])],
    },
  };
}

// Anthropic Sandbox Runtime backends (Windows native, macOS/Linux) run through
// the long-lived broker: initialization happens once per workspace/policy and
// commands may run in parallel.
async function spawnBrokeredCommand(command, { signal, policy, backend }) {
  const windows = backend === 'windows-native';
  if (typeof command !== 'string' || !command.trim() || command.includes('\0') || command.length > (windows ? 24000 : 100000)) throw new SandboxError(windows ? 'Windows 命令无效或过长' : '命令无效', 'SANDBOX_COMMAND');
  if (windows && process.platform !== 'win32') throw new SandboxError('原生 Windows 沙箱仅支持 Windows', 'SANDBOX_UNAVAILABLE');
  if (!windows && !['darwin', 'linux'].includes(process.platform)) throw new SandboxError('Anthropic 沙箱后端仅支持 macOS 和 Linux', 'SANDBOX_UNAVAILABLE');
  if (!windows && !srtNetworkSupported(policy)) throw new SandboxError('Anthropic 沙箱只能按域名白名单联网；请配置白名单，或改用 Seatbelt/Bubblewrap 后端获得不受限网络', 'SANDBOX_CONFIG');
  const helper = windows ? await ensureWindowsSandboxComponents() : null;
  if (signal?.aborted) throw new SandboxError('任务已停止', 'ABORT_ERR');
  let root;
  try { root = fs.realpathSync(getWorkspaceRoot()); }
  catch (error) { throw new SandboxError(`工作区不可访问：${error.message}`, 'SANDBOX_PATH'); }
  if (windows && (!/^[a-z]:\\/i.test(root) || root.startsWith('\\\\'))) throw new SandboxError('原生 Windows 沙箱不支持 UNC 或设备工作区路径', 'SANDBOX_PATH');
  const entries = protectedEntries(root);
  // Protect the native broker dependency from writes when developing MLI itself.
  if (helper && isInside(helper.directory, root)) entries.push({ source: helper.directory, hidden: false });
  const hidden = entries.filter(item => item.hidden).map(item => item.source), readOnly = entries.filter(item => !item.hidden).map(item => item.source);
  const policyKey = { mode: policy.mode, networkAccess: policy.networkAccess, allowedDomains: policy.allowedDomains };
  let launch;
  if (windows) {
    const readable = windowsReadableToolchains(cleanCommandEnv('win32').PATH, { root, dataRoot: DATA_ROOT, extra: bundledToolDirectories() });
    const config = windowsRuntimeConfig({ root, policy, entries, helper: helper.file, readable });
    launch = {
      command: `chcp 65001 >nul & ${command}`,
      // Protected paths that existed at initialization are stamped once; the
      // runtime skips those and stamps only ones that appeared since.
      session: { key: sessionKey({ backend, root, policyKey, readable, helper: helper.file }), config, helper: { file: helper.file, directory: helper.directory } },
      perExec: { filesystem: { denyRead: hidden, denyWrite: readOnly } },
      windowsEnv: policy.networkAccess ? { GIT_CONFIG_PARAMETERS: "'http.schannelCheckRevoke'='false'" } : undefined,
      brokerEnv: windowsBrokerEnvironment(), claim: claimWindowsSandbox, requestRelease: requestWindowsSandboxRelease,
    };
  } else {
    const searchPath = await commandSearchPath(root);
    const writableHome = sandboxHome();
    const config = srtRuntimeConfig({ root, policy, entries, searchPath, writableHome });
    const brokerEnv = { ...cleanCommandEnv(), PATH: searchPath, HOME: os.homedir(), TMPDIR: os.tmpdir(), ELECTRON_RUN_AS_NODE: '1' };
    launch = {
      command,
      session: { key: sessionKey({ backend, root, policyKey, filesystem: { ...config.filesystem, denyRead: [], denyWrite: [] } }), config },
      // Per-command filesystem settings replace the session's on macOS/Linux.
      perExec: { filesystem: config.filesystem },
      env: { HOME: writableHome, PATH: searchPath },
      brokerEnv, claim: null,
    };
  }
  const sandbox = { backend, mode: policy.mode, networkAccess: policy.networkAccess && policy.allowedDomains.length > 0, allowedDomains: [...policy.allowedDomains], cwd: root };
  let child;
  child = await runBrokerCommand(launch.command, { ...launch, cwd: root, signal, sandbox, onCleanup: () => activeCommands.delete(child) });
  activeCommands.add(child);
  // Registered first, so callers' close handlers see the explained failure.
  child.once('close', () => {
    if (child.sandboxFailure) {
      const hint = friendlyFailure(backend, child.sandboxFailure.code, child.sandboxFailure.message);
      if (hint) child.sandboxFailure.message = `${hint}（${child.sandboxFailure.message.slice(0, 1000)}）`;
      resetSandboxProbes(); // The next command re-checks instead of trusting a stale success.
    }
    child.cleanupSandbox().catch(() => {});
  });
  if (signal?.aborted) child.stopSandbox().catch(() => {});
  return child;
}
