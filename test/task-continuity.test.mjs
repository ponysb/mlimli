import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Session } from '../core/session.mjs';
import { maybeCompact, compactionPlan } from '../core/compact.mjs';
import { QualityProgress, deliveryVersion } from '../core/quality-progress.mjs';
import { sourceEvidence } from '../core/task-quality.mjs';
import { saveTaskCheckpoint, taskRecoveryState } from '../core/task-checkpoint.mjs';
import { withRunContext } from '../core/run-context.mjs';
import { completeOnce } from '../core/llm.mjs';

const summary = '## Summary\n已读取旧文件，仍需继续任务。\n## Decisions\n无\n## Files Read\n旧文件\n## Files Modified\n无\n## Commands Run\n无\n## Tools Used\n读取\n## Open TODOs\n按用户纠正继续修复。\n## Risks\n尚未验收。';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-continuity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const session = Session.create('continuity', { directory: path.join(root, '.agent', 'sessions') });
  return { root, session, run: fn => withRunContext({ executionRoot: root, sessionStorageRoot: root }, fn) };
}
const message = (session, extra) => session.append({ type: 'message', turnId: 'task', ...extra });
function oldEvidence(session, count = 20) {
  for (let n = 0; n < count; n++) {
    message(session, { role: 'assistant', toolCalls: [{ id: `old-${n}`, name: 'read_file', args: { path: 'old.txt' } }] });
    message(session, { role: 'tool', toolCallId: `old-${n}`, content: `${n}:` + '旧资料'.repeat(1500), status: 'ok' });
  }
}

test('重复压缩保留原始目标、用户纠正、完整失败组及图片，不丢工具配对', async t => {
  const { session } = fixture(t);
  const image = session.saveAttachments([{ name: 'goal.png', mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }]);
  message(session, { role: 'user', content: [{ type: 'text', text: '原始目标：按参考图交付，保留退款逻辑' }, ...image] });
  session.append({ type: 'turn_start', turnId: 'task', prompt: '原始目标' });
  oldEvidence(session);
  message(session, { role: 'user', content: '用户最新纠正：不能删除退款功能' });
  const calls = [{ id: 'failed', name: 'bash', args: { command: 'npm test' } }, { id: 'sibling', name: 'read_file', args: { path: 'a.txt' } }];
  message(session, { role: 'assistant', toolCalls: calls });
  message(session, { role: 'tool', toolCallId: 'failed', status: 'error', content: '真实失败：退款金额错误' });
  message(session, { role: 'tool', toolCallId: 'sibling', status: 'ok', content: '同组完整回复' });
  for (let n = 0; n < 2; n++) {
    await maybeCompact(session, { contextWindow: 16000 }, { force: true, complete: async ({ requireComplete }) => { assert.equal(requireComplete, true); return summary; } });
    const messages = session.messages({ contextWindow: 16000 });
    assert.ok(messages.some(item => Array.isArray(item.content) && item.content.some(part => part.type === 'image' && part.dataUrl)));
    assert.ok(messages.some(item => item.content === '用户最新纠正：不能删除退款功能'));
    assert.ok(messages.some(item => item.toolCallId === 'failed' && item.content === '真实失败：退款金额错误'));
    const callIndex = messages.findIndex(item => item.toolCalls?.some(call => call.id === 'failed'));
    assert.deepEqual(messages.slice(callIndex + 1, callIndex + 3).map(item => item.toolCallId), ['failed', 'sibling']);
    assert.ok(session.entries().some(item => item.toolCallId === 'old-0'), '磁盘原历史保持');
    oldEvidence(session, 8);
  }
});

