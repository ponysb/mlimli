import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';

test('repository API saves a readable address when Git is absent from the runtime environment', { timeout: 30000 }, async context => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-workspace-no-git-'));
  const environment = Object.fromEntries(Object.keys(process.env).filter(key => key.toUpperCase() === 'PATH').map(key => [key, '']));
  const start = () => runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory, environment: { ...environment, MLI_ACCOUNT_ENABLED: 'false' } });
  let instance = start();
  context.after(async () => {
    if (instance.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; }
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  let { url } = await instance.ready;
  const { workspaces } = await (await fetch(`${url}/api/workspaces`)).json();
  const workspace = workspaces.find(item => item.active);
  const remote = 'https://github.com/ponysb/91Writing';
  const repositoriesRoute = `/api/workspaces/repositories?workspaceId=${workspace.id}`;
  assert.deepEqual(await (await fetch(url + repositoriesRoute)).json(), { repositories: [] });
  const response = await fetch(`${url}/api/workspaces/clone`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: remote, workspaceId: workspace.id }) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.mode, 'reference');
  assert.equal(result.path, path.join(workspace.path, '91Writing.repository.md'));
  assert.ok(fs.readFileSync(result.path, 'utf8').includes(remote));
  assert.equal(fs.existsSync(path.join(workspace.path, '91Writing')), false);
  const saved = await (await fetch(url + repositoriesRoute)).json();
  assert.equal(saved.repositories.length, 1);
  assert.equal(saved.repositories[0].url, remote);
  assert.equal(saved.repositories[0].mode, 'reference');
  assert.equal(saved.repositories[0].source, 'github');
  const exited = once(instance.child, 'exit'); instance.child.kill(); await exited;
  instance = start();
  ({ url } = await instance.ready);
  assert.deepEqual(await (await fetch(url + repositoriesRoute)).json(), saved);
  const switchResponse = await fetch(`${url}/api/workspaces`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: path.join(directory, 'other-workspace') }) });
  assert.equal(switchResponse.status, 200);
  assert.equal((await fetch(url + repositoriesRoute)).status, 409);
  assert.deepEqual(await (await fetch(`${url}/api/workspaces/repositories`)).json(), { repositories: [] });
});

test('removing workspace entries switches the runtime and preserves files and sessions across restart', { timeout: 30000 }, async context => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-workspace-http-'));
  let instance;
  async function stop() {
    if (instance?.child.exitCode === null) {
      const exited = once(instance.child, 'exit'); instance.child.kill(); await exited;
    }
  }
  context.after(async () => {
    await stop();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  async function start() {
    instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory });
    return (await instance.ready).url;
  }
  let url = await start();
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(url + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  const initial = (await request('/api/workspaces')).data.workspaces[0];
  const first = (await request('/api/workspaces', 'POST', { path: path.join(directory, 'first') })).data.workspace;
  const firstSession = (await request('/api/session', 'POST', { title: 'First workspace conversation' })).data;
  const second = (await request('/api/workspaces', 'POST', { path: path.join(directory, 'second') })).data.workspace;
  const session = (await request('/api/session', 'POST', { title: 'Preserved conversation' })).data;
  fs.writeFileSync(path.join(second.path, 'keep.txt'), 'preserve me');

  const grouped = (await request('/api/sessions')).data.workspaceSessions;
  assert.deepEqual(grouped[first.id].map(item => item.id), [firstSession.id]);
  assert.deepEqual(grouped[second.id].map(item => item.id), [session.id]);

  assert.equal((await request(`/api/workspaces/${first.id}`, 'DELETE')).status, 200);
  assert.equal((await request('/api/runtime')).data.workspace, second.path);
  assert.equal((await request(`/api/workspaces/${second.id}`, 'DELETE')).status, 200);
  assert.equal((await request('/api/runtime')).data.workspace, initial.path);
  assert.equal(fs.readFileSync(path.join(second.path, 'keep.txt'), 'utf8'), 'preserve me');

  await request('/api/workspaces', 'POST', { path: second.path });
  assert.equal((await request(`/api/session/${session.id}`)).data.title, 'Preserved conversation');
  await request(`/api/workspaces/${initial.id}`, 'DELETE');
  const active = (await request('/api/workspaces')).data.workspaces[0];
  await request(`/api/workspaces/${active.id}`, 'DELETE');
  assert.deepEqual((await request('/api/workspaces')).data.workspaces, []);
  assert.equal((await request(`/api/workspaces/${active.id}`, 'DELETE')).status, 404);

  await stop(); url = await start();
  assert.deepEqual((await request('/api/workspaces')).data.workspaces, []);
  assert.ok(fs.existsSync(path.join(second.path, '.agent', 'sessions')));
});
