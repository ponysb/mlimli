import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';

test('local workspace Git API reads status and manages safe provider remotes', { timeout: 30000 }, async context => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-workspace-git-'));
  const workspace = path.join(dataRoot, 'project');
  fs.mkdirSync(workspace);
  execFileSync('git', ['init', '-q', '-b', 'test-branch'], { cwd: workspace });
  const fsmonitorMarker = path.join(dataRoot, 'fsmonitor-ran');
  const fsmonitor = path.join(dataRoot, 'fsmonitor.sh');
  fs.writeFileSync(fsmonitor, `#!/bin/sh\ntouch '${fsmonitorMarker}'\n`);
  fs.chmodSync(fsmonitor, 0o700);
  execFileSync('git', ['config', 'core.fsmonitor', fsmonitor], { cwd: workspace });
  let instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: projectRoot, dataRoot });
  context.after(async () => {
    if (instance.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; }
    fs.rmSync(dataRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const { url } = await instance.ready;
  async function request(route, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${url}${route}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, value: await response.json() };
  }

  const created = await request('/api/workspaces', { method: 'POST', body: { path: workspace } });
  assert.equal(created.status, 200);
  const workspaceId = created.value.workspace.id;
  execFileSync('git', ['config', 'user.email', 'tester@example.invalid'], { cwd: workspace });
  execFileSync('git', ['config', 'user.name', 'Workspace Git Test'], { cwd: workspace });
  const status = await request(`/api/workspaces/${workspaceId}/git`);
  assert.equal(status.status, 200);
  assert.equal(status.value.branch, 'test-branch');
  assert.match(status.value.status, /test-branch/);
  assert.deepEqual(status.value.remotes, []);
  assert.deepEqual(status.value.changes, []);
  assert.equal(fs.existsSync(fsmonitorMarker), false);
  const attributes = path.join(dataRoot, 'attributes');
  const hookMarker = path.join(dataRoot, 'hook-ran');
  fs.writeFileSync(attributes, '*.txt filter=run-hook\n');
  const hook = path.join(dataRoot, 'filter-hook.sh');
  fs.writeFileSync(hook, `#!/bin/sh\ntouch '${hookMarker}'\ncat\n`);
  fs.chmodSync(hook, 0o700);
  execFileSync('git', ['config', 'filter.run-hook.clean', hook], { cwd: workspace });
  fs.mkdirSync(path.join(workspace, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.git', 'info', 'attributes'), '*.txt filter=run-hook\n');
  fs.writeFileSync(path.join(workspace, 'probe.txt'), 'safe');
  await request(`/api/workspaces/${workspaceId}/git`);
  assert.equal(fs.existsSync(hookMarker), false);
  fs.rmSync(path.join(workspace, 'probe.txt'));

  const urls = [
    'https://github.com/org/repo.git',
    'https://gitlab.example:8443/group/repo.git',
    'https://gitee.com/org/repo.git',
    'ssh://git@code.example:2222/team/repo.git',
    'git@code.example:team/repo.git',
  ];
  for (let index = 0; index < urls.length; index++) {
    const result = await request(`/api/workspaces/${workspaceId}/git`, {
      method: 'POST',
      body: { action: 'add', name: `remote${index}`, url: urls[index] },
    });
    assert.equal(result.status, 200);
    assert.equal(result.value.remotes.find(remote => remote.name === `remote${index}`).url, urls[index]);
  }

  const renamed = await request(`/api/workspaces/${workspaceId}/git`, {
    method: 'POST', body: { action: 'set-url', name: 'origin', previousName: 'remote0', url: 'https://github.com/new/repo.git' },
  });
  assert.equal(renamed.status, 200);
  assert.deepEqual(renamed.value.remotes[0], { name: 'origin', url: 'https://github.com/new/repo.git' });

  const invalidRename = await request(`/api/workspaces/${workspaceId}/git`, {
    method: 'POST', body: { action: 'set-url', name: 'should-not-rename', previousName: 'remote1', url: 'https://user:token@git.example/group/repo.git' },
  });
  assert.equal(invalidRename.status, 400);
  assert.equal(execFileSync('git', ['remote'], { cwd: workspace, encoding: 'utf8' }).includes('remote1'), true);
  assert.equal(execFileSync('git', ['remote'], { cwd: workspace, encoding: 'utf8' }).includes('should-not-rename'), false);

  const rejected = await request(`/api/workspaces/${workspaceId}/git`, {
    method: 'POST', body: { action: 'add', name: 'secret', url: 'https://user:token@git.example/group/repo.git' },
  });
  assert.equal(rejected.status, 400);
  assert.doesNotMatch(JSON.stringify(rejected), /token/);
  assert.equal(execFileSync('git', ['remote'], { cwd: workspace, encoding: 'utf8' }).includes('secret'), false);

  fs.writeFileSync(path.join(workspace, 'src.txt'), 'first line\n');
  let operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'commit', message: 'Add source file' } } });
  assert.equal(operation.status, 400);
  assert.match(operation.value.error, /暂存区没有/);
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'stage', paths: ['src.txt'] } } });
  assert.equal(operation.status, 200);
  assert.deepEqual(operation.value.changes.map(item => ({ path: item.path, indexStatus: item.indexStatus, worktreeStatus: item.worktreeStatus })), [{ path: 'src.txt', indexStatus: 'A', worktreeStatus: ' ' }]);
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'diff', path: 'src.txt', staged: true } } });
  assert.equal(operation.status, 200);
  assert.match(operation.value.diff, /first line/);
  fs.writeFileSync(path.join(dataRoot, 'outside.txt'), 'outside contents');
  fs.symlinkSync(path.join(dataRoot, 'outside.txt'), path.join(workspace, 'outside-link.txt'));
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'diff', path: 'outside-link.txt' } } });
  assert.equal(operation.status, 400);
  assert.match(operation.value.error, /符号链接/);
  fs.rmSync(path.join(workspace, 'outside-link.txt'));
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'commit', message: 'Add source file' } } });
  assert.equal(operation.status, 200);
  assert.equal(operation.value.changes.length, 0);
  assert.equal(execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: workspace, encoding: 'utf8' }).trim(), 'Add source file');
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'branch-create', name: 'feature/ui' } } });
  assert.equal(operation.status, 200);
  assert.equal(operation.value.branch, 'feature/ui');
  fs.writeFileSync(path.join(workspace, '.env.local'), 'do-not-stage');
  for (const secretPath of ['src/id_ed25519', 'config/secrets.yaml', '.git/config']) {
    operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'stage', paths: [secretPath] } } });
    assert.equal(operation.status, 400);
    assert.match(operation.value.error, /受保护/);
  }
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'stage', paths: ['../outside'] } } });
  assert.equal(operation.status, 400);
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'stage', paths: ['.env.local'] } } });
  assert.equal(operation.status, 400);
  assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: workspace, encoding: 'utf8' }), '');
  for (const secretPath of ['src/id_ed25519', 'config/secrets.yaml', '.git/config']) {
    operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'stage', paths: [secretPath] } } });
    assert.equal(operation.status, 400);
    assert.match(operation.value.error, /受保护/);
  }
  fs.rmSync(path.join(workspace, '.env.local'));
  fs.appendFileSync(path.join(workspace, 'README.md'), 'uncommitted change\n');
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'pull', remote: 'origin' } } });
  assert.equal(operation.status, 400);
  assert.match(operation.value.error, /未提交.*变更/);
  fs.writeFileSync(path.join(workspace, '.env.local'), 'staged secret');
  execFileSync('git', ['add', '-f', '.env.local'], { cwd: workspace });
  operation = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'operation', operation: { action: 'commit', message: 'must not commit secret' } } });
  assert.equal(operation.status, 400);
  assert.match(operation.value.error, /受保护文件/);
  execFileSync('git', ['reset', '-q', 'HEAD', '--', '.env.local'], { cwd: workspace });

  execFileSync('git', ['remote', 'add', 'unsafe-existing', 'https://token:secret@git.example/group/repo.git?access_token=hidden'], { cwd: workspace });
  const redacted = await request(`/api/workspaces/${workspaceId}/git`);
  const unsafeRemote = redacted.value.remotes.find(remote => remote.name === 'unsafe-existing');
  assert.equal(unsafeRemote.url, 'https://git.example/group/repo.git?[redacted]');
  assert.doesNotMatch(JSON.stringify(redacted), /secret|hidden|token/);

  const crossSite = await request(`/api/workspaces/${workspaceId}/git`, {
    method: 'POST', body: { action: 'remove', name: 'remote1' }, headers: { origin: 'https://attacker.example' },
  });
  assert.equal(crossSite.status, 403);
  assert.equal(execFileSync('git', ['remote'], { cwd: workspace, encoding: 'utf8' }).includes('remote1'), true);

  const removed = await request(`/api/workspaces/${workspaceId}/git`, { method: 'POST', body: { action: 'remove', name: 'origin' } });
  assert.equal(removed.status, 200);
  assert.equal(removed.value.remotes.some(remote => remote.name === 'origin'), false);
  assert.equal((await request(`/api/workspaces/not-a-workspace/git`)).status, 404);

  const nestedPath = path.join(workspace, 'src');
  fs.mkdirSync(nestedPath);
  const nested = await request('/api/workspaces', { method: 'POST', body: { path: nestedPath } });
  const nestedGit = await request(`/api/workspaces/${nested.value.workspace.id}/git`);
  assert.equal(nestedGit.status, 400);
  assert.match(nestedGit.value.error, /Git 仓库根目录/);

  const notRepository = path.join(dataRoot, 'plain-folder');
  const plain = await request('/api/workspaces', { method: 'POST', body: { path: notRepository } });
  assert.equal(plain.status, 200);
  const missing = await request(`/api/workspaces/${plain.value.workspace.id}/git`);
  assert.equal(missing.status, 400);
});
