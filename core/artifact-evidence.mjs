import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getWorkspaceRoot, resolveReadable } from './paths.mjs';
import { getRunContext } from './run-context.mjs';

export function verificationEnvironment() {
  const remote = getRunContext()?.executionEnvironment;
  const root = path.resolve(getWorkspaceRoot());
  return { type: remote?.type || 'host', root: process.platform === 'win32' ? root.toLowerCase() : root,
    ...(remote && remote.type !== 'host' ? { cwd: remote.cwd || '', platform: remote.platform || '', id: remote.id || '' } : {}) };
}
export function sameVerificationEnvironment(environment) {
  const current = verificationEnvironment();
  // Older local evidence remains readable; never treat it as remote evidence.
  return environment ? ['type','root','cwd','platform','id'].every(key=>(environment[key]??'')===(current[key]??'')) : current.type === 'host';
}
export function assertLocalVerification() {
  if (verificationEnvironment().type !== 'host') throw new Error('此验收工具读取宿主文件，不能验证远端产物；请在实际执行环境使用对应验证器');
}
export function fileEvidence(file) {
  const abs = resolveReadable(file), before = fs.statSync(abs);
  if (!before.isFile()) throw new Error('验收文件必须是实际存在的普通文件');
  const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(abs, 'r');
  try { let size; while ((size = fs.readSync(descriptor, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, size)); }
  finally { fs.closeSync(descriptor); }
  const after = fs.statSync(abs);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('计算产物版本期间文件发生变化，请重新验收');
  return { path: file, sha256: hash.digest('hex'), size: after.size, environment: verificationEnvironment() };
}
export function freshArtifact(artifact) {
  if (!sameVerificationEnvironment(artifact?.environment)) return false;
  try { return fileEvidence(artifact.path).sha256 === artifact.sha256; } catch { return false; }
}
