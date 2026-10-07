import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppCenter } from '../core/app-center.mjs';
import policy from '../core/app-center-policy.cjs';
import { registerAppBrowser } from '../electron/app-center.cjs';

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
test('trusted desktop observation resumes after login without a second authorization click', async t => {
  const { center, app } = fixture(t);
  const waiting = center.waitLogin(app.id, { sessionId: 'session-auto' });
  center.observe(app.id, 'https://example.com/login');
  assert.equal(center.get(app.id).status, 'needs-login');
  center.observe(app.id, 'https://example.com/workspace', 'signed-in');
  assert.equal((await waiting).status, 'authorized');
  assert.equal(center.get(app.id).loginState, 'signed-in');
});
test('agent permission is sticky and can be restored for an already signed-in app', async t => {
  const { center, app } = fixture(t);
  center.observe(app.id, app.url, 'signed-in');
  center.permission(app.id, false);
  assert.equal(center.get(app.id).agentAllowed, false);
  const waiting = center.waitLogin(app.id);
  center.permission(app.id, true);
  assert.equal((await waiting).status, 'authorized');
});
test('login-page and external-origin confirmation are rejected and live redirects expire authorization', t => {
  const { center, app } = fixture(t);
  assert.throws(() => center.authorize(app.id, 'https://example.com/login'), /完成登录/);
  assert.throws(() => center.authorize(app.id, 'https://evil.example/app'), /完成登录/);
  center.authorize(app.id, 'https://example.com/workspace');
  center.observe(app.id, 'https://example.com/login?return=secret');
  assert.equal(center.get(app.id).status, 'needs-login');
  center.authorize(app.id, 'https://example.com/workspace');
  center.observe(app.id, 'https://accounts.example/sso'); assert.equal(center.get(app.id).status, 'needs-login');
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
  registerAppBrowser({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, controller: { open() { called = true; } }, getWindow: () => win, serverUrl: 'http://127.0.0.1:3000' });
  assert.throws(() => handlers.get('app-browser-open')({ sender: {}, senderFrame: { url: 'https://evil.example' } }, 'app'), /主窗口/);
  assert.throws(() => handlers.get('app-browser-open')({ sender: win.webContents, senderFrame: { url: 'https://evil.example' } }, 'app'), /主窗口/);
  assert.equal(called, false);
});
