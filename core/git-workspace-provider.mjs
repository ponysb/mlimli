import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { redactGitRemoteUrl, redactGitText, validGitRemoteName, validateGitRemoteUrl } from './git-remote.mjs';

const execFileAsync = promisify(execFile);

async function git(root, args, { allowExitCodeOne = false } = {}) {
  const cwd = path.resolve(root);
  const filterKeys = await execFileAsync('git', ['-C', cwd, 'config', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|smudge)$'], {
    cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true,
  }).then(result => result.stdout.split(/\r?\n/).filter(Boolean), error => error.code === 1 ? [] : Promise.reject(error));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_') && !['GIT_TERMINAL_PROMPT', 'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_ASKPASS'].includes(key)) delete env[key];
  }
  const safetyOptions = [
    '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${os.devNull}`, '-c', 'core.pager=cat',
    ...filterKeys.flatMap(key => ['-c', `${key}=`]),
  ];
  try {
    const result = await execFileAsync('git', [...safetyOptions, '-C', cwd, ...args], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    if (allowExitCodeOne && error.code === 1) return error.stdout || '';
    error.message = error.killed || error.code === 'ETIMEDOUT'
      ? 'Git 操作超时，结果可能不确定，请刷新 Git 状态后再操作'
      : redactGitText(error.stderr || error.stdout || error.message);
    error.stderr = redactGitText(error.stderr);
    error.stdout = redactGitText(error.stdout);
    throw error;
  }
}

export function safeWorkspacePath(value) {
  const input = String(value || '');
  if (!input || input.includes('\0') || input.includes('\\') || input.startsWith(':') || path.isAbsolute(input)) throw new Error('Git 文件路径无效');
  const normalized = path.posix.normalize(input);
  if (normalized === '..' || normalized.startsWith('../') || normalized === '.' || protectedGitPath(normalized)) throw new Error('Git 文件路径超出工作区或包含受保护文件');
  return normalized;
}

function parseStatus(output) {
  const records = String(output).split('\0').filter(Boolean), changes = [];
  for (const record of records) {
    if (record.length < 4) continue;
    const indexStatus = record[0], worktreeStatus = record[1];
    const filePath = record.slice(3);
    if (!filePath || filePath.split('/').some(part => part === '.git' || /^\.env(?:\.|$)/i.test(part) || /^(?:\.ssh|\.security|\.aws|\.gnupg)$/i.test(part))) continue;
    changes.push({ path: filePath, indexStatus, worktreeStatus, untracked: indexStatus === '?' && worktreeStatus === '?', conflicted: indexStatus === 'U' || worktreeStatus === 'U' });
  }
  return changes;
}

function protectedGitPath(filePath) {
  return String(filePath).split('/').some(part => part === '.git' || /^\.env(?:\.|$)/i.test(part) || /^(?:\.ssh|\.security|\.aws|\.gnupg)$/i.test(part) || /^(?:id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|keystore)|credentials(?:\.json)?|secrets?\.ya?ml)$/i.test(part));
}

async function gitState(cwd) {
  const [branch, status, rawChanges, names, branchNames] = await Promise.all([
    git(cwd, ['branch', '--show-current']),
    git(cwd, ['status', '--short', '--branch']),
    git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']),
    git(cwd, ['remote']),
    git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
  ]);
  const remotes = [];
  for (const name of names.split(/\r?\n/).filter(Boolean).slice(0, 50)) {
    const safeName = validGitRemoteName(name);
    const url = await git(cwd, ['remote', 'get-url', safeName]);
    remotes.push({ name: safeName, url: redactGitRemoteUrl(url) });
  }
  const records = String(rawChanges).split('\0').filter(Boolean);
  const changes = parseStatus(rawChanges);
  const stagedRecords = records.filter(record => record.length >= 4 && record[0] !== ' ' && record[0] !== '?');
  const protectedChanges = records.filter(record => record.length >= 4 && protectedGitPath(record.slice(3)));
  const safeStatus = [status.split(/\r?\n/, 1)[0], ...changes.map(change => `${change.indexStatus}${change.worktreeStatus} ${change.path}`)].filter(Boolean).join('\n');
  return { root: cwd, branch: branch.trim(), status: safeStatus, dirty: records.length > 0, blockedChanges: protectedChanges.length > 0, hasStagedChanges: stagedRecords.length > 0, protectedStaged: stagedRecords.some(record => protectedGitPath(record.slice(3))), changes, branches: branchNames.split(/\r?\n/).filter(Boolean).slice(0, 200), remotes };
}

export function gitOperationArgs(action = {}) {
  const paths = () => {
    if (!Array.isArray(action.paths) || action.paths.length < 1 || action.paths.length > 100) throw new Error('请选择 1 到 100 个 Git 文件');
    return [...new Set(action.paths.map(safeWorkspacePath))];
  };
  if (action.action === 'stage') return ['add', '--', ...paths().map(value => `:(literal)${value}`)];
  if (action.action === 'diff') {
    const filePath = safeWorkspacePath(action.path);
    return ['diff', '--no-ext-diff', '--no-textconv', '--no-color', ...(action.staged ? ['--cached'] : []), '--', `:(literal)${filePath}`];
  }
  if (action.action === 'branch-create' || action.action === 'branch-switch') {
    const name = String(action.name || '').trim();
    if (!validBranchName(name)) throw new Error('Git 分支名称无效');
    return action.action === 'branch-create' ? ['switch', '-c', name] : ['switch', '--no-guess', name];
  }
  if (action.action === 'fetch' || action.action === 'pull' || action.action === 'push') {
    const remote = validGitRemoteName(action.remote || 'origin');
    if (action.action === 'fetch') return ['fetch', remote];
    if (action.action === 'pull') return ['pull', '--ff-only', remote, ...(action.branch ? [String(action.branch)] : [])];
    const branch = String(action.branch || '').trim();
    if (!validBranchName(branch)) throw new Error('Git 分支名称无效');
    return ['push', '--porcelain', remote, branch];
  }
  throw new Error('不支持的 Git 操作');
}

