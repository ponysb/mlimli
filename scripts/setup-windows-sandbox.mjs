// This command intentionally invokes the upstream installer, which requests
// UAC before provisioning its dedicated account and WFP filters.
import { installWindowsSandboxAsync, uninstallWindowsSandbox, resolveSrtWin } from '@anthropic-ai/sandbox-runtime';
import { windowsHelper, windowsSandboxPreflight } from '../core/windows-sandbox.mjs';
const action = process.argv[2] || 'status';
if (!['install', 'uninstall', 'status'].includes(action)) throw new Error('用法：node scripts/setup-windows-sandbox.mjs install|uninstall|status');
const srtWin = resolveSrtWin({ path: windowsHelper().file });
if (action === 'install') {
  console.log('将安装独立 srt-sandbox 账户和该账户的 WFP 网络过滤规则；请在 UAC 窗口授权。');
  const result = await installWindowsSandboxAsync({ srtWin });
  if (result.cancelled) process.exitCode = 1;
} else if (action === 'uninstall') {
  const result = uninstallWindowsSandbox({ srtWin });
  if (result.cancelled) process.exitCode = 1;
}
// Provisioning only; the full launch/WFP/ACL check runs in the app (重新检测).
console.log(JSON.stringify(await windowsSandboxPreflight(), null, 2));
