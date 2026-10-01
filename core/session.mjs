// core/session.mjs —— Pi 式会话树：JSONL append-only，历史永不改写
// entry 类型：
//   meta        首行 {id, title, created}
//   message     {role:'user'|'assistant'|'tool', text?, content?, toolCalls?, toolCallId?}
//   state       {mode?, desktopEnabled?, expertId?, expertPrompt?}   会话级开关（也是追加，不回改）
//   compaction  {summary}                  压缩摘要：重建消息时"截断"其前的历史
//   event       {event:{type:'turn_end'}}  运行边界（重放时用于恢复 UI 状态）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sessionsDir } from './paths.mjs';
import { discoverLegacySessions, readLegacyTranscript, summarizeLegacyTranscript, legacySessionId, legacyTitle } from './session-import.mjs';

const indexFile = () => path.join(sessionsDir(), 'index.json');
const attachmentDir = (id) => path.join(sessionsDir(), `${id}-attachments`);
const MEDIA_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/wav', 'audio/ogg']);
const MEDIA_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg' };
const IMAGE_CONTEXT_TOKENS = 800;

function estimateMessageTokens(messages = []) {
  let tokens = 0;
  for (const message of messages) {
    tokens += 8;
    if (Array.isArray(message.content)) {
      for (const part of message.content) tokens += part?.type === 'image' ? IMAGE_CONTEXT_TOKENS : Math.ceil(String(part?.text || '').length / 4);
    } else if (message.content != null) tokens += Math.ceil(String(message.content).length / 4);
    if (message.text) tokens += Math.ceil(String(message.text).length / 4);
    if (message.toolCalls?.length) tokens += Math.ceil(JSON.stringify(message.toolCalls).length / 4);
  }
  return tokens;
}

function completeToolReplies(messages) {
  const result = [];
  let pending = new Set();
  const closePending = () => {
    for (const toolCallId of pending) result.push({
      role: 'tool', toolCallId, content: '[工具结果未记录；请根据当前状态重新检查，不要假定工具已完成。]',
    });
    pending = new Set();
  };
  for (const message of messages) {
    if (message.role === 'tool') {
      if (pending.has(message.toolCallId)) {
        result.push(message);
        pending.delete(message.toolCallId);
      }
      continue;
    }
    closePending();
    result.push(message);
    if (message.role === 'assistant') pending = new Set((message.toolCalls || []).map((call) => call.id).filter(Boolean));
  }
  closePending();
  return result;
}

function readIndex() {
  try { return JSON.parse(fs.readFileSync(indexFile(), 'utf8')); } catch { return {}; }
}
function writeIndex(idx) {
  fs.writeFileSync(indexFile(), JSON.stringify(idx, null, 2));
}

function importLegacySessions() {
  const idx = readIndex();
  const root = path.dirname(path.dirname(sessionsDir()));
  let changed = false;
  for (const source of discoverLegacySessions(root)) {
    const id = legacySessionId(source.path);
    const relative = path.relative(root, source.path).replaceAll(path.sep, '/');
    const existing = idx[id];
    if (existing?.legacySource === relative) continue;
    const transcript = readLegacyTranscript(source.path, source.format);
    if (!transcript.messages.length) continue;
    const title = legacyTitle(transcript.messages, source.path, source.format);
    const target = path.join(sessionsDir(), `${id}.jsonl`);
    const meta = { id: 0, parent: null, ts: Date.now(), type: 'meta', title, created: Date.now(), source: 'legacy-import', sourceFormat: source.format, legacySource: relative };
    const compacted = { id: 1, parent: 0, ts: Date.now(), type: 'compaction', source: 'legacy-import', sourceFormat: source.format, used: transcript.messages.length, summary: summarizeLegacyTranscript(transcript.messages, { format: source.format, source: relative }) };
    fs.writeFileSync(target, `${JSON.stringify(meta)}\n${JSON.stringify(compacted)}\n`, 'utf8');
    idx[id] = { id, title, created: meta.created, updated: meta.created, source: 'legacy-import', sourceFormat: source.format, legacySource: relative, legacyFingerprint: transcript.fingerprint };
    changed = true;
  }
  if (changed) writeIndex(idx);
}

export class Session {
  constructor(id) {
    this.id = id;
    this.file = path.join(sessionsDir(), `${id}.jsonl`);
    this.counter = 0;
    this.leaf = 0; // 游标：指向树中的当前位置
  }

  static create(title = '新会话') {
    const id = crypto.randomUUID().slice(0, 8);
    const s = new Session(id);
    s.append({ type: 'meta', title, created: Date.now() }, { root: true });
    const idx = readIndex();
    idx[id] = { id, title, created: Date.now(), updated: Date.now() };
    writeIndex(idx);
    return s;
  }

