// Native Windows backend from Anthropic Sandbox Runtime. Installation is an
// explicit user action; detection and execution never provision system policy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { SandboxError, PRIVATE_DIRS } from './sandbox-policy.mjs';
import { ensureSandboxComponents, restoreSandboxComponents } from './sandbox-repair.mjs';
import { shutdownSandboxBroker } from './sandbox-broker.mjs';

const require = createRequire(import.meta.url);
const HELPER_HASHES = {
  x64: 'b1927893da83a1cb28054f63c8b2bc61ac4303cf63dd92c0182f79c5c414d26d',
  arm64: '72a289b76db3de6b94bb7ae7821870dcbf7b950a4de98c8b5e92619060a5b44d',
};
export const WINDOWS_SANDBOX_SETUP = 'node scripts/setup-windows-sandbox.mjs install';
const SETUP_HINT = '在 设置 → 权限配置 → 运行沙箱 中点击“安装沙箱”（需要一次管理员 UAC 授权；标准用户需管理员协助）';
export async function ensureWindowsSandboxComponents() {
  if (process.platform !== 'win32' || !HELPER_HASHES[windowsHelperArchitecture()]) throw new SandboxError('原生 Windows 沙箱仅支持 Windows x64 / arm64', 'SANDBOX_UNAVAILABLE');
  try {
    return await ensureSandboxComponents(async () => {
      const helper = windowsHelper();
      await import('@anthropic-ai/sandbox-runtime');
      return helper;
    }, { restore: async () => {
      await shutdownSandboxBroker();
      const release = await claimWindowsSandboxWhenFree();
      try { return restoreSandboxComponents(); } finally { await release(); }
    } });
  } catch (error) { throw new SandboxError(`沙箱组件自动修复失败：${error.message}；请在权限配置中修复沙箱或重新安装客户端`, 'SANDBOX_UNAVAILABLE'); }
}
export async function repairNativeWindowsSandbox({ packaged = true } = {}) {
  if (process.platform !== 'win32' || !HELPER_HASHES[windowsHelperArchitecture()]) throw new SandboxError('原生 Windows 沙箱仅支持 Windows x64 / arm64', 'SANDBOX_UNAVAILABLE');
  const release = await claimWindowsSandboxWhenFree();
  try { await repairWindowsSandboxComponents({ packaged }); }
  finally { await release(); }
  const status = await windowsSandboxPreflight();
  return status.available ? { cancelled: false, status } : installNativeWindowsSandbox();
}
export async function repairWindowsSandboxComponents({
  packaged = true,
  restore = restoreSandboxComponents,
  getHelper = windowsHelper,
  loadRuntime = () => import('@anthropic-ai/sandbox-runtime'),
} = {}) {
  // Installed clients carry an offline backup. Development checkouts use the
  // dependency tree installed by npm and do not generate that release asset.
  if (packaged) restore();
  getHelper();
  await loadRuntime();
}
export function windowsHelperArchitecture(arch = process.arch, nativeArchitecture = process.env.PROCESSOR_ARCHITEW6432) {
  if (arch !== 'ia32') return arch;
  const native = String(nativeArchitecture || '').toLowerCase();
  if (native === 'amd64' || native === 'x86_64') return 'x64';
  if (native === 'arm64') return 'arm64';
  return arch;
}
export function windowsHelper() {
  if (process.platform !== 'win32') throw new SandboxError('原生 Windows 沙箱仅支持 Windows', 'SANDBOX_UNAVAILABLE');
  const architecture = windowsHelperArchitecture();
  const directory = path.dirname(path.dirname(require.resolve('@anthropic-ai/sandbox-runtime')));
  const file = path.join(directory, 'vendor', 'srt-win', architecture, 'srt-win.exe');
  if (!HELPER_HASHES[architecture] || !fs.existsSync(file)) throw new SandboxError('当前系统没有可用的原生沙箱 helper（支持 Windows x64 / arm64；32 位系统不支持）', 'SANDBOX_UNAVAILABLE');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash !== HELPER_HASHES[architecture]) throw new SandboxError('原生沙箱 helper 校验失败，已阻止执行；请重新安装锁定的依赖', 'SANDBOX_UNAVAILABLE');
  return { file, directory, architecture };
}

