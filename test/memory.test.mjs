import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setConfig, getConfig } from '../core/llm.mjs';
import { withRunContext } from '../core/run-context.mjs';
import { memoryLocations, saveMemory, listMemories, getMemory, deleteMemory, approveMemory, restoreMemory, createMemorySnapshot, recordMemoryRecall, searchMemories } from '../core/memory.mjs';
import { updateMemorySettings } from '../core/memory-policy.mjs';
import { MemoryLearner } from '../core/memory-learning.mjs';
import { searchHistory } from '../core/memory-history.mjs';
import { buildSystemPrompt } from '../core/prompts.mjs';
import { executeTool, getTools, loadAll } from '../core/plugins.mjs';
import { coreTools } from '../core/tools.mjs';
import { Session } from '../core/session.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-memory-'));
  const context = { sessionStorageRoot: path.join(root, 'project-a'), memoryDataRoot: root, executionRoot: path.join(root, 'execution'), sandboxPolicy: { mode: 'off' }, modelSelection: { provider: { protocol: 'openai' } } };
  const config = JSON.parse(fs.readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'));
  setConfig(config);
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return { root, context, run: fn => withRunContext(context, fn) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settled(learner) { for (let i = 0; i < 100 && (learner.active || learner.queue.length); i++) await tick(); assert.equal(learner.active, null); }
function learningSession(root) {
  const session = Session.create('学习测试', { directory: path.join(root, '.agent', 'sessions') });
  const user = session.append({ type: 'message', role: 'user', turnId: 'turn-1', content: '以后请始终使用中文回答，并简洁说明测试结果。' });
  const tool = session.append({ type: 'tool_end', turnId: 'turn-1', name: 'bash', status: 'ok', content: 'npm test: 18 passed, no failures' });
  session.append({ type: 'message', role: 'assistant', turnId: 'turn-1', content: '我猜所有功能都很可靠，今后直接发布。' });
  const summary = session.append({ type: 'task_summary', turnId: 'turn-1', reason: 'done' });
  return { session, user, tool, summary };
}
const preference = user => ({ scope: 'global', kind: 'preference', title: '沟通偏好', content: '使用中文回答，并简洁说明测试结果。', evidence: [{ entryId: user.id, quote: '始终使用中文回答' }] });

test('兼容旧记忆数组，损坏的数据保留且禁止覆盖', t => {
  const { run } = fixture(t);
  run(() => {
    const file = memoryLocations().project; fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify([{ id: 'legacy', title: '构建', content: '运行 npm test', tags: [] }]));
    assert.equal(getMemory('legacy').revision, 1);
    saveMemory({ id: 'legacy', expectedRevision: 1, content: '运行 npm run check' });
    assert.equal(JSON.parse(fs.readFileSync(file)).version, 2);
    fs.writeFileSync(file, '{broken');
    assert.throws(() => saveMemory({ content: '不要丢数据' }), /原文件已保留/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
    assert.equal(fs.existsSync(file + '.lock'), false);
  });
});

test('全局偏好跨项目复用，项目和子 Agent 执行目录隔离', t => {
  const { root, context, run } = fixture(t);
  const global = run(() => saveMemory({ scope: 'global', kind: 'preference', content: '中文回答' }));
  const local = run(() => saveMemory({ title: 'A 项目', content: '项目 A 使用 pnpm' }));
  withRunContext({ ...context, sessionStorageRoot: path.join(root, 'project-b') }, () => {
    assert.equal(getMemory(global.id, 'global').content, '中文回答');
    assert.equal(getMemory(local.id), null);
    saveMemory({ content: '项目 B 使用 npm' });
  });
  run(() => { assert.equal(listMemories().length, 1); assert.equal(fs.existsSync(path.join(context.executionRoot, '.agent')), false); });
});

test('记忆存储拒绝符号链接逃出项目范围', t => {
  const { root, context, run } = fixture(t);
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.mkdirSync(context.sessionStorageRoot);
  fs.symlinkSync(outside, path.join(context.sessionStorageRoot, '.agent'), process.platform === 'win32' ? 'junction' : 'dir');
  run(() => assert.throws(() => saveMemory({ content: '越界写入' }), /路径越界/));
  assert.equal(fs.existsSync(path.join(outside, 'memory.json')), false);
});

test('版本冲突、替换提案审核、版本恢复和删除', t => {
  const { run } = fixture(t);
  run(() => {
    const original = saveMemory({ title: '工具', content: '使用 npm' });
    const proposal = saveMemory({ title: '工具', content: '使用 pnpm', status: 'pending', supersedesId: original.id, baseRevision: 1 });
    assert.equal(searchMemories('pnpm').length, 0);
    assert.throws(() => saveMemory({ id: proposal.id, status: 'active' }), /审核入口/);
    const approved = approveMemory(proposal.id, 'project', 1);
    assert.equal(approved.id, original.id); assert.equal(approved.revision, 2); assert.equal(getMemory(proposal.id), null);
    assert.throws(() => saveMemory({ id: original.id, content: '覆盖', expectedRevision: 1 }), error => error.status === 409);
    const restored = restoreMemory(original.id, 'project', 1, 2);
    assert.equal(restored.content, '使用 npm'); assert.equal(restored.revision, 3);
    const stale = saveMemory({ content: '使用 yarn', status: 'pending', supersedesId: original.id, baseRevision: 3 });
    saveMemory({ id: original.id, content: '用户的新要求', expectedRevision: 3 });
    assert.throws(() => approveMemory(stale.id, 'project', 1), error => error.status === 409);
    assert.equal(getMemory(original.id).content, '用户的新要求');
    deleteMemory(original.id, 'project', 4); assert.equal(getMemory(original.id), null);
  });
});

test('去重、凭据脱敏和正文预算；同轮冻结，下轮更新', t => {
  const { context, run } = fixture(t);
  run(() => {
    const saved = saveMemory({ title: '构建', content: '构建步骤 npm test', tags: ['password=secret123'], evidence: 'api_key=secret123' });
    assert.equal(saveMemory({ content: saved.content }).id, saved.id);
    assert.ok(!JSON.stringify(getMemory(saved.id)).includes('secret123'));
    for (let i = 0; i < 12; i++) saveMemory({ title: `记忆 ${i}`, content: `构建${i} ` + '内容'.repeat(1000), pinned: true });
    saveMemory({ content: '构建停用内容', status: 'archived' });
    const snapshot = createMemorySnapshot('构建'); assert.ok(snapshot.body.length < 6650); assert.ok(snapshot.ids.length <= 8);
    assert.ok(!snapshot.body.includes('构建停用内容'));
    recordMemoryRecall(snapshot); assert.equal(getMemory(snapshot.ids[0].id).useCount, 1);
    saveMemory({ scope: 'global', kind: 'preference', content: '偏好原内容' });
    const frozen = createMemorySnapshot('构建');
    saveMemory({ scope: 'global', kind: 'preference', content: '偏好新内容' });
    withRunContext({ ...context, memorySnapshot: frozen }, () => assert.ok(!buildSystemPrompt({}).includes('偏好新内容')));
    assert.ok(buildSystemPrompt({}).includes('偏好新内容'));
  });
});

test('关闭后隐藏记忆工具、拒绝直接执行、取消提示注入，仍可手动管理', async t => {
  const { run } = fixture(t); await loadAll();
  await run(async () => {
    saveMemory({ content: '需要忘掉的正文', pinned: true });
    updateMemorySettings({ enabled: false });
    assert.ok(!getTools({ id: 'root' }).some(tool => /memor|search_history/.test(tool.name)));
    assert.ok(!getTools().some(tool => /memor|search_history/.test(tool.name)));
    assert.ok(!buildSystemPrompt({}).includes('需要忘掉的正文'));
    await assert.rejects(executeTool(coreTools.find(tool => tool.name === 'read_memory'), { id: 'anything' }, { session: { id: 'root' }, timeoutMs: 1000 }), /已关闭/);
    saveMemory({ content: '手动管理仍然可用' }); assert.equal(listMemories().length, 2);
    updateMemorySettings({ enabled: true, historyEnabled: false });
    assert.ok(getTools().some(tool => tool.name === 'read_memory')); assert.ok(!getTools().some(tool => tool.name === 'search_history'));
    assert.throws(() => searchHistory('中文'), /已关闭/);
  });
});

test('前台工具只接受白名单参数，审核更新绑定读取版本', async t => {
  const { run } = fixture(t);
  await run(async () => {
    const tool = coreTools.find(tool => tool.name === 'write_memory');
    const target = saveMemory({ content: '旧内容' });
    await tool.run({ title: '新条目', content: '新内容', evidence: '用户要求', supersedesId: target.id, baseRevision: 1, pinned: true, confidence: 'user_confirmed' }, { session: { id: 'root' } });
    const created = listMemories().find(item => item.title === '新条目');
    assert.equal(created.supersedesId, undefined); assert.equal(created.pinned, false); assert.equal(created.confidence, 'observed');
    updateMemorySettings({ reviewBeforeSave: true });
    await tool.run({ id: target.id, title: '更新', content: '待审核内容', evidence: '纠正', expectedRevision: 1 }, { session: { id: 'root' } });
    assert.equal(getMemory(target.id).content, '旧内容');
    assert.equal(listMemories({ status: 'pending' })[0].baseRevision, 1);
    await assert.rejects(tool.run({ id: target.id, title: '更新', content: '过期', evidence: '纠正', expectedRevision: 999 }, { session: {} }), /刷新/);
    await assert.rejects(tool.run({ title: '缺依据', content: '未经验证' }, { session: {} }), /evidence/);
    await assert.rejects(coreTools.find(tool => tool.name === 'delete_memory').run({ id: target.id }), /expectedRevision/);
  });
});

test('历史检索仅当前项目的根会话、真实消息，带来源且脱敏', t => {
  const { context, run } = fixture(t);
  run(() => {
    const directory = path.join(context.sessionStorageRoot, '.agent', 'sessions');
    const root = Session.create('历史', { directory });
    root.append({ type: 'message', role: 'user', content: '部署服务器 password=secret123' });
    root.append({ type: 'message', role: 'user', source: 'agent', content: '部署协作汇总' });
    const child = Session.create('隐藏', { directory, parentSessionId: root.id });
    child.append({ type: 'message', role: 'user', content: '部署子任务' });
    const hits = searchHistory('部署'); assert.equal(hits.length, 1); assert.equal(hits[0].sessionId, root.id); assert.ok(!hits[0].snippet.includes('secret123'));
    assert.equal(searchHistory('部署', { excludeSessionId: root.id }).length, 0);
    assert.throws(() => searchHistory('部署', { sessionId: '../bad' }), /无效/);
  });
});

test('自动沉淀真正调用提炼器，校验证据、去除猜测和内部参数', async t => {
  const { context, run } = fixture(t); const { session, user, tool, summary } = learningSession(context.sessionStorageRoot);
  const learner = new MemoryLearner({ complete: async request => {
    assert.equal(request.maxOutputTokens, 1800); assert.ok(!request.messages[0].content.includes('我猜所有功能'));
    return JSON.stringify({ memories: [{ ...preference(user), id: 'overwrite', pinned: true }, { scope: 'project', kind: 'lesson', title: '无依据', content: '今后直接发布', evidence: [{ entryId: tool.id, quote: '伪造成功结果' }] }, { ...preference(tool), title: '不能全局保存工具推断', evidence: [{ entryId: tool.id, quote: '18 passed' }] }] });
  } }); t.after(() => learner.dispose());
  run(() => learner.enqueue(session, summary, context)); await settled(learner);
  run(() => { const items = listMemories({ scope: 'all' }); assert.equal(items.length, 1); assert.equal(items[0].source, 'auto'); assert.notEqual(items[0].id, 'overwrite'); assert.equal(items[0].pinned, false); assert.equal(items[0].origin.entryIds[0], user.id); });
  assert.equal(learner.status(context.sessionStorageRoot)[0].status, 'completed');
  assert.equal(run(() => learner.enqueue(session, summary, context)), undefined);
});

test('后台纠正总是待审核；开关或手动编辑使在途结果失效', async t => {
  const { context, run } = fixture(t); const { session, user, summary } = learningSession(context.sessionStorageRoot);
  run(() => saveMemory({ scope: 'global', kind: 'preference', title: '沟通偏好', content: '英文回答' }));
  const learner = new MemoryLearner({ complete: async () => JSON.stringify({ memories: [preference(user)] }) }); t.after(() => learner.dispose());
  run(() => learner.enqueue(session, summary, context)); await settled(learner);
  run(() => { assert.equal(listMemories({ scope: 'global', status: 'active' })[0].content, '英文回答'); assert.equal(listMemories({ scope: 'global', status: 'pending' }).length, 1); });
  for (const invalidate of [() => updateMemorySettings({ autoLearn: false }), () => run(() => saveMemory({ content: '用户手动修改' }))]) {
    updateMemorySettings({ autoLearn: true });
    let release; const delayed = new MemoryLearner({ complete: () => new Promise(resolve => { release = resolve; }) }); t.after(() => delayed.dispose());
    const second = learningSession(context.sessionStorageRoot);
    run(() => delayed.enqueue(second.session, second.summary, context)); assert.equal(typeof release, 'function');
    invalidate(); release(JSON.stringify({ memories: [{ ...preference(second.user), title: '过期结果' }] })); await settled(delayed);
    assert.equal(delayed.status(context.sessionStorageRoot)[0].status, 'cancelled');
    run(() => assert.ok(!listMemories({ scope: 'all' }).some(item => item.title === '过期结果')));
  }
});

test('mock、子任务和未完成任务不回顾；失败和重启保持任务独立', async t => {
  const { context, run } = fixture(t); const { session, summary } = learningSession(context.sessionStorageRoot);
  const learner = new MemoryLearner({ complete: async () => { throw new Error('模型无法连接'); } }); t.after(() => learner.dispose());
  for (const patch of [{ taskId: 'child' }, { modelSelection: { provider: { protocol: 'mock' } } }]) assert.equal(run(() => learner.enqueue(session, summary, { ...context, ...patch })), undefined);
  assert.equal(run(() => learner.enqueue(session, { ...summary, reason: 'aborted' }, context)), undefined);
  run(() => learner.enqueue(session, summary, context)); await settled(learner);
  assert.equal(learner.status(context.sessionStorageRoot)[0].status, 'failed');
  const file = path.join(context.sessionStorageRoot, '.agent', 'memory-learning.json');
  fs.writeFileSync(file, JSON.stringify({ jobs: [{ id: 'unfinished', status: 'running' }] }));
  const restarted = new MemoryLearner(); assert.equal(restarted.status(context.sessionStorageRoot)[0].status, 'interrupted'); restarted.dispose();
  run(() => assert.equal(listMemories({ scope: 'all' }).length, 0));
});
