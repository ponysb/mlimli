// core/paths.mjs —— 工作区路径监狱：所有文件类工具必须经过这里
// 读 = 工作区 或 程序安装目录（技能/插件文件）；写 = 仅工作区
import path from 'node:path';
import { getRunContext } from './run-context.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { toolSandboxPolicy, pathProtection, SandboxError } from './sandbox-policy.mjs';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_ROOT = process.env.MLI_AGENT_DATA_DIR ? path.resolve(process.env.MLI_AGENT_DATA_DIR) : APP_ROOT;
export const USER_PLUGINS_DIR = path.join(DATA_ROOT, 'plugins');

let workspaceRoot = APP_ROOT;
let ownedWorkspaceLock;

function releaseWorkspaceLock() {
  if (!ownedWorkspaceLock) return;
  try {
    const record = JSON.parse(fs.readFileSync(ownedWorkspaceLock, 'utf8'));
    if (record.instance === globalThis.mliRuntimeHost?.instance) fs.unlinkSync(ownedWorkspaceLock);
  } catch {}
  ownedWorkspaceLock = undefined;
}
process.once('exit', releaseWorkspaceLock);

function claimWorkspace(root) {
  const owner = globalThis.mliRuntimeHost;
  if (!owner) return;
  const directory = path.join(root, '.agent');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'runtime-lock.json');
  if (ownedWorkspaceLock && norm(file) === norm(ownedWorkspaceLock)) return;
  const record = JSON.stringify({ pid: process.pid, instance: owner.instance });
  try { fs.writeFileSync(file, record, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let previous;
    try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('项目运行时正在启动，请稍后重试'); }
    if (previous.instance === owner.instance) return;
    let running = false;
    try { process.kill(previous.pid, 0); running = true; } catch (failure) { running = failure.code === 'EPERM'; }
    if (running) throw new Error('此项目已由另一个运行时占用，请使用同一用户配置目录连接');
    fs.unlinkSync(file);
    fs.writeFileSync(file, record, { flag: 'wx', mode: 0o600 });
  }
  releaseWorkspaceLock();
  ownedWorkspaceLock = file;
}

export function setWorkspaceRoot(root) {
  const resolved = path.resolve(root);
  fs.mkdirSync(resolved, { recursive: true });
  claimWorkspace(resolved);
  workspaceRoot = resolved;
  return workspaceRoot;
}

export function getWorkspaceRoot() {
  return getRunContext()?.executionRoot || workspaceRoot;
}

export function isWorkspaceRoot(root) { return norm(root) === norm(getWorkspaceRoot()); }

/** 相对/绝对路径 → 工作区内绝对路径；越界（..、符号链接逃逸、盘符切换）直接抛错 */
export function resolveInWorkspace(p, { write = false } = {}) {
  if (typeof p !== 'string' || p.trim() === '') throw new Error('路径不能为空');
  validatePath(p);
  const workspaceRoot = getWorkspaceRoot();
  const abs = path.resolve(workspaceRoot, p);
  if (!isInside(abs, workspaceRoot)) {
    throw new Error(`路径越界：${p} 不在工作区 ${workspaceRoot} 内`);
  }
  const real = canonicalPath(abs), root = canonicalPath(workspaceRoot);
  if (!isInside(real, root)) throw new Error('路径越界：符号链接指向工作区之外');
  assertToolPath(abs, real, { write });
  return abs;
}

function validatePath(p) {
  if (p.includes('\0')) throw new Error('路径包含无效字符');
  if (process.platform === 'win32') {
    const rest = p.replace(/^[a-z]:/i, '');
    if (rest.includes(':') || /^\\\\[?.]\\/.test(p) || rest.split(/[\\/]/).some(part => /[. ]$/.test(part) && !['.', '..'].includes(part))) throw new Error('不支持设备路径、备用数据流或尾随点/空格');
  }
}

// Resolve the nearest existing ancestor even for new files. lstat (rather than
// existsSync) ensures dangling links cannot masquerade as absent directories.
export function canonicalPath(candidate) {
  let current = path.resolve(candidate);
  const remaining = [];
  while (true) {
    try { fs.lstatSync(current); return path.resolve(fs.realpathSync(current), ...remaining.reverse()); }
    catch (error) {
      if (error.code !== 'ENOENT' || current === path.dirname(current)) throw error;
      // A dangling link's realpath failed after lstat succeeded: reject it.
      try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('路径包含无效符号链接'); } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
      remaining.push(path.basename(current)); current = path.dirname(current);
    }
  }
}

function assertToolPath(abs, real, { write = false } = {}) {
  const policy = toolSandboxPolicy();
  if (!policy || policy.mode === 'off') return;
  if (write && policy.mode === 'read-only') throw new SandboxError('只读沙箱禁止修改文件');
  for (const root of new Set([getWorkspaceRoot(), APP_ROOT, DATA_ROOT])) {
    for (const [candidate, parent] of [[abs, root], [real, canonicalPath(root)]]) {
      if (!isInside(candidate, parent)) continue;
      const protection = pathProtection(path.relative(parent, candidate));
      if (protection === 'private' || (write && protection === 'read-only')) throw new SandboxError('沙箱保护路径不可访问：' + path.relative(parent, candidate));
    }
  }
  try { if (fs.statSync(real).isFile() && fs.statSync(real).nlink > 1) throw new SandboxError('沙箱不允许访问硬链接文件'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function norm(p) {
  const x = path.resolve(p);
  return process.platform === 'win32' ? x.toLowerCase() : x;
}

export function isInside(abs, root) {
  const a = norm(abs), r = norm(root);
  const rootWithSep = r.endsWith(path.sep) ? r : r + path.sep;
  return a === r || a.startsWith(rootWithSep);
}

/** 读权限 = 工作区内 或 程序目录内（允许模型按需读技能/插件文件） */
export function resolveReadable(p) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('路径不能为空');
  validatePath(p);
  const workspaceRoot = getWorkspaceRoot();
  const abs = path.resolve(workspaceRoot, p);
  const inWorkspace = isInside(abs, workspaceRoot);
  const inApp = isInside(abs, APP_ROOT);
  if (!inWorkspace && !inApp) throw new Error(`路径不可读：${p}（仅允许工作区或程序目录）`);
  const real = canonicalPath(abs);
  // The lexical root owns the read: a workspace link into the installation is
  // still an escape, even though explicit installation paths are readable.
  const owner = inWorkspace ? workspaceRoot : APP_ROOT;
  if (!isInside(real, canonicalPath(owner))) throw new Error('路径不可读：符号链接指向授权目录之外');
  assertToolPath(abs, real);
  return abs;
}

/** 会话/规则等应用数据目录（工作区内 .agent/） */
export function agentDataDir() {
  const dir = path.join(getRunContext()?.sessionStorageRoot || getWorkspaceRoot(), '.agent');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function sessionsDir() {
  const dir = path.join(agentDataDir(), 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
