import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateGitRemoteUrl, redactGitText } from './git-remote.mjs';
const execute = promisify(execFile);
const pending = new Set();

export function listWorkspaceRepositories(parentPath) {
  const parent = fs.realpathSync(parentPath);
  const repositories = [];
  function readSmallFile(file) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 65536) return '';
    return fs.readFileSync(file, 'utf8');
  }
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    try {
      const target = path.join(parent, entry.name);
      let url, mode;
      if (entry.isFile() && entry.name.endsWith('.repository.md')) {
        url = readSmallFile(target).split(/\r?\n/).find(line => /^(?:https?:\/\/|ssh:\/\/|(?:[\w.-]+@)?[\w.-]+:)/.test(line));
        mode = 'reference';
      } else if (entry.isDirectory() && !fs.lstatSync(path.join(target, '.git')).isSymbolicLink()) {
        const config = readSmallFile(path.join(target, '.git', 'config'));
        const origin = config.match(/^\s*\[remote "origin"\]\s*\r?\n([^\[]*)/m)?.[1];
        url = origin?.match(/^\s*url\s*=\s*(.+?)\s*$/m)?.[1];
        mode = 'cloned';
      }
      if (!url) continue;
      url = validateGitRemoteUrl(url);
      const host = /^[\w+.-]+:\/\//.test(url) ? new URL(url).hostname : url.split(':')[0].split('@').at(-1);
      const source = /^(?:www\.)?github\.com$/i.test(host) ? 'github' : /^(?:www\.)?gitee\.com$/i.test(host) ? 'gitee' : 'gitlab';
      repositories.push({ name: entry.name, path: target, url, mode, source, updated: fs.statSync(target).mtimeMs });
    } catch { /* Ignore unrelated, removed or invalid workspace files. */ }
  }
  return repositories.sort((a, b) => b.updated - a.updated);
}

export function gitRepositoryDirectoryName(url) {
  const remote = validateGitRemoteUrl(url);
  const repositoryPath = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(remote)
    ? new URL(remote).pathname
    : remote.slice(remote.indexOf(':') + 1);
  let segment = repositoryPath.split(/[\\/]/).filter(Boolean).at(-1) || '';
  try { segment = decodeURIComponent(segment); } catch {}
  let name = segment.replace(/\.git$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().replace(/[. ]+$/g, '').slice(0, 100);
  if (!name || name.startsWith('.')) throw new Error('无法从 Git 地址识别目录名称');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `repo-${name}`;
  return name;
}

export async function cloneGitWorkspace({ url, parentPath, directoryName } = {}, { run = execute } = {}) {
  const remote = validateGitRemoteUrl(url);
  if (!path.isAbsolute(String(parentPath || ''))) throw new Error('请选择本机目标父目录');
  const parent = fs.realpathSync(parentPath);
  if (!fs.statSync(parent).isDirectory()) throw new Error('目标父目录不存在');
  const name = String(directoryName || gitRepositoryDirectoryName(remote)).trim();
  if (!name || name.length > 100 || !/^[\p{L}\p{N}._ -]+$/u.test(name) || name.startsWith('.') || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('请输入有效的新文件夹名称');
  const destination = path.join(parent, name);
  if (fs.existsSync(destination) || pending.has(destination)) throw new Error('目标目录已存在，请更换文件夹名称');
  pending.add(destination);
  let temporary;
  try {
    temporary = fs.mkdtempSync(path.join(parent, '.mli-clone-'));
    const checkout = path.join(temporary, 'checkout');
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_') && key !== 'GIT_TERMINAL_PROMPT') delete env[key];
    try {
      await run('git', ['-c', `core.hooksPath=${os.devNull}`, '-c', 'core.fsmonitor=false', '-c', 'protocol.file.allow=never', '-c', 'protocol.ext.allow=never', 'clone', '--', remote, checkout], { cwd: parent, env, timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true });
    } catch (error) {
      if (error.code !== 'ENOENT' || error.path !== 'git') throw error;
      const filename = `${name}.repository.md`;
      const reference = path.join(parent, filename);
      const content = `# 仓库地址\n\n${remote}\n\n本机未找到 Git，已保存仓库地址供 Agent 读取，尚未下载仓库代码。\n`;
      try { fs.writeFileSync(reference, content, { flag: 'wx' }); }
      catch (writeError) {
        if (writeError.code !== 'EEXIST') throw writeError;
        if (fs.lstatSync(reference).isSymbolicLink() || !fs.statSync(reference).isFile() || fs.readFileSync(reference, 'utf8') !== content) throw new Error('仓库地址文件已存在，未覆盖原文件');
      }
      return { path: reference, name: filename, mode: 'reference', url: remote };
    }
    fs.mkdirSync(destination);
    for (const entry of fs.readdirSync(checkout)) fs.renameSync(path.join(checkout, entry), path.join(destination, entry));
    return { path: destination, name, mode: 'cloned' };
  } catch (error) {
    if (error.killed || error.code === 'ETIMEDOUT') throw new Error('克隆超时，请检查网络后重试');
    throw new Error(redactGitText(error.stderr || error.message || '克隆失败').slice(0, 2000));
  } finally { pending.delete(destination); if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
}
