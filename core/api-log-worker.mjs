import { parentPort } from 'node:worker_threads';
import { readLogPage, readRecentLogs } from './api-log-reader.mjs';

parentPort.on('message', ({ id, file, operation, options }) => {
  try {
    const result = operation === 'detail' ? readRecentLogs(file, { id: options.id, limit: 1 }).rows[0] || null : readLogPage(file, options);
    parentPort.postMessage({ id, result });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
