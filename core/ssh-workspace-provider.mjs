import { compareMonitorSnapshots } from './ssh-monitor-metrics.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { getSshConnection, setSshWorkspaceRoot as persistSshWorkspaceRoot } from './ssh-connection-store.mjs';
import { getSshSessionClient, getSshSftpClient } from './ssh-runtime.mjs';
import { redactGitRemoteUrl, validGitRemoteName, validateGitRemoteUrl } from './git-remote.mjs';
import { gitOperationArgs, safeWorkspacePath } from './git-workspace-provider.mjs';
export { validateGitRemoteUrl };

const MAX_TEXT_BYTES = 512 * 1024;
const MAX_WRITE_BYTES = 5 * 1024 * 1024;
const PRIVATE_DIRS = new Set(['.agent', '.security', '.codex', '.ssh', '.aws', '.gnupg', '.config', '.local', '.git', 'user-profiles', 'partitions', 'session storage', 'local storage', 'indexeddb']);
const PRIVATE_FILES = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|keystore)|credentials(?:\.json)?|secrets?\.ya?ml)$/i;
const TEXT_EXTENSIONS = new Set(['', '.txt', '.tex', '.latex', '.typ', '.bib', '.sty', '.cls', '.md', '.mdx', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.jsonc', '.css', '.scss', '.less', '.html', '.htm', '.xml', '.yaml', '.yml', '.toml', '.ini', '.gitignore', '.editorconfig', '.py', '.rb', '.php', '.java', '.kt', '.kts', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.go', '.rs', '.swift', '.sql', '.sh', '.ps1', '.bat', '.cmd', '.vue', '.svelte', '.graphql', '.gql', '.csv', '.tsv', '.log', '.properties', '.conf']);

export function safeRemoteRelativePath(input = '') {
  if (typeof input !== 'string' || input.includes('\0') || input.includes('\\') || input.startsWith('/')) throw new Error('远程路径必须是相对 POSIX 路径');
  const normalized = path.posix.normalize(input || '.');
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('远程路径超出工作区');
  return normalized === '.' ? '' : normalized;
}

export function protectedRemotePath(input = '') {
  const normalized = safeRemoteRelativePath(input);
  return normalized.split('/').some(part => PRIVATE_DIRS.has(part.toLowerCase()) || PRIVATE_FILES.test(part));
}

function call(target, method, ...args) {
  return new Promise((resolve, reject) => {
    target[method](...args, (error, value) => error ? reject(error) : resolve(value));
  });
}

let hostFileTestSftpFactory = null;
export function setHostFileSftpFactoryForTest(factory) { hostFileTestSftpFactory = factory; }
function sftpFor(connectionId) { return hostFileTestSftpFactory ? hostFileTestSftpFactory(connectionId) : getSshSftpClient(connectionId); }

function connectionRoot(connectionId) {
  const connection = getSshConnection(connectionId);
  if (!connection) throw new Error('SSH 连接不存在');
  if (!connection.workspaceRoot) throw new Error('请先设置远程项目目录');
  return { connection, root: connection.workspaceRoot };
}

function resolveRemote(root, relative, { allowRoot = true } = {}) {
  const safe = safeRemoteRelativePath(relative);
  if (safe && protectedRemotePath(safe)) throw new Error('远程路径包含受保护的凭据或应用数据');
  if (!safe && !allowRoot) throw new Error('不能操作工作区根目录');
  return { relative: safe, absolute: safe ? path.posix.join(root, safe) : root };
}

function isSymlink(attrs) { return attrs?.isSymbolicLink?.() || (Number(attrs?.mode) & 0o170000) === 0o120000; }
function isDirectory(attrs) { return attrs?.isDirectory?.() || (Number(attrs?.mode) & 0o170000) === 0o040000; }
function isFile(attrs) { return attrs?.isFile?.() || (Number(attrs?.mode) & 0o170000) === 0o100000; }
function isRemoteChildName(name) { return typeof name === 'string' && Boolean(name) && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\') && !name.includes('\0'); }

export function normalizeSshHostPath(input = '/') {
  if (typeof input !== 'string' || !input.startsWith('/') || input.includes('\\') || input.includes('\0') || input.length > 4096) throw new Error('远程路径必须是绝对 POSIX 路径');
  const canonical = input.replace(/\/+$/, '') || '/';
  const normalized = path.posix.normalize(canonical);
  if (normalized !== canonical || input.includes('//')) throw new Error('远程路径格式无效');
  return normalized;
}

async function assertHostPathNoSymlink(sftp, absolute, { allowMissing = false } = {}) {
  let current = '/';
  for (const part of absolute.split('/').filter(Boolean)) {
    current = path.posix.join(current, part);
    try {
      const attrs = await call(sftp, 'lstat', current);
      if (isSymlink(attrs)) throw new Error('为保护服务器文件，暂不跟随符号链接');
    } catch (error) { if (allowMissing && error.code === 2) continue; throw error; }
  }
}

export async function listSshHostDirectory(connectionId, requestedPath = '/') {
  const absolute = normalizeSshHostPath(requestedPath), sftp = await sftpFor(connectionId);
  await assertHostPathNoSymlink(sftp, absolute);
  const attrs = await call(sftp, 'lstat', absolute);
  if (!isDirectory(attrs)) throw new Error('远程路径不是目录');
  const entries = [];
  for (const item of await call(sftp, 'readdir', absolute)) {
    if (!isRemoteChildName(item.filename) || isSymlink(item.attrs) || (!isDirectory(item.attrs) && !isFile(item.attrs))) continue;
    entries.push({ name: item.filename, path: path.posix.join(absolute, item.filename), type: isDirectory(item.attrs) ? 'directory' : 'file', size: Number(item.attrs.size) || 0, mode: Number(item.attrs.mode) & 0o7777, modified: Number(item.attrs.mtime) * 1000 || 0 });
  }
  entries.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'directory' ? -1 : 1);
  return { path: absolute, entries };
}

