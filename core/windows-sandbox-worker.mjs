// Trusted broker process, outside the sandbox. One manager per command avoids
// shared mutable library policy; IPC carries no host credentials or tool output.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { SandboxManager, SandboxRuntimeConfigSchema } from '@anthropic-ai/sandbox-runtime';
import { windowsHelper } from './windows-sandbox.mjs';

let child, stopped = false, started = false;
async function stop() {
  stopped = true;
  if (child?.pid && child.exitCode === null) {
    // The native helper owns a kill-on-close Windows job. Kill its broker;
    // closing the job also terminates descendants running under the other SID.
    child.kill();
  }
}
process.on('message', async message => {
  if (message?.type === 'stop') { await stop(); return; }
  if (message?.type !== 'execute' || started) return;
  started = true;
  let exitCode = 1;
  try {
    windowsHelper(); // Recheck before any host-side native helper invocation.
    const config = SandboxRuntimeConfigSchema.parse(message.config);
    await SandboxManager.initialize(config, undefined, false);
    if (stopped) return;
    if (!await SandboxManager.waitForNetworkInitialization()) throw new Error('网络隔离代理初始化失败');
    if (stopped) return;
    const { argv, env } = await SandboxManager.wrapWithSandboxArgv(message.command, 'cmd', undefined, undefined, message.root, { commandId: message.id });
    if (stopped) return;
    child = spawn(argv[0], argv.slice(1), { cwd: message.root, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(process.stdout, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    const [code] = await once(child, 'close');
    exitCode = stopped ? 1 : code ?? 1;
  } catch (error) { process.stderr.write(`原生沙箱执行失败：${error.message}\n`); }
  finally {
    try { await SandboxManager.reset(); }
    catch (error) { process.stderr.write(`原生沙箱清理失败：${error.message}\n`); exitCode = 1; }
    process.exitCode = exitCode;
    process.disconnect?.();
  }
});
process.on('disconnect', () => { stop().catch(() => {}); });
