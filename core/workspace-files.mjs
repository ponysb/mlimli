import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getWorkspaceRoot, resolveInWorkspace } from './paths.mjs';
import { docxExtractText, pptxExtractText, pptxRenderSlides, xlsxRead } from '../plugins/office/lib/ooxml.mjs';

const TEXT_EXTENSIONS = new Set([
  '', '.txt', '.md', '.mdx', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.jsonc',
  '.css', '.scss', '.less', '.html', '.htm', '.xml', '.svg', '.yaml', '.yml', '.toml', '.ini',
  '.env', '.gitignore', '.npmrc', '.editorconfig', '.py', '.rb', '.php', '.java', '.kt', '.kts',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.go', '.rs', '.swift', '.sql', '.sh', '.ps1', '.bat',
  '.cmd', '.vue', '.svelte', '.graphql', '.gql', '.csv', '.tsv', '.log', '.properties', '.conf',
]);
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

function cleanRelative(input = '') {
  const value = String(input).replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  const normalized = path.posix.normalize(value === '.' ? '' : value);
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('路径不能超出工作目录');
  if (normalized.split('/').includes('.agent')) throw new Error('应用数据目录不可操作');
  return normalized === '.' ? '' : normalized;
}

function absolute(input = '', options = {}) {
  const relative = cleanRelative(input);
  const abs = resolveInWorkspace(relative || '.', options);
  if (fs.existsSync(abs)) {
    const real = fs.realpathSync(abs);
    resolveInWorkspace(real, options);
  }
  return { relative, abs };
}

function requireItem(input, expected) {
  const item = absolute(input, { write: expected !== 'read' });
  if (!fs.existsSync(item.abs)) throw new Error('文件或文件夹不存在');
  const stat = fs.statSync(item.abs);
  if (expected === 'file' && !stat.isFile()) throw new Error('目标不是文件');
  if (expected === 'directory' && !stat.isDirectory()) throw new Error('目标不是文件夹');
  return { ...item, stat };
}

function fileKind(file, sample) {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) return { kind: 'office-binary', mime };
  if (mime.startsWith('image/')) return { kind: 'image', mime };
  if (mime.startsWith('audio/')) return { kind: 'audio', mime };
  if (mime.startsWith('video/')) return { kind: 'video', mime };
  if (mime === 'application/pdf') return { kind: 'pdf', mime };
  if (TEXT_EXTENSIONS.has(ext) && !sample?.includes(0)) return { kind: 'text', mime: 'text/plain; charset=utf-8' };
  return { kind: 'binary', mime };
}

export function listDirectory(relativePath = '') {
  const { relative, abs } = requireItem(relativePath, 'directory');
  const entries = fs.readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.name !== '.agent')
    .map((entry) => {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      let stat;
      try { stat = fs.statSync(path.join(abs, entry.name)); } catch { stat = null; }
      return {
        name: entry.name,
        path: childRelative,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        size: stat?.size ?? 0,
        modified: stat?.mtimeMs ?? 0,
      };
    })
    .filter((entry) => entry.type !== 'other')
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'directory' ? -1 : 1));
  return { path: relative, entries };
}

export function readWorkspaceFile(relativePath) {
  const { relative, abs, stat } = requireItem(relativePath, 'file');
  const handle = fs.openSync(abs, 'r');
  const sample = Buffer.alloc(Math.min(stat.size, 8192));
  try { if (sample.length) fs.readSync(handle, sample, 0, sample.length, 0); } finally { fs.closeSync(handle); }
  const type = fileKind(abs, sample);
  const info = { path: relative, name: path.basename(abs), size: stat.size, modified: stat.mtimeMs, ...type };
  const ext = path.extname(abs).toLowerCase();
  if (ext === '.docx') return { ...info, kind: 'office-text', officeType: 'Word', content: docxExtractText(fs.readFileSync(abs)) };
  if (ext === '.pptx') {
    const buffer = fs.readFileSync(abs);
    return { ...info, kind: 'office-text', officeType: 'PowerPoint', content: pptxExtractText(buffer), slides: pptxRenderSlides(buffer) };
  }
  if (ext === '.xlsx') {
    const sheets = xlsxRead(fs.readFileSync(abs)).map((sheet) => ({ name: sheet.name, rows: sheet.rows.slice(0, 500).map((row) => row.slice(0, 100)) }));
    return { ...info, kind: 'spreadsheet', officeType: 'Excel', sheets };
  }
  if (ext === '.doc' || ext === '.xls' || ext === '.ppt') {
    const officeType = ext === '.doc' ? 'Word' : ext === '.xls' ? 'Excel' : 'PowerPoint';
    return { ...info, kind: 'office-binary', officeType, content: '' };
  }
  if (type.kind === 'text') {
    if (stat.size > MAX_TEXT_BYTES) return { ...info, kind: 'large-text', maxEditableBytes: MAX_TEXT_BYTES };
    return { ...info, content: fs.readFileSync(abs, 'utf8') };
  }
  return info;
}

export function rawWorkspaceFile(relativePath) {
  const item = requireItem(relativePath, 'file');
  const sample = Buffer.alloc(Math.min(item.stat.size, 8192));
  const handle = fs.openSync(item.abs, 'r');
  try { if (sample.length) fs.readSync(handle, sample, 0, sample.length, 0); } finally { fs.closeSync(handle); }
  return { ...item, ...fileKind(item.abs, sample) };
}

export function writeWorkspaceFile(relativePath, content) {
  const { relative, abs } = absolute(relativePath, { write: true });
  if (!relative) throw new Error('不能写入工作目录根路径');
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) throw new Error('目标是文件夹');
  const text = String(content ?? '');
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error('文件超过 5 MB 编辑上限');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
  return readWorkspaceFile(relative);
}

