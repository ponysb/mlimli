import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setWorkspaceRoot, getWorkspaceRoot } from '../core/paths.mjs';
import { appendApiLog, getApiLog, queryApiLogs } from '../core/api-logs.mjs';
import { MAX_LOG_LINE_BYTES, readLogPage } from '../core/api-log-reader.mjs';
import { queryApiLogsAsync, disposeLogReader } from '../core/api-log-service.mjs';
import runtime from '../electron/runtime.cjs';

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-log-recovery-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return directory;
}
test('reverse log reader crosses chunk and UTF-8 boundaries, skips huge legacy rows, and reads older records', t => {
  const root = temporary(t), file = path.join(root, 'logs.jsonl');
  const old = { id: 'old', ts: 1, metrics: { totalTokens: 2 } };
  const middle = { id: 'middle', ts: 2, request: { text: '汉字🙂'.repeat(40000) }, metrics: { totalTokens: 3 } };
  const recent = { id: 'recent', ts: 4, metrics: { totalTokens: 5 } };
  fs.writeFileSync(file, JSON.stringify(old) + '\n' + JSON.stringify(middle) + '\n{"id":"huge","request":"');
  fs.appendFileSync(file, 'x'.repeat(MAX_LOG_LINE_BYTES + 200));
  fs.appendFileSync(file, '"}\ncorrupt-json\nnull\n' + JSON.stringify(recent));
  const page = readLogPage(file);
  assert.deepEqual(page.logs.map(row => row.id), ['recent', 'middle', 'old']);
  assert.equal(page.skippedLargeRecords, 1); assert.match(page.warning, /统计不包含/);
  assert.equal(page.summary.totalTokens, 10);
  const detail = readLogPage(file, { summary: false }); assert.equal(detail.logs[1].request.text, middle.request.text);
});
test('new diagnostic snapshots omit inline media and bound text while preserving original input and usage', t => {
  const root = temporary(t), previous = getWorkspaceRoot(); setWorkspaceRoot(root); t.after(() => setWorkspaceRoot(previous));
  const entry = { id: 'bounded', request: { media: 'data:image/png;base64,' + 'A'.repeat(4 * 1024 * 1024), messages: Array.from({ length: 100 }, () => ({ text: '中文'.repeat(50000) })) }, response: { text: 'x'.repeat(600000), usage: { input_tokens: 10 } }, metrics: { totalTokens: 12 } };
  appendApiLog(entry);
  const stored = getApiLog(entry.id);
  assert.equal(stored.snapshotTruncated, true); assert.equal(stored.metrics.totalTokens, 12); assert.equal(stored.response.usage.input_tokens, 10);
  assert.match(stored.request.media, /媒体内容已省略/);
  assert.equal(entry.request.messages[0].text.length, 100000);
  assert.ok(fs.statSync(path.join(root, '.agent', 'api-logs.jsonl')).size < 2 * 1024 * 1024);
});
test('worker results match synchronous pagination, coalesce queries, and invalidate after append', async t => {
  const root = temporary(t), previous = getWorkspaceRoot(); setWorkspaceRoot(root);
  t.after(async () => { await disposeLogReader(); setWorkspaceRoot(previous); });
  appendApiLog({ id: 'first', ts: 1, provider: { model: 'A' }, metrics: { totalTokens: 3 } });
  const options = { limit: 1 };
  const [a, b] = await Promise.all([queryApiLogsAsync(options), queryApiLogsAsync(options)]);
  assert.deepEqual(a, queryApiLogs(options)); assert.equal(a, b);
  appendApiLog({ id: 'second', ts: 2, provider: { model: 'B' }, metrics: { totalTokens: 4 } });
  const updated = await queryApiLogsAsync(options); assert.equal(updated.total, 2); assert.equal(updated.logs[0].id, 'second'); assert.equal(updated.summary.totalTokens, 7);
});
test('HTTP health and lease requests stay responsive while reading a large legacy log', { timeout: 25000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-log-http-')), dataRoot = path.join(root, 'data');
  runtime.prepareData(fileURLToPath(new URL('..', import.meta.url)), dataRoot);
  const directory = path.join(dataRoot, 'workspace', '.agent'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'api-logs.jsonl');
  const tail = { id: 'valid', ts: 100, metrics: { totalTokens: 7 } };
  const descriptor = fs.openSync(file, 'w');
  fs.writeSync(descriptor, '{"id":"oversized","request":"');
  const chunk = Buffer.alloc(1024 * 1024, 120);
  for (let i = 0; i < 128; i++) fs.writeSync(descriptor, chunk);
  fs.writeSync(descriptor, '"}\n' + JSON.stringify(tail) + '\n'); fs.closeSync(descriptor);
  const before = fs.statSync(file).size;
  const instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: fileURLToPath(new URL('..', import.meta.url)), dataRoot, environment: { MLI_ACCOUNT_ENABLED: 'false', MLI_ACCOUNT_APP_SECRET: '', MLI_RUNTIME_MANAGED: '0' } });
  t.after(async () => { if (instance.child.exitCode === null) { const done = once(instance.child, 'exit'); instance.child.kill('SIGKILL'); await done; } fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const { url } = await instance.ready;
  const pagePromise = fetch(url + '/api/logs?summary=1').then(res => res.json());
  const health = await fetch(url + '/api/runtime', { signal: AbortSignal.timeout(2000) }); assert.equal(health.status, 200);
  const page = await pagePromise;
  assert.equal(page.logs[0].id, 'valid'); assert.equal(page.skippedLargeRecords, 1); assert.equal(page.summary.totalTokens, 7);
  assert.equal(fs.statSync(file).size, before);
  const detail = await (await fetch(url + '/api/logs/valid')).json(); assert.equal(detail.log.id, 'valid');
  assert.equal((await fetch(url + '/api/runtime')).status, 200);
});
