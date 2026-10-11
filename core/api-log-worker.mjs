import { parentPort } from 'node:worker_threads';
import fs from 'node:fs';
import { readLogPage, readRecentLogs } from './api-log-reader.mjs';

parentPort.on('message', ({ id, file, summaryFile, operation, options }) => {
  try {
    const result = operation === 'detail' ? readRecentLogs(file, { id: options.id, limit: 1 }).rows[0] || null : readLogPage(summaryFile && fs.existsSync(summaryFile) ? summaryFile : file, options);
    parentPort.postMessage({ id, result });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