test('摘要辅助请求联合预算覆盖巨大工具参数，近期归档优先，小窗口不静默丢目标', async t => {
  const { session } = fixture(t);
  message(session, { role: 'user', content: '必须保留的目标' });
  session.append({ type: 'turn_start', turnId: 'task', prompt: '目标' });
  message(session, { role: 'assistant', toolCalls: [{ id: 'big', name: 'write_file', args: { content: 'x'.repeat(150000) } }] });
  message(session, { role: 'tool', toolCallId: 'big', content: '已写入' });
  oldEvidence(session);
  message(session, { role: 'assistant', text: 'RECENT_ARCHIVE_MARKER' });
  oldEvidence(session, 7);
  const cfg = { contextWindow: 8000 };
  const plan = compactionPlan(session, cfg);
  assert.ok(plan.selected.some(row => row.content === 'RECENT_ARCHIVE_MARKER'));
  await maybeCompact(session, cfg, { force: true, complete: async request => {
    assert.ok(request.messages[0].content.length <= plan.inputChars);
    assert.ok(request.messages[0].content.length / 4 + request.maxOutputTokens < cfg.contextWindow * 0.7);
    return summary;
  } });
  assert.ok(session.messages({ contextWindow: 8000 }).some(row => row.content === '必须保留的目标'));
  message(session, { role: 'user', content: '不能丢弃'.repeat(10000) });
  await assert.rejects(maybeCompact(session, cfg, { force: true, complete: async () => summary }), { code: 'CONTEXT_COMPACTION_FAILED' });
  assert.throws(() => session.messages({ contextWindow: 8000 }), { code: 'CONTEXT_COMPACTION_FAILED' });
  assert.equal(session.snapshot(8000).context.blocked, true, '上下文受阻仍能加载界面并调整模型');
});

test('损坏、截断、并发追加和用户停止时不能发布失真的压缩条目', async t => {
  const { session } = fixture(t); oldEvidence(session);
  const attempts = [];
  await assert.rejects(maybeCompact(session, {}, { force: true, complete: async () => { attempts.push(1); return '全部成功'; } }), { code: 'CONTEXT_COMPACTION_FAILED' });
  assert.equal(attempts.length, 2);
  assert.equal(session.entries().filter(row => row.type === 'compaction').length, 0);
  const stale = await maybeCompact(session, {}, { force: true, complete: async () => { message(session, { role: 'user', content: '并发追加的最新要求' }); return summary; } });
  assert.equal(stale.stale, true);
  assert.equal(session.entries().filter(row => row.type === 'compaction').length, 0);
  const controller = new AbortController();
  await assert.rejects(maybeCompact(session, {}, { force: true, signal: controller.signal, complete: async () => { controller.abort(); return summary; } }));
  assert.equal(session.entries().filter(row => row.type === 'compaction').length, 0);
});

test('旧压缩会话兼容，无任务 ID 的旧多轮目标只保护近期用户消息', async t => {
  const { session } = fixture(t);
  for (let n = 0; n < 12; n++) session.append({ type: 'message', role: 'user', content: '旧目标'.repeat(200) });
  const plan = compactionPlan(session, { contextWindow: 16000 });
  assert.ok(plan.archivedCount > 0);
  session.append({ type: 'compaction', summary: '旧格式摘要' });
  session.append({ type: 'message', role: 'user', content: '新问题' });
  assert.deepEqual(session.messages().map(row => row.content), ['[以下是之前对话的压缩摘要，完整历史已存档]\n\n旧格式摘要', '新问题']);
});

test('产物真实变化可以继续超过三次修复，源码及测试变化纳入进展', t => {
  const { root, run } = fixture(t);
  run(() => {
    const progress = new QualityProgress();
    for (let n = 0; n < 6; n++) {
      fs.writeFileSync(path.join(root, 'main.mjs'), `export const value=${n};`);
      fs.writeFileSync(path.join(root, 'public.test.mjs'), `// 新测试版本 ${n}`);
      const observed = progress.observe({ missing: ['缺少实际测试'], checks: [] }, [deliveryVersion(['main.mjs']), sourceEvidence()]);
      assert.equal(observed.progress, true); assert.equal(observed.blocked, false);
    }
    assert.equal(progress.attempts, 6);
  });
});