export async function readSshHostTextFile(connectionId, requestedPath) {
  const absolute = normalizeSshHostPath(requestedPath), sftp = await sftpFor(connectionId);
  await assertHostPathNoSymlink(sftp, absolute);
  const attrs = await call(sftp, 'lstat', absolute);
  if (!isFile(attrs) || Number(attrs.size) > MAX_TEXT_BYTES) throw new Error('仅支持读取 512 KB 以内的普通文件');
  const data = Buffer.from(await call(sftp, 'readFile', absolute));
  if (data.length > MAX_TEXT_BYTES) throw new Error('文件在读取期间增长，已超过 512 KB 文本预览上限，请下载到本地打开');
  if (data.includes(0)) throw new Error('该文件为二进制文件，文本编辑器不支持打开');
  try { new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { throw new Error('该文件不是 UTF-8 文本，请下载到本地使用相应编码打开'); }
  return { path: absolute, content: data.toString('utf8'), size: data.length };
}

export async function writeSshHostTextFile(connectionId, requestedPath, content) {
  const absolute = normalizeSshHostPath(requestedPath), data = Buffer.from(String(content ?? ''), 'utf8');
  if (data.length > MAX_WRITE_BYTES) throw new Error('文件超过 5 MB 写入上限');
  const sftp = await sftpFor(connectionId), parent = path.posix.dirname(absolute);
  await assertHostPathNoSymlink(sftp, parent);
  const parentAttrs = await call(sftp, 'lstat', parent);
  if (!isDirectory(parentAttrs)) throw new Error('目标目录不存在');
  await assertHostPathNoSymlink(sftp, absolute, { allowMissing: true });
  let mode = 0o600;
  try {
    const existing = await call(sftp, 'lstat', absolute);
    if (!isFile(existing)) throw new Error('只能保存普通文件');
    mode = Number(existing.mode) & 0o777;
  } catch (error) { if (error.code !== 2) throw error; }
  const temporary = path.posix.join(parent, `.${path.posix.basename(absolute)}.mli-${crypto.randomUUID()}.tmp`);
  try {
    await call(sftp, 'writeFile', temporary, data, { mode, flags: 'wx' });
    await call(sftp, 'ext_openssh_rename', temporary, absolute);
  } catch (error) { try { await call(sftp, 'unlink', temporary); } catch {} throw error; }
  return { path: absolute, size: data.length };
}

export async function readSshHostFileBytes(connectionId, requestedPath, { maxBytes = 50 * 1024 * 1024 } = {}) {
  const absolute = normalizeSshHostPath(requestedPath), sftp = await sftpFor(connectionId);
  await assertHostPathNoSymlink(sftp, absolute);
  const attrs = await call(sftp, 'lstat', absolute);
  if (!isFile(attrs)) throw new Error('远程路径不是普通文件');
  if (Number(attrs.size) > maxBytes) throw new Error(`文件超过 ${Math.floor(maxBytes / 1024 / 1024)} MB 下载上限`);
  return { path: absolute, name: path.posix.basename(absolute), size: Number(attrs.size) || 0, content: Buffer.from(await call(sftp, 'readFile', absolute)) };
}

// Desktop mutations use SFTP operations; names never become shell commands.
export async function mutateSshHostFile(connectionId, operation) {
  const { action } = operation;
  const absolute = normalizeSshHostPath(operation.path);
  if (absolute === '/') throw new Error('不能修改服务器根目录');
  const sftp = await sftpFor(connectionId);
  await assertHostPathNoSymlink(sftp, path.posix.dirname(absolute));
  if (action === 'mkdir' || action === 'upload') {
    try { await call(sftp, 'lstat', absolute); throw new Error('目标名称已存在'); }
    catch (error) { if (error.code !== 2) throw error; }
    if (action === 'mkdir') await call(sftp, 'mkdir', absolute, { mode: 0o755 });
    else {
      if (typeof operation.content !== 'string' || operation.content.length > 14 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(operation.content)) throw new Error('上传文件格式无效或超过 10 MB');
      const bytes = Buffer.from(operation.content, 'base64');
      if (bytes.length > 10 * 1024 * 1024) throw new Error('上传文件超过 10 MB');
      await call(sftp, 'writeFile', absolute, bytes, { mode: 0o644, flags: 'wx' });
    }
    return { path: absolute };
  }
  await assertHostPathNoSymlink(sftp, absolute);
  const attrs = await call(sftp, 'lstat', absolute);
  if (!isFile(attrs) && !isDirectory(attrs)) throw new Error('只支持普通文件和目录');
  if (action === 'rename') {
    if (!isRemoteChildName(operation.name)) throw new Error('请输入有效的文件名称');
    const destination = path.posix.join(path.posix.dirname(absolute), operation.name);
    try { await call(sftp, 'lstat', destination); throw new Error('目标名称已存在'); }
    catch (error) { if (error.code !== 2) throw error; }
    await call(sftp, 'rename', absolute, destination);
    return { path: destination };
  }
  if (action === 'trash') {
    const trash = path.posix.join(path.posix.dirname(absolute), '.mli-trash');
    if (absolute.split('/').includes('.mli-trash')) throw new Error('废纸篓内的项目请使用重命名恢复');
    try { await call(sftp, 'mkdir', trash, { mode: 0o700 }); } catch (error) {
      const existing = await call(sftp, 'lstat', trash);
      if (!isDirectory(existing) || isSymlink(existing)) throw error;
    }
    await assertHostPathNoSymlink(sftp, trash);
    const destination = path.posix.join(trash, `${crypto.randomUUID()}-${path.posix.basename(absolute)}`);
    await call(sftp, 'rename', absolute, destination);
    return { path: destination, originalPath: absolute };
  }
  if (action === 'restore') {
    if (path.posix.basename(path.posix.dirname(absolute)) !== '.mli-trash') throw new Error('项目不在废纸篓中');
    const destination = normalizeSshHostPath(operation.destination);
    if (path.posix.dirname(destination) !== path.posix.dirname(path.posix.dirname(absolute))) throw new Error('只能恢复到原目录');
    await assertHostPathNoSymlink(sftp, path.posix.dirname(destination));
    try { await call(sftp, 'lstat', destination); throw new Error('原位置已有同名项目'); }
    catch (error) { if (error.code !== 2) throw error; }
    await call(sftp, 'rename', absolute, destination);
    return { path: destination };
  }
  throw new Error('不支持的文件操作');
}

async function assertNoSymlink(sftp, root, absolute, { allowMissing = false } = {}) {
  const relative = path.posix.relative(root, absolute);
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) throw new Error('远程路径超出工作区');
  let current = root;
  const rootStat = await call(sftp, 'lstat', root);
  if (isSymlink(rootStat) || !isDirectory(rootStat)) throw new Error('工作区根目录必须是实际目录，不能是符号链接');
  for (const part of relative.split('/').filter(Boolean)) {
    current = path.posix.join(current, part);
    try {
      const attrs = await call(sftp, 'lstat', current);
      if (isSymlink(attrs)) throw new Error('远程工作区不允许通过符号链接访问文件');
    } catch (error) {
      if (allowMissing && error.code === 2) continue;
      throw error;
    }
  }
}

