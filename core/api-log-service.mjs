import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { agentDataDir } from './paths.mjs';

let worker, sequence = 0;
const pending = new Map(), cache = new Map(), inFlight = new Map();
function ensureWorker() {
  if (worker) return worker;
  const current = new Worker(new URL('./api-log-worker.mjs', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 256 } });
  worker = current; current.unref();
  current.on('message', message => {
    const job = pending.get(message.id); if (!job) return;
    pending.delete(message.id); clearTimeout(job.timer);
    if (message.error) job.reject(new Error(message.error)); else job.resolve(message.result);
    if (!pending.size) current.unref();
  });
  const fail = error => {
    if (worker !== current) return; worker = undefined;
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); } pending.clear();
  };
  current.on('error', fail); current.on('exit', code => fail(new Error(`调用日志读取线程已退出 (${code})，请重试`)));
  return current;
}
async function read(operation, options) {
  // Capture the workspace before crossing the worker boundary, so switching
  // projects never reads another project's log or shares its cached result.
  const file = path.join(agentDataDir(), 'api-logs.jsonl');
  let stat;
  try { stat = await fs.promises.stat(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const key = JSON.stringify([file, stat?.size, stat?.mtimeMs, operation, options]);
  const cached = cache.get(key); if (cached?.expires > Date.now()) return cached.result;
  if (inFlight.has(key)) return inFlight.get(key);
  if (pending.size >= 16) throw new Error('调用日志查询繁忙，请稍后重试');
  const promise = new Promise((resolve, reject) => {
    const id = ++sequence, current = ensureWorker();
    const timer = setTimeout(() => { disposeLogReader(new Error('调用日志读取超时，请缩小查询范围后重试')); }, 120000);
    pending.set(id, { resolve, reject, timer }); current.ref(); current.postMessage({ id, file, operation, options });
  });
  inFlight.set(key, promise);
  try {
    const result = await promise;
    if (cache.size >= 8) cache.delete(cache.keys().next().value);
    cache.set(key, { result, expires: Date.now() + 30000 }); return result;
  } finally { inFlight.delete(key); }
}
export function queryApiLogsAsync(options = {}) { return read('query', options); }
export function getApiLogAsync(id) { return read('detail', { id }); }
export function disposeLogReader(error = new Error('本地服务已停止')) {
  const current = worker; worker = undefined;
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); } pending.clear(); inFlight.clear(); cache.clear();
  return current?.terminate();
}