test('相同失败和版本循环先换策略再阻塞，恢复不会重置停滞状态', () => {
  const quality = { missing: ['实际验收失败'], checks: [] };
  const progress = new QualityProgress({ noProgressThreshold: 2 });
  for (const version of ['A', 'B', 'A']) assert.equal(progress.observe(quality, version).blocked, false);
  assert.equal(progress.observe(quality, 'B').changeStrategy, true);
  const restored = new QualityProgress({ noProgressThreshold: 2, saved: progress.snapshot() });
  assert.equal(restored.observe(quality, 'A').blocked, true);
  assert.equal(restored.observe(quality, 'C').blocked, false, '真实新版本仍能推进');
});

test('检查点重载保留目标、未知副作用、句柄、用量和已消耗预算，不保存文件正文', t => {
  const { root, session, run } = fixture(t);
  session.append({ type: 'turn_start', turnId: 'task', prompt: '写入成品并交付' });
  run(() => saveTaskCheckpoint(session, { turnId: 'task', phase: 'working', baseline: [{ path: 'a.txt', size: 3, modified: 12 }], stepCount: 1, activeDurationMs: 90 }));
  session.append({ type: 'tool_start', turnId: 'task', callId: 'completed', name: 'write_file' });
  session.append({ type: 'tool_end', turnId: 'task', callId: 'completed', name: 'write_file', status: 'ok' });
  session.append({ type: 'tool_start', turnId: 'task', callId: 'uncertain', name: 'bash' });
  session.append({ type: 'step_start', turnId: 'task', step: 2 });
  const checkpoint = run(() => saveTaskCheckpoint(session, { turnId: 'task', phase: 'tool_pending', stepCount: 2, activeDurationMs: 120, usage: { promptTokens: 30, completionTokens: 10 }, externalHandle: { tool: 'video', jobId: 'job-123' } }));
  const loaded = Session.load(session.id, session.directory), recovery = taskRecoveryState(loaded);
  assert.equal(recovery.checkpointId, checkpoint.id); assert.equal(recovery.stepCount, 3);
  assert.equal(recovery.executionRoot, root); assert.equal(recovery.activeDurationMs, 120);
  assert.deepEqual(recovery.unknownActions.map(row => row.callId), ['uncertain']);
  assert.equal(recovery.externalHandles[0].jobId, 'job-123'); assert.equal(recovery.usage.promptTokens, 30);
  assert.equal(recovery.baseline[0].lines, undefined);
  session.append({ type: 'turn_end', turnId: 'task', reason: 'done' });
  assert.equal(taskRecoveryState(Session.load(session.id, session.directory)).available, false);
});

test('三种非流模型协议的截断摘要被拒绝，完整摘要正常返回', async t => {
  const { run, session } = fixture(t);
  let payload;
  const provider = http.createServer((req, res) => { req.resume(); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(payload)); });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  t.after(async () => { provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); });
  for (const [protocol, incomplete, complete] of [
    ['openai-chat', { choices: [{ message: { content: summary }, finish_reason: 'length' }] }, { choices: [{ message: { content: summary }, finish_reason: 'stop' }] }],
    ['anthropic', { content: [{ type: 'text', text: summary }], stop_reason: 'max_tokens' }, { content: [{ type: 'text', text: summary }], stop_reason: 'end_turn' }],
    ['openai-responses', { status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: summary }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: summary }] }] }],
  ]) {
    const request = { sessionId: session.id, messages: [{ role: 'user', content: '摘要' }], requireComplete: true, modelSelection: { provider: { protocol, baseUrl: `http://127.0.0.1:${provider.address().port}` }, model: { model: 'fixture' } } };
    payload = incomplete; await assert.rejects(run(() => completeOnce(request)), /不完整/);
    payload = complete; assert.equal(await run(() => completeOnce(request)), summary);
  }
});
