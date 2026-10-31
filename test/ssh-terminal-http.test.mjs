import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { isLocalApiRequest } from '../core/local-api-security.mjs';

const { startRuntime } = createRequire(import.meta.url)('../electron/runtime.cjs');
const root = path.resolve(import.meta.dirname, '..');

test('SSH HTTP APIs accept only direct loopback requests and reject forged or cross-site origins', { timeout: 30000 }, async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-ssh-http-'));
  const runtime = startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory });
  context.after(async () => {
    if (runtime.child.exitCode === null) { const exited = once(runtime.child, 'exit'); runtime.child.kill(); await exited; }
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const { url } = await runtime.ready;
  const base = new URL(url);
  async function request(endpoint, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${url}${endpoint}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, value: await response.json() };
  }

  const config = { name: 'HTTP test', host: 'server.example.com', port: 22, username: 'tester', authMode: 'agent', agentSocket: '/tmp/ssh-agent.sock' };
  const created = await request('/api/ssh/connections', { method: 'POST', body: config });
  assert.equal(created.status, 200);
  const connectionId = created.value.connection.id;
  const stored = await request('/api/ssh/connections');
  assert.equal(stored.status, 200);
  assert.equal(stored.value.connections.length, 1);
  assert.equal(JSON.stringify(stored.value).includes('agentSocket'), false);

  const crossSite = await request('/api/ssh/connections', { method: 'POST', body: { ...config, name: 'cross-site' }, headers: { origin: 'https://attacker.example' } });
  assert.equal(crossSite.status, 403);
  const fetchMetadata = await request('/api/ssh/connections', { method: 'POST', body: { ...config, name: 'fetch metadata' }, headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(fetchMetadata.status, 403);
  const forwarded = await request('/api/ssh/connections', { method: 'POST', body: { ...config, name: 'forwarded' }, headers: { 'x-forwarded-for': '192.0.2.8' } });
  assert.equal(forwarded.status, 403);

  const sameOrigin = await request('/api/ssh/connections', { method: 'POST', body: { ...config, name: 'same origin' }, headers: { origin: base.origin, 'sec-fetch-site': 'same-origin' } });
  assert.equal(sameOrigin.status, 200);
  assert.equal((await request('/api/ssh/connections')).value.connections.length, 2);

  const remoteRead = await request(`/api/ssh/connections/${connectionId}/workspace`);
  assert.equal(remoteRead.status, 409);
  assert.equal(remoteRead.value.code, 'SSH_NOT_CONNECTED');
  for (const endpoint of [
    `/api/ssh/connections/${connectionId}/desktop/files?path=%2F`,
    `/api/ssh/connections/${connectionId}/desktop/file?path=%2Fetc%2Fhosts`,
    `/api/ssh/connections/${connectionId}/desktop/download?path=%2Fetc%2Fhosts`,
  ]) {
    const result = await request(endpoint);
    assert.equal(result.status, 409);
    assert.equal(result.value.code, 'SSH_NOT_CONNECTED');
  }
  const disconnectedSystem = await request(`/api/ssh/connections/${connectionId}/desktop/system`, { method: 'POST', body: { area: 'services' } });
  assert.equal(disconnectedSystem.status, 409);
  const crossSiteSystem = await request(`/api/ssh/connections/${connectionId}/desktop/system`, { method: 'POST', body: { area: 'services' }, headers: { origin: 'https://attacker.example' } });
  assert.equal(crossSiteSystem.status, 403);
  const disconnectedOperation = await request(`/api/ssh/connections/${connectionId}/desktop/operation`, { method: 'POST', body: { action: 'mkdir', path: '/tmp/test' } });
  assert.equal(disconnectedOperation.status, 409);
  const crossSiteOperation = await request(`/api/ssh/connections/${connectionId}/desktop/operation`, { method: 'POST', body: { action: 'mkdir', path: '/tmp/test' }, headers: { origin: 'https://attacker.example' } });
  assert.equal(crossSiteOperation.status, 403);
  const desktopCrossSite = await request(`/api/ssh/connections/${connectionId}/desktop/files?path=%2F`, { headers: { origin: 'https://attacker.example' } });
  assert.equal(desktopCrossSite.status, 403);
  const remoteMutation = await request(`/api/ssh/connections/${connectionId}/workspace/root`, {
    method: 'POST', body: { path: '/tmp/project' }, headers: { origin: 'https://attacker.example' },
  });
  assert.equal(remoteMutation.status, 403);

  const forgedHost = { headers: { host: 'localhost' }, socket: { remoteAddress: '192.0.2.8' } };
  assert.equal(isLocalApiRequest(forgedHost), false);
  assert.equal(isLocalApiRequest({ headers: { host: base.host, origin: 'https://attacker.example' }, socket: { remoteAddress: '127.0.0.1' } }), false);
  assert.equal(isLocalApiRequest({ headers: { host: base.host, 'sec-fetch-site': 'cross-site' }, socket: { remoteAddress: '127.0.0.1' } }), false);
  assert.equal(isLocalApiRequest({ headers: { host: base.host, origin: base.origin }, socket: { remoteAddress: '127.0.0.1' } }), true);
});