  static load(id) {
    if (!/^[\w-]+$/.test(id)) return null;
    const file = path.join(sessionsDir(), `${id}.jsonl`);
    if (!fs.existsSync(file)) return null;
    const s = new Session(id);
    const entries = s.entries();
    // 恢复计数器与游标：leaf = 最后一个 entry（线性追加；树分支由 fork 产生新文件）
    if (entries.length) {
      s.counter = entries.length;
      s.leaf = entries[entries.length - 1].id;
    }
    return s;
  }

  static list() {
    importLegacySessions();
    const idx = readIndex();
    return Object.values(idx).sort((a, b) => b.updated - a.updated);
  }

  static remove(id) {
    const file = path.join(sessionsDir(), `${id}.jsonl`);
    try { fs.unlinkSync(file); } catch { /* 已不存在 */ }
    try { fs.rmSync(attachmentDir(id), { recursive: true, force: true }); } catch { /* 已不存在 */ }
    const idx = readIndex();
    delete idx[id];
    writeIndex(idx);
  }

  /** 将会话文件与索引迁移到另一个工作目录，目标存在同 ID 时拒绝覆盖。 */
  moveToWorkspace(targetRoot) {
    const targetDir = path.join(path.resolve(targetRoot), '.agent', 'sessions');
    fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, `${this.id}.jsonl`);
    const targetIndexFile = path.join(targetDir, 'index.json');
    if (path.resolve(targetFile) === path.resolve(this.file)) return this.id;
    if (fs.existsSync(targetFile)) throw new Error('目标工作目录中已存在同 ID 会话');

    const sourceIndex = readIndex();
    let targetIndex = {};
    try { targetIndex = JSON.parse(fs.readFileSync(targetIndexFile, 'utf8')); } catch { /* 首个会话 */ }
    const metadata = sourceIndex[this.id] ?? { id: this.id, title: this.title, created: Date.now(), updated: Date.now() };

    fs.copyFileSync(this.file, targetFile, fs.constants.COPYFILE_EXCL);
    try {
      const sourceAttachments = attachmentDir(this.id);
      const targetAttachments = path.join(targetDir, `${this.id}-attachments`);
      if (fs.existsSync(sourceAttachments)) fs.cpSync(sourceAttachments, targetAttachments, { recursive: true, errorOnExist: true });
      targetIndex[this.id] = { ...metadata, updated: Date.now() };
      fs.writeFileSync(targetIndexFile, JSON.stringify(targetIndex, null, 2), 'utf8');
    } catch (error) {
      try { fs.unlinkSync(targetFile); } catch { /* 回滚失败时保留副本，不破坏源会话 */ }
      throw error;
    }