export function createWorkspaceItem(parentPath, name, type = 'file') {
  const parent = requireItem(parentPath, 'directory');
  const safeName = String(name ?? '').trim();
  if (!safeName || safeName === '.' || safeName === '..' || safeName.includes('/') || safeName.includes('\\')) throw new Error('名称无效');
  if (safeName === '.agent') throw new Error('该名称由应用保留');
  const targetRelative = parent.relative ? `${parent.relative}/${safeName}` : safeName;
  const target = absolute(targetRelative, { write: true });
  if (fs.existsSync(target.abs)) throw new Error('同名文件或文件夹已存在');
  if (type === 'directory') fs.mkdirSync(target.abs);
  else if (type === 'file') fs.writeFileSync(target.abs, '', { encoding: 'utf8', flag: 'wx' });
  else throw new Error('类型必须是 file 或 directory');
  return { path: target.relative, name: safeName, type };
}

export function renameWorkspaceItem(relativePath, newName) {
  const source = requireItem(relativePath, 'write');
  if (!source.relative) throw new Error('不能重命名工作目录根路径');
  const safeName = String(newName ?? '').trim();
  if (!safeName || safeName === '.' || safeName === '..' || safeName.includes('/') || safeName.includes('\\') || safeName === '.agent') throw new Error('名称无效');
  const parent = path.posix.dirname(source.relative) === '.' ? '' : path.posix.dirname(source.relative);
  const targetRelative = parent ? `${parent}/${safeName}` : safeName;
  const target = absolute(targetRelative, { write: true });
  if (fs.existsSync(target.abs)) throw new Error('同名文件或文件夹已存在');
  fs.renameSync(source.abs, target.abs);
  return { from: source.relative, path: target.relative, name: safeName };
}

export function moveWorkspaceItem(relativePath, targetDirectory) {
  const source = requireItem(relativePath, 'write');
  if (!source.relative) throw new Error('不能移动工作目录根路径');
  const targetDir = requireItem(targetDirectory, 'directory');
  const targetRelative = targetDir.relative ? `${targetDir.relative}/${path.basename(source.abs)}` : path.basename(source.abs);
  const target = absolute(targetRelative, { write: true });
  if (target.abs === source.abs) return { from: source.relative, path: source.relative };
  if (target.abs.startsWith(source.abs + path.sep)) throw new Error('不能将文件夹移动到自身内部');
  if (fs.existsSync(target.abs)) throw new Error('目标位置存在同名项目');
  fs.renameSync(source.abs, target.abs);
  return { from: source.relative, path: target.relative };
}

export function copyWorkspaceItem(relativePath, targetDirectory) {
  const source = requireItem(relativePath, 'read');
  if (!source.relative) throw new Error('不能复制工作目录');
  const targetDir = requireItem(targetDirectory, 'directory');
  if (source.stat.isDirectory() && (targetDir.abs === source.abs || targetDir.abs.startsWith(source.abs + path.sep))) throw new Error('不能将文件夹复制到自身内部');
  const ext = source.stat.isFile() ? path.extname(source.abs) : '';
  const base = path.basename(source.abs, ext);
  let name = path.basename(source.abs), index = 1;
  let targetRelative = targetDir.relative ? `${targetDir.relative}/${name}` : name;
  let target = absolute(targetRelative, { write: true });
  while (fs.existsSync(target.abs)) {
    name = `${base} copy${index > 1 ? ` ${index}` : ''}${ext}`;
    targetRelative = targetDir.relative ? `${targetDir.relative}/${name}` : name;
    target = absolute(targetRelative, { write: true });
    index += 1;
  }
  if (source.stat.isDirectory()) fs.cpSync(source.abs, target.abs, { recursive: true, errorOnExist: true });
  else fs.copyFileSync(source.abs, target.abs, fs.constants.COPYFILE_EXCL);
  return { from: source.relative, path: target.relative, name, type: source.stat.isDirectory() ? 'directory' : 'file' };
}

export function deleteWorkspaceItem(relativePath) {
  const item = requireItem(relativePath, 'write');
  if (!item.relative) throw new Error('不能删除工作目录');
  fs.rmSync(item.abs, { recursive: item.stat.isDirectory(), force: false });
  return { path: item.relative, type: item.stat.isDirectory() ? 'directory' : 'file' };
}

export function workspacePath(relativePath = '') {
  return absolute(relativePath).abs;
}

function launchDetached(command, args) {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

export function revealWorkspaceItem(relativePath) {
  const item = requireItem(relativePath, 'read');
  if (process.platform === 'win32') launchDetached('explorer.exe', item.stat.isDirectory() ? [item.abs] : ['/select,', item.abs]);
  else if (process.platform === 'darwin') launchDetached('open', ['-R', item.abs]);
  else launchDetached('xdg-open', [item.stat.isDirectory() ? item.abs : path.dirname(item.abs)]);
  return { ok: true, path: item.relative };
}

export function openWorkspaceItem(relativePath) {
  const item = requireItem(relativePath, 'read');
  if (process.platform === 'win32') launchDetached('rundll32.exe', ['url.dll,FileProtocolHandler', item.abs]);
  else if (process.platform === 'darwin') launchDetached('open', [item.abs]);
  else launchDetached('xdg-open', [item.abs]);
  return { ok: true, path: item.relative };
}

export function workspaceRootInfo() {
  return { path: getWorkspaceRoot(), name: path.basename(getWorkspaceRoot()) };
}