// Upstream error codes and Win32 errors, in words a user can act on.
export function describeWindowsSandboxFailure(code = '', message = '') {
  const text = `${code} ${message}`;
  if (/not_provisioned|not provisioned/i.test(text)) return `尚未安装 Windows 原生沙箱：${SETUP_HINT}`;
  // Upstream appends a seclogon hint to every CreateProcessWithLogonW error;
  // access denied there means the sandbox account cannot open the helper or
  // the working directory, not that the service is off.
  if (/CreateProcessWithLogonW[^\n]*(0x80070005|拒绝访问|access is denied)/i.test(text)) return '沙箱账户无法打开沙箱 helper 或工作目录（CreateProcessWithLogonW 拒绝访问）；请点击“重新检测”，仍失败时点击“修复沙箱”';
  if (/\b1058\b|0x8007041d|service (?:is )?disabled|seclogon[^\n]*disabled/i.test(text)) return 'Windows “Secondary Logon”（seclogon）服务被禁用，沙箱无法以独立账户启动命令；请让管理员运行 sc config seclogon start= demand 后重新检测';
  if (/\b1385\b|logon type/i.test(text)) return '系统策略禁止沙箱账户登录（错误 1385）；请联系管理员检查“拒绝本地登录/拒绝以批处理作业登录”策略或安全软件';
  if (/\b1326\b|\b1327\b|\b1330\b|cred/i.test(text)) return '沙箱账户凭据失效；请在设置中点击“修复沙箱”重新安装';
  if (/3221225781|0xC0000135|\bDLL\b/i.test(text)) return 'srt-win.exe 缺少 Windows 运行库；Legacy/Windows 7 可能不支持该原生沙箱，请安装 Windows 更新和 Microsoft Visual C++ 运行库';
  if (/wfp|egress/i.test(text)) return 'Windows 防火墙（WFP）隔离规则缺失或失效；请在设置中点击“修复沙箱”重新安装';
  if (/timeout|timed out/i.test(text)) return '沙箱初始化超时（首次为沙箱账户创建用户配置可能需要 30 秒以上），请稍后重新检测';
  if (/acl|access is denied|拒绝访问/i.test(text)) return '为工作区设置沙箱访问权限失败；请确认工作区不在只读、网络或加密（EFS）目录中';
  if (/argv_too_long/i.test(text)) return '命令过长，超过 Windows 命令行长度上限';
  return '';
}

function run(command, args, timeoutMs = 5000) {
  return new Promise(resolve => {
    let output = '', child;
    try { child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { resolve(''); return; }
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(output); }, timeoutMs);
    child.stdout.on('data', chunk => { if (output.length < 8000) output += chunk; });
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.on('close', () => { clearTimeout(timer); resolve(output); });
  });
}
// CreateProcessWithLogonW needs seclogon. Demand-start is fine; disabled is not.
export async function seclogonDisabled() {
  const output = await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'sc.exe'), ['qc', 'seclogon']);
  return /START_TYPE\s*:\s*4\b|DISABLED/i.test(output);
}

