import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';

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
  const second = (await request('/api/workspaces', 'POST', { path: path.join(directory, 'second') })).data.workspace;
  const session = (await request('/api/session', 'POST', { title: 'Preserved conversation' })).data;
  fs.writeFileSync(path.join(second.path, 'keep.txt'), 'preserve me');

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