export async function validateSshWorkspacePath(connectionId, requestedPath) {
  const client = getSshSessionClient(connectionId);
  const sftp = await sftpFor(connectionId);
  const input = String(requestedPath || '').trim();
  if (!input.startsWith('/') || input.includes('\0') || input.includes('\\') || input.length > 4096) throw new Error('远程项目目录必须是 POSIX 绝对路径');
  const actual = await call(sftp, 'realpath', input);
  const normalizedInput = input.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  if (actual !== normalizedInput) throw new Error('远程项目目录经过了符号链接解析，请使用其真实路径');
  if (actual === '/' || ['/home', '/root', '/etc', '/proc', '/sys', '/dev', '/var', '/tmp'].includes(actual)) throw new Error('不能将系统根目录或公共系统目录设为工作区');
  const attrs = await call(sftp, 'lstat', actual);
  if (isSymlink(attrs) || !isDirectory(attrs)) throw new Error('远程项目路径必须是实际目录');
  return { connectionId, workspaceRoot: actual, host: getSshConnection(connectionId).host, name: getSshConnection(connectionId).name, connected: Boolean(client) };
}

export async function browseSshWorkspacePath(connectionId, requestedPath = '/') {
  const sftp = await sftpFor(connectionId);
  const input = String(requestedPath || '/').trim();
  if (!input.startsWith('/') || input.includes('\\') || input.includes('\0') || input.length > 4096) throw new Error('远程目录必须是 POSIX 绝对路径');
  const actual = await call(sftp, 'realpath', input);
  if (actual !== (input.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/')) throw new Error('该路径经过符号链接，请使用真实路径');
  const attrs = await call(sftp, 'lstat', actual);
  if (isSymlink(attrs) || !isDirectory(attrs)) throw new Error('远程路径不是实际目录');
  const entries = [];
  for (const item of await call(sftp, 'readdir', actual)) {
    if (!isRemoteChildName(item.filename) || isSymlink(item.attrs) || !isDirectory(item.attrs)) continue;
    if (protectedRemotePath(path.posix.join(actual, item.filename).replace(/^\/+/, ''))) continue;
    entries.push({ name: item.filename, path: path.posix.join(actual, item.filename), type: 'directory' });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { path: actual, entries };
}

export async function setSshWorkspaceRoot(connectionId, requestedPath) {
  const value = await validateSshWorkspacePath(connectionId, requestedPath);
  const connection = persistSshWorkspaceRoot(connectionId, value.workspaceRoot);
  return { ...value, workspaceRoot: connection.workspaceRoot };
}

export async function listSshWorkspaceDirectory(connectionId, relativePath = '') {
  const { root } = connectionRoot(connectionId), target = resolveRemote(root, relativePath);
  const sftp = await sftpFor(connectionId);
  await assertNoSymlink(sftp, root, target.absolute);
  const attrs = await call(sftp, 'lstat', target.absolute);
  if (!isDirectory(attrs)) throw new Error('远程路径不是文件夹');
  const items = await call(sftp, 'readdir', target.absolute);
  const entries = [];
  for (const item of items) {
    if (!isRemoteChildName(item.filename)) continue;
    const child = target.relative ? `${target.relative}/${item.filename}` : item.filename;
    if (protectedRemotePath(child) || isSymlink(item.attrs) || (!isFile(item.attrs) && !isDirectory(item.attrs))) continue;
    entries.push({ name: item.filename, path: child, type: isDirectory(item.attrs) ? 'directory' : 'file', size: Number(item.attrs.size) || 0, modified: Number(item.attrs.mtime) * 1000 || 0 });
  }
  entries.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'directory' ? -1 : 1);
  return { path: target.relative, root, entries };
}

export async function readSshWorkspaceFile(connectionId, relativePath) {
  const { root } = connectionRoot(connectionId), target = resolveRemote(root, relativePath, { allowRoot: false });
  const sftp = await sftpFor(connectionId);
  await assertNoSymlink(sftp, root, target.absolute);
  const attrs = await call(sftp, 'lstat', target.absolute);
  if (!isFile(attrs)) throw new Error('远程路径不是普通文件');
  if (Number(attrs.size) > MAX_TEXT_BYTES) throw new Error('远程文本文件超过 512 KB 读取上限');
  const ext = path.posix.extname(target.absolute).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) throw new Error('远程预览仅支持文本文件');
  const data = await call(sftp, 'readFile', target.absolute);
  const buffer = Buffer.from(data);
  if (buffer.includes(0)) throw new Error('远程文件包含二进制数据，不能作为文本读取');
  return { path: target.relative, name: path.posix.basename(target.absolute), size: buffer.length, modified: Number(attrs.mtime) * 1000 || 0, kind: 'text', mime: 'text/plain; charset=utf-8', content: buffer.toString('utf8') };
}

export async function writeSshWorkspaceFile(connectionId, relativePath, content) {
  const { root } = connectionRoot(connectionId), target = resolveRemote(root, relativePath, { allowRoot: false });
  const text = String(content ?? ''), data = Buffer.from(text, 'utf8');
  if (data.length > MAX_WRITE_BYTES) throw new Error('远程文本文件超过 5 MB 写入上限');
  const sftp = await sftpFor(connectionId);
  const parent = path.posix.dirname(target.absolute);
  await assertNoSymlink(sftp, root, parent);
  const parentAttrs = await call(sftp, 'lstat', parent);
  if (!isDirectory(parentAttrs)) throw new Error('远程父路径不是文件夹');
  let mode = 0o600;
  try {
    const existing = await call(sftp, 'lstat', target.absolute);
    mode = existing.mode & 0o777;
    if (isSymlink(existing) || !isFile(existing)) throw new Error('远程目标必须是普通文件，不能覆盖目录或符号链接');
  } catch (error) { if (error.code !== 2) throw error; }
  const temporary = path.posix.join(parent, `.${path.posix.basename(target.absolute)}.${crypto.randomUUID()}.mli-tmp`);
  try {
    await call(sftp, 'writeFile', temporary, data, { mode, flags: 'wx' });
    await call(sftp, 'ext_openssh_rename', temporary, target.absolute);
  } catch (error) {
    try { await call(sftp, 'unlink', temporary); } catch {}
    throw error;
  }
  return { path: target.relative, size: data.length, content: text };
}

export async function createSshWorkspaceDirectory(connectionId, relativePath) {
  const { root } = connectionRoot(connectionId), target = resolveRemote(root, relativePath, { allowRoot: false });
  const sftp = await sftpFor(connectionId);
  await assertNoSymlink(sftp, root, path.posix.dirname(target.absolute));
  await call(sftp, 'mkdir', target.absolute, { mode: 0o700 });
  return { path: target.relative, name: path.posix.basename(target.absolute), type: 'directory' };
}

export async function createSshWorkspaceFile(connectionId, relativePath) {
  const { root } = connectionRoot(connectionId), target = resolveRemote(root, relativePath, { allowRoot: false });
  const sftp = await sftpFor(connectionId);
  await assertNoSymlink(sftp, root, path.posix.dirname(target.absolute));
  try { await call(sftp, 'lstat', target.absolute); throw new Error('同名远程项目已存在'); }
  catch (error) { if (error.code !== 2) throw error; }
  await writeSshWorkspaceFile(connectionId, relativePath, '');
  return { path: target.relative, name: path.posix.basename(target.absolute), type: 'file' };
}

async function removeRemoteTree(sftp, absolute, relative, budget) {
  if (protectedRemotePath(relative)) throw new Error('目录包含受保护的凭据或应用数据，拒绝递归删除');
  if (--budget.remaining < 0) throw new Error('目录项目超过 10000 个，拒绝递归删除');
  const attrs = await call(sftp, 'lstat', absolute);
  if (isSymlink(attrs)) throw new Error('远程工作区不允许删除符号链接');
  if (isDirectory(attrs)) {
    const entries = await call(sftp, 'readdir', absolute);
    for (const entry of entries) {
      if (!isRemoteChildName(entry.filename)) continue;
      const child = path.posix.join(relative, entry.filename);
      await removeRemoteTree(sftp, path.posix.join(absolute, entry.filename), child, budget);
    }
    await call(sftp, 'rmdir', absolute);
  } else if (isFile(attrs)) await call(sftp, 'unlink', absolute);
  else throw new Error('不支持删除特殊文件');
}

async function inspectRemoteTreeForDeletion(sftp, absolute, relative, budget) {
  if (protectedRemotePath(relative)) throw new Error('目录包含受保护的凭据或应用数据，拒绝递归删除');
  if (--budget.remaining < 0) throw new Error('目录项目超过 10000 个，拒绝递归删除');
  const attrs = await call(sftp, 'lstat', absolute);
  if (isSymlink(attrs)) throw new Error('目录包含符号链接，拒绝递归删除');
  if (!isDirectory(attrs) && !isFile(attrs)) throw new Error('目录包含特殊文件，拒绝递归删除');
  if (!isDirectory(attrs)) return;
  for (const entry of await call(sftp, 'readdir', absolute)) {
    if (!isRemoteChildName(entry.filename)) throw new Error('远程目录返回无效名称，拒绝递归删除');
    const child = path.posix.join(relative, entry.filename);
    await inspectRemoteTreeForDeletion(sftp, path.posix.join(absolute, entry.filename), child, budget);
  }
}

export async function renameSshWorkspaceItem(connectionId, relativePath, newName) {
  const source = resolveRemote(connectionRoot(connectionId).root, relativePath, { allowRoot: false });
  const name = String(newName || '').trim();
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) throw new Error('名称无效');
  const destinationPath = path.posix.join(path.posix.dirname(source.relative), name);
  const destination = resolveRemote(connectionRoot(connectionId).root, destinationPath, { allowRoot: false });
  const sftp = await sftpFor(connectionId);
  await assertNoSymlink(sftp, connectionRoot(connectionId).root, path.posix.dirname(source.absolute));
  try { await call(sftp, 'lstat', destination.absolute); throw new Error('同名远程项目已存在'); }
  catch (error) { if (error.code !== 2) throw error; }
  await call(sftp, 'rename', source.absolute, destination.absolute);
  return { from: source.relative, path: destination.relative, name };
}