// Readiness without starting a session: helper integrity, seclogon and
// provisioning. Read-only; never claims or changes system state. The real
// launch, WFP and ACL checks run when the broker initializes.
export async function windowsSandboxPreflight() {
  const base = { setupCommand: WINDOWS_SANDBOX_SETUP, setupSupported: true };
  try {
    const { file } = windowsHelper();
    if (await seclogonDisabled()) return { ...base, available: false, setupSupported: false, probe: 'seclogon', errorCode: 'seclogon_disabled', reason: describeWindowsSandboxFailure('seclogon_disabled', 'seclogon disabled') };
    const { checkWindowsDependenciesAsync, getWindowsSandboxUserStatusAsync, resolveSrtWin } = await import('@anthropic-ai/sandbox-runtime');
    const srtWin = resolveSrtWin({ path: file });
    const check = await checkWindowsDependenciesAsync({ srtWin });
    if (check.errors.length) return { ...base, available: false, probe: 'dependencies', errorCode: 'not_provisioned', reason: `${describeWindowsSandboxFailure('not_provisioned')}；${check.errors.join('; ').slice(0, 350)}` };
    const user = await getWindowsSandboxUserStatusAsync({ srtWin });
    if (!user.provisioned || !user.credPresent) return { ...base, available: false, probe: 'provisioning', errorCode: 'not_provisioned', reason: describeWindowsSandboxFailure('not_provisioned') };
    return { ...base, available: true, probe: 'provisioning', reason: 'Windows 原生沙箱已安装' };
  } catch (error) {
    const detail = error.message || String(error);
    const known = describeWindowsSandboxFailure(error?.code, detail);
    return { ...base, available: false, probe: 'provisioning', errorCode: error?.code || '', setupSupported: error?.code !== 'SANDBOX_BUSY',
      reason: known ? `${known}（${detail.slice(0, 300)}）` : `Windows 原生沙箱检测失败：${detail}` };
  }
}

// Desktop settings invoke this explicitly. Status checks never launch the installer.
export async function installNativeWindowsSandbox() {
  const {file}=windowsHelper(); // Architecture and pinned SHA-256 check before any UAC.
  const release=await claimWindowsSandboxWhenFree();
  try {
    const {installWindowsSandboxAsync,resolveSrtWin}=await import('@anthropic-ai/sandbox-runtime');
    const result=await installWindowsSandboxAsync({srtWin:resolveSrtWin({path:file})});
    const status=await windowsSandboxPreflight();
    if(result.cancelled)return {cancelled:true,status};
    if(!status.available)throw new SandboxError(`安装后沙箱仍未就绪：${status.reason}`,'SANDBOX_UNAVAILABLE');
    return {cancelled:false,status};
  } finally {await release();}
}

// Tools installed under the profile (Python, %APPDATA%\npm, nvm targets, the
// bundled Node) are invisible to the sandbox account. Grant read on those PATH
// directories only; never the profile, a parent of the workspace, MLI's data
// directory, or folders that typically hold documents or credentials.
const PROFILE_BLOCKED = ['desktop', 'documents', 'downloads', 'onedrive', 'pictures', 'videos', 'music', 'favorites', 'contacts', 'links', 'saved games', 'searches',
  '.docker', '.kube', '.azure', '.config', '.vscode', '.cursor', '.claude', 'credentials', 'microsoft\\credentials', 'microsoft\\protect', 'packages'];
export function windowsReadableToolchains(pathValue, { root, home = os.homedir(), dataRoot, extra = [], limit = 40 } = {}) {
  const norm = value => path.win32.resolve(value).toLowerCase().replace(/\\+$/, '');
  const inside = (child, parent) => { const c = norm(child), p = norm(parent); return c === p || c.startsWith(p + '\\'); };
  const usable = directory => {
    if (!/^[a-z]:\\/i.test(directory) || !inside(directory, home) || norm(directory) === norm(home)) return false;
    if (root && (inside(directory, root) || inside(root, directory))) return false;
    if (dataRoot && (inside(directory, dataRoot) || inside(dataRoot, directory))) return false;
    const relative = path.win32.relative(home, directory).toLowerCase();
    const parts = relative.split('\\');
    if (parts.some(part => PRIVATE_DIRS.includes(part) || PROFILE_BLOCKED.includes(part)) || PROFILE_BLOCKED.some(blocked => blocked.includes('\\') && relative.includes(blocked))) return false;
    // Never a whole AppData root such as AppData\Local.
    return parts[0] !== 'appdata' || parts.length >= 3;
  };
  const result = new Set();
  for (const raw of [...String(pathValue || '').split(';'), ...extra]) {
    const entry = raw.trim().replace(/^"|"$/g, '');
    if (!entry || !path.win32.isAbsolute(entry)) continue;
    let real;
    try { if (!fs.statSync(entry).isDirectory()) continue; real = fs.realpathSync.native(entry); } catch { continue; }
    // nvm-style links outside the profile point into it; grant the target.
    for (const directory of new Set([path.win32.resolve(entry), path.win32.resolve(real)])) if (usable(directory)) result.add(directory);
    if (result.size >= limit) break;
  }
  return [...result].slice(0, limit);
}

