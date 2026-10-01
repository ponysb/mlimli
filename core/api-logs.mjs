// API 调用日志：独立 JSONL 文件，保存每次模型请求的请求/响应快照与性能指标。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { agentDataDir } from './paths.mjs';

function logFile() {
  return path.join(agentDataDir(), 'api-logs.jsonl');
}

export function appendApiLog(entry) {
  const row = { ...entry, id: entry.id || crypto.randomUUID(), ts: entry.ts || Date.now() };
  fs.appendFileSync(logFile(), JSON.stringify(row) + '\n', 'utf8');
  return row;
}

export function createApiLogId() {
  return crypto.randomUUID();
}

function toSummaryRow(row) {
  return { ...row, request: undefined, response: { usage: row.response?.usage, metadata: row.response?.metadata } };
}

// 从文件尾部逐行读取，避免为了分页把整个 JSONL 文件一次性载入内存。
function scanRowsReverse(visitor) {
  let descriptor;
  try {
    descriptor = fs.openSync(logFile(), 'r');
    let position = fs.fstatSync(descriptor).size;
    let pending = Buffer.alloc(0);
    let stopped = false;
    const visitLine = (buffer) => {
      const line = buffer.toString('utf8').trim();
      if (!line) return true;
      try { return visitor(JSON.parse(line)) !== false; } catch { return true; }
    };
    while (position > 0 && !stopped) {
      const size = Math.min(1024 * 1024, position);
      position -= size;
      const chunk = Buffer.allocUnsafe(size);
      fs.readSync(descriptor, chunk, 0, size, position);
      const combined = pending.length ? Buffer.concat([chunk, pending]) : chunk;
      let end = combined.length;
      for (let offset = combined.length - 1; offset >= 0; offset--) {
        if (combined[offset] !== 10) continue;
        if (!visitLine(combined.subarray(offset + 1, end))) { stopped = true; break; }
        end = offset;
      }
      if (!stopped) pending = combined.subarray(0, end);
    }
    if (!stopped && position === 0) visitLine(pending);
  } catch { /* 尚无日志 */ }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function recentRows({ limit, sessionId, id, summary = false }) {
  const rows = [];
  scanRowsReverse((row) => {
    if (sessionId && row.sessionId !== sessionId) return true;
    if (id && row.id !== id) return rows.length < limit;
    rows.push(summary ? toSummaryRow(row) : row);
    return rows.length < limit;
  });
  return rows;
}

export function listApiLogs({ limit = 200, sessionId, summary = false } = {}) {
  const n = Math.max(1, Math.min(2000, Number(limit) || 200));
  return recentRows({ limit: n, sessionId, summary });
}

export function queryApiLogs({ limit = 100, offset = 0, sessionId, from, to, model, summary = true } = {}) {
  const pageSize = Math.max(1, Math.min(1000, Number(limit) || 100));
  const pageOffset = Math.max(0, Number(offset) || 0);
  const fromTs = from == null || from === '' ? null : Number(from);
  const toTs = to == null || to === '' ? null : Number(to);
  const modelFilter = model && model !== 'all' ? String(model) : null;
  const rows = [];
  const models = new Set();
  let total = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let totalMs = 0;
  const currencies = new Set();

  scanRowsReverse((row) => {
    if (sessionId && row.sessionId !== sessionId) return true;
    const ts = Number(row.ts || 0);
    if (Number.isFinite(fromTs) && ts < fromTs) return true;
    if (Number.isFinite(toTs) && ts >= toTs) return true;
    const rowModel = row.provider?.model ? String(row.provider.model) : '';
    if (rowModel) models.add(rowModel);
    if (modelFilter && rowModel !== modelFilter) return true;

    total += 1;
    const metrics = row.metrics || {};
    totalTokens += Number(metrics.totalTokens) || 0;
    totalCost += Number(metrics.cost) || 0;
    totalMs += Number(metrics.totalMs) || 0;
    if (metrics.currency) currencies.add(String(metrics.currency));
    if (total > pageOffset && rows.length < pageSize) rows.push(summary ? toSummaryRow(row) : row);
    return true;
  });

  const averageMs = total ? totalMs / total : 0;
  return {
    logs: rows,
    total,
    offset: pageOffset,
    limit: pageSize,
    hasMore: pageOffset + rows.length < total,
    models: [...models].sort((a, b) => a.localeCompare(b)),
    summary: {
      totalCalls: total,
      totalTokens,
      totalCost,
      totalMs,
      averageMs,
      currency: currencies.size === 1 ? [...currencies][0] : currencies.size ? 'mixed' : null,
    },
  };
}

export function getApiLog(id) {
  return recentRows({ limit: 1, id })[0] || null;
}