export async function moveSshWorkspaceItem(connectionId, relativePath, targetDirectory) {
  const root = connectionRoot(connectionId).root;
  const source = resolveRemote(root, relativePath, { allowRoot: false });
  const target = resolveRemote(root, targetDirectory);
  const sftp = await sftpFor(connectionId);
  await assertNoSymlink(sftp, root, source.absolute);
  await assertNoSymlink(sftp, root, target.absolute);
  if (!isDirectory(await call(sftp, 'lstat', target.absolute))) throw new Error('远程目标不是文件夹');
  if (isDirectory(await call(sftp, 'lstat', source.absolute)) && target.absolute.startsWith(`${source.absolute}/`)) throw new Error('不能将文件夹移动到自身内部');
  const destinationPath = target.relative ? `${target.relative}/${path.posix.basename(source.relative)}` : path.posix.basename(source.relative);
  const destination = resolveRemote(root, destinationPath, { allowRoot: false });
  try { await call(sftp, 'lstat', destination.absolute); throw new Error('目标位置存在同名远程项目'); }
  catch (error) { if (error.code !== 2) throw error; }
  await call(sftp, 'rename', source.absolute, destination.absolute);
  return { from: source.relative, path: destination.relative };
}

export async function deleteSshWorkspaceItem(connectionId, relativePath) {
  const { root } = connectionRoot(connectionId), target = resolveRemote(root, relativePath, { allowRoot: false });
  const sftp = await sftpFor(connectionId);
  await assertNoSymlink(sftp, root, target.absolute);
  const attrs = await call(sftp, 'lstat', target.absolute);
  await inspectRemoteTreeForDeletion(sftp, target.absolute, target.relative, { remaining: 10000 });
  await removeRemoteTree(sftp, target.absolute, target.relative, { remaining: 10000 });
  return { path: target.relative, type: isDirectory(attrs) ? 'directory' : 'file' };
}