    fs.unlinkSync(this.file);
    try { fs.rmSync(attachmentDir(this.id), { recursive: true, force: true }); } catch { /* 已移动 */ }
    delete sourceIndex[this.id];
    writeIndex(sourceIndex);
    return this.id;
  }

  append(data, { root = false } = {}) {
    const entry = root
      ? { id: 0, parent: null, ts: Date.now(), ...data }
      : { id: ++this.counter, parent: this.leaf, ts: Date.now(), ...data };
    fs.appendFileSync(this.file, JSON.stringify(entry) + '\n');
    if (!root) this.leaf = entry.id;
    return entry;
  }

  saveAttachments(items = [], { imagesOnly = true } = {}) {
    if (!Array.isArray(items) || items.length > 6) throw new Error('每次最多添加 6 张图片');
    if (!items.length) return [];
    const targetDir = attachmentDir(this.id);
    fs.mkdirSync(targetDir, { recursive: true });
    return items.map((item) => {
      const match = String(item?.dataUrl || '').match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
      const mime = String(match?.[1] || item?.mime || '').toLowerCase();
      if (!match || !MEDIA_MIME.has(mime) || (imagesOnly && !mime.startsWith('image/'))) throw new Error(imagesOnly ? '附件仅支持 PNG、JPEG、WebP 和 GIF 图片' : '不支持的媒体格式');
      const data = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
      if (!data.length || data.length > (imagesOnly ? 10 : 100) * 1024 * 1024) throw new Error(imagesOnly ? '单张图片必须小于 10 MB' : '单个媒体必须小于 100 MB');
      const id = crypto.randomUUID().slice(0, 12), file = `${id}${MEDIA_EXT[mime]}`;
      fs.writeFileSync(path.join(targetDir, file), data, { flag: 'wx' });
      const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'audio';
      return { type: kind, attachmentId: id, file, mime, name: String(item.name || `媒体${MEDIA_EXT[mime]}`).slice(0, 120), size: data.length, url: `/api/session/${this.id}/attachment/${id}` };
    });
  }

  queued() {
    const pending = new Map();
    for (const entry of this.chain()) {
      if (entry.type === 'queue_add') pending.set(entry.queueId, entry);
      if (entry.type === 'queue_mode' && pending.has(entry.queueId)) pending.set(entry.queueId, { ...pending.get(entry.queueId), mode: entry.mode });
      if (entry.type === 'queue_remove' || (entry.type === 'message' && entry.queuedId)) pending.delete(entry.queueId || entry.queuedId);
    }
    return [...pending.values()];
  }

  enqueue(text, attachments = [], mode = 'next') {
    const savedAttachments = this.saveAttachments(attachments);
    const entry = this.append({ type: 'queue_add', queueId: crypto.randomUUID(), text: String(text || '').trim().slice(0, 30000), attachments: savedAttachments, mode: mode === 'adjust' ? 'adjust' : 'next' });
    this.touchIndex();
    return entry;
  }

  removeQueued(queueId) {
    const entry = this.queued().find((item) => item.queueId === queueId);
    if (!entry) return null;
    this.append({ type: 'queue_remove', queueId });
    this.touchIndex();
    return entry;
  }

  adjustQueued(queueId) {
    const entry = this.queued().find((item) => item.queueId === queueId);
    if (!entry) return null;
    this.append({ type: 'queue_mode', queueId, mode: 'adjust' });
    this.touchIndex();
    return entry;
  }

  attachment(id) {
    if (!/^[\w-]+$/.test(id)) return null;
    const item = this.chain().flatMap((entry) => entry.type === 'message' ? [...(Array.isArray(entry.content) ? entry.content : []), ...(Array.isArray(entry.media) ? entry.media : [])] : entry.type === 'queue_add' ? entry.attachments || [] : []).find((part) => part?.attachmentId === id);
    if (!item) return null;
    const file = path.join(attachmentDir(this.id), item.file);
    return fs.existsSync(file) ? { ...item, path: file } : null;
  }

  entries() {
    const out = [];
    try {
      const lines = fs.readFileSync(this.file, 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try { out.push(JSON.parse(line)); } catch { /* 跳过损坏行 */ }
      }
    } catch { /* 空会话 */ }
    return out;
  }

  /** 根 → 当前叶子 的链（即"当前分支"） */
  chain() {
    return this.entries();
  }

  touchIndex(patch = {}) {
    const idx = readIndex();
    if (idx[this.id]) {
      Object.assign(idx[this.id], { updated: Date.now(), ...patch });
      writeIndex(idx);
    }
  }

  setTitle(title) {
    this.append({ type: 'state', title });
    this.touchIndex({ title });
  }

  setMode(mode) {
    this.append({ type: 'state', mode });
    this.touchIndex();
    return mode;
  }

  setDesktopEnabled(on) {
    this.append({ type: 'state', desktopEnabled: !!on });
    this.touchIndex();
    return !!on;
  }

  setExpert(expertId, expertPrompt = '') {
    this.append({ type: 'state', expertId: String(expertId || ''), expertPrompt: String(expertPrompt || '').slice(0, 12000) });
    this.touchIndex();
    return { expertId: String(expertId || ''), expertPrompt: String(expertPrompt || '').slice(0, 12000) };
  }

  /** 沿链回溯取最新状态值 */
  _lastState(key, fallback) {
    const entries = this.chain();
    for (let i = entries.length - 1; i >= 1; i--) {
      const e = entries[i];
      if (e.type === 'state' && key in e) return e[key];
    }
    return fallback;
  }

  get title() { return this._lastState('title', readIndex()[this.id]?.title ?? '新会话'); }
  get mode() { const value = this._lastState('mode', 'default'); return value === 'auto-all' ? 'auto-all' : 'default'; }
  get desktopEnabled() { return this._lastState('desktopEnabled', false); }
  get expertId() { return this._lastState('expertId', ''); }
  get expertPrompt() { return this._lastState('expertPrompt', ''); }

  /** 重建 LLM 消息载荷：遇到 compaction entry 时用摘要替换其前的全部历史 */
  messages({ contextWindow = 0 } = {}) {
    const out = [];
    let compacted = null;
    let pendingGeneratedImages = [];
    const flushGeneratedImages = () => {
      if (!pendingGeneratedImages.length) return;
      out.push({ role: 'user', content: [{ type: 'text', text: '[以下图片是上一组工具生成的结果，请结合任务继续处理]' }, ...pendingGeneratedImages] });
      pendingGeneratedImages = [];
    };
    for (const e of this.chain()) {
      if (e.type === 'compaction') {
        compacted = e.summary;
        out.length = 0;
        pendingGeneratedImages = [];
        continue;
      }
      if (e.type !== 'message') continue;
      const m = e;
      if (m.role !== 'tool') flushGeneratedImages();
      if (m.role === 'user') out.push({ role: 'user', content: Array.isArray(m.content) ? m.content.map((part) => part?.type === 'image' && part.file ? { type: 'image', dataUrl: `data:${part.mime};base64,${fs.readFileSync(path.join(attachmentDir(this.id), part.file)).toString('base64')}` } : part) : m.content });
      else if (m.role === 'assistant') out.push({ role: 'assistant', text: m.text ?? '', toolCalls: m.toolCalls ?? [] });
      else if (m.role === 'tool') {
        out.push({ role: 'tool', toolCallId: m.toolCallId, content: m.content });
        const imageMedia = (m.media || []).filter((item) => item.type === 'image' && item.file);
        pendingGeneratedImages.push(...imageMedia.map((item) => ({ type: 'image', dataUrl: `data:${item.mime};base64,${fs.readFileSync(path.join(attachmentDir(this.id), item.file)).toString('base64')}` })));
      }
    }
    flushGeneratedImages();
    const replay = completeToolReplies(out);
    const summary = compacted ? { role: 'user', content: `[以下是之前对话的压缩摘要，完整历史已存档]\n\n${compacted}` } : null;
    if (summary) replay.unshift(summary);
    if (!contextWindow) return replay;

    const limit = Math.max(2000, Math.floor(Number(contextWindow) * 0.85));
    const estimate = estimateMessageTokens;
    if (estimate(replay) <= limit) return replay;
    const fixed = summary ? [summary] : [{ role: 'user', content: '[更早的对话已压缩或省略，当前消息为最近上下文]' }];
    const tail = summary ? replay.slice(1) : replay;
    const selected = [];
    let used = estimate(fixed);
    for (let index = tail.length - 1; index >= 0;) {
      let start = index;
      while (start > 0 && tail[start].role !== 'user') start -= 1;
      const group = tail.slice(start, index + 1);
      const groupTokens = estimate(group);
      if (selected.length && used + groupTokens > limit) break;
      selected.unshift(...group);
      used += groupTokens;
      index = start - 1;
    }
    return [...fixed, ...selected];
  }

  /** 供 UI 重放：返回当前分支的 entries + 会话状态 */
  snapshot(contextWindow = 128000) {
    return {
      id: this.id,
      title: this.title,
      mode: this.mode,
      desktopEnabled: this.desktopEnabled,
      expertId: this.expertId,
      expertPrompt: this.expertPrompt,
      entries: this.chain(),
      context: this.contextStats(contextWindow),
    };
  }

  contextStats(contextWindow = 128000) {
    const messages = this.messages({ contextWindow });
    const tokens = estimateMessageTokens(messages);
    const rawTokens = estimateMessageTokens(this.messages());
    return { tokens, rawTokens, contextWindow, percent: contextWindow ? Math.min(100, Math.round(tokens / contextWindow * 1000) / 10) : 0, messageCount: messages.length, compacted: this.chain().some((e) => e.type === 'compaction'), truncated: rawTokens > tokens };
  }

  /** fork：把当前分支完整复制为一个新会话文件 */
  fork(newTitle) {
    const ns = Session.create(newTitle ?? `${this.title} (fork)`);
    fs.writeFileSync(ns.file, ''); // 清掉 create 写入的 meta，重写完整分支
    ns.counter = 0;
    ns.leaf = 0;
    const idx = readIndex();
    for (const e of this.chain()) {
      const copy = { ...e };
      if (e.id === 0) {
        copy.created = Date.now();
        copy.title = newTitle ?? `${this.title} (fork)`;
      }
      fs.appendFileSync(ns.file, JSON.stringify(copy) + '\n');
      if (e.id !== 0) { ns.counter = e.id; ns.leaf = e.id; }
    }
    const sourceAttachments = attachmentDir(this.id), targetAttachments = attachmentDir(ns.id);
    if (fs.existsSync(sourceAttachments)) fs.cpSync(sourceAttachments, targetAttachments, { recursive: true });
    idx[ns.id].title = newTitle ?? `${this.title} (fork)`;
    writeIndex(idx);
    return ns;
  }
}