function validBranchName(name) {
  if (!name || name.length > 200 || name.startsWith('-') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.includes('..') || name.includes('@{')) return false;
  return name.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock') && !/[ ~^:?*\[\\\x00-\x20\x7f]/.test(part));
}

async function repositoryRoot(root) {
  const cwd = path.resolve(root);
  const canonicalRoot = fs.realpathSync(cwd);
  const reportedRoot = fs.realpathSync((await git(cwd, ['-c', 'core.fsmonitor=false', 'rev-parse', '--show-toplevel'])).trim());
  if (reportedRoot !== canonicalRoot) throw new Error('Git 仓库根目录必须与当前工作区根目录一致');
  return cwd;
}

export async function readWorkspaceGitInfo(root) {
  const cwd = await repositoryRoot(root);
  return gitState(cwd);
}

export async function runWorkspaceGitAction(root, input = {}) {
  const cwd = await repositoryRoot(root);
  if (input.action === 'diff') {
    const safePath = safeWorkspacePath(input.path);
    const state = await gitState(cwd);
    const change = state.changes.find(item => item.path === safePath);
    if (change?.untracked && !input.staged) {
      let current = cwd;
      let attrs;
      for (const part of safePath.split('/')) {
        current = path.join(current, part);
        attrs = await fs.promises.lstat(current);
        if (attrs.isSymbolicLink()) throw new Error('未跟踪差异不允许通过符号链接访问');
      }
      if (!attrs?.isFile()) throw new Error('未跟踪差异只支持普通文件');
    }
    const args = change?.untracked && !input.staged
      ? ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--no-color', '--', '/dev/null', safePath]
      : gitOperationArgs(input);
    const output = await git(cwd, args, { allowExitCodeOne: change?.untracked && !input.staged });
    return { diff: output.slice(0, 256 * 1024), truncated: output.length > 256 * 1024 };
  }
  if (input.action === 'unstage') {
    const state = await gitState(cwd);
    const requested = new Set((Array.isArray(input.paths) ? input.paths : []).map(safeWorkspacePath));
    if (!requested.size || requested.size > 100) throw new Error('请选择 1 到 100 个 Git 文件');
    for (const filePath of requested) {
      const entry = state.changes.find(change => change.path === filePath);
      if (!entry || entry.indexStatus === ' ' || entry.indexStatus === '?') continue;
      const inHead = await git(cwd, ['cat-file', '-e', `HEAD:${filePath}`]).then(() => true, () => false);
      if (inHead) await git(cwd, ['restore', '--staged', '--', `:(literal)${filePath}`]);
      else await git(cwd, ['update-index', '--force-remove', '--', `:(literal)${filePath}`]);
    }
    return gitState(cwd);
  }
  if (input.action === 'commit') {
    const message = String(input.message || '').trim();
    if (!message || message.length > 5000) throw new Error('提交说明必须为 1 到 5000 个字符');
    const staged = await git(cwd, ['diff', '--cached', '--quiet']).then(() => false, error => error.code === 1 ? true : Promise.reject(error));
    if (!staged) throw new Error('暂存区没有可提交的修改');
    if ((await gitState(cwd)).protectedStaged) throw new Error('暂存区包含受保护文件，拒绝提交');
    await git(cwd, ['commit', '-m', message]);
    return gitState(cwd);
  }
  const args = gitOperationArgs(input);
  if (['branch-create', 'branch-switch', 'pull'].includes(input.action)) {
    const state = await gitState(cwd);
    if (state.dirty || state.blockedChanges) throw new Error('工作区有未提交或受保护文件变更，请先处理后重试');
  }
  if (['fetch', 'pull', 'push'].includes(input.action)) {
    const remote = validGitRemoteName(input.remote || 'origin');
    const remoteUrl = (await git(cwd, ['remote', 'get-url', remote])).trim();
    validateGitRemoteUrl(remoteUrl);
  }
  await git(cwd, ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.pager=cat', ...args]);
  return gitState(cwd);
}

export async function updateWorkspaceGitRemote(root, { action, name, url, previousName } = {}) {
  const cwd = await repositoryRoot(root);
  const safeName = validGitRemoteName(name);
  if (action === 'remove') {
    await git(cwd, ['remote', 'remove', safeName]);
  } else if (action === 'add') {
    await git(cwd, ['remote', 'add', safeName, validateGitRemoteUrl(url)]);
  } else if (action === 'set-url') {
    const oldName = validGitRemoteName(previousName || safeName);
    const safeUrl = validateGitRemoteUrl(url);
    if (oldName !== safeName) await git(cwd, ['remote', 'rename', oldName, safeName]);
    await git(cwd, ['remote', 'set-url', safeName, safeUrl]);
  } else {
    throw new Error('不支持的 Git remote 操作');
  }
  return readWorkspaceGitInfo(cwd);
}
