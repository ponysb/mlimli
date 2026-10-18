import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const runtimeRoot = fileURLToPath(new URL('../', import.meta.url));
let pending;

export function restoreSandboxComponents({ root = runtimeRoot } = {}) {
  const manifest = path.join(root, 'core', 'sandbox-repair-manifest.json');
  if (!fs.existsSync(manifest)) throw new Error('客户端未附带沙箱修复组件，请安装包含修复组件的新版客户端');
  const { sha256 } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const archive = fs.readFileSync(path.join(root, 'sandbox-runtime-repair.gz'));
  if (crypto.createHash('sha256').update(archive).digest('hex') !== sha256) throw new Error('沙箱修复组件校验失败，请重新安装客户端');
  const files = JSON.parse(gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 }).toString('utf8'));
  // Validate every target before restoring any file; never follow directory links.
  const targets = files.map(file => {
    if (!/^node_modules\//.test(file.path) || file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error('沙箱修复组件包含无效路径');
    const target = path.join(root, file.path);
    let current = root;
    for (const part of file.path.split('/')) {
      current = path.join(current, part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('沙箱修复路径不能包含符号链接');
    }
    return { target, data: Buffer.from(file.data, 'base64') };
  });
  for (const { target, data } of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, data, { flag: 'wx' }); fs.renameSync(temporary, target); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  return { restoredFiles: targets.length };
}

export async function ensureSandboxComponents(check, { restore = restoreSandboxComponents } = {}) {
  try { return await check(); }
  catch (error) {
    if (error.code === 'ABORT_ERR' || error.code === 'SANDBOX_BUSY') throw error;
    if (!pending) pending = Promise.resolve().then(restore).finally(() => { pending = undefined; });
    await pending;
    return check();
  }
}
