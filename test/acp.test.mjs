import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { client, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { AcpAgent } from '../cli/acp.mjs';
import { parseOptions } from '../cli/options.mjs';

const root = path.resolve(import.meta.dirname, '..');

function fakeRuntime({ connect = true } = {}) {
  const requests = [];
  let listener;
  let connected;
  let disconnected;
  return {
    requests,
    async useWorkspace() {},
    async request(resource, body) { requests.push({ resource, body }); return { id: 'owned' }; },
    events(callback, { signal, onConnected, onDisconnected }) {
      listener = callback;
      connected = onConnected;
      disconnected = onDisconnected;
      if (connect) onConnected();
      return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    },
    emit(event) { listener(event); },
    disconnect() { disconnected(new Error('Event stream lost')); },
    ready() { return Boolean(connected); },
  };
}

async function setup() {
  const runtime = fakeRuntime();
  const adapter = new AcpAgent(runtime);
  adapter.initialize();
  await adapter.newSession({ cwd: root, mcpServers: [] });
  return { adapter, runtime };
}

async function submitted(runtime) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (runtime.requests.some(request => request.resource.endsWith('/message'))) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Prompt not submitted');
}

test('ACP CLI and capability validation', async () => {
  assert.equal(parseOptions(['acp']).command, 'acp');
  assert.throws(() => parseOptions(['acp', '--auto']));
  assert.throws(() => parseOptions(['acp', '--resume']));
  const { adapter } = await setup();
  assert.equal(adapter.initialize().protocolVersion, PROTOCOL_VERSION);
  await assert.rejects(adapter.newSession({ cwd: root, mcpServers: [{ name: 'unsupported' }] }));
  await assert.rejects(adapter.newSession({ cwd: os.tmpdir() }));
  await assert.rejects(adapter.prompt({ sessionId: 'foreign', prompt: [{ type: 'text', text: 'hello' }] }, {}));
  await assert.rejects(adapter.prompt({ sessionId: 'owned', prompt: [{ type: 'image', data: '' }] }, {}));
});

test('ACP closes safely before SSE connects and aborts on SSE loss', async () => {
  for (const connect of [false, true]) {
    const runtime = fakeRuntime({ connect });
    const adapter = new AcpAgent(runtime);
    adapter.initialize();
    await adapter.newSession({ cwd: root });
    const pending = adapter.prompt({ sessionId: 'owned', prompt: [{ type: 'text', text: 'hello' }] }, { async notify() {} });
    const rejection = assert.rejects(pending, /disconnected|stream lost/);
    if (connect) { await submitted(runtime); runtime.disconnect(); }
    else await adapter.close();
    await rejection;
    if (connect) assert.ok(runtime.requests.some(request => request.resource.endsWith('/abort')));
  }
});

test('ACP rejects tasks requiring extra UI input rather than auto-confirming', async () => {
  const { adapter, runtime } = await setup();
  const pending = adapter.prompt({ sessionId: 'owned', prompt: [{ type: 'text', text: 'hello' }] }, { async notify() {} });
  const rejection = assert.rejects(pending, /interactive MLI UI/);
  await submitted(runtime);
  runtime.emit({ sessionId: 'owned', type: 'ui_request', request: { reqId: 'input' } });
  await rejection;
  assert.ok(runtime.requests.some(request => request.resource.endsWith('/ui/input') && request.body.value === null));
});

test('ACP streams owned text and tool events and preserves ordering', async () => {
  const { adapter, runtime } = await setup();
  const updates = [];
  const pending = adapter.prompt({ sessionId: 'owned', prompt: [{ type: 'text', text: 'hello' }] }, { async notify(method, params) { updates.push(params.update); } });
  await submitted(runtime);
  await assert.rejects(adapter.prompt({ sessionId: 'owned', prompt: [{ type: 'text', text: 'duplicate' }] }, {}));
  runtime.emit({ sessionId: 'foreign', type: 'text_delta', text: 'secret' });
  runtime.emit({ sessionId: 'owned', type: 'text_delta', text: 'hello' });
  runtime.emit({ sessionId: 'owned', type: 'tool_call', call: { id: 'call', name: 'read_file', args: { path: 'README.md' } } });
  runtime.emit({ sessionId: 'owned', type: 'tool_result', callId: 'call', status: 'ok', content: 'contents' });
  runtime.emit({ sessionId: 'owned', type: 'turn_end', reason: 'done' });
  assert.deepEqual(await pending, { stopReason: 'end_turn' });
  assert.equal(updates.length, 3);
  assert.equal(updates[1].locations[0].path, path.join(fs.realpathSync(root), 'README.md'));
  assert.equal(updates[2].status, 'completed');
});

