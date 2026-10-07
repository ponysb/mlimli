import { Worker } from 'node:worker_threads';
import { sessionsDir } from './paths.mjs';

let worker, sequence = 0;
const pending = new Map();
function ensureWorker() {
  if (worker) return worker;
  const current = new Worker(new URL('./session-view-worker.mjs', import.meta.url), { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 512 } });
  worker = current;
  current.unref();
  current.on('message', message => {
    const job = pending.get(message.jobId);
    if (!job) return;
    pending.delete(message.jobId);
    clearTimeout(job.timer);
    if (message.error) job.reject(new Error(message.error)); else job.resolve(message.result);
    if (!pending.size) current.unref();
  });
  const fail = error => {
    if (worker !== current) return;
    worker = undefined;
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
    pending.clear();
  };
  current.on('error', fail);
  current.on('exit', code => fail(new Error(`Session reader exited (${code})`)));
  return current;
}

export function readSessionView(sessionId, operation = 'snapshot', options = {}, directory = sessionsDir()) {
  if (!/^[\w-]+$/.test(sessionId)) return Promise.resolve(null);
  if (pending.size >= 16) return Promise.reject(new Error('会话读取繁忙，请稍后重试'));
  return new Promise((resolve, reject) => {
    const jobId = ++sequence, current = ensureWorker();
    const timer = setTimeout(() => disposeSessionReader(new Error('会话读取超时，请重试')), 120000);
    pending.set(jobId, { resolve, reject, timer });
    current.ref();
    // Capture the storage directory before asynchronous work or workspace switching.
    current.postMessage({ jobId, sessionId, directory, operation, options });
  });
}

export function disposeSessionReader(error = new Error('本地服务已停止')) {
  const current = worker;
  worker = undefined;
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
  pending.clear();
  return current?.terminate();
}
