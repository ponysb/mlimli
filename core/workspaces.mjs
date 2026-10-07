// 工作目录注册表：每个目录独立拥有 .agent/sessions、日志、权限规则和会话索引。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_ROOT } from './paths.mjs';

const registryFile = path.join(DATA_ROOT, '.agent', 'workspaces.json');
export function workspaceRegistryExists() { return fs.existsSync(registryFile); }
function read() {
  try { return JSON.parse(fs.readFileSync(registryFile, 'utf8')); } catch { return { activeId: null, items: [] }; }
}
function write(data) {
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  fs.writeFileSync(registryFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
function normalize(item) {
  return { id: item.id, name: item.name || path.basename(item.path), path: path.resolve(item.path), created: item.created ?? Date.now(), updated: item.updated ?? Date.now() };
}
export function listWorkspaces() {
  const data = read();
  return data.items.map(normalize).filter((x) => fs.existsSync(x.path)).map((x) => ({ ...x, active: x.id === data.activeId }));
}
export function addWorkspace(input = {}, { activate = true } = {}) {
  const root = path.resolve(String(input.path ?? '').trim());
  if (!root) throw new Error('工作目录不能为空');
  fs.mkdirSync(root, { recursive: true });
  const data = read();
  const existing = data.items.find((x) => path.resolve(x.path) === root);
  if (existing) { if (activate) data.activeId = existing.id; write(data); return normalize(existing); }
  const item = normalize({ id: crypto.randomUUID().slice(0, 10), name: input.name || path.basename(root), path: root });
  data.items.push(item); if (activate) data.activeId = item.id; write(data); return item;
}
export function setActiveWorkspace(id) {
  const data = read();
  const item = data.items.find((x) => x.id === id);
  if (!item) throw new Error('工作目录不存在');
  data.activeId = id; item.updated = Date.now(); write(data); return normalize(item);
}
export function removeWorkspace(id) {
  const data = read();
  const item = data.items.find((x) => x.id === id);
  if (!item) return false;
  data.items = data.items.filter((x) => x.id !== id);
  if (data.activeId === id) data.activeId = data.items[0]?.id ?? null;
  write(data); return true;
}
export function ensureWorkspace(root) {
  const data = read();
  const abs = path.resolve(root);
  let item = data.items.find((x) => path.resolve(x.path) === abs);
  if (!item) { item = addWorkspace({ path: abs }); return item; }
  if (data.activeId !== item.id) { data.activeId = item.id; write(data); }
  return normalize(item);
}
