import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { agentDataDir } from './paths.mjs';

const MAX_ITEMS = 200;
const MAX_CONTENT = 12000;

function file() { return path.join(agentDataDir(), 'memory.json'); }
function readAll() {
  try { const value = JSON.parse(fs.readFileSync(file(), 'utf8')); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function writeAll(items) { fs.writeFileSync(file(), JSON.stringify(items, null, 2) + '\n', 'utf8'); }
function cleanText(value, limit) { return String(value || '').trim().slice(0, limit); }
function cleanTags(tags) { return [...new Set((Array.isArray(tags) ? tags : []).map((tag) => cleanText(tag, 40)).filter(Boolean))].slice(0, 12); }

export function listMemories() {
  return readAll().sort((a, b) => b.updated - a.updated);
}

export function getMemory(id) {
  return listMemories().find((item) => item.id === id) || null;
}

export function saveMemory({ id, title, content, tags = [], source = 'agent' } = {}) {
  const body = cleanText(content, MAX_CONTENT);
  if (!body) throw new Error('记忆内容不能为空');
  const items = readAll();
  let item = id ? items.find((entry) => entry.id === id) : null;
  if (!item && items.length >= MAX_ITEMS) throw new Error(`项目记忆最多 ${MAX_ITEMS} 条`);
  const now = Date.now();
  if (!item) {
    item = { id: crypto.randomUUID().slice(0, 12), created: now };
    items.push(item);
  }
  Object.assign(item, {
    title: cleanText(title, 120) || body.split(/\r?\n/)[0].slice(0, 120),
    content: body,
    tags: cleanTags(tags),
    source: cleanText(source, 80) || 'agent',
    updated: now,
  });
  writeAll(items);
  return item;
}

export function deleteMemory(id) {
  const items = readAll(), item = items.find((entry) => entry.id === id);
  if (!item) throw new Error('记忆不存在');
  writeAll(items.filter((entry) => entry.id !== id));
  return item;
}

export function memoryCatalog() {
  const items = listMemories();
  if (!items.length) return '当前项目没有已沉淀的记忆。';
  return items.map((item) => `- ${item.id} | ${item.title}${item.tags?.length ? ` | 标签：${item.tags.join(', ')}` : ''}`).join('\n');
}
