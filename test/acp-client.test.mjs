import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { callExternalAgent, discoverAcpAgents, externalAgents, publicExternalAgents, runExternalAgent, stopExternalAgent } from '../core/acp-client.mjs';
import { AgentManager } from '../core/agent-manager.mjs';
import { Session } from '../core/session.mjs';
import { getWorkspaceRoot, setWorkspaceRoot } from '../core/paths.mjs';
import { createRunContext, withRunContext } from '../core/run-context.mjs';
import { onEvent } from '../core/events.mjs';
import { resolveRequest, authorize, replacePersistentRules } from '../core/permissions.mjs';

const peer = path.resolve(import.meta.dirname, 'fixtures/acp-peer.mjs');
const definition = (mode = 'normal', timeoutMs = 5000) => ({ id: 'fixture', name: 'Fixture', command: process.execPath, args: [peer, mode], env: {}, timeoutMs });
function fixture(context) {
  const previous = getWorkspaceRoot();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-acp-client-'));
  setWorkspaceRoot(root);
  context.after(() => { setWorkspaceRoot(previous); fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return root;
}

test('external ACP config validation and public list hide commands and credentials', () => {
  const config = { acp: { agents: [{ ...definition(), env: { SECRET: 'private' } }] } };
  assert.equal(externalAgents(config).length, 1);
  assert.doesNotMatch(JSON.stringify(publicExternalAgents(config)), /private|command|args/);
  for (const agents of [{}, [definition(), definition()], [{ ...definition(), args: 'shell' }], [{ ...definition(), env: { SECRET: 123 } }], [{ ...definition(), timeoutMs: 0 }]]) assert.throws(() => externalAgents({ acp: { agents } }));
});

test('ACP discovery only reports candidates that complete initialize', async () => {
  const agents = await discoverAcpAgents({ candidates: [
    { id: 'fixture', name: 'Fixture', command: process.execPath, args: [peer, 'normal'] },
    { id: 'bad-version', name: 'Bad version', command: process.execPath, args: [peer, 'version'] },
    { id: 'missing', name: 'Missing', command: 'mli-acp-command-that-does-not-exist', args: [] },
  ] });
  assert.equal(agents.find(agent => agent.id === 'fixture').status, 'available');
  assert.equal(agents.find(agent => agent.id === 'bad-version').status, 'invalid');
  assert.equal(agents.find(agent => agent.id === 'missing').status, 'not_found');
  assert.equal(agents.find(agent => agent.id === 'fixture').protocolVersion, 1);
});

test('ACP discovery falls back across known entrypoints and reports unsupported transports', async () => {
  const agents = await discoverAcpAgents({ candidates: [
    { id: 'fallback', name: 'Fallback', entries: [
      { command: 'mli-acp-command-that-does-not-exist', args: [], kind: 'adapter' },
      { command: process.execPath, args: [peer, 'normal'], kind: 'native' },
    ] },
    { id: 'http-only', name: 'HTTP only', entries: [], unsupportedReason: 'stdio unavailable' },
  ] });
  assert.equal(agents[0].status, 'available');
  assert.equal(agents[0].kind, 'native');
  assert.equal(agents[1].status, 'unsupported');
});

test('official ACP client scopes updates and does not inherit MLI credentials', async context => {
  const cwd = fixture(context);
  const previous = process.env.MLI_ACCOUNT_APP_SECRET;
  process.env.MLI_ACCOUNT_APP_SECRET = 'must-not-leak';
  context.after(() => { if (previous === undefined) delete process.env.MLI_ACCOUNT_APP_SECRET; else process.env.MLI_ACCOUNT_APP_SECRET = previous; });
  const updates = [];
  const result = await callExternalAgent(definition('env'), { cwd, prompt: 'hello', onUpdate: update => updates.push(update) });
  assert.equal(result.text, 'not-inherited');
  assert.equal(updates.length, 1);
  assert.equal(result.externalSessionId, 'external-session');
});

test('external ACP permissions allow only known single-shot choices', async context => {
  const cwd = fixture(context);
  for (const optionId of ['invented', 'yes']) {
    await callExternalAgent(definition('permission'), { cwd, prompt: 'write', onPermission: async () => ({ outcome: { outcome: 'selected', optionId } }) });
    assert.equal(fs.existsSync(path.join(cwd, 'external-proof.txt')), optionId === 'yes');
  }
});

test('external ACP errors, timeouts and cancellation terminate promptly', { timeout: 15000 }, async context => {
  const cwd = fixture(context);
  for (const [mode, message] of [['exit', /exited|closed/], ['version', /protocol version/], ['refuse', /did not complete/], ['hang', /timed out/]]) {
    await assert.rejects(callExternalAgent(definition(mode, mode === 'hang' ? 150 : 5000), { cwd, prompt: 'hello' }), message);
  }
  const controller = new AbortController();
  const pending = callExternalAgent(definition('hang'), { cwd, prompt: 'hello', signal: controller.signal });
  const rejected = assert.rejects(pending, /cancelled/);
  controller.abort();
  await rejected;
});

test('external worker runs through scheduler and bridges approvals into MLI history', { timeout: 10000 }, async context => {
  const root = fixture(context);
  const config = { agent: { subagents: { maxConcurrent: 2 } }, acp: { agents: [definition('permission')] } };
  const session = Session.create('Coordinator');
  session.setMode('auto-all');
  const runContext = createRunContext({ session, executionRoot: root, config });
  const manager = new AgentManager();
  manager.configure({ config: () => config, run: runExternalAgent, stop: stopExternalAgent });
  const permissions = [];
  const cleanup = onEvent(event => {
    if (event.type === 'permission_request') {
      permissions.push(event.request.tool);
      resolveRequest(event.request.reqId, 'allow', event.sessionId);
    }
  });
  context.after(cleanup);
  await assert.rejects(withRunContext(runContext, () => manager.spawn(session, { tasks: [{ profile: 'explorer', externalAgentId: 'fixture', instruction: 'read' }] })), /worker/);
  await assert.rejects(withRunContext(runContext, () => manager.spawn(session, { tasks: [{ profile: 'worker', externalAgentId: 'unknown', instruction: 'read' }] })), /受信任/);
  const [task] = await withRunContext(runContext, () => manager.spawn(session, { tasks: [{ profile: 'worker', externalAgentId: 'fixture', instruction: 'write proof' }] }));
  const result = await withRunContext(runContext, () => manager.wait(session, { timeoutMs: 5000, ignoreBlocked: true }));
  assert.equal(result.tasks[0].status, 'completed');
  assert.match(result.tasks[0].result.summary, /External result/);
  assert.deepEqual(permissions, ['acp_launch', 'acp_permission']);
  assert.ok(fs.existsSync(path.join(root, 'external-proof.txt')));
  const history = Session.load(task.agentId).entries();
  assert.ok(history.some(entry => entry.type === 'acp_update'));
  assert.equal(history.findLast(entry => entry.type === 'task_summary').verification, 'external-agent-reported; not independently verified');
});

test('external startup denial prevents process execution even in auto-all mode', async context => {
  const root = fixture(context);
  const config = { acp: { agents: [definition('permission')] } };
  const session = Session.create('Denied');
  session.setMode('auto-all');
  const runContext = createRunContext({ session, executionRoot: root, config, allowedTools: ['acp_launch', 'acp_permission'], externalAgentId: 'fixture' });
  const cleanup = onEvent(event => { if (event.type === 'permission_request') resolveRequest(event.request.reqId, 'deny'); });
  context.after(cleanup);
  await assert.rejects(withRunContext(runContext, () => runExternalAgent(session, 'write')), /拒绝/);
  assert.ok(!fs.existsSync(path.join(root, 'external-proof.txt')));
});

test('single-shot ACP approval ignores remembered rules and never persists new ones', async context => {
  fixture(context);
  replacePersistentRules([{ tool: 'acp_launch', pattern: '*' }]);
  const session = Session.create('Approval');
  let count = 0;
  const cleanup = onEvent(event => {
    if (event.type === 'permission_request') { count++; resolveRequest(event.request.reqId, 'allow_always'); }
  });
  context.after(cleanup);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await authorize({ session, tool: { name: 'acp_launch', permission: 'L3' }, args: { agent: 'fixture' }, allowRemember: false });
    assert.equal(response.decision, 'allow');
  }
  assert.equal(count, 2);
});

test('external workers share writer exclusion and stop through the runtime coordinator', { timeout: 10000 }, async context => {
  const root = fixture(context);
  const config = { agent: { subagents: { maxConcurrent: 2 } }, acp: { agents: [definition('hang')] } };
  const session = Session.create('Cancellation');
  const runContext = createRunContext({ session, executionRoot: root, config });
  const manager = new AgentManager();
  manager.configure({ config: () => config, run: runExternalAgent, stop: stopExternalAgent });
  let launchCount = 0;
  const cleanup = onEvent(event => {
    if (event.type === 'permission_request') { launchCount++; resolveRequest(event.request.reqId, 'allow'); }
  });
  context.after(cleanup);
  const tasks = await withRunContext(runContext, () => manager.spawn(session, { tasks: [1, 2].map(index => ({ profile: 'worker', externalAgentId: 'fixture', instruction: `hang ${index}` })) }));
  for (let attempt = 0; attempt < 100 && launchCount === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(launchCount, 1);
  assert.equal(manager.view(session).tasks[1].status, 'queued');
  assert.throws(() => withRunContext(runContext, () => manager.send(session, { agentId: tasks[0].agentId, text: 'steer', kind: 'steer' })), /不支持/);
  withRunContext(runContext, () => manager.stop(session.id, root));
  const result = await withRunContext(runContext, () => manager.wait(session, { timeoutMs: 5000, ignoreBlocked: true }));
  assert.ok(result.complete);
  assert.ok(result.tasks.every(task => task.status === 'cancelled'));
});
