import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assetFile } from './assets.mjs';
import { filmCanvasMediaPath } from './film-canvas.mjs';

// Resolve only a registered asset or a validated workspace media file.
export function filmCanvasMediaInfo({ assetId, path: filePath } = {}) {
  if (assetId) {
    const asset = assetFile(assetId);
    const stat = fs.statSync(asset.path);
    return { path: asset.path, name: path.basename(asset.path), size: stat.size, mime: asset.item.mime };
  }
  return filmCanvasMediaPath(filePath || '');
}

export async function openFilmCanvasMedia(input, action, launch = spawn) {
  if (!['open', 'reveal'].includes(action)) throw new Error('不支持的素材操作');
  const media = filmCanvasMediaInfo(input);
  const reveal = action === 'reveal';
  const [command, args] = process.platform === 'darwin'
    ? ['open', reveal ? ['-R', media.path] : [media.path]]
    : process.platform === 'win32'
      ? reveal ? ['explorer.exe', ['/select,', media.path]] : ['rundll32.exe', ['url.dll,FileProtocolHandler', media.path]]
      : ['xdg-open', [reveal ? path.dirname(media.path) : media.path]];
  await new Promise((resolve, reject) => {
    const child = launch(command, args, { detached: false, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('无法打开素材，请检查系统默认应用')));
  });
  return { ok: true };
}