async function walkSshWorkspace(connectionId, base = '') {
  const safeBase = safeRemoteRelativePath(base);
  const result = [];
  const pending = [safeBase];
  while (pending.length && result.length < 2000) {
    const directory = pending.pop();
    const listing = await listSshWorkspaceDirectory(connectionId, directory);
    for (const entry of listing.entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.type === 'directory') pending.push(entry.path);
      else result.push(entry);
      if (result.length >= 2000) break;
    }
  }
  return result;
}

export async function searchSshWorkspaceFiles(connectionId, { pattern, base = '', ignoreCase = false, limit = 100 } = {}) {
  const expression = new RegExp(String(pattern || ''), ignoreCase ? 'i' : '');
  const files = await walkSshWorkspace(connectionId, base), matches = [];
  for (const file of files) {
    if (matches.length >= limit || file.size > 1024 * 1024) continue;
    try {
      const value = await readSshWorkspaceFile(connectionId, file.path);
      const lines = value.content.split('\n');
      for (let index = 0; index < lines.length && matches.length < limit; index++) if (expression.test(lines[index])) matches.push(`${file.path}:${index + 1}:${lines[index].trim().slice(0, 200)}`);
    } catch { /* Binary, protected, and changing files are skipped. */ }
  }
  return matches;
}

export async function findSshWorkspaceFiles(connectionId, { pattern, base = '', limit = 200 } = {}) {
  const expression = new RegExp(`^${String(pattern || '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')}$`, 'i');
  const files = await walkSshWorkspace(connectionId, base);
  return files.filter(file => expression.test(path.posix.basename(file.path))).slice(0, limit).map(file => file.path);
}

export async function listSshWorkspaceReferences(connectionId, { query = '', limit = 100 } = {}) {
  const root = connectionRoot(connectionId).root;
  const search = String(query).trim().replaceAll('\\', '/').toLocaleLowerCase();
  const terms = search.split(/\s+/).filter(Boolean);
  const excluded = new Set(['node_modules', 'vendor', 'dist', 'build', 'target', '.venv', 'venv', '__pycache__', '.next', '.nuxt']);
  const pending = [{ path: '', depth: 0 }], entries = [];
  let scanned = 0, incomplete = false;
  while (pending.length && scanned < 10000) {
    const current = pending.shift();
    let listing;
    try { listing = await listSshWorkspaceDirectory(connectionId, current.path); }
    catch { incomplete = true; continue; }
    for (const item of listing.entries) {
      if (++scanned > 10000) { incomplete = true; break; }
      if (item.name.startsWith('.') || excluded.has(item.name.toLowerCase())) continue;
      entries.push({ name: item.name, path: item.path, type: item.type });
      if (item.type === 'directory' && current.depth < 16) pending.push({ path: item.path, depth: current.depth + 1 });
      else if (item.type === 'directory') incomplete = true;
    }
  }
  if (pending.length) incomplete = true;
  const matched = entries.filter(item => terms.every(term => item.path.toLocaleLowerCase().includes(term)));
  if (search) matched.sort((a, b) => {
    const rank = item => item.name.toLocaleLowerCase() === search ? 0 : item.name.toLocaleLowerCase().startsWith(search) ? 1 : item.name.toLocaleLowerCase().includes(search) ? 2 : 3;
    return rank(a) - rank(b) || a.path.localeCompare(b.path, 'zh-CN', { numeric: true });
  });
  const count = Math.max(1, Math.min(200, Number(limit) || 100));
  return { workspace: root, entries: matched.slice(0, count), hasMore: matched.length > count, incomplete };
}

export async function execSshCommand(connectionId, command, { cwd, signal, timeoutMs = 60000, onOutput } = {}) {
  if (typeof command !== 'string' || !command.trim() || command.length > 20000) throw new Error('远程命令必须为 1–20000 字符');
  const { root } = connectionRoot(connectionId);
  const relative = safeRemoteRelativePath(cwd || '');
  if (relative && protectedRemotePath(relative)) throw new Error('远程命令目录包含受保护路径');
  const workingDirectory = relative ? path.posix.join(root, relative) : root;
  const sftp = await sftpFor(connectionId);
  await assertNoSymlink(sftp, root, workingDirectory);
  const attrs = await call(sftp, 'lstat', workingDirectory);
  if (!isDirectory(attrs)) throw new Error('远程命令目录不是文件夹');
  const client = getSshSessionClient(connectionId);
  return new Promise((resolve, reject) => {
    let settled = false, stdout = [], stderr = [], stdoutSize = 0, stderrSize = 0, timedOut = false;
    let stream;
    const chunksLimit = 1024 * 1024;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => { try { stream?.signal('INT'); } catch {} finish(null, { status: 'interrupted', code: null, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), command }); };
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    const quotedCwd = `'${workingDirectory.replaceAll("'", "'\\''")}'`;
    client.exec(`cd -- ${quotedCwd} && ${command}`, { pty: false }, (error, remoteStream) => {
      if (error) return finish(error);
      stream = remoteStream;
      const collect = (target, streamName) => data => {
        const buffer = Buffer.from(data), remaining = Math.max(0, chunksLimit - target.reduce((sum, item) => sum + item.length, 0));
        if (remaining) target.push(buffer.subarray(0, remaining));
        if (streamName === 'stdout') stdoutSize += buffer.length; else stderrSize += buffer.length;
        onOutput?.(streamName, buffer.subarray(0, remaining).toString('utf8'));
      };
      remoteStream.on('data', collect(stdout, 'stdout'));
      remoteStream.stderr.on('data', collect(stderr, 'stderr'));
      remoteStream.once('close', (code, exitSignal) => finish(null, { status: timedOut ? 'timeout' : signal?.aborted ? 'interrupted' : 'exited', code: code ?? null, signal: exitSignal || null, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), truncated: stdoutSize > chunksLimit || stderrSize > chunksLimit, command, cwd: workingDirectory }));
    });
  });
}

