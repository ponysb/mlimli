import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_ROOT, getWorkspaceRoot, canonicalPath, isInside } from './paths.mjs';
import { getRunContext } from './run-context.mjs';
import { memorySettings } from './memory-policy.mjs';
import { emit } from './events.mjs';

const SCOPES = ['global', 'project'];
const KINDS = ['preference', 'fact', 'lesson', 'workflow'];
const STATUSES = ['active', 'pending', 'archived'];
const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
const tagsFor = tags => [...new Set((Array.isArray(tags) ? tags : []).map(tag => safe(tag, 40)).filter(Boolean))].slice(0, 12);
const memoryError = (message, status = 400) => Object.assign(new Error(message), { status });
export function redactMemoryText(value) {
  return String(value ?? '')
    .replace(/-----BEGIN [\w ]*PRIVATE KEY-----[\s\S]*?-----END [\w ]*PRIVATE KEY-----/g, '[已脱敏私钥]')
    .replace(/\b(?:sk-[\w-]{12,}|gh[opusr]_[\w]{20,}|github_pat_[\w]{20,}|AKIA[A-Z0-9]{16})\b/g, '[已脱敏凭据]')
    .replace(/\bBearer\s+[\w.+/=-]{12,}/gi, 'Bearer [已脱敏]')
    .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|password|密码|密钥|令牌)\s*[=:：]\s*["']?)[^\s"',;，；}]{6,}/gi, '$1[已脱敏]');
}
const safe = (value, limit) => clean(redactMemoryText(value), limit);
export function memoryLocations() {
  const context = getRunContext();
  return { global: path.join(context?.memoryDataRoot || DATA_ROOT, 'memories', 'memory.json'), project: path.join(context?.sessionStorageRoot || getWorkspaceRoot(), '.agent', 'memory.json') };
}
function scopeFile(scope) {
  if (!SCOPES.includes(scope)) throw memoryError('无效记忆范围');
  const context = getRunContext(), root = scope === 'global' ? context?.memoryDataRoot || DATA_ROOT : context?.sessionStorageRoot || getWorkspaceRoot();
  const file = memoryLocations()[scope];
  if (!isInside(canonicalPath(file), canonicalPath(root))) throw memoryError('记忆路径越界：符号链接指向范围之外', 403);
  return file;
}
function normalize(item, scope) {
  return { ...item, scope, kind: KINDS.includes(item.kind) ? item.kind : 'fact', status: STATUSES.includes(item.status) ? item.status : 'active', revision: Number(item.revision) || 1, pinned: Boolean(item.pinned), title: safe(item.title, 120), content: safe(item.content, 12000), source: safe(item.source, 80), evidence: safe(item.evidence || item.source, 1200), tags: tagsFor(item.tags), history: Array.isArray(item.history) ? item.history.slice(-10).map(entry => ({ ...entry, title: safe(entry.title, 120), source: safe(entry.source, 80), tags: tagsFor(entry.tags), content: safe(entry.content, 12000), evidence: safe(entry.evidence, 1200) })) : [], useCount: Number(item.useCount) || 0 };
}
function readStore(scope) {
  try {
    const value = JSON.parse(fs.readFileSync(scopeFile(scope), 'utf8'));
    const items = Array.isArray(value) ? value : value.items;
    if (!Array.isArray(items)) throw new Error('记忆数据格式无效');
    return { version: 2, items: items.map(item => normalize(item, scope)).filter(item => typeof item.id === 'string' && item.content) };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 2, items: [] };
    throw memoryError(`记忆数据无法读取，原文件已保留：${error.message}`, 500);
  }
}
function mutate(scope, action) {
  const file = scopeFile(scope), dir = path.dirname(file), lock = `${file}.lock`;
  fs.mkdirSync(dir, { recursive: true });
  let acquired = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' }); acquired = true; break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let pid; try { pid = JSON.parse(fs.readFileSync(lock, 'utf8')).pid; } catch {}
      if (!Number.isInteger(pid)) throw memoryError('记忆更新锁无法读取，请检查锁文件', 409);
      try { process.kill(pid, 0); throw memoryError('记忆正在更新，请稍后重试', 409); }
      catch (failure) { if (failure.code !== 'ESRCH') throw failure; }
      try { fs.unlinkSync(lock); } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
    }
  }
  if (!acquired) throw memoryError('记忆正在更新，请稍后重试', 409);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const store = readStore(scope), result = action(store.items);
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, file); return result;
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
    try { fs.unlinkSync(lock); } catch {}
  }
}
export function listMemories({ scope = 'project', status, query = '', kind } = {}) {
  let items = (scope === 'all' ? SCOPES : [scope]).flatMap(value => readStore(value).items);
  if (status && status !== 'all') items = items.filter(item => item.status === status);
  if (kind && kind !== 'all') items = items.filter(item => item.kind === kind);
  if (String(query).trim()) items = items.map(item => ({ ...item, score: matchScore(`${item.title} ${item.tags.join(' ')} ${item.content}`, query) })).filter(item => item.score > 0);
  return items.sort((a, b) => (b.score || 0) - (a.score || 0) || Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
}
export function getMemory(id, scope = 'project') { return listMemories({ scope }).find(item => item.id === id) || null; }
function checkRevision(item, revision) {
  if (revision != null && Number(revision) !== item.revision) throw memoryError('记忆已被更新，请刷新后再修改', 409);
}
export function saveMemory(input = {}) {
  const scope = input.scope || 'project'; let changed = false;
  const result = mutate(scope, items => {
    let item = input.id ? items.find(entry => entry.id === input.id) : null;
    if (input.id && !item) throw memoryError('记忆不存在', 404);
    if (item) checkRevision(item, input.expectedRevision);
    const body = safe(input.content ?? item?.content, 12000);
    if (!body) throw memoryError('记忆内容不能为空');
    const kind = input.kind ?? item?.kind ?? 'fact', status = input.status ?? item?.status ?? 'active';
    if (!KINDS.includes(kind) || !STATUSES.includes(status)) throw memoryError('无效记忆类型或状态');
    if ((input.supersedesId || item?.supersedesId) && status === 'active') throw memoryError('替换提案必须通过审核入口应用');
    if (input.pinned != null && typeof input.pinned !== 'boolean') throw memoryError('置顶必须为布尔值');
    if (input.supersedesId) {
      const target = items.find(entry => entry.id === input.supersedesId);
      if (!target || target.id === input.id) throw memoryError('待替换记忆不存在');
      checkRevision(target, input.baseRevision);
    }
    if (!item) {
      const duplicate = items.find(entry => entry.kind === kind && entry.content === body && entry.status === status && entry.supersedesId === input.supersedesId && (!input.supersedesId || entry.baseRevision === Number(input.baseRevision)));
      if (duplicate) return duplicate;
      if (items.length >= (scope === 'global' ? 200 : 500)) throw memoryError('记忆库已满，请合并或删除不再适用的记忆');
      item = { id: crypto.randomUUID(), created: Date.now(), revision: 0, history: [], useCount: 0 }; items.push(item);
    } else {
      const { history, ...previous } = item; item.history = [...history, previous].slice(-10);
    }
    Object.assign(item, {
      scope, kind, status, content: body, title: safe(input.title ?? item.title, 120) || body.split(/\r?\n/)[0].slice(0, 120),
      tags: tagsFor(input.tags ?? item.tags), source: safe(input.source ?? item.source ?? 'agent', 80),
      evidence: safe(input.evidence ?? item.evidence ?? input.source ?? '', 1200), pinned: input.pinned ?? item.pinned ?? false,
      confidence: ['user_confirmed', 'observed', 'inferred'].includes(input.confidence) ? input.confidence : item.confidence || 'observed',
      origin: item.origin || {}, updated: Date.now(), revision: item.revision + 1,
    });
    if (input.origin) item.origin = { sessionId: clean(input.origin.sessionId, 80), turnId: clean(input.origin.turnId, 80), workspace: safe(input.origin.workspace, 1000), entryIds: (Array.isArray(input.origin.entryIds) ? input.origin.entryIds : []).filter(Number.isInteger).slice(0, 12) };
    if (input.supersedesId) { item.supersedesId = input.supersedesId; item.baseRevision = Number(input.baseRevision); }
    changed = true; return item;
  });
  if (changed) emit('memory_updated', { scope, memoryId: result.id, action: input.id ? 'updated' : 'created' });
  return result;
}
export function deleteMemory(id, scope = 'project', expectedRevision) {
  const result = mutate(scope, items => {
    const index = items.findIndex(item => item.id === id);
    if (index < 0) throw memoryError('记忆不存在', 404);
    checkRevision(items[index], expectedRevision); return items.splice(index, 1)[0];
  });
  emit('memory_updated', { scope, memoryId: id, action: 'deleted' }); return result;
}
export function restoreMemory(id, scope, revision, expectedRevision) {
  const item = getMemory(id, scope), previous = item?.history.find(entry => entry.revision === Number(revision));
  if (!previous) throw memoryError('记忆版本不存在', 404);
  return saveMemory({ ...previous, id, scope, expectedRevision, source: 'user', origin: item.origin });
}
export function approveMemory(id, scope, expectedRevision) {
  const item = getMemory(id, scope);
  if (!item || item.status !== 'pending') throw memoryError('待审核记忆不存在', 404);
  checkRevision(item, expectedRevision);
  if (!item.supersedesId) return saveMemory({ id, scope, status: 'active', expectedRevision: item.revision });
  const result = mutate(scope, items => {
    const proposal = items.find(entry => entry.id === id), target = items.find(entry => entry.id === item.supersedesId);
    if (!proposal || !target) throw memoryError('待替换记忆不存在', 409);
    checkRevision(proposal, expectedRevision); checkRevision(target, proposal.baseRevision);
    const { history, ...previous } = target; target.history = [...history, previous].slice(-10);
    Object.assign(target, { content: proposal.content, title: proposal.title, tags: proposal.tags, evidence: proposal.evidence, confidence: proposal.confidence, origin: proposal.origin, source: proposal.source, updated: Date.now(), revision: target.revision + 1 });
    items.splice(items.findIndex(entry => entry.id === id), 1); return target;
  });
  emit('memory_updated', { scope, memoryId: result.id, action: 'approved' }); return result;
}
export function matchScore(text, query) {
  const haystack = String(text).toLowerCase(), raw = String(query).toLowerCase().slice(0, 2000);
  const words = new Set(raw.match(/[a-z0-9_./-]{2,}|[\u4e00-\u9fff]{2,}/g) || []);
  const tokens = [...words].flatMap(word => /[\u4e00-\u9fff]/.test(word) ? [...Array(Math.min(60, word.length - 1))].map((_, index) => word.slice(index, index + 2)) : [word]).slice(0, 100);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}
export function searchMemories(query, { scope = 'all', limit = 12 } = {}) {
  if (!String(query).trim()) throw memoryError('搜索词不能为空');
  return listMemories({ scope, status: 'active', query: String(query).slice(0, 2000) }).slice(0, Math.max(1, Math.min(30, Number(limit) || 12)));
}
export function memoryCatalog({ scope = 'all', query = '' } = {}) {
  const items = listMemories({ scope, status: 'active', query }).slice(0, 50);
  return items.length ? items.map(item => `- ${item.scope}/${item.id} | ${item.title} | ${item.kind} | revision ${item.revision}${item.tags.length ? ` | ${item.tags.join(', ')}` : ''}`).join('\n') : '没有匹配的有效记忆。';
}
export function createMemorySnapshot(query = '') {
  if (!memorySettings().enabled) return { body: '', ids: [] };
  const items = listMemories({ scope: 'all', status: 'active' });
  const ranked = items.map(item => ({ item, rank: (item.pinned ? 100 : 0) + (item.scope === 'global' && item.kind === 'preference' ? 50 : 0) + matchScore(`${item.title} ${item.tags.join(' ')} ${item.content}`, query) * 3 })).filter(row => row.rank > 0).sort((a, b) => b.rank - a.rank || b.item.updated - a.item.updated);
  const blocks = [], ids = []; let budget = 4400;
  for (const { item } of ranked.slice(0, 8)) {
    const block = `[${item.scope}/${item.id} · ${item.title} · ${item.kind} · v${item.revision}]\n${item.content.slice(0, 1100)}`;
    if (block.length > budget) continue;
    budget -= block.length; blocks.push(block); ids.push({ id: item.id, scope: item.scope });
  }
  const catalog = items.filter(item => !ids.some(used => used.id === item.id && used.scope === item.scope)).sort((a, b) => b.updated - a.updated).slice(0, 24).map(item => `- ${item.scope}/${item.id}：${item.title}`).join('\n').slice(0, 2200);
  return { body: [...blocks, ...(catalog ? ['其他记忆目录（调用 read_memory 获取正文）：\n' + catalog] : [])].join('\n\n'), ids };
}
export function recordMemoryRecall(snapshot) {
  if (!memorySettings().enabled) return;
  for (const scope of SCOPES) {
    const ids = snapshot.ids?.filter(item => item.scope === scope).map(item => item.id) || [];
    if (!ids.length) continue;
    mutate(scope, items => { for (const item of items) if (ids.includes(item.id)) { item.useCount++; item.lastUsed = Date.now(); } });
  }
}
