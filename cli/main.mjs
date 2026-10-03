import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import runtimeLauncher from '../electron/runtime.cjs';
import userData from '../core/user-data.cjs';
import { HELP, parseOptions, loopbackUrl } from './options.mjs';
import { RuntimeClient } from './client.mjs';
import { executePrompt } from './exec.mjs';
import { APP_VERSION } from '../core/version.mjs';
import { configureModel, login, terminalForm } from './forms.mjs';

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (options.help) { process.stdout.write(HELP); return; }
  if (options.version) { process.stdout.write(`${APP_VERSION}\n`); return; }
  const interactive = ['tui', 'config', 'login'].includes(options.command);
  if (interactive && (!process.stdin.isTTY || !process.stdout.isTTY || process.env.TERM === 'dumb')) throw new Error('此命令需要交互终端；脚本和管道请使用 mli exec [--json] "任务"');
  if (!fs.existsSync(options.cwd) || !fs.statSync(options.cwd).isDirectory()) throw new Error('工作目录不存在');
  const dataRoot = options.dataRoot || userData.userDataRoot({ legacy: Number(process.versions.node.split('.')[0]) < 18 });
  const abort = new AbortController();
  const modernTui = options.command === 'tui' && Number(process.versions.node.split('.')[0]) >= 18 && process.env.MLI_TUI_LEGACY !== '1';
  let terminalOwnsInput = false;
  const onSignal = () => abort.abort();
  const onInterrupt = () => { if (!terminalOwnsInput) abort.abort(); };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onSignal);
  let runtime;
  let form;
  try {
    runtime = options.connect ? await runtimeLauncher.connectRuntime(loopbackUrl(options.connect)) : await runtimeLauncher.acquireRuntime({
      executable: process.execPath, runtimeRoot, dataRoot,
      packaged: fs.existsSync(path.join(runtimeRoot, 'client-defaults.env')),
      environment: { MLI_AGENT_WORKSPACE: options.cwd },
    });
    const client = new RuntimeClient(runtime.url);
    if (abort.signal.aborted) { process.exitCode = 130; return; }
    if (['tui', 'exec', 'serve'].includes(options.command)) await client.useWorkspace(options.cwd);
    if (options.command === 'exec') process.exitCode = await executePrompt(client, options, { signal: abort.signal });
    else if (options.command === 'tui') {
      if (modernTui) {
        const { runModernTui } = await import('./modern-launcher.mjs');
        terminalOwnsInput = true;
        process.exitCode = await runModernTui(client, { ...options, dataRoot }, { signal: abort.signal });
      } else {
        const { runTui } = await import('./tui.mjs');
        process.exitCode = await runTui(client, options, { signal: abort.signal });
      }
    } else if (options.command === 'models') {
      const settings = await client.request('/api/settings');
      for (const model of settings.models) process.stdout.write(`${model.id === settings.activeModelId ? '*' : ' '} ${model.id}\t${model.name}\t${model.model}\n`);
    } else if (options.command === 'model') {
      if (options.positional.length !== 1) throw new Error('用法：mli model MODEL_ID');
      await client.request('/api/settings', { action: 'activate_model', modelId: options.positional[0] });
      process.stdout.write(`模型已切换：${options.positional[0]}\n`);
    } else if (options.command === 'config' || options.command === 'login') {
      form = await terminalForm(abort.signal);
      const result = options.command === 'config' ? await configureModel(client, form) : await login(client, form);
      process.stdout.write(result ? '已保存\n' : '已取消\n');
    } else if (options.command === 'logout') {
      await client.request('/api/account/logout', {});
      process.stdout.write('已退出账户\n');
    } else if (options.command === 'serve') {
      process.stdout.write(`MLI runtime: ${runtime.url}\nWorkspace: ${options.cwd}\n`);
      if (!abort.signal.aborted) await new Promise(resolve => abort.signal.addEventListener('abort', resolve, { once: true }));
    }
  } finally {
    form?.close();
    await runtime?.release();
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onSignal);
  }
}