function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }

async function gitCommand(connectionId, args) {
  const { root } = connectionRoot(connectionId);
  const rootArg = shellQuote(root);
  const filters = await execSshCommand(connectionId, `git -C ${rootArg} config --name-only --get-regexp '^filter\\..*\\.(clean|smudge|process)$'`, { timeoutMs: 5000 });
  if (filters.status === 'timeout' || filters.status === 'interrupted') throw new Error('远端 Git 安全配置检查中断');
  const filterKeys = filters.stdout.split(/\r?\n/).map(value => value.trim()).filter(value => /^filter\.[A-Za-z0-9._-]+\.(?:clean|smudge|process)$/.test(value));
  const configArgs = [
    '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.pager=cat', '-c', 'core.attributesFile=/dev/null',
    ...filterKeys.flatMap(key => ['-c', `${key}=`]),
  ];
  const command = Array.isArray(args) ? args.map(shellQuote).join(' ') : args;
  return execSshCommand(connectionId, `git ${[...configArgs, '-C', root].map(shellQuote).join(' ')} ${command}`, { timeoutMs: 30000 });
}

function requireGitSuccess(result) {
  if (result.status !== 'exited' || result.code !== 0) throw new Error(redactRemoteGitError(result));
  return result.stdout;
}

function redactRemoteGitError(error) {
  const message = String(error?.stderr || error?.stdout || error?.message || '远端 Git 命令失败').trim().slice(0, 1000);
  return message.replace(/https?:\/\/[^\s'"<>]+/gi, value => redactGitRemoteUrl(value));
}

function protectedGitPath(filePath) {
  return String(filePath).split('/').some(part => part === '.git' || /^\.env(?:\.|$)/i.test(part) || /^(?:\.ssh|\.security|\.aws|\.gnupg)$/i.test(part) || /^(?:id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|keystore)|credentials(?:\.json)?|secrets?\.ya?ml)$/i.test(part));
}

export async function readSshGitInfo(connectionId) {
  const workspaceRoot = connectionRoot(connectionId).root;
  const root = requireGitSuccess(await gitCommand(connectionId, 'rev-parse --show-toplevel')).trim();
  if (path.posix.normalize(root) !== path.posix.normalize(workspaceRoot)) throw new Error('Git 仓库根目录必须与当前 SSH 工作区根目录一致');
  const [branch, status, rawChanges, names, branchNames] = await Promise.all([
    gitCommand(connectionId, ['branch', '--show-current']).then(requireGitSuccess),
    gitCommand(connectionId, ['status', '--short', '--branch']).then(requireGitSuccess),
    gitCommand(connectionId, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).then(requireGitSuccess),
    gitCommand(connectionId, ['remote']).then(requireGitSuccess),
    gitCommand(connectionId, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).then(requireGitSuccess),
  ]);
  const remotes = [];
  for (const name of names.split(/\r?\n/).filter(Boolean).slice(0, 50)) {
    const safeName = validGitRemoteName(name);
    const url = requireGitSuccess(await gitCommand(connectionId, ['remote', 'get-url', safeName])).trim();
    remotes.push({ name: safeName, url: redactGitRemoteUrl(url) });
  }
  const records = String(rawChanges).split('\0').filter(Boolean);
  const changes = records.flatMap(record => {
    if (record.length < 4) return [];
    const indexStatus = record[0], worktreeStatus = record[1], filePath = record.slice(3);
    if (!filePath || filePath.split('/').some(part => part === '.git' || /^\.env(?:\.|$)/i.test(part) || /^(?:\.ssh|\.security|\.aws|\.gnupg)$/i.test(part))) return [];
    return [{ path: filePath, indexStatus, worktreeStatus, untracked: indexStatus === '?' && worktreeStatus === '?', conflicted: indexStatus === 'U' || worktreeStatus === 'U' }];
  });
  const stagedRecords = records.filter(record => record.length >= 4 && record[0] !== ' ' && record[0] !== '?');
  const protectedRecords = records.filter(record => record.length >= 4 && protectedGitPath(record.slice(3)));
  const safeStatus = [status.split(/\r?\n/, 1)[0], ...changes.map(change => `${change.indexStatus}${change.worktreeStatus} ${change.path}`)].filter(Boolean).join('\n');
  return { root, branch: branch.trim(), status: safeStatus, dirty: records.length > 0, blockedChanges: protectedRecords.length > 0, hasStagedChanges: stagedRecords.length > 0, protectedStaged: stagedRecords.some(record => protectedGitPath(record.slice(3))), changes, branches: branchNames.split(/\r?\n/).filter(Boolean).slice(0, 200), remotes };
}

export async function updateSshGitRemote(connectionId, { action, name, url, previousName } = {}) {
  const safeName = validGitRemoteName(name);
  if (action === 'remove') {
    requireGitSuccess(await gitCommand(connectionId, ['remote', 'remove', safeName]));
  } else {
    const safeUrl = validateGitRemoteUrl(url);
    if (action === 'add') requireGitSuccess(await gitCommand(connectionId, ['remote', 'add', safeName, safeUrl]));
    else if (action === 'set-url') {
      const oldName = validGitRemoteName(previousName || safeName);
      const checkedUrl = validateGitRemoteUrl(url);
      if (oldName !== safeName) requireGitSuccess(await gitCommand(connectionId, ['remote', 'rename', oldName, safeName]));
      requireGitSuccess(await gitCommand(connectionId, ['remote', 'set-url', safeName, checkedUrl]));
    } else throw new Error('不支持的 Git remote 操作');
  }
  return readSshGitInfo(connectionId);
}

export async function runSshGitAction(connectionId, input = {}) {
  const { root } = connectionRoot(connectionId);
  if (input.action === 'diff') {
    const filePath = safeWorkspacePath(input.path);
    const state = await readSshGitInfo(connectionId);
    const change = state.changes.find(item => item.path === filePath);
    if (change?.untracked && !input.staged) {
      const sftp = await sftpFor(connectionId);
      await assertNoSymlink(sftp, root, path.posix.join(root, filePath));
      const attrs = await call(sftp, 'lstat', path.posix.join(root, filePath));
      if (!isFile(attrs) || Number(attrs.size) > MAX_TEXT_BYTES) throw new Error('未跟踪差异只支持 512 KB 内的普通文本文件');
    }
    const result = await gitCommand(connectionId, change?.untracked && !input.staged
      ? ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--no-color', '--', '/dev/null', filePath]
      : gitOperationArgs(input));
    if (!(change?.untracked && !input.staged)) requireGitSuccess(result);
    else if (result.status !== 'exited' || ![0, 1].includes(result.code)) throw new Error(result.status === 'timeout' || result.status === 'interrupted' ? 'Git 差异读取中断' : redactRemoteGitError(result));
    return { diff: String(result.stdout || '').slice(0, 256 * 1024), truncated: String(result.stdout || '').length > 256 * 1024 };
  }
  if (input.action === 'unstage') {
    const state = await readSshGitInfo(connectionId);
    const requested = new Set((Array.isArray(input.paths) ? input.paths : []).map(safeWorkspacePath));
    if (!requested.size || requested.size > 100) throw new Error('请选择 1 到 100 个 Git 文件');
    for (const filePath of requested) {
      const entry = state.changes.find(change => change.path === filePath);
      if (!entry || entry.indexStatus === ' ' || entry.indexStatus === '?') continue;
      const exists = await gitCommand(connectionId, ['cat-file', '-e', `HEAD:${filePath}`]);
      if (exists.code === 0) requireGitSuccess(await gitCommand(connectionId, ['restore', '--staged', '--', `:(literal)${filePath}`]));
      else requireGitSuccess(await gitCommand(connectionId, ['update-index', '--force-remove', '--', `:(literal)${filePath}`]));
    }
    return readSshGitInfo(connectionId);
  }
  if (input.action === 'commit') {
    const message = String(input.message || '').trim();
    if (!message || message.length > 5000) throw new Error('提交说明必须为 1 到 5000 个字符');
    const staged = await gitCommand(connectionId, ['diff', '--cached', '--quiet']);
    if (staged.code !== 1 && staged.code !== 0) requireGitSuccess(staged);
    if (staged.code === 0) throw new Error('暂存区没有可提交的修改');
    if ((await readSshGitInfo(connectionId)).protectedStaged) throw new Error('暂存区包含受保护文件，拒绝提交');
    const commitResult = await gitCommand(connectionId, ['commit', '-m', message]);
    if (commitResult.status !== 'exited' || commitResult.code !== 0) throw new Error(commitResult.status === 'timeout' || commitResult.status === 'interrupted' ? '提交操作中断，结果可能不确定，请刷新 Git 状态后再操作' : redactRemoteGitError(commitResult));
    return readSshGitInfo(connectionId);
  }
  const args = gitOperationArgs(input);
  if (['branch-create', 'branch-switch', 'pull'].includes(input.action)) {
    const state = await readSshGitInfo(connectionId);
    if (state.dirty || state.blockedChanges) throw new Error('工作区有未提交或受保护文件变更，请先处理后重试');
  }
  if (['fetch', 'pull', 'push'].includes(input.action)) {
    const remoteName = validGitRemoteName(input.remote || 'origin');
    const remoteUrl = requireGitSuccess(await gitCommand(connectionId, ['remote', 'get-url', remoteName])).trim();
    validateGitRemoteUrl(remoteUrl);
  }
  const operationResult = await gitCommand(connectionId, args);
  if (operationResult.status !== 'exited' || operationResult.code !== 0) throw new Error(['timeout', 'interrupted'].includes(operationResult.status) ? 'Git 操作中断，结果可能不确定，请刷新 Git 状态后再操作' : redactRemoteGitError(operationResult));
  return readSshGitInfo(connectionId);
}

export function parseCpuStat(text) {
  text = String(text).replace(/^MLI_CPU:/gm, '');
  const line = String(text).split(/\r?\n/).find(value => /^cpu\s/.test(value));
  const values = line?.trim().split(/\s+/).slice(1).map(Number);
  if (!values || values.length < 4 || values.some(value => !Number.isFinite(value) || value < 0)) return null;
  const total = values.slice(0, 8).reduce((sum, value) => sum + value, 0), idle = values[3] + (values[4] || 0);

  return { total, idle, cores: Math.max(1, String(text).split(/\r?\n/).filter(value => /^cpu\d+\s/.test(value)).length), utilizationSince(previous) {
    if (!previous || total <= previous.total) return null;
    const totalDelta = total - previous.total, idleDelta = idle - previous.idle;
    return Math.max(0, Math.min(100, (totalDelta - idleDelta) / totalDelta * 100));
  } };
}

export function parseMemInfo(text) {
  const values = Object.fromEntries(String(text).split(/\r?\n/).map(line => line.match(/^(MemTotal|MemAvailable|MemFree|Buffers|Cached|SReclaimable|Shmem|SwapTotal|SwapFree):\s+(\d+)\s+kB$/)).filter(Boolean).map(([, key, value]) => [key, Number(value) * 1024]));
  if (!values.MemTotal || values.MemAvailable == null) return null;
  const availableBytes = Math.min(values.MemTotal, values.MemAvailable), usedBytes = values.MemTotal - availableBytes;
  return { totalBytes: values.MemTotal, availableBytes, usedBytes, usedPercent: Math.round(usedBytes / values.MemTotal * 100),
    ...(values.MemFree == null ? {} : { freeBytes:values.MemFree, cacheBytes:Math.max(0,(values.Cached||0)+(values.Buffers||0)+(values.SReclaimable||0)-(values.Shmem||0)) }),
    ...(values.SwapTotal == null ? {} : {swapTotalBytes:values.SwapTotal,swapUsedBytes:Math.max(0,values.SwapTotal-(values.SwapFree||0))}) };
}

export function parseLoadAverage(text) {
  const match = String(text).trim().match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\/(\d+)/);
  return match ? { one: Number(match[1]), five: Number(match[2]), fifteen: Number(match[3]), runnable: Number(match[4]), processes: Number(match[5]) } : null;
}

