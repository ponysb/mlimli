import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { agentDataDir, getWorkspaceRoot, resolveInWorkspace } from './paths.mjs';

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/wav', 'audio/ogg',
]);
const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg' };
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]));
const MAX_ASSET_BYTES = 100 * 1024 * 1024;

function dir() { const value = path.join(agentDataDir(), 'assets'); fs.mkdirSync(value, { recursive: true }); return value; }
function indexFile() { return path.join(dir(), 'index.json'); }
function readIndex() { try { const value = JSON.parse(fs.readFileSync(indexFile(), 'utf8')); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeIndex(items) { fs.writeFileSync(indexFile(), JSON.stringify(items, null, 2) + '\n', 'utf8'); }
function kindOf(mime = '') { return mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file'; }
function safeTitle(value, fallback) { return String(value || fallback).trim().slice(0, 120) || fallback; }
function safeFileName(value, mime) {
  const input = path.basename(String(value || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 120);
  const ext = path.extname(input) || EXT_BY_MIME[mime] || '';
  const stem = path.basename(input || 'asset', path.extname(input || 'asset')).slice(0, 90) || 'asset';
  return `${stem}${ext}`;
}
function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new Error('资源数据必须是 base64 data URL');
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) throw new Error(`不支持的资源格式：${mime}`);
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_ASSET_BYTES) throw new Error('资源大小必须在 1 B 到 100 MB 之间');
  return { mime, buffer };
}

export function listAssets() { return readIndex().filter((item) => fs.existsSync(path.join(dir(), item.file))).sort((a, b) => b.created - a.created); }

export function addAsset({ dataUrl, workspacePath, title, source = 'user', metadata = {} } = {}) {
  let buffer, mime, originalName;
  if (dataUrl) ({ buffer, mime } = decodeDataUrl(dataUrl));
  else if (workspacePath) {
    const abs = resolveInWorkspace(workspacePath);
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) throw new Error('资源文件无效或超过 100 MB');
    mime = MIME_BY_EXT[path.extname(abs).toLowerCase()];
    if (!mime || !ALLOWED_MIME.has(mime)) throw new Error('仅支持图片、视频和音频资源');
    buffer = fs.readFileSync(abs); originalName = path.basename(abs);
  } else throw new Error('缺少资源内容或工作区文件路径');

  const id = crypto.randomUUID().slice(0, 12);
  const fileName = `${id}-${safeFileName(originalName || title, mime)}`;
  fs.writeFileSync(path.join(dir(), fileName), buffer, { flag: 'wx' });
  const item = { id, title: safeTitle(title, originalName || `资源 ${id}`), file: fileName, mime, kind: kindOf(mime), size: buffer.length, source: String(source || 'user').slice(0, 40), metadata, created: Date.now() };
  const items = readIndex(); items.push(item); writeIndex(items);
  return item;
}

export function addAssetFromFile(filePath, options = {}) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) throw new Error('资源文件无效或超过 100 MB');
  const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || options.mime;
  if (!mime || !ALLOWED_MIME.has(mime)) throw new Error('仅支持图片、视频和音频资源');
  const dataUrl = `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  return addAsset({ dataUrl, title: options.title || path.basename(filePath), source: options.source, metadata: options.metadata });
}

export async function addAssetFromUrl(url, options = {}) {
  const parsed = new URL(String(url));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('资源 URL 仅支持 http/https');
  const response = await fetch(parsed, { signal: options.signal, redirect: 'follow' });
  if (!response.ok) throw new Error(`下载资源失败 HTTP ${response.status}`);
  const mime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) throw new Error(`不支持的远程资源格式：${mime || '未知'}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_ASSET_BYTES) throw new Error('远程资源超过 100 MB');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ASSET_BYTES) throw new Error('远程资源超过 100 MB');
  return addAsset({ dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, title: options.title || path.basename(parsed.pathname) || '生成资源', source: options.source || 'agent', metadata: { ...options.metadata, sourceUrl: String(url) } });
}

export function getAsset(id) { return listAssets().find((item) => item.id === id) || null; }
export function assetFile(id) { const item = getAsset(id); if (!item) throw new Error('资源不存在'); return { item, path: path.join(dir(), item.file) }; }
export function assetDataUrl(id) { const { item, path: file } = assetFile(id); return `data:${item.mime};base64,${fs.readFileSync(file).toString('base64')}`; }
export function deleteAsset(id) { const { item, path: file } = assetFile(id); fs.unlinkSync(file); writeIndex(readIndex().filter((entry) => entry.id !== id)); return item; }
export function assetAbsolutePath(id) { return assetFile(id).path; }
export function assetLibraryDescription() {
  const items = listAssets();
  if (!items.length) return '当前资源库为空。';
  return items.map((item) => `- ${item.id} | ${item.kind} | ${item.title} | ${item.mime} | ${Math.ceil(item.size / 1024)} KB`).join('\n');
}

export function isWorkspaceAssetPath(input) {
  try { return path.resolve(input).startsWith(path.resolve(getWorkspaceRoot()) + path.sep); } catch { return false; }
}