export function windowsRuntimeConfig({ root, policy, entries, helper, home = os.homedir(), readable = [] }) {
  const norm = value => path.win32.resolve(value).toLowerCase();
  if (norm(root) === norm(home) || norm(root) === norm(path.win32.parse(root).root)) throw new SandboxError('Windows 原生沙箱需要独立项目目录，不能把用户主目录或盘符根作为工作区', 'SANDBOX_PATH');
  const unrestricted = policy.networkAccess && policy.allowedDomains.includes('*');
  return {
    windows: { srtWin: { path: helper } },
    network: { allowedDomains: policy.networkAccess && !unrestricted ? [...policy.allowedDomains] : [], deniedDomains: [], strictAllowlist: !unrestricted, allowLocalBinding: false },
    filesystem: {
      // An explicit project read grant reopens it beneath the profile deny;
      // toolchain directories under the profile are read-only grants.
      allowRead: [root, ...readable], allowWrite: policy.mode === 'workspace-write' ? [root] : [],
      // The dedicated account has no ambient access to the real user's
      // profile. Denying the whole profile would force Windows to propagate a
      // large inheritable ACL and can stall initialization; the explicit root
      // grant below is the only profile subtree it can enter.
      // On Windows a deny-read stamp already prevents opening the target for
      // writes. Stamping the same path as deny-write as well makes the native
      // helper replace the read-deny ACE with its narrower write-deny ACE.
      denyRead: entries.filter(item => item.hidden).map(item => item.source),
      denyWrite: [...entries.filter(item => !item.hidden).map(item => item.source), ...(policy.mode === 'read-only' ? [root] : [])],
    },
  };
}

// ACL grants target a shared sandbox SID, so MLI brokers are serialized across
// this Windows user's runtimes. Other applications using that SID must not run
// concurrently with sensitive MLI tasks.
const claimPipe = () => `\\\\.\\pipe\\mli-agent-native-sandbox-${crypto.createHash('sha256').update(os.homedir().toLowerCase()).digest('hex').slice(0, 24)}`;
// `onContention` runs when another process asks for the claim, so an idle
// holder (a warm broker) can give it up instead of making the other wait.
export async function claimWindowsSandbox(onContention) {
  // libuv binds Windows pipes with FILE_FLAG_FIRST_PIPE_INSTANCE. Unlike a
  // stale PID file, the kernel releases this claim on process exit/crash.
  const server = net.createServer(socket => { socket.destroy(); onContention?.(); });
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(new SandboxError(`原生沙箱正在使用或互斥锁不可用：${error.code}；请等待其他命令结束后重试`, 'SANDBOX_BUSY')));
    server.listen({ path: claimPipe(), exclusive: true }, resolve);
  });
  let release;
  const close = () => release ??= new Promise(resolve => server.close(resolve));
  // An idle holder must not keep a one-shot process alive.
  close.hold = active => { active ? server.ref() : server.unref(); };
  return close;
}
// Carries no data; the connection itself is the request.
export function requestWindowsSandboxRelease() {
  return new Promise(resolve => {
    const socket = net.connect(claimPipe());
    const done = () => { socket.destroy(); resolve(); };
    socket.once('connect', done); socket.once('error', done); socket.setTimeout(1000, done);
  });
}

// Setup and repair run in the desktop main process; the runtime's broker is
// asked to stop by the install preflight, so a short wait covers its cleanup.
export async function claimWindowsSandboxWhenFree(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    try { return await claimWindowsSandbox(); }
    catch (error) {
      if (error.code !== 'SANDBOX_BUSY' || Date.now() > deadline) throw error;
      if (attempt % 8 === 0) await requestWindowsSandboxRelease();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}
