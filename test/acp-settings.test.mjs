import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import runtime from '../electron/runtime.cjs';
import { acpSettings, updateAcpSettings } from '../core/acp-settings.mjs';

const agent = { id: 'example', name: 'Example', command: '/test/agent', args: ['acp'], env: { TOKEN: 'test-private-value' }, timeoutMs: 5000 };

test('ACP settings redact secrets and preserve or explicitly clear environment', () => {
  const config = { acp: { agents: [agent] } };
  assert.doesNotMatch(JSON.stringify(acpSettings(config)), /test-private-value/);
  assert.deepEqual(acpSettings(config)[0].envKeys, ['TOKEN']);
  const { env, ...publicAgent } = agent;
  assert.deepEqual(updateAcpSettings(config, { action: 'save', agent: publicAgent }).agents[0].env, env);
  assert.deepEqual(updateAcpSettings(config, { action: 'save', agent: { ...publicAgent, env: {} } }).agents[0].env, {});
  assert.equal(updateAcpSettings(config, { action: 'delete', id: agent.id }).agents.length, 0);
  assert.throws(() => updateAcpSettings(config, { action: 'save', agent: { ...agent, args: 'shell' } }));
});

test('ACP settings HTTP persistence and origin protection', { timeout: 30000 }, async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-acp-settings-'));
  let instance;
  const stop = async () => { if (instance?.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; } };
  context.after(async () => { await stop(); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const start = async () => {
    instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: path.resolve(import.meta.dirname, '..'), dataRoot: directory, environment: { MLI_ACCOUNT_ENABLED: 'false' } });
    return (await instance.ready).url;
  };
  let url = await start();
  const post = (body, headers = {}) => fetch(url + '/api/acp/settings', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({ action: 'save', agent }, { origin: 'https://evil.example' })).status, 403);
  const saved = await post({ action: 'save', agent });
  assert.equal(saved.status, 200);
  assert.doesNotMatch(await saved.text(), /test-private-value/);
  assert.equal((await post({ action: 'save', agent: { ...agent, timeoutMs: 0 } })).status, 400);
  await stop(); url = await start();
  const loaded = await (await fetch(url + '/api/acp/settings')).json();
  assert.equal(loaded.agents[0].id, 'example');
  assert.doesNotMatch(JSON.stringify(loaded), /test-private-value/);
  const { env, ...withoutSecret } = agent;
  assert.equal((await post({ action: 'save', agent: { ...withoutSecret, name: 'Changed' } })).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8')).acp.agents[0].env.TOKEN, agent.env.TOKEN);
  assert.equal((await post({ action: 'delete', id: 'example' })).status, 200);
  assert.deepEqual((await (await fetch(url + '/api/acp/settings')).json()).agents, []);
});

test('ACP tab belongs to SettingsPage rather than model-only page', () => {
  const source = fs.readFileSync(new URL('../react/src/main.jsx', import.meta.url), 'utf8');
  const settings = source.slice(source.indexOf('function SettingsPage('));
  assert.match(settings, /setTab\("acp"\)/);
  assert.match(settings, /<AcpSettings get=\{get\} post=\{post\}/);
  const models = source.slice(source.indexOf('function ModelPage('), source.indexOf('function ModelPage(') + 1600);
  assert.doesNotMatch(models, /setTab\("acp"\)/);
});
