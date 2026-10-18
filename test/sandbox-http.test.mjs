import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';
import {assertPackagedSandboxStatus, waitFor} from '../scripts/verify-win.mjs';

test('Windows package verification preserves the disabled-by-default sandbox policy', () => {
  const status = {
    policy: { enabled: false, mode: 'workspace-write', backend: 'auto' }, backend: 'none',
    enforced: false, hostFallback: true, failClosed: false,
    fallbacks: ['host-auto', 'host-confirmed'], runtime: { packagePresent: true },
  };
  assert.doesNotThrow(() => assertPackagedSandboxStatus(status));
  assert.throws(() => assertPackagedSandboxStatus({ ...status, policy: { ...status.policy, enabled: true } }), /默认关闭/);
  assert.throws(() => assertPackagedSandboxStatus({ ...status, backend: 'windows-native' }), /不得启动/);
  assert.throws(() => assertPackagedSandboxStatus({ ...status, enforced: true }), /不得声称/);
  assert.throws(() => assertPackagedSandboxStatus({ ...status, failClosed: true }), /宿主执行策略一致/);
  assert.throws(() => assertPackagedSandboxStatus({ ...status, runtime: { packagePresent: false } }), /沙箱运行库/);
});

test('sandbox API persists validated host settings across restarts and workspace changes', { timeout: 30000 }, async context => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-sandbox-http-'));
  let instance;
  async function stop() {
    if (instance?.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; }
  }
  context.after(async () => { await stop(); fs.rmSync(dataRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); });
  async function start() { instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot }); return (await instance.ready).url; }
  let url = await start();
  async function request(route, method = 'GET', body) {
    const response = await fetch(url + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  const initial = await request('/api/sandbox');
  assert.equal(initial.status, 200); assert.equal(initial.data.policy.mode, 'workspace-write'); assert.equal(initial.data.policy.enabled, false);
  // `auto` is opportunistic: an unusable backend falls back to the host shell.
  assert.equal(initial.data.failClosed, false); assert.equal(initial.data.hostFallback, true);
  assert.equal((await request('/api/sandbox/install-preflight','POST')).status,200,'readiness check never installs');
  assert.equal((await request('/api/sandbox/install','POST')).status,404,'system installation is not exposed as a web API');
  const terminal=await request('/api/terminal/run','POST',{command:'node -e "setTimeout(()=>{},30000)"'});
  assert.equal(terminal.status,200);
  await waitFor(async()=> (await request(`/api/terminal/${terminal.data.terminalId}`)).data.status==='running');
  assert.equal((await request('/api/sandbox/install-preflight','POST')).status,409,'active terminal blocks setup before UAC');
  assert.equal((await request(`/api/terminal/${terminal.data.terminalId}/stop`,'POST')).data.ok,true);
  await waitFor(async()=> (await request(`/api/terminal/${terminal.data.terminalId}`)).data.status==='exited');
  assert.equal((await request('/api/sandbox/install-preflight','POST')).status,200,'setup permitted once terminal has exited');
  assert.equal((await request('/api/sandbox', 'POST', { mode: 'silently-disable' })).status, 400);
  assert.equal((await request('/api/sandbox', 'POST', { networkAccess: 'true' })).status, 400);
  assert.equal((await request('/api/sandbox', 'POST', { allowedDomains: ['*'] })).status, 200);
  assert.equal((await request('/api/sandbox')).data.policy.networkAccess, true);
  assert.deepEqual((await request('/api/sandbox')).data.policy.allowedDomains, ['*']);
  assert.equal((await request('/api/sandbox', 'POST', { enabled: false })).status, 200);
  assert.equal((await request('/api/sandbox')).data.policy.enabled, false);
  assert.equal((await request('/api/sandbox', 'POST', { mode: 'read-only', allowedDomains: ['registry.npmjs.org:443'] })).status, 200);
  await request('/api/workspaces', 'POST', { path: path.join(dataRoot, 'other-project') });
  assert.equal((await request('/api/sandbox')).data.policy.mode, 'read-only');
  assert.deepEqual((await request('/api/sandbox')).data.policy.allowedDomains, ['registry.npmjs.org:443']);
  const saved = JSON.parse(fs.readFileSync(path.join(dataRoot, '.security', 'sandbox.json'), 'utf8'));
  assert.equal(saved.mode, 'read-only');
  await stop(); url = await start();
  assert.equal((await request('/api/sandbox')).data.policy.mode, 'read-only');
  const disabled = await request('/api/sandbox', 'POST', { mode: 'off' });
  assert.equal(disabled.data.backend, 'none'); assert.equal(disabled.data.enforced, false);
});
