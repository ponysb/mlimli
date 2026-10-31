import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { cloneGitWorkspace, gitRepositoryDirectoryName, listWorkspaceRepositories } from '../core/git-clone.mjs';

test('repository clone directory name is derived from HTTPS and SSH remotes', () => {
  assert.equal(gitRepositoryDirectoryName('https://github.com/owner/project.git'), 'project');
  assert.equal(gitRepositoryDirectoryName('git@github.com:owner/project.git'), 'project');
  assert.equal(gitRepositoryDirectoryName('ssh://git@example.com/group/my%20project.git'), 'my project');
});

test('clone imports a local bare repository safely and refuses to overwrite an existing project', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-clone-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), bare = path.join(root, 'remote.git'), parent = path.join(root, 'projects');
  fs.mkdirSync(source); fs.mkdirSync(parent);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: source });
  fs.writeFileSync(path.join(source, 'README.md'), 'clone fixture');
  execFileSync('git', ['add', 'README.md'], { cwd: source });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'], { cwd: source });
  execFileSync('git', ['clone', '-q', '--bare', source, bare]);
  const fakeRun = async (_command, args, options) => { assert.equal(args.at(-2), 'https://example.invalid/project.git'); execFileSync('git', ['clone', '-q', bare, args.at(-1)], options); };
  const cloned = await cloneGitWorkspace({ url: 'https://example.invalid/project.git', parentPath: parent }, { run: fakeRun });
  assert.equal(cloned.mode, 'cloned');
  assert.equal(fs.readFileSync(path.join(cloned.path, 'README.md'), 'utf8'), 'clone fixture');
  assert.equal(execFileSync('git', ['-C', cloned.path, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main');
  await assert.rejects(cloneGitWorkspace({ url: 'https://example.invalid/project.git', parentPath: parent, directoryName: 'project' }, { run: fakeRun }), /已存在/);
  await assert.rejects(cloneGitWorkspace({ url: 'https://example.invalid/project.git', parentPath: parent, directoryName: '../escape' }, { run: fakeRun }), /有效/);
  assert.equal(fs.existsSync(path.join(root, 'escape')), false);
  assert.deepEqual(fs.readdirSync(parent), ['project']);
});

test('missing Git saves an Agent-readable repository reference in the workspace without downloading code', async t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-clone-no-git-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const input = { url: 'https://github.com/owner/project.git', parentPath: parent };
  const options = { run: async () => { throw Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT', path: 'git' }); } };
  const result = await cloneGitWorkspace(input, options);
  assert.equal(result.mode, 'reference');
  assert.equal(result.path, path.join(parent, 'project.repository.md'));
  assert.ok(fs.readFileSync(result.path, 'utf8').includes(input.url));
  assert.deepEqual(fs.readdirSync(parent), ['project.repository.md']);
  assert.deepEqual(await cloneGitWorkspace(input, options), result);
  const repositories = listWorkspaceRepositories(parent);
  assert.equal(repositories.length, 1);
  assert.equal(repositories[0].url, input.url);
  assert.equal(repositories[0].source, 'github');
  assert.equal(repositories[0].mode, 'reference');
  fs.writeFileSync(result.path, 'user content');
  await assert.rejects(cloneGitWorkspace(input, options), /未覆盖/);
  assert.equal(fs.readFileSync(result.path, 'utf8'), 'user content');
  await assert.rejects(cloneGitWorkspace({ ...input, directoryName: 'other' }, { run: async () => { throw Object.assign(new Error('missing checkout'), { code: 'ENOENT', path: 'checkout' }); } }), /missing checkout/);
  assert.deepEqual(fs.readdirSync(parent), ['project.repository.md']);
});

test('workspace repository history discovers existing references and clone origins without Git', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-repository-history-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  fs.writeFileSync(path.join(parent, 'old.repository.md'), '# 仓库地址\r\n\r\nhttps://github.com/owner/old\r\n');
  fs.mkdirSync(path.join(parent, 'cloned', '.git'), { recursive: true });
  fs.writeFileSync(path.join(parent, 'cloned', '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@gitee.com:owner/cloned.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "main"]\n\tremote = origin\n');
  fs.writeFileSync(path.join(parent, 'private.repository.md'), '# 仓库地址\n\nhttps://user:secret@example.com/repo\n');
  fs.writeFileSync(path.join(parent, 'large.repository.md'), 'https://gitlab.com/owner/large\n' + 'x'.repeat(65536));
  fs.writeFileSync(path.join(parent, 'notes.md'), 'https://github.com/owner/unrelated');
  fs.mkdirSync(path.join(parent, 'other-workspace'));
  fs.writeFileSync(path.join(parent, 'other-workspace', 'other.repository.md'), 'https://git.example.com/group/repo');
  const repositories = listWorkspaceRepositories(parent);
  assert.deepEqual(repositories.map(item => [item.name, item.mode, item.source, item.url]).sort(), [
    ['cloned', 'cloned', 'gitee', 'git@gitee.com:owner/cloned.git'],
    ['old.repository.md', 'reference', 'github', 'https://github.com/owner/old']
  ]);
  assert.equal(listWorkspaceRepositories(path.join(parent, 'other-workspace'))[0].source, 'gitlab');
  fs.unlinkSync(path.join(parent, 'old.repository.md'));
  assert.equal(listWorkspaceRepositories(parent).length, 1);
});
test('clone validates provider URLs and reports failures without exposing query credentials', async () => {
  await assert.rejects(cloneGitWorkspace({ url: 'https://user:secret@example.invalid/project.git', parentPath: '/tmp', directoryName: 'project' }), /不能包含密码/);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-clone-error-'));
  try {
    await assert.rejects(cloneGitWorkspace({ url: 'https://example.invalid/repo.git', parentPath: parent, directoryName: 'repo' }, { run: async () => { throw new Error('fatal: remote unavailable'); } }), /克隆|fatal/i);
    assert.deepEqual(fs.readdirSync(parent), []);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
