import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';

test('app registry HTTP API persists records and restricts the privileged browser bridge', { timeout: 25000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-app-http-'));
  let instance;
  async function stop() { if (instance?.child.exitCode === null) { const done = once(instance.child, 'exit'); instance.child.kill(); await done; } }
  t.after(async () => { await stop(); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  async function start() { instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: fileURLToPath(new URL('..', import.meta.url)), dataRoot: directory }); return (await instance.ready).url; }
  let url = await start();
  async function request(route, body, headers = {}, method = body ? 'POST' : 'GET') { const response = await fetch(url + '/api/app-center' + route, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, data: await response.json() }; }
  assert.equal((await request('')).status, 200);
  assert.equal((await request('/apps', { name: 'Private', url: 'https://127.0.0.1' })).status, 400);
  assert.equal((await request('/apps', { name: 'Evil', url: 'https://evil.example' }, { origin: 'https://evil.example' })).status, 403);
  const created = await request('/apps', { name: 'Example', url: 'https://example.com/home' }); assert.equal(created.status, 201);
  const id = created.data.app.id;
  const own = await request('/apps', { url: 'my.example/work' });
  assert.equal(own.status, 201); assert.equal(own.data.app.name, 'my.example'); assert.equal(own.data.app.url, 'https://my.example/work');
  assert.equal(own.data.app.source, 'user');
  assert.equal((await request('/apps', { url: 'https://my.example/work' })).data.app.id, own.data.app.id);
  await request(`/apps/${own.data.app.id}`, null, {}, 'DELETE');
  assert.equal((await request('/bridge/authorize', { appId: id, url: 'https://example.com/home' })).status, 403);
  const token = fs.readFileSync(path.join(directory, '.security', 'app-center', 'bridge-token'), 'utf8');
  const headers = { 'x-mli-browser-token': token };
  assert.equal((await request('/bridge/poll', { clientId: 'testDesktop' }, headers)).status, 200);
  assert.equal((await request('/bridge/authorize', { appId: id, url: 'https://example.com/login' }, headers)).status, 400);
  assert.equal((await request('/bridge/authorize', { appId: id, url: 'https://example.com/home' }, headers)).status, 200);
  assert.equal((await request('')).data.apps[0].status, 'authorized');
  await stop(); url = await start();
  assert.equal((await request('')).data.apps[0].status, 'authorized');
  assert.equal((await request('/bridge/poll', { clientId: 'testDesktop' }, headers)).status, 403);
  assert.equal((await request(`/apps/${id}/revoke`, {})).status, 200);
  assert.equal((await request('')).data.apps[0].status, 'needs-login');
  const currentHeaders = { 'x-mli-browser-token': fs.readFileSync(path.join(directory, '.security', 'app-center', 'bridge-token'), 'utf8') };
  await request('/bridge/poll', { clientId: 'testDesktop' }, currentHeaders);
  const sessionResponse = await fetch(url + '/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '取消登录等待' }) });
  const session = await sessionResponse.json();
  const waiting = fetch(url + `/api/session/${session.id}/dev-tool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: 'app_open', args: { app_id: id } }) });
  let pending;
  for (let i = 0; i < 150; i++) {
    const polled = await request('/bridge/poll', { clientId: 'testDesktop' }, currentHeaders);
    for (const job of polled.data.jobs) await request('/bridge/result', { clientId: 'testDesktop', id: job.id, result: { url: 'https://example.com/home' } }, currentHeaders);
    pending = (await request('')).data.pending;
    if (pending.length) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(pending[0]?.sessionId, session.id);
  assert.equal((await request(`/apps/${id}/cancel`, {})).status, 200);
  const cancelled = await waiting;
  assert.equal(cancelled.status, 400);
  assert.match((await cancelled.json()).error, /取消|停止/);
  assert.deepEqual((await request('')).data.pending, []);
  assert.equal((await request(`/apps/${id}`, null, {}, 'DELETE')).status, 200);
  assert.equal((await request('')).data.apps.length, 0);
});