test('ACP permission decisions are single-shot and fail closed', async () => {
  const { adapter, runtime } = await setup();
  for (const outcome of [{ outcome: 'selected', optionId: 'allow' }, { outcome: 'selected', optionId: 'untrusted' }, { outcome: 'cancelled' }]) {
    const state = { pendingPermissions: new Set(), calls: new Map(), abort: new AbortController() };
    const event = { sessionId: 'child', request: { reqId: 'approval', tool: 'write_file', summary: 'file' } };
    await adapter.permission('owned', state, event, { async request(method, params) { assert.equal(params.sessionId, 'owned'); return { outcome }; } });
    assert.equal(runtime.requests.at(-1).body.decision, outcome.optionId === 'allow' ? 'allow' : 'deny');
    assert.match(runtime.requests.at(-1).resource, /child\/permission\/approval/);
  }
});

test('ACP cancellation and disconnection stop owned runtime tasks', async () => {
  const { adapter, runtime } = await setup();
  const pending = adapter.prompt({ sessionId: 'owned', prompt: [{ type: 'text', text: 'hello' }] }, { async notify() {} });
  await submitted(runtime);
  await adapter.cancel({ sessionId: 'owned' });
  runtime.emit({ sessionId: 'owned', type: 'turn_end', reason: 'aborted' });
  assert.deepEqual(await pending, { stopReason: 'cancelled' });
  const disconnected = adapter.prompt({ sessionId: 'owned', prompt: [{ type: 'text', text: 'again' }] }, { async notify() {} });
  await new Promise(resolve => setImmediate(resolve));
  const rejection = assert.rejects(disconnected, /disconnected/);
  await adapter.close();
  await rejection;
  assert.ok(runtime.requests.some(request => request.resource.endsWith('/abort')));
});

test('official ACP SDK drives mli acp over stdio with a real mock runtime', { timeout: 45000 }, async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-acp-'));
  const cwd = path.join(directory, 'project');
  fs.mkdirSync(cwd);
  const child = spawn(process.execPath, [path.join(root, 'cli/main.cjs'), 'acp', '--data-dir', path.join(directory, 'data'), '--cwd', cwd], {
    env: { ...process.env, MLI_ACCOUNT_ENABLED: 'false', MLI_ACCOUNT_APP_SECRET: '' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const updates = [];
  let permissionCount = 0;
  const connection = client({ name: 'mli-acp-test' })
    .onNotification('session/update', ({ params }) => { updates.push(params.update); })
    .onRequest('session/request_permission', ({ params }) => {
      permissionCount++;
      assert.ok(params.options.some(option => option.optionId === 'allow'));
      return { outcome: { outcome: 'selected', optionId: 'allow' } };
    })
    .connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
  context.after(async () => {
    connection.close();
    if (child.exitCode === null) child.kill('SIGTERM');
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const initialized = await connection.agent.request('initialize', { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(initialized.agentInfo.name, 'mli-agent');
  const session = await connection.agent.request('session/new', { cwd, mcpServers: [] });
  const result = await connection.agent.request('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: '写一个 hello.txt' }] });
  assert.equal(result.stopReason, 'end_turn', stderr);
  assert.ok(permissionCount > 0);
  assert.ok(updates.some(update => update.sessionUpdate === 'tool_call'));
  assert.ok(updates.some(update => update.sessionUpdate === 'tool_call_update' && update.status === 'completed'));
  assert.ok(fs.existsSync(path.join(cwd, 'hello.txt')));
  const exited = once(child, 'exit');
  child.stdin.end();
  const [code] = await exited;
  assert.equal(code, 0, stderr);
});
