import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import runtime from '../electron/runtime.cjs';

test('permission defaults survive runtime restart and new sessions inherit them without changing history', { timeout: 30000 }, async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-ui-preferences-'));
  let instance;
  const stop = async () => { if (instance?.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; } };
  context.after(async () => { await stop(); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const start = async () => {
    instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: path.resolve(import.meta.dirname, '..'), dataRoot: directory });
    return (await instance.ready).url;
  };
  let url = await start();
  const post = (route, body) => fetch(url + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const create = async body => { const response = await post('/api/session', body); assert.equal(response.status, 200); return response.json(); };
  const snapshot = async id => (await fetch(url + '/api/session/' + id)).json();
  const history = await create({ title: 'history' });
  assert.equal((await snapshot(history.id)).mode, 'default');
  assert.equal((await post('/api/ui/preferences', { defaultPermissionMode: 'auto-all' })).status, 200);
  assert.equal((await post('/api/ui/preferences', { defaultPermissionMode: 'invalid' })).status, 400);
  await stop(); url = await start();
  const info = await (await fetch(url + '/api/info')).json();
  assert.equal(info.uiPreferences.defaultPermissionMode, 'auto-all');
  const inherited = await create({ title: 'inherited' });
  assert.equal((await snapshot(inherited.id)).mode, 'auto-all');
  assert.equal((await snapshot(history.id)).mode, 'default');
  const explicit = await create({ title: 'explicit', mode: 'default' });
  assert.equal((await snapshot(explicit.id)).mode, 'default');
  await post('/api/ui/preferences', { defaultPermissionMode: 'default' });
  const reset = await create({ title: 'reset' });
  assert.equal((await snapshot(reset.id)).mode, 'default');
  assert.equal((await snapshot(inherited.id)).mode, 'auto-all');
});
