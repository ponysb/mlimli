// 后端插件仓库客户端：下载、校验并把插件安装到本地 Agent。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { USER_PLUGINS_DIR } from './paths.mjs';
import { readZip } from './zip.mjs';

function safeEntryName(name) {
  const normalized = String(name || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part, index) => (!part && index !== parts.length - 1) || part === '.' || part === '..')) return null;
  return parts.join('/');
}

function findManifest(entries) {
  return entries.find((entry) => /(?:^|\/)\.codex-plugin\/plugin\.json$/i.test(entry.name))
    || entries.find((entry) => /(?:^|\/)plugin\.json$/i.test(entry.name));
}

function relativeToRoot(entryName, root) {
  const normalized = entryName.replaceAll('\\', '/');
  if (!root) return normalized;
  if (normalized === root) return '';
  if (!normalized.startsWith(`${root}/`)) return null;
  return normalized.slice(root.length + 1);
}

function writePluginArchive(buffer, expectedSha256) {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  if (expectedSha256 && sha256.toLowerCase() !== String(expectedSha256).toLowerCase()) throw new Error('插件包 SHA-256 校验失败');
  const entries = readZip(buffer).map((entry) => ({ ...entry, name: safeEntryName(entry.name) }));
  if (entries.some((entry) => !entry.name)) throw new Error('插件包包含不安全的路径');
  const manifestEntry = findManifest(entries);
  if (!manifestEntry) throw new Error('插件包缺少 plugin.json');
  let manifest;
  try { manifest = JSON.parse(manifestEntry.data.toString('utf8')); } catch { throw new Error('插件 manifest 不是有效 JSON'); }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(String(manifest.name || ''))) throw new Error('插件 manifest 名称无效');
  const manifestParts = manifestEntry.name.split('/');
  const root = manifestParts.includes('.codex-plugin') ? manifestParts.slice(0, manifestParts.indexOf('.codex-plugin')).join('/') : manifestParts.slice(0, -1).join('/');
  const target = path.join(USER_PLUGINS_DIR, manifest.name);
  const temp = `${target}.install-${process.pid}-${Date.now()}`;
  fs.mkdirSync(temp, { recursive: true });
  try {
    let count = 0;
    for (const entry of entries) {
      if (entry.name.endsWith('/')) continue;
      const relative = relativeToRoot(entry.name, root);
      if (relative == null || !relative) continue;
      const file = path.resolve(temp, relative);
      if (!file.toLowerCase().startsWith(`${path.resolve(temp).toLowerCase()}${path.sep}`)) throw new Error('插件包路径越界');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, entry.data);
      count++;
    }
    if (!fs.existsSync(path.join(temp, 'plugin.mjs')) && !fs.existsSync(path.join(temp, 'skills'))) throw new Error('插件包必须包含 plugin.mjs 或 skills 目录');
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(temp, target);
    return { name: manifest.name, version: manifest.version || '0.0.0', sha256, files: count };
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

export async function listPlatformPlugins({ baseUrl, token }) {
  if (!baseUrl) return [];
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v2/plugins`, { headers, signal: AbortSignal.timeout(15000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || payload.error || `插件仓库 HTTP ${response.status}`);
  return payload.data?.plugins || [];
}

export async function installPlatformPlugin({ baseUrl, token, id, sha256 }) {
  if (!baseUrl || !token || !id) throw new Error('插件下载参数不完整');
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v2/plugins/${encodeURIComponent(id)}/download`, { headers: { accept: 'application/zip', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || payload.error || `插件下载失败 (${response.status})`);
  }
  return writePluginArchive(Buffer.from(await response.arrayBuffer()), sha256);
}
