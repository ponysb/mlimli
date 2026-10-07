import fs from 'node:fs';

export const MAX_LOG_LINE_BYTES = 4 * 1024 * 1024;

export function summaryRow(row) {
  const { request, response, ...rest } = row;
  return { ...rest, response: { usage: response?.usage, metadata: response?.metadata } };
}

// Scan backwards with a fixed-size read buffer. Discard oversized legacy rows
// until their preceding newline; never concatenate a multi-GB request snapshot.
export function scanLogRows(file, visitor) {
  let descriptor, skippedLargeRecords = 0;
  try { descriptor = fs.openSync(file, 'r'); }
  catch (error) { if (error.code === 'ENOENT') return { skippedLargeRecords }; throw error; }
  try {
    let position = fs.fstatSync(descriptor).size, fragments = [], bytes = 0, skipping = false;
    const buffer = Buffer.allocUnsafe(256 * 1024);
    const add = fragment => {
      if (skipping || !fragment.length) return;
      bytes += fragment.length;
      if (bytes > MAX_LOG_LINE_BYTES) { fragments = []; skipping = true; return; }
      fragments.push(Buffer.from(fragment));
    };
    const finish = () => {
      if (skipping) skippedLargeRecords++;
      else if (bytes) {
        const line = Buffer.concat(fragments.reverse(), bytes).toString('utf8').trim();
        let row;
        try { row = JSON.parse(line); } catch {}
        if (row && typeof row === 'object' && !Array.isArray(row) && visitor(row) === false) return false;
      }
      fragments = []; bytes = 0; skipping = false; return true;
    };
    while (position > 0) {
      const size = Math.min(buffer.length, position); position -= size;
      let read = 0;
      while (read < size) { const n = fs.readSync(descriptor, buffer, read, size - read, position + read); if (!n) break; read += n; }
      let end = read, boundary;
      while ((boundary = buffer.lastIndexOf(10, end - 1)) >= 0 && end > 0) {
        add(buffer.subarray(boundary + 1, end));
        if (!finish()) return { skippedLargeRecords };
        end = boundary;
      }
      add(buffer.subarray(0, end));
    }
    finish(); return { skippedLargeRecords };
  } finally { fs.closeSync(descriptor); }
}

export function readRecentLogs(file, { limit = 200, sessionId, id, summary = false } = {}) {
  const rows = [], n = Math.max(1, Math.min(2000, Number(limit) || 200));
  const diagnostics = scanLogRows(file, row => {
    if (sessionId && row.sessionId !== sessionId || id && row.id !== id) return true;
    rows.push(summary ? summaryRow(row) : row); return rows.length < n;
  });
  return { rows, ...diagnostics };
}

export function readLogPage(file, { limit = 100, offset = 0, sessionId, from, to, model, summary = true } = {}) {
  const pageSize = Math.max(1, Math.min(1000, Number(limit) || 100)), pageOffset = Math.max(0, Number(offset) || 0);
  const fromTs = from == null || from === '' ? null : Number(from), toTs = to == null || to === '' ? null : Number(to);
  const modelFilter = model && model !== 'all' ? String(model) : null;
  const rows = [], models = new Set(), currencies = new Set();
  let total = 0, totalTokens = 0, totalCost = 0, totalMs = 0;
  const diagnostics = scanLogRows(file, row => {
    if (sessionId && row.sessionId !== sessionId) return true;
    const ts = Number(row.ts || 0);
    if (Number.isFinite(fromTs) && ts < fromTs || Number.isFinite(toTs) && ts >= toTs) return true;
    const rowModel = row.provider?.model ? String(row.provider.model) : '';
    if (rowModel) models.add(rowModel);
    if (modelFilter && rowModel !== modelFilter) return true;
    total++;
    const metrics = row.metrics || {};
    totalTokens += Number(metrics.totalTokens) || 0; totalCost += Number(metrics.cost) || 0; totalMs += Number(metrics.totalMs) || 0;
    if (metrics.currency) currencies.add(String(metrics.currency));
    if (total > pageOffset && rows.length < pageSize) rows.push(summary ? summaryRow(row) : row);
    return true;
  });
  return { logs: rows, total, offset: pageOffset, limit: pageSize, hasMore: pageOffset + rows.length < total,
    models: [...models].sort((a, b) => a.localeCompare(b)), ...diagnostics,
    warning: diagnostics.skippedLargeRecords ? `已跳过 ${diagnostics.skippedLargeRecords} 条超过 4 MB 的历史记录，原文件保留，当前统计不包含这些记录。` : '',
    summary: { totalCalls: total, totalTokens, totalCost, totalMs, averageMs: total ? totalMs / total : 0,
      currency: currencies.size === 1 ? [...currencies][0] : currencies.size ? 'mixed' : null } };
}
