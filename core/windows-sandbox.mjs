// Native Windows backend from Anthropic Sandbox Runtime. Installation is an
// explicit user action; detection and execution never provision system policy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { createRequire } from 'node:module';
import { SandboxError } from './sandbox-policy.mjs';

const require = createRequire(import.meta.url);
const HELPER_HASHES = {
  x64: 'b1927893da83a1cb28054f63c8b2bc61ac4303cf63dd92c0182f79c5c414d26d',
  arm64: '72a289b76db3de6b94bb7ae7821870dcbf7b950a4de98c8b5e92619060a5b44d',
};
export const WINDOWS_SANDBOX_SETUP = 'node scripts/setup-windows-sandbox.mjs install';
export function windowsHelper() {
  if (process.platform !== 'win32') throw new SandboxError('原生 Windows 沙箱仅支持 Windows', 'SANDBOX_UNAVAILABLE');
  const directory = path.dirname(path.dirname(require.resolve('@anthropic-ai/sandbox-runtime')));
  const file = path.join(directory, 'vendor', 'srt-win', process.arch, 'srt-win.exe');
  if (!HELPER_HASHES[process.arch] || !fs.existsSync(file)) throw new SandboxError('当前架构没有原生沙箱 helper（支持 Windows x64 / arm64）', 'SANDBOX_UNAVAILABLE');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash !== HELPER_HASHES[process.arch]) throw new SandboxError('原生沙箱 helper 校验失败，已阻止执行；请重新安装锁定的依赖', 'SANDBOX_UNAVAILABLE');
  return { file, directory };
}
export async function windowsSandboxStatus() {
  try {
    const { file } = windowsHelper();
    const { checkWindowsDependenciesAsync, resolveSrtWin } = await import('@anthropic-ai/sandbox-runtime');
    const check = await checkWindowsDependenciesAsync({ srtWin: resolveSrtWin({ path: file }) });
    return { available: check.errors.length === 0, reason: check.errors.length ? `Windows 原生沙箱未就绪，请运行 ${WINDOWS_SANDBOX_SETUP}（一次 UAC 授权）；${check.errors.join('; ').slice(0, 350)}` : 'Windows 原生沙箱已安装（Alpha）；每次执行还会验证内核网络封锁', setupCommand: WINDOWS_SANDBOX_SETUP, setupSupported: true };
  } catch (error) { return { available: false, reason: error.message, setupCommand: WINDOWS_SANDBOX_SETUP, setupSupported: false }; }
}

// Desktop settings invoke this explicitly. Status checks never launch the installer.
export async function installNativeWindowsSandbox() {
  const {file}=windowsHelper(); // Architecture and pinned SHA-256 check before any UAC.
  const release=await claimWindowsSandbox();
  try {
    const {installWindowsSandboxAsync}=await import('@anthropic-ai/sandbox-runtime');
    const result=await installWindowsSandboxAsync({srtWin:{exe:file,prependArgs:['--srt-win']}});
    const status=await windowsSandboxStatus();
    if(result.cancelled)return {cancelled:true,status};
    if(!status.available)throw new SandboxError(`安装后沙箱仍未就绪：${status.reason}`,'SANDBOX_UNAVAILABLE');
    return {cancelled:false,status};
  } finally {await release();}
}

export function windowsRuntimeConfig({ root, policy, entries, helper, home = os.homedir() }) {
  const norm = value => path.win32.resolve(value).toLowerCase();
  if (norm(root) === norm(home) || norm(root) === norm(path.win32.parse(root).root)) throw new SandboxError('Windows 原生沙箱需要独立项目目录，不能把用户主目录或盘符根作为工作区', 'SANDBOX_PATH');
  return {
    windows: { srtWin: { path: helper } },
    network: { allowedDomains: policy.networkAccess ? [...policy.allowedDomains] : [], deniedDomains: [], strictAllowlist: true, allowLocalBinding: false },
    filesystem: {
      // An explicit project read grant reopens it beneath the profile deny.
      allowRead: [root], allowWrite: policy.mode === 'workspace-write' ? [root] : [],
      denyRead: [home, ...entries.filter(item => item.hidden).map(item => item.source)],
      denyWrite: [...entries.map(item => item.source), ...(policy.mode === 'read-only' ? [root] : [])],
    },
  };
}

// ACL grants target a shared sandbox SID, so MLI commands are serialized across
// this Windows user's runtimes. Other applications using that SID must not run
// concurrently with sensitive MLI tasks.
export async function claimWindowsSandbox() {
  // libuv binds Windows pipes with FILE_FLAG_FIRST_PIPE_INSTANCE. Unlike a
  // stale PID file, the kernel releases this claim on process exit/crash.
  const owner = crypto.createHash('sha256').update(os.homedir().toLowerCase()).digest('hex').slice(0, 24);
  const server = net.createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(new SandboxError(`原生沙箱正在使用或互斥锁不可用：${error.code}；请等待其他命令结束后重试`, 'SANDBOX_BUSY')));
    server.listen({ path: `\\\\.\\pipe\\mli-agent-native-sandbox-${owner}`, exclusive: true }, resolve);
  });
  let release;
  return () => release ??= new Promise(resolve => server.close(resolve));
}