function parseMetrics(output) {
  const groups = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^(MLI_[A-Z_]+):(.*)$/);
    if (!match) continue;
    const values = groups.get(match[1]) || [];
    values.push(match[2]); groups.set(match[1], values);
  }
  const cpu = parseCpuStat((groups.get('MLI_CPU') || []).join('\n'));
  const memory = parseMemInfo((groups.get('MLI_MEM') || []).join('\n'));
  const load = parseLoadAverage((groups.get('MLI_LOAD') || []).join(''));
  return { supported: Boolean(cpu && memory && load), platform: 'linux', sampledAt: Date.now(), cpu: cpu ? { cores: cpu.cores } : null, memory, load, uptimeSeconds: Number((groups.get('MLI_UPTIME') || [])[0]) || null, processes: (groups.get('MLI_PROCESSES') || []).filter(line => line.trim() && !/^\s*PID\s+COMMAND/i.test(line)).slice(0, 5).map(line => line.trim().slice(0, 240)), reason: cpu && memory && load ? null : '远端系统未提供完整的 /proc 指标' };
}

function execFixed(client, command, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false, output = '', streamRef;
    const timer = setTimeout(() => { if (!settled) { settled = true; streamRef?.close(); reject(new Error('远端状态采样超时')); } }, timeoutMs);
    client.exec(command, (error, stream) => {
      if (error) { clearTimeout(timer); reject(error); return; }
      streamRef = stream;
      stream.on('data', data => { output += Buffer.from(data).toString('utf8'); if (output.length > 64 * 1024 && !settled) { settled = true; clearTimeout(timer); stream.close(); reject(new Error('远端状态数据超过上限')); } });
      stream.stderr.on('data', () => {});
      stream.once('close', code => { if (settled) return; settled = true; clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`远端状态命令失败（退出码 ${code ?? 'unknown'}）`)); });
    });
  });
}

