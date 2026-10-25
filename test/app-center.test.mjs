import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppCenter } from '../core/app-center.mjs';
import policy from '../core/app-center-policy.cjs';
import { registerAppBrowser } from '../electron/app-center.cjs';
import { appCenterTools } from '../core/app-center-tools.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-app-center-')), events = [];
  const center = new AppCenter({ directory, event: (type, data) => events.push({ type, ...data }) });
  t.after(() => { center.shutdown(); fs.rmSync(directory, { recursive: true, force: true }); });
  const app = center.upsert({ name: 'Example', url: 'https://example.com/workspace' });
  return { center, app, events, directory };
}
test('application registry persists confirmation without cookies, OAuth codes, or passwords', t => {
  const { center, app, directory } = fixture(t);
  center.authorize(app.id, 'https://example.com/workspace?code=SECRET_CODE#token');
  const restored = new AppCenter({ directory, event() {} });
  assert.equal(restored.get(app.id).status, 'authorized');
  assert.equal(restored.connected(), null);
  assert.equal(restored.get(app.id).lastUrl, 'https://example.com/workspace');
  assert.ok(!fs.readFileSync(path.join(directory, 'apps.json'), 'utf8').includes('SECRET_CODE'));
  const second = center.upsert({ name: 'Second', url: 'https://second.example/app?token=SECRET_CODE' });
  assert.equal(second.url, 'https://second.example/app');
});
test('plain URLs open as transient browser jobs without creating applications', async t => {
  const { center, events } = fixture(t);
  const before = center.list().apps.map(app => app.id);
  center.poll('desktop1');
  const pending = center.openUrl('https://developer.mozilla.org/en-US/', { sessionId: 'session1', rootSessionId: 'root1' });
  const job = center.poll('desktop1').jobs[0];
  assert.equal(job.action, 'open_url');
  assert.equal(job.app.transient, true);
  assert.equal(job.args.url, 'https://developer.mozilla.org/en-US/');
  assert.deepEqual(center.list().apps.map(app => app.id), before);
  assert.equal(events.find(event => event.type === 'browser_open_required').browserId, job.app.id);
  center.complete('desktop1', job.id, { title: 'MDN', text: 'Docs', elements: [], url: job.args.url });
  assert.equal((await pending).title, 'MDN');
  assert.deepEqual(center.list().apps.map(app => app.id), before);
});
test('app_open only accepts an existing application id and open_url owns arbitrary URLs', () => {
  const appOpen = appCenterTools.find(tool => tool.name === 'app_open');
  const openUrl = appCenterTools.find(tool => tool.name === 'open_url');
  assert.deepEqual(appOpen.parameters.required, ['app_id']);
  assert.deepEqual(Object.keys(appOpen.parameters.properties), ['app_id']);
  assert.deepEqual(openUrl.parameters.required, ['url']);
  assert.match(openUrl.description, /不会把网站添加到应用台/);
});
test('only user applications can be deleted', t => {
  const { center, app } = fixture(t);
  center.remove(app.id);
  assert.equal(center.list().apps.some(item => item.id === app.id), false);
  center.syncCatalog([{ id: 'docs', name: 'Docs', url: 'https://docs.example.com', sortOrder: 1 }]);
  assert.throws(() => center.remove('platform-docs'), /平台应用不能删除/);
});
test('unconfirmed application suspends and resumes the same call after human authorization', async t => {
  const { center, app, events } = fixture(t);
  let done = false;
  const waiting = center.waitLogin(app.id, { sessionId: 'session1', rootSessionId: 'root1' }).then(value => { done = true; return value; });
  await Promise.resolve(); assert.equal(done, false);
  assert.equal(center.list().pending[0].sessionId, 'session1');
  assert.equal(events.find(e => e.type === 'app_login_required').rootSessionId, 'root1');
  center.authorize(app.id, 'https://example.com/workspace');
  assert.equal((await waiting).id, app.id); assert.equal(center.list().pending.length, 0);
});
test('document observations cannot grant login without a user confirmation', t => {
  const { center, app } = fixture(t);
  center.observe(app.id, 'https://example.com/workspace', 'signed-in');
  assert.equal(center.get(app.id).status, 'needs-login');
});
test('manual login confirmation survives inconclusive observations and survives login pages', t => {
  const { center, app } = fixture(t);
  center.observe(app.id, app.url, 'unknown');
  assert.equal(center.get(app.id).status, 'needs-login');
  center.authorize(app.id, app.url);
  center.observe(app.id, app.url, 'unknown');
  assert.equal(center.get(app.id).status, 'authorized');
  center.observe(app.id, 'https://example.com/login', 'required');
  assert.equal(center.get(app.id).status, 'authorized');
});
test('application browser exposes a manual login confirmation button through the trusted desktop bridge', () => {
  const source = fs.readFileSync(new URL('../react/src/AppCenter.jsx', import.meta.url), 'utf8');
  assert.match(source, /await desktop\.authorizeApp\(appId\); await refresh\(\)/);
  assert.match(source, /className="app-center-card-confirm"[^>]*onClick=\{onConfirm\}>确认登录<\/button>/);
  assert.match(source, /onConfirm=\{\(\) => confirmLogin\(item.id\)\}/);
  assert.doesNotMatch(source, /className="app-center-card-remove"/);
  assert.match(source, /onClick=\{startDelete\}[^>]*>.*删除应用/s);
  assert.match(source, /删除所选/);
  assert.match(source, /removeSelected/);
  assert.match(source, /className="app-center-card-check" onClick=\{onToggleDelete\}/);
  assert.match(source, /aria-pressed=\{deleteSelected\}/);
  assert.doesNotMatch(source, /我已登录，确认/);
});
test('agent permission is sticky and can be restored for an already signed-in app', async t => {
  const { center, app } = fixture(t);
  center.authorize(app.id, app.url);
  center.permission(app.id, false);
  assert.equal(center.get(app.id).agentAllowed, false);
  const waiting = center.waitLogin(app.id);
  center.permission(app.id, true);
  assert.equal((await waiting).status, 'authorized');
});
test('user confirmation does not require a visible page, login detection or a domain whitelist', t => {
  const { center, app } = fixture(t);
  assert.equal(center.authorize(app.id).status, 'authorized');
  assert.equal(center.authorize(app.id, 'https://www.example.com/login').status, 'authorized');
  center.observe(app.id, 'https://accounts.example/sso', 'required');
  assert.equal(center.get(app.id).status, 'authorized');
});
test('editing the authorized origin scope requires fresh user confirmation', t => {
  const { center, app } = fixture(t); center.authorize(app.id, app.url);
  center.upsert({ ...app, origins: ['https://second.example'] });
  assert.equal(center.get(app.id).status, 'needs-login');
});
test('application browser rejects local services, credential URLs, special schemes and private hosts', () => {
  for (const url of ['file:///C:/private.txt', 'http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://10.1.2.3', 'https://2130706433', 'https://user:password@example.com', 'https://example.com:3000', 'javascript:alert(1)']) assert.throws(() => policy.appUrl(url));
  assert.equal(policy.appUrl('https://github.com/login').origin, 'https://github.com');
});
test('login cancellation, task abort and timeout release pending waits', async t => {
  const { center, app } = fixture(t);
  const ac = new AbortController(), first = center.waitLogin(app.id, { signal: ac.signal });
  ac.abort(); await assert.rejects(first, /已停止/);
  const second = center.waitLogin(app.id); center.revoke(app.id); await assert.rejects(second, /取消/);
  await assert.rejects(center.waitLogin(app.id, { timeoutMs: 10 }), /超时/);
  assert.equal(center.list().pending.length, 0);
});
test('desktop bridge delivers one job, accepts only its owner, and cannot replay completed jobs', async t => {
  const { center, app } = fixture(t);
  assert.throws(() => center.command(app.id, 'open'), /桌面端/);
  center.poll('desktop1');
  const pending = center.command(app.id, 'open', { url: app.url });
  const { jobs } = center.poll('desktop1'); assert.equal(jobs.length, 1);
  assert.equal(center.poll('desktop1').jobs.length, 0);
  assert.equal(center.complete('other', jobs[0].id, {}), false);
  center.complete('desktop1', jobs[0].id, { url: app.url });
  assert.equal((await pending).url, app.url);
  assert.equal(center.complete('desktop1', jobs[0].id, {}), false);
});
test('aborted browser commands disappear from the desktop active set and cannot complete later', async t => {
  const { center, app } = fixture(t); center.poll('desktop1');
  const ac = new AbortController(), pending = center.command(app.id, 'snapshot', {}, { signal: ac.signal });
  const id = center.poll('desktop1').jobs[0].id; ac.abort();
  await assert.rejects(pending, /已停止/);
  assert.deepEqual(center.poll('desktop1').activeJobIds, []);
  assert.equal(center.complete('desktop1', id, {}), false);
});
test('remote browser contents cannot invoke privileged desktop IPC', () => {
  const handlers = new Map(), win = { webContents: {} }; let called = false;
  registerAppBrowser({ ipcMain: { on: (name, fn) => handlers.set(name, fn), handle: (name, fn) => handlers.set(name, fn) }, controller: { open() { called = true; } }, getWindow: () => win, serverUrl: 'http://127.0.0.1:3000' });
  assert.throws(() => handlers.get('app-browser-open')({ sender: {}, senderFrame: { url: 'https://evil.example' } }, 'app'), /主窗口/);
  assert.throws(() => handlers.get('app-browser-open')({ sender: win.webContents, senderFrame: { url: 'https://evil.example' } }, 'app'), /主窗口/);
  assert.equal(called, false);
});
