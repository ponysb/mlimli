import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import os from 'node:os';
import { stopProcessTree } from './process-tree.mjs';
import { cleanCommandEnv } from './sandbox.mjs';

// Argument arrays only; verifiers do not interpolate model arguments into a shell.
export function verifierProcess(binary, args, { signal, timeoutMs = 60000, maxOutputBytes = 1024 * 1024, env = cleanCommandEnv() } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(maxOutputBytes) || maxOutputBytes <= 0) throw new Error('验收工具操作预算必须为正数');
  if (signal?.aborted) return Promise.reject(new Error('验收已停止'));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, cwd: os.tmpdir(), detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', bytes = 0, timedOut = false, outputExceeded = false;
    const stdoutDecoder = new StringDecoder('utf8'), stderrDecoder = new StringDecoder('utf8');
    const cancel = () => stopProcessTree(child, 'SIGKILL');
    const timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes <= maxOutputBytes) stdout += stdoutDecoder.write(chunk); else { outputExceeded = true; cancel(); } });
    child.stderr.on('data', chunk => { bytes += chunk.length; stderr = (stderr + stderrDecoder.write(chunk)).slice(-12000); if (bytes > maxOutputBytes) { outputExceeded = true; cancel(); } });
    child.on('error', error => { cleanup(); reject(new Error(`验收程序不可用：${binary}（${error.code || error.message}）`)); });
    child.on('close', code => {
      cleanup();
      stdout += stdoutDecoder.end(); stderr = (stderr + stderrDecoder.end()).slice(-12000);
      if (signal?.aborted) reject(new Error('验收已停止'));
      else if (timedOut) reject(new Error(`本次验收工具超时（${timeoutMs}ms），未确认通过`));
      else if (outputExceeded) reject(new Error('验收程序输出超过读取预算，未确认通过'));
      else resolve({ code, stdout, stderr });
    });
    if(signal?.aborted)cancel();
  });
}