export async function readSshServerMetrics(connectionId, { mountPath } = {}) {
  const client = getSshSessionClient(connectionId);
  const diskPath = mountPath || getSshConnection(connectionId)?.workspaceRoot;
  const pathArg = diskPath ? ` '${String(diskPath).replaceAll("'", "'\\''")}'` : " '/'";
  const command = 'awk \'{print "MLI_CPU:" $0}\' /proc/stat 2>/dev/null; awk \'/^(MemTotal|MemAvailable|MemFree|Buffers|Cached|SReclaimable|Shmem|SwapTotal|SwapFree):/{print "MLI_MEM:" $0}\' /proc/meminfo 2>/dev/null; awk \'{print "MLI_LOAD:" $0}\' /proc/loadavg 2>/dev/null; awk \'{print "MLI_UPTIME:" $1}\' /proc/uptime 2>/dev/null; ps -eo pid,comm,%cpu,%mem --sort=-%cpu 2>/dev/null | head -n 6 | awk \'{print "MLI_PROCESSES:" $0}\'; if command -v df >/dev/null 2>&1; then df -Pk' + pathArg + ' 2>/dev/null | tail -n 1 | awk \'{print "MLI_DISK:" $2 ":" $3 ":" $4 ":" $5}\'; fi';
  try {
    const extendedCommand = command + `; awk '{print "MLI_NET:" $0}' /proc/net/dev 2>/dev/null; awk '{print "MLI_IO:" $0}' /proc/diskstats 2>/dev/null; df -PTk -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | tail -n +2 | head -n 80 | awk '{print "MLI_MOUNTS:" $0}'; if [ -r /etc/os-release ]; then . /etc/os-release; printf 'MLI_SYSTEM:os\\t%s\\n' "$PRETTY_NAME"; fi; printf 'MLI_SYSTEM:kernel\\t%s\\n' "$(uname -sr)"; printf 'MLI_SYSTEM:hostname\\t%s\\n' "$(hostname)"; printf 'MLI_SYSTEM:timezone\\t%s\\n' "$(date +'%Z %z')"; true`;
    const first = await execFixed(client, extendedCommand);
    await new Promise(resolve => setTimeout(resolve, 180));
    const second = await execFixed(client, extendedCommand);
    const before = parseCpuStat(first);
    const after = parseCpuStat(second);
    const metrics = parseMetrics(second);
    metrics.cpu = before && after ? { cores: after.cores, utilizationPercent: after.utilizationSince(before) } : null;

    Object.assign(metrics, compareMonitorSnapshots(first,second));
    metrics.available = metrics.supported;
    const disk = second.split(/\r?\n/).find(line => line.startsWith('MLI_DISK:'))?.split(':');
    metrics.disk = disk?.length === 5 && disk.slice(1, 4).every(v => /^\d+$/.test(v)) && /^\d+%$/.test(disk[4]) && Number(disk[1]) > 0 && Number(disk[2]) + Number(disk[3]) > 0 ? { totalBytes: Number(disk[1]) * 1024, usedBytes: Number(disk[2]) * 1024, availableBytes: Number(disk[3]) * 1024, usedPercent: Math.round(Number(disk[2]) / (Number(disk[2]) + Number(disk[3])) * 1000) / 10, path: diskPath || '/' } : null;
    const missing = [!Number.isFinite(metrics.cpu?.utilizationPercent) && 'CPU', !metrics.memory && '内存', !metrics.load && '负载', !metrics.disk && '磁盘'].filter(Boolean);
    metrics.reason = missing.length ? `${missing.join('、')}指标不可用，请检查服务器系统支持、目录和读取权限` : null;
    return metrics;
  } catch (error) {
    return { supported: false, available: false, platform: null, sampledAt: Date.now(), cpu: null, memory: null, load: null, uptimeSeconds: null, processes: [], reason: error.message };
  }
}
