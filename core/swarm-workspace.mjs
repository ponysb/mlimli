import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathProtection } from './sandbox-policy.mjs';

const SKIP = new Set(['node_modules', 'dist', 'build', '.next', '.cache', '.DS_Store']);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export function writablePaths(values) {
  if (!Array.isArray(values) || !values.length || values.length > 128) throw new Error('隔离任务需声明 1–128 个 writablePaths 文件路径');
  return [...new Set(values.map(value => {
    if (typeof value !== 'string' || !value || value.length > 512 || value.includes('\\') || value.includes(':') || value.includes('\0') || path.posix.isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || pathProtection(value)) throw new Error('writablePaths 必须是工作区内非私有的具体文件路径');
    return value;
  }))];
}

function safeFile(root, relative) {
  const clean = writablePaths([relative])[0], target = path.resolve(root, clean);
  let cursor = root;
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('工作目录不能是符号链接');
  for (const part of clean.split('/')) {
    cursor = path.join(cursor, part);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('交付路径不能包含符号链接'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
function version(root, relative) {
  const file = safeFile(root, relative);
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('交付只支持不超过 16MB 的普通文件');
    return { hash: digest(fs.readFileSync(file)), mode: stat.mode & 0o777 };
  } catch (error) { if (error.code === 'ENOENT') return { hash: null, mode: null }; throw error; }
}
function atomicJson(file, value) {
  const fd = fs.openSync(`${file}.tmp`, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(`${file}.tmp`, file);
  syncDirectory(path.dirname(file));
}
function syncDirectory(directory) {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

export function createTaskWorkspace(storageRoot, task, sourceRoot) {
  if (typeof task.taskId !== 'string' || !/^[\w-]{1,128}$/.test(task.taskId)) throw new Error('无效隔离任务 ID');
  writablePaths(task.writablePaths);
  sourceRoot = fs.realpathSync(sourceRoot);
  const directory = path.join(storageRoot, '.agent', 'swarm-workspaces', task.taskId);
  const manifestFile = path.join(directory, 'manifest.json');
  if (fs.existsSync(manifestFile)) {
    const saved = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (saved.taskId !== task.taskId || saved.sourceRoot !== path.resolve(sourceRoot)) throw new Error('隔离快照来源不匹配');
    if (JSON.stringify(Object.keys(saved.baseline || {}).sort()) !== JSON.stringify([...task.writablePaths].sort())) throw new Error('隔离快照写入范围不匹配');
    return { ...saved, directory, root: path.join(directory, 'files') };
  }
  const root = path.join(directory, 'files');
  fs.mkdirSync(root, { recursive: true });
  let bytes = 0, count = 0;
  function copy(relative = '') {
    for (const item of fs.readdirSync(path.join(sourceRoot, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (SKIP.has(item.name) || pathProtection(name) || item.isSymbolicLink()) continue;
      const source = path.join(sourceRoot, name), target = path.join(root, name);
      if (item.isDirectory()) { fs.mkdirSync(target, { recursive: true }); copy(name); }
      else if (item.isFile()) {
        const stat = fs.statSync(source); bytes += stat.size; count++;
        if (bytes > 128 * 1024 * 1024 || count > 20000 || stat.size > 16 * 1024 * 1024) throw new Error('隔离快照超过文件或容量限制，请缩小工作区');
        fs.copyFileSync(source, target); fs.chmodSync(target, stat.mode & 0o777);
      }
    }
  }
  try {
    copy();
    const baseline = Object.fromEntries(writablePaths(task.writablePaths).map(name => [name, version(root, name)]));
    // Validate source paths as well, including links omitted from the copy.
    for (const name of task.writablePaths) if (JSON.stringify(version(sourceRoot, name)) !== JSON.stringify(baseline[name])) throw new Error('源目录在创建快照时发生变化，请重试');
    const manifest = { taskId: task.taskId, sourceRoot: path.resolve(sourceRoot), baseline };
    atomicJson(manifestFile, manifest);
    return { directory, root, ...manifest };
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
}

export function taskChanges(workspace) {
  return Object.entries(workspace.baseline).flatMap(([name, base]) => {
    const next = version(workspace.root, name);
    return next.hash === base.hash && next.mode === base.mode ? [] : [{ path: name, base, next }];
  });
}

export function integrateTaskWorkspace(workspace) {
  const journalFile = path.join(workspace.directory, 'integration.json');
  let journal;
  try { journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!journal) {
    const changes = taskChanges(workspace);
    const conflicts = changes.filter(change => JSON.stringify(version(workspace.sourceRoot, change.path)) !== JSON.stringify(change.base));
    if (conflicts.length) return { status: 'conflict', conflicts: conflicts.map(change => change.path) };
    journal = { status: 'applying', changes, taskId: workspace.taskId };
    // Stage immutable proposed bytes before recording the integration intent.
    fs.mkdirSync(path.join(workspace.directory, 'delivery'), { recursive: true });
    for (const change of changes) if (change.next.hash !== null) {
      const bytes = fs.readFileSync(safeFile(workspace.root, change.path));
      if (digest(bytes) !== change.next.hash) throw new Error('交付内容在准备期间发生变化');
      const fd = fs.openSync(path.join(workspace.directory, 'delivery', digest(change.path)), 'w', 0o600);
      try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    syncDirectory(path.join(workspace.directory, 'delivery'));
    atomicJson(journalFile, journal);
  }
  const same = (a, b) => a.hash === b.hash && a.mode === b.mode;
  const conflicts = journal.changes.filter(change => {
    const current = version(workspace.sourceRoot, change.path);
    return !same(current, change.next) && (journal.status === 'integrated' || !same(current, change.base));
  });
  if (conflicts.length) return { status: 'conflict', conflicts: conflicts.map(change => change.path) };
  for (const change of journal.changes) {
    const target = safeFile(workspace.sourceRoot, change.path);
    if (same(version(workspace.sourceRoot, change.path), change.next)) continue;
    if (change.next.hash === null) fs.unlinkSync(target);
    else {
      const staged = path.join(workspace.directory, 'delivery', digest(change.path));
      if (digest(fs.readFileSync(staged)) !== change.next.hash) throw new Error('交付内容已改变，不能继续合入');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = path.join(path.dirname(target), `.swarm-${workspace.taskId}-${crypto.randomUUID()}.tmp`);
      const fd = fs.openSync(temporary, 'wx', change.next.mode);
      try {
        try { fs.writeFileSync(fd, fs.readFileSync(staged)); fs.fchmodSync(fd, change.next.mode); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(temporary, target);
      } finally { fs.rmSync(temporary, { force: true }); }
    }
    syncDirectory(path.dirname(target));
  }
  journal.status = 'integrated'; atomicJson(journalFile, journal);
  return { status: 'integrated', files: journal.changes.map(change => ({ path: change.path, hash: change.next.hash, baselineHash: change.base.hash })) };
}
