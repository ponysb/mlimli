import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentManager, agentManager } from '../core/agent-manager.mjs';
import { Session } from '../core/session.mjs';
import { setWorkspaceRoot, getWorkspaceRoot, resolveInWorkspace } from '../core/paths.mjs';
import { createRunContext, withRunContext, getRunContext } from '../core/run-context.mjs';
import { setConfig, getConfig, resolveModelSelection, chat } from '../core/llm.mjs';
import { getSandboxPolicy, setSandboxPolicy } from '../core/sandbox-policy.mjs';
import { executeTool, getTool, loadAll } from '../core/plugins.mjs';
import { queryApiLogs } from '../core/api-logs.mjs';
import { onEvent } from '../core/events.mjs';
import { initializeAgentRuntime, runSequence, contextForSession, stopSession } from '../core/runtime.mjs';
import { reduceEvent, emptySession } from '../cli/modern/state.mjs';
import { agentProfiles } from '../core/agent-profiles.mjs';

const config = () => JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'));
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t) {
  const previous = getWorkspaceRoot(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-subagents-'));
  setWorkspaceRoot(root); setConfig(config());
  const session = Session.create('主任务');
  const context = createRunContext({ session, config: getConfig(), modelSelection: resolveModelSelection(), sandboxPolicy: { ...getSandboxPolicy(), mode: 'off' } });
  t.after(() => { setWorkspaceRoot(previous); fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return { root, session, context };
}

test('Session 索引绑定实例，子会话隐藏且可以直接查看', t => {
  const { root, session } = fixture(t);
  const child = Session.create('子任务', { parentSessionId: session.id, rootSessionId: session.id });
  const other = path.join(root, 'other'); setWorkspaceRoot(other);
  child.setTitle('改名后的子任务');
  assert.equal(Session.list().length, 0);
  setWorkspaceRoot(root);
  assert.deepEqual(Session.list().map(s => s.id), [session.id]);
  assert.equal(Session.list({ includeChildren: true }).length, 2);
  const loaded = Session.load(child.id);
  assert.equal(loaded.parentSessionId, session.id); assert.equal(loaded.title, '改名后的子任务');
  assert.equal(Session.load(child.fork().id).parentSessionId, undefined);
});

test('并发上下文隔离工作根、模型选择、沙箱和日志存储', async t => {
  const { root, session } = fixture(t);
  const cfg = getConfig();
  cfg.models.push({ ...cfg.models[0], id: 'second-model', model: 'second', name: '第二模型' });
  const firstSelection = resolveModelSelection(), secondSelection = resolveModelSelection('second-model');
  cfg.models[0].model = 'changed-after-snapshot'; cfg.activeModelId = 'second-model';
  const roots = [path.join(root, 'a'), path.join(root, 'b')];
  roots.forEach((dir, i) => { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'proof.txt'), String(i)); });
  const seen = await Promise.all(roots.map((executionRoot, index) => {
    const context = createRunContext({ session, executionRoot, config: cfg, modelSelection: [firstSelection, secondSelection][index], sandboxPolicy: { ...getSandboxPolicy(), mode: index ? 'read-only' : 'off' } });
    return withRunContext(context, async () => {
      await tick(); assert.equal(getRunContext(), context);
      assert.equal(fs.readFileSync(resolveInWorkspace('proof.txt'), 'utf8'), String(index));
      assert.equal(getSandboxPolicy().mode, index ? 'read-only' : 'off');
      for await (const _ of chat({ messages: [{ role: 'user', content: 'hello' }], sessionId: `run-${index}` })) {}
      return getWorkspaceRoot();
    });
  }));
  assert.deepEqual(seen, roots);
  const rows = queryApiLogs({ limit: 10 }).logs;
  assert.deepEqual(new Set(rows.map(row => row.provider.model)), new Set(['mock', 'second']));
  assert.ok(fs.existsSync(path.join(root, '.agent', 'api-logs.jsonl')));
  assert.ok(!fs.existsSync(path.join(roots[0], '.agent')));
});

test('spawn 立即排队、两任务真实重叠、限流、依赖和幂等', async t => {
  const { session, context } = fixture(t), manager = new AgentManager();
  const starts = [], releases = new Map();
  manager.configure({ config: () => context.config, stop() {}, run: async child => {
    starts.push(child.id); await new Promise(resolve => releases.set(child.id, resolve));
    child.append({ type: 'task_summary', reason: 'done', summaryText: `证据 ${child.id}` });
  } });
  const input = { tasks: [{ instruction: 'A' }, { instruction: 'B' }, { instruction: 'C' }], idempotencyKey: 'batch' };
  const tasks = await withRunContext(context, () => manager.spawn(session, input));
  assert.equal(starts.length, 0); await tick();
  assert.equal(starts.length, 2); assert.equal(manager.running, 2);
  const again = await withRunContext(context, () => manager.spawn(session, input));
  assert.deepEqual(again.map(t => t.taskId), tasks.map(t => t.taskId));
  await assert.rejects(withRunContext(context, () => manager.spawn(session, { tasks: [{ instruction: 'D' }], idempotencyKey: 'batch' })), /幂等键/);
  const dependent = (await withRunContext(context, () => manager.spawn(session, { tasks: [{ instruction: 'after A', dependsOn: [tasks[0].taskId] }] })))[0];
  releases.get(tasks[1].agentId)(); await tick(); await tick();
  assert.ok(starts.includes(tasks[2].agentId)); assert.ok(!starts.includes(dependent.agentId));
  releases.get(tasks[0].agentId)(); await tick(); await tick();
  assert.ok(starts.includes(dependent.agentId));
  releases.get(tasks[2].agentId)(); releases.get(dependent.agentId)();
  const result = await withRunContext(context, () => manager.wait(session, { timeoutMs: 1000 }));
  assert.equal(result.complete, true); assert.ok(result.tasks.every(t => t.status === 'completed'));
  assert.equal(withRunContext(context, () => manager.consume(session)), 4);
  assert.equal(withRunContext(context, () => manager.consume(session)), 0);
});

test('邮箱送达和重启消费去重，恢复不自动重放任务', async t => {
  const { root, session, context } = fixture(t), manager = new AgentManager();
  manager.configure({ config: () => context.config, run: async () => {}, stop() {} });
  const [task] = await withRunContext(context, () => manager.spawn(session, { tasks: [{ instruction: '检查文件' }] }));
  const childContext = manager.executionFor(Session.load(task.sessionId)).context;
  const child = manager.executionFor(Session.load(task.sessionId)).session;
  withRunContext(childContext, () => manager.send(child, { agentId: session.id, kind: 'info', text: '发现证据', messageId: 'message-one' }));
  withRunContext(childContext, () => manager.send(child, { agentId: session.id, kind: 'info', text: '发现证据', messageId: 'message-one' }));
  assert.equal(withRunContext(context, () => manager.consume(session)), 1);
  const restored = new AgentManager();
  fs.appendFileSync(path.join(root, '.agent', 'task-groups', `${session.id}.jsonl`), '{incomplete\n');
  assert.equal(restored.view(session).tasks[0].status, 'interrupted');
  const loaded = Session.load(session.id);
  assert.equal(withRunContext(context, () => restored.consume(loaded)), 1); // recovery notification only
  assert.equal(withRunContext(context, () => restored.consume(loaded)), 0);
  assert.equal(restored.running, 0);
  manager.stop(session.id); await tick();
});

test('子 Agent 可回读自己长输出且仍受父工具白名单限制', async t => {
  const { session, context } = fixture(t), manager = new AgentManager();
  manager.configure({ config: () => context.config, run: async () => {}, stop() {} });
  t.after(() => manager.stop(session.id));
  const [first] = await withRunContext(context, () => manager.spawn(session, { tasks: [{ instruction: '核对日志' }] }));
  assert.ok(manager.executionFor(Session.load(first.sessionId)).context.allowedTools.includes('read_tool_output'));
  assert.equal(manager.executionFor(Session.load(first.sessionId)).context.maxSteps, null);
  assert.equal(manager.executionFor(Session.load(first.sessionId)).context.maxDurationMs, null);
  const restricted = { ...context, allowedTools: ['read_file'] };
  const [second] = await withRunContext(restricted, () => manager.spawn(session, { tasks: [{ instruction: '仅读文件' }] }));
  assert.deepEqual(manager.executionFor(Session.load(second.sessionId)).context.allowedTools, ['read_file']);
});

test('子 Agent 默认无固定预算，显式长任务配置不再被 80 轮/30 分钟夹断', () => {
  assert.ok(agentProfiles().every(p => p.maxSteps === null && p.maxDurationMs === null));
  const worker = agentProfiles({ agent: { subagents: { profiles: { worker: { maxSteps: 4000, maxDurationMs: 172800000 } } } } }).find(p => p.id === 'worker');
  assert.equal(worker.maxSteps, 4000); assert.equal(worker.maxDurationMs, 172800000);
});

test('只读限制在实际执行入口生效，模型不可直接调用隐藏的写工具', async t => {
  const { session, context } = fixture(t);
  await loadAll();
  const childContext = { ...context, readOnly: true, allowedTools: ['read_file'], sandboxPolicy: { ...context.sandboxPolicy, mode: 'read-only' } };
  await assert.rejects(withRunContext(childContext, () => executeTool(getTool('write_file'), { path: 'escape.txt', content: 'bad' }, { session, timeoutMs: 1000 })), /无权调用/);
});

test('真实循环收敛两个 mock 子 Agent，主上下文只接收结果，停止传播', async t => {
  const { root, session } = fixture(t); await loadAll(); initializeAgentRuntime();
  const events = []; const off = onEvent(event => events.push(event)); t.after(off);
  await runSequence(session, '使用子agent并行探索', []);
  const tasks = agentManager.view(session).tasks;
  assert.equal(tasks.length, 2); assert.ok(tasks.every(task => task.status === 'completed'));
  const starts = events.filter(event => event.type === 'session_run_started' && event.isSubagent);
  const finishes = events.filter(event => event.type === 'session_run_finished' && event.isSubagent);
  assert.equal(starts.length, 2); assert.ok(starts.every(start => start.ts <= Math.min(...finishes.map(f => f.ts))));
  assert.equal(Session.list().length, 1);
  assert.ok(session.entries().some(entry => entry.source === 'agent' && entry.content.includes('completed')));
  for (const task of tasks) {
    const child = Session.load(task.sessionId); assert.equal(child.parentSessionId, session.id);
    assert.ok(!child.entries().some(entry => entry.content === '使用子agent并行探索'));
    assert.deepEqual(task.result.files, []); assert.ok(task.usage.totalTokens > 0);
  }
  assert.equal(session.entries().findLast(entry => entry.type === 'turn_end').reason, 'done');
  const stopped = Session.create('取消任务'), context = contextForSession(stopped);
  let rootRun;
  const spawned = await withRunContext(context, () => agentManager.spawn(stopped, { tasks: [{ instruction: '研究 A' }, { instruction: '研究 B' }, { instruction: '研究 C' }] }));
  rootRun = runSequence(stopped, '等待结果', [], { context });
  await tick();
  assert.equal(contextForSession(stopped), context);
  stopSession(stopped.id); await rootRun;
  assert.ok(agentManager.view(stopped).tasks.every(task => task.status === 'cancelled'));
  assert.equal(spawned.length, 3); assert.ok(fs.existsSync(path.join(root, '.agent', 'task-groups', `${stopped.id}.jsonl`)));
});

test('终端保留并发子 Agent 的审批来源和队列', () => {
  let state = emptySession('root');
  state = reduceEvent(state, { type: 'permission_request', sessionId: 'child-a', rootSessionId: 'root', seq: 1, request: { reqId: 'a', sessionId: 'child-a' } });
  state = reduceEvent(state, { type: 'permission_request', sessionId: 'child-b', rootSessionId: 'root', seq: 2, request: { reqId: 'b', sessionId: 'child-b' } });
  assert.equal(state.permission.sessionId, 'child-a');
  state = reduceEvent(state, { type: 'permission_resolved', sessionId: 'child-a', rootSessionId: 'root', seq: 3, reqId: 'a' });
  assert.equal(state.permission.sessionId, 'child-b');
});

test('写入租约阻止子 worker 与主工具重叠，失败依赖不会启动', async t => {
  const { session, context } = fixture(t), manager = new AgentManager();
  let started = 0, releaseWorker;
  manager.configure({ config: () => context.config, stop() {}, run: async child => { started++; await new Promise(resolve => { releaseWorker = resolve; }); child.append({ type: 'task_summary', reason: 'error', error: '验证失败' }); } });
  const group = manager.group(session, context);
  const release = withRunContext(context, () => manager.acquireResource(group, session.id, { permission: 'L1' }));
  const [worker] = await withRunContext(context, () => manager.spawn(session, { tasks: [{ profile: 'worker', instruction: '修改指定文件' }] }));
  await tick(); assert.equal(started, 0);
  release(); await tick(); assert.equal(started, 1);
  assert.throws(withRunContext(context, () => () => manager.assertResource(group, session.id, { permission: 'L1' })), /共享目录/);
  const [dependent] = await withRunContext(context, () => manager.spawn(session, { tasks: [{ instruction: '依赖成功的产物', dependsOn: [worker.taskId] }] }));
  releaseWorker(); await withRunContext(context, () => manager.wait(session, { timeoutMs: 1000 }));
  assert.equal(group.tasks[dependent.taskId].status, 'failed'); assert.equal(started, 1);
});

test('子任务步骤预算是实际运行约束', async t => {
  const { session } = fixture(t);
  await loadAll(); initializeAgentRuntime();
  const cfg = getConfig(); cfg.agent.subagents.profiles = { worker: { maxSteps: 1 } };
  session.setMode('auto-all'); setSandboxPolicy({ ...getSandboxPolicy(), mode: 'off' });
  const context = contextForSession(session);
  const [task] = await withRunContext(context, () => agentManager.spawn(session, { tasks: [{ profile: 'worker', instruction: '创建 hello.txt' }] }));
  await withRunContext(context, () => agentManager.wait(session, { timeoutMs: 3000, ignoreBlocked: true }));
  assert.equal(task.status, 'budget_exceeded');
  assert.equal(Session.load(task.sessionId).entries().findLast(e => e.type === 'turn_end').reason, 'max_steps');
});

test('插件忽略取消时，资源租约保持到实际操作结束', async t => {
  const { session, context } = fixture(t), manager = new AgentManager();
  manager.configure({ config: () => context.config, run() {}, stop() {} });
  const group = manager.group(session, context);
  let complete;
  const scoped = { ...context, acquireResource: tool => manager.acquireResource(group, session.id, tool), assertResource: tool => manager.assertResource(group, session.id, tool) };
  const controller = new AbortController();
  const operation = withRunContext(scoped, () => executeTool({ name: 'slow-plugin', permission: 'L3', run: () => new Promise(resolve => { complete = resolve; }) }, {}, { session, signal: controller.signal, timeoutMs: 1000 }));
  controller.abort(); await assert.rejects(operation, /停止/);
  assert.throws(() => manager.assertResource(group, 'other-agent', { permission: 'L3' }), /共享资源/);
  complete({ content: 'finished' }); await tick();
  assert.doesNotThrow(() => manager.assertResource(group, 'other-agent', { permission: 'L3' }));
});
