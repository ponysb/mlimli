import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

function modified(directory) {
  return Math.max(...fs.readdirSync(directory, { withFileTypes: true }).map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? modified(file) : fs.statSync(file).mtimeMs;
  }), 0);
}

export async function modernBinary() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const name = process.platform === 'win32' ? 'mli-tui.exe' : 'mli-tui';
  const installed = path.join(root, 'cli', 'bin', name);
  if (fs.existsSync(installed)) return installed;
  if (fs.existsSync(path.join(root, 'client-defaults.env'))) throw new Error('安装包缺少新版终端程序，请重新安装');
  const binary = path.join(root, 'node_modules', '.cache', 'mli-tui', `${process.platform}-${process.arch}`, name);
  const newest = Math.max(modified(path.join(root, 'cli', 'modern')), ...['cli/client.mjs', 'cli/forms.mjs', 'scripts/build-tui.mjs', 'scripts/compile-tui.ts', 'package-lock.json'].map(file => fs.statSync(path.join(root, file)).mtimeMs));
  if (!fs.existsSync(binary) || fs.statSync(binary).mtimeMs < newest) {
    process.stderr.write('正在构建终端程序…\n');
    const { buildTui } = await import('../scripts/build-tui.mjs');
    return buildTui();
  }
  return binary;
}

export async function runModernTui(client, options, { signal } = {}) {
  const binary = await modernBinary();
  if (signal?.aborted) return 130;
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], {
      cwd: options.cwd, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, OTUI_ASSET_ROOT: path.join(path.dirname(binary), 'assets'), MLI_TUI_OPTIONS: JSON.stringify({ ...options, url: client.url }) },
    });
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.once('error', error => { signal?.removeEventListener('abort', abort); reject(error); });
    child.once('exit', (code, endedBy) => { signal?.removeEventListener('abort', abort); resolve(endedBy ? 130 : code ?? 1); });
  });
}
