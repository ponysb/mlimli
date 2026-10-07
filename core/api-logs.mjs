// API 调用日志：独立 JSONL 文件，保存每次模型请求的请求/响应快照与性能指标。
import fs from 'node:fs';
import { getRunContext } from './run-context.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { agentDataDir } from './paths.mjs';
import { readLogPage, readRecentLogs } from './api-log-reader.mjs';

function logFile() {
  return path.join(agentDataDir(), 'api-logs.jsonl');
}

export function appendApiLog(entry) {
  const context = getRunContext();
  const row = { ...entry, agentId: context?.agentId, taskId: context?.taskId, rootSessionId: context?.rootSessionId, id: entry.id || crypto.randomUUID(), ts: entry.ts || Date.now() };
  let truncated = false;
  for (const field of ['request', 'response']) if (row[field] !== undefined) {
    const snapshot = boundedSnapshot(row[field]); row[field] = snapshot.value; truncated ||= snapshot.truncated;
  }
  if (truncated) row.snapshotTruncated = true;
  fs.appendFileSync(logFile(), JSON.stringify(row) + '\n', 'utf8');
  context?.recordUsage?.(row.metrics || {});
  return row;
}

// Limit only the saved diagnostic snapshot, never the request sent to a model.
// Inline media is represented by a short marker rather than repeated base64.
export function boundedSnapshot(value) {
  let remaining = 256 * 1024, nodes = 20000, truncated = false;
  const marker = '[日志快照已省略：内容过大]';
  const visit = (item, depth = 0) => {
    if (--nodes < 0 || depth > 20 || remaining <= 0) { truncated = true; return marker; }
    if (typeof item === 'string') {
      if (/^data:[^,]{0,200};base64,/i.test(item)) { truncated = true; return item.slice(0, item.indexOf(',') + 1) + `[媒体内容已省略，原长度 ${item.length}]`; }
      const n = Math.min(item.length, 32768, remaining); remaining -= n;
      if (n < item.length) { truncated = true; return item.slice(0, n) + marker; }
      return item;
    }
    if (!item || typeof item !== 'object') return item;
    if (Array.isArray(item)) {
      const result = [];
      for (const child of item) { if (remaining <= 0 || nodes <= 0 || result.length >= 2000) { truncated = true; result.push(marker); break; } result.push(visit(child, depth + 1)); }
      return result;
    }
    const result = {};
    for (const [key, child] of Object.entries(item)) {
      if (remaining <= 0 || nodes <= 0) { truncated = true; result._logTruncated = true; break; }
      Object.defineProperty(result, key, { value: visit(child, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return result;
  };
  const result = visit(value);
  // Usage stays available even when a large text field consumed the budget.
  if (value?.usage && result && typeof result === 'object' && !Array.isArray(result)) result.usage = { ...value.usage };
  return { value: result, truncated };
}

export function createApiLogId() {
  return crypto.randomUUID();
}

export function listApiLogs(options = {}) {
  return readRecentLogs(logFile(), options).rows;
}

export function queryApiLogs(options = {}) {
  return readLogPage(logFile(), options);
}

export function getApiLog(id) {
  return readRecentLogs(logFile(), { limit: 1, id }).rows[0] || null;
}
