import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { AppCenter } from '../core/app-center.mjs';
import { createCatalogSync } from '../core/app-center-catalog.mjs';
import runtime from '../electron/runtime.cjs';

const entry = { id: 'catalog-example', name: '平台应用', url: 'https://example.com/home', description: '网站介绍', sortOrder: 1 };
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-app-catalog-'));
  const center = new AppCenter({ directory, event() {} });
  t.after(() => { center.shutdown(); fs.rmSync(directory, { recursive: true, force: true }); });
  return center;
}
test('platform publication preserves user apps and requires fresh authorization on URL changes or withdrawal', async t => {
  const center = fixture(t), own = center.upsert({ url: 'https://my.example' });
  center.syncCatalog([entry]);
  const platform = center.list().apps.find(app => app.source === 'platform');
  assert.equal(platform.status, 'needs-login'); assert.equal(platform.platformId, entry.id);
  center.authorize(platform.id, platform.url);
  center.syncCatalog([{ ...entry, name: '新的名称', description: '新的描述' }]);
  assert.equal(center.get(platform.id).status, 'authorized');
  center.syncCatalog([{ ...entry, url: 'https://new.example/home' }]);
  assert.equal(center.get(platform.id).status, 'needs-login');
  assert.deepEqual(center.get(platform.id).origins, ['https://new.example']);
  const wait = center.waitLogin(platform.id);
  center.syncCatalog([]); await assert.rejects(wait, /取消/);
  assert.deepEqual(center.list().apps.map(app => app.id), [own.id]);
  center.syncCatalog([entry]); assert.equal(center.get(platform.id).status, 'needs-login');
  assert.equal(center.get(own.id).source, 'user');
});
test('invalid platform catalogs do not partially publish entries or change local authorization', t => {
  const center = fixture(t); center.syncCatalog([entry]);
  const before = center.list().apps;
  assert.throws(() => center.syncCatalog([{ ...entry, name: '错误更新' }, { ...entry, id: 'bad', url: 'https://127.0.0.1' }]));
  assert.deepEqual(center.list().apps, before);
  assert.throws(() => center.syncCatalog([entry, entry]), /重复/);
});
test('catalog updates deduplicate concurrent requests, cache success and retain apps when offline', async t => {
  const center = fixture(t); let count = 0, time = 1, fail = false;
  const sync = createCatalogSync({ now: () => time, fetcher: async () => { count++; if (fail) throw new Error('offline'); return Response.json({ success: true, data: { items: [entry] } }); } });
  const options = { baseUrl: 'https://backend.example', enabled: true };
  await Promise.all([sync(center, options), sync(center, options)]); assert.equal(count, 1);
  await sync(center, options); assert.equal(count, 1);
  fail = true; time += 61000;
  assert.match((await sync(center, options)).catalogError, /保留/);
  assert.equal(center.list().apps.length, 1);
  await sync(center, { ...options, enabled: false }); assert.equal(count, 2);
  fail = false; await sync(center, { ...options, force: true }); assert.equal(count, 3);
});
test('client HTTP displays published backend apps, merges URL-only user apps and hides withdrawn entries', { timeout: 20000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-catalog-http-')); let items = [entry];
  const backend = http.createServer((req, res) => { assert.equal(req.url, '/api/v2/apps'); assert.equal(req.headers.authorization, undefined); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, data: { items } })); });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: fileURLToPath(new URL('..', import.meta.url)), dataRoot: directory, environment: { MLI_ACCOUNT_ENABLED: 'true', MLI_ACCOUNT_SERVER_URL: `http://127.0.0.1:${backend.address().port}`, MLI_ACCOUNT_APP_SECRET: '' } });
  t.after(async () => { if (instance.child.exitCode === null) { const done = once(instance.child, 'exit'); instance.child.kill(); await done; } backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve)); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const { url } = await instance.ready;
  const get = async (suffix = '') => (await fetch(url + '/api/app-center' + suffix)).json();
  const first = await get(); assert.equal(first.apps[0].name, entry.name); assert.equal(first.apps[0].status, 'needs-login');
  const own = await (await fetch(url + '/api/app-center/apps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'my.example' }) })).json();
  assert.equal(own.app.source, 'user'); assert.equal((await get()).apps.length, 2);
  items = []; const updated = await get('?refresh=1'); assert.deepEqual(updated.apps.map(app => app.id), [own.app.id]);
});
