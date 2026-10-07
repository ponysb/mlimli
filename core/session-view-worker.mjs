import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { Session } from './session.mjs';
import { visibleSessionEntries } from './session-deletion.mjs';

// Keep only the last viewed history. File changes invalidate it before every job.
let cached;
function load(id, directory) {
  const file = path.join(directory, `${id}.jsonl`);
  let stat;
  try { stat = fs.statSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const signature = `${file}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  if (cached?.signature === signature) return cached;
  const session = new Session(id, directory);
  // Historical sessions may contain large inline screenshots. Keep their
  // metadata, but remove Base64 from the cached view; media is loaded on demand.
  const entries = visibleSessionEntries(session.entries()).map(entry => stripInlineMedia(entry));
  session.parentSessionId = entries[0]?.parentSessionId;
  session.rootSessionId = entries[0]?.rootSessionId;
  session.entries = () => entries;
  session.readPage = ({ limit = 120, before = null } = {}) => {
    const count = Math.max(1, Math.min(500, Math.floor(Number(limit) || 120)));
    let end = entries.length;
    if (before != null && before !== '') {
      end = entries.findIndex(entry => Number(entry.id) >= Number(before));
      if (end < 0) end = entries.length;
    }
    const start = Math.max(0, end - count), page = entries.slice(start, end);
    return { entries: page, hasMore: start > 0, oldestId: page[0]?.id ?? null, newestId: page.at(-1)?.id ?? null };
  };
  cached = { signature, session, entries, metadata: new Map() };
  return cached;
}

function stripInlineMedia(value) {
  if (Array.isArray(value)) return value.map(stripInlineMedia);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'dataUrl' && typeof item === 'string' && item.startsWith('data:')) { result.__mliInlineMedia = true; continue; }
    result[key] = stripInlineMedia(item);
  }
  return result;
}

function rawEntry(id, directory, entryId) {
  const file = path.join(directory, `${id}.jsonl`);
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const entry = JSON.parse(line); if (String(entry?.id) === String(entryId)) return entry; } catch {}
    }
  } catch {}
  return null;
}

function forDisplay(entry, sessionId, { full = false } = {}) {
  let truncated = false, remaining = 32 * 1024;
  function visit(value, keys = []) {
    if (typeof value === 'string') {
      if (keys.at(-1) === 'dataUrl' && value.startsWith('data:')) return undefined;
      const isContent = ['text', 'thinking', 'content', 'summary', 'summaryText', 'promptText', 'extractedText'].includes(keys.at(-1)) || keys.includes('args');
      if (full || !isContent) return value;
      const length = Math.min(12000, Math.max(0, remaining));
      remaining -= Math.min(value.length, length);
      if (value.length <= length) return value;
      truncated = true;
      return `${value.slice(0, length)}\n[更多内容待展开]`;
    }
    if (Array.isArray(value)) return value.map((item, index) => visit(item, [...keys, index]));
    if (!value || typeof value !== 'object') return value;
    const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, [...keys, key])]));
    if ((typeof value.dataUrl === 'string' && value.dataUrl.startsWith('data:') || value.__mliInlineMedia) && !value.url) {
      result.url = `/api/session/${sessionId}/entries/${entry.id}/media?path=${encodeURIComponent(JSON.stringify(keys))}`;
    }
    delete result.__mliInlineMedia;
    return result;
  }
  const result = visit(entry);
  if (truncated) { result.previewTruncated = true; result.previewEntryId = entry.id; }
  return result;
}

parentPort.on('message', ({ jobId, sessionId, directory, operation, options = {} }) => {
  try {
    const data = load(sessionId, directory);
    if (!data) return parentPort.postMessage({ jobId, result: null });
    const { session, entries, metadata } = data;
    let result;
    if (operation === 'entry') {
      const entry = entries.find(item => String(item.id) === String(options.entryId));
      result = entry ? forDisplay(entry, sessionId, { full: true }) : null;
    } else if (operation === 'media') {
      const entry = entries.find(item => String(item.id) === String(options.entryId));
      const keys = JSON.parse(options.path || '[]');
      if (!Array.isArray(keys) || keys.length > 16 || keys.some(key => !['string', 'number'].includes(typeof key) || ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Invalid media path');
      let part = entry && (rawEntry(sessionId, directory, options.entryId) || entry);
      for (const key of keys) part = part && Object.hasOwn(part, key) ? part[key] : null;
      const match = typeof part?.dataUrl === 'string' && part.dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
      result = match ? { mime: match[1], name: String(part.name || 'media'), bytes: Buffer.from(match[2], 'base64') } : null;
    } else if (operation === 'attachment') {
      result = session.attachment(options.attachmentId);
    } else {
      const page = session.readPage(options);
      const display = page.entries.map(entry => forDisplay(entry, sessionId));
      const history = { hasMore: page.hasMore, oldestId: page.oldestId, newestId: page.newestId };
      if (operation === 'page') result = { ...history, entries: display };
      else {
        const contextWindow = Number(options.contextWindow) || 128000;
        if (!metadata.has(contextWindow)) {
          const { entries: allEntries, ...snapshot } = session.snapshot(contextWindow);
          metadata.set(contextWindow, { ...snapshot, queue: session.queued().map(entry => forDisplay(entry, sessionId)) });
        }
        result = { ...metadata.get(contextWindow), entries: display, history: { ...history, limit: Math.max(1, Math.min(500, Number(options.limit) || 120)) } };
      }
    }
    parentPort.postMessage({ jobId, result });
  } catch (error) { parentPort.postMessage({ jobId, error: error.message }); }
});
