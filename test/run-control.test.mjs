import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { RunControl, runStatePrompt, runLimits, runDeadline } from '../core/run-control.mjs';
import { prepareToolOutput, readToolOutput } from '../core/tool-output.mjs';
import { Session } from '../core/session.mjs';
import { createRunContext, withRunContext } from '../core/run-context.mjs';
import { getWorkspaceRoot, setWorkspaceRoot } from '../core/paths.mjs';
import { buildSystemPrompt } from '../core/prompts.mjs';
import { buildRequest, setConfig, resolveModelSelection } from '../core/llm.mjs';
import { loadAll, disposePlugins, getTool, executeTool } from '../core/plugins.mjs';
import { runTurn, setLoopConfig, abortRun } from '../core/loop.mjs';
import { saveTaskCheckpoint, taskRecoveryState } from '../core/task-checkpoint.mjs';
import { parseOpenAIStream, parseResponsesStream, parseAnthropicStream, assembleToolCalls } from '../core/stream.mjs';

function workspace(t) {
  const previous = getWorkspaceRoot(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-control-'));
  setWorkspaceRoot(root);
  t.after(() => { setWorkspaceRoot(previous); fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return root;
}

test('重复参数需要结果也相同才告警，变化与成功写入清除提示', () => {
  const control = new RunControl({ config: {}, maxSteps: 10, maxDurationMs: 10000 });
  const read = { name: 'read_file', permission: 'L0' };
  const result = { content: 'unchanged', status: 'ok' };
  assert.equal(control.observe(read, { b: 2, a: 1 }, result), null);
  assert.equal(control.observe(read, { a: 1, b: 2 }, result), null);
  assert.equal(control.observe(read, { a: 1, b: 2 }, result)?.kind, 'repeated_result');
  assert.equal(control.observe(read, { a: 1, b: 2 }, result), null, '相同无进展周期只提醒一次');
  assert.equal(control.observe(read, { a: 1, b: 2 }, { content: 'changed', status: 'ok' }), null);
  assert.equal(control.state(1).warning, '');
  control.observe(read, { a: 1, b: 2 }, { content: 'changed', status: 'ok' });
  control.observe(read, { a: 1, b: 2 }, { content: 'changed', status: 'ok' });
  control.observe({ name: 'write_file', permission: 'L1' }, {}, { status: 'ok', content: 'written' });
  assert.equal(control.state(1).warning, '');
});

test('步数和时间触发收尾，关闭后没有预算提示，也不改变原上限', () => {
  const control = new RunControl({ config: {}, maxSteps: 20, maxDurationMs: 10000, startedAt: 1000, now: () => 2000 });
  assert.equal(control.state(16).wrapUp, false); assert.equal(control.state(17).wrapUp, true);
  assert.equal(control.state(17).remainingSteps, 3); assert.equal(control.state(17).remainingSeconds, 9);
  assert.match(runStatePrompt(control.state(17)), /不得降低验收标准/);
  control.now = () => 9500; assert.equal(control.state(2).wrapUp, true);
  const disabled = new RunControl({ config: { agent: { runControl: { enabled: false } } }, maxSteps: 20, maxDurationMs: 10000 });
  assert.equal(disabled.state(19), null);
});

test('默认无限任务预算、显式上下文覆盖和单维预算提示', () => {
  assert.deepEqual(runLimits(undefined, {}), { maxSteps: null, maxDurationMs: null });
  assert.deepEqual(runLimits({ maxSteps: null, maxDurationMs: 0 }, { agent: { maxSteps: 100, maxDurationMs: 1800000 } }), { maxSteps: null, maxDurationMs: null });
  assert.deepEqual(runLimits({}, { agent: { maxSteps: 4000, maxDurationMs: 172800000 } }), { maxSteps: 4000, maxDurationMs: 172800000 });
  const unlimited = new RunControl({ config: {}, startedAt: 0, now: () => 48 * 3600000 });
  const state = unlimited.state(20000);
  assert.equal(state.wrapUp, false); assert.equal(state.remainingSteps, null); assert.equal(state.remainingSeconds, null);
  assert.match(runStatePrompt(state), /未设置固定轮数和总时长上限/);
  assert.doesNotMatch(runStatePrompt(state), /Infinity|NaN|剩余模型轮数|剩余时间/);
  const timed = new RunControl({ config: {}, maxDurationMs: 10000, startedAt: 0, now: () => 9000 });
  assert.equal(timed.state(1000).wrapUp, true);
  assert.doesNotMatch(runStatePrompt(timed.state(1000)), /剩余模型轮数/);
});

test('未配置时不创建任务截止计时器，超长显式时限分段等待且可取消', () => {
  let time = 0, timerCallback, expired = 0, clears = 0;
  const delays = [], clock = { now: () => time, setTimer: (fn, delay) => { timerCallback = fn; delays.push(delay); return 1; }, clearTimer: () => { clears++; } };
  runDeadline(() => expired++, null, clock)();
  assert.deepEqual(delays, []);
  const cancel = runDeadline(() => expired++, 2147483647 + 5000, clock);
  assert.deepEqual(delays, [2147483647]);
  time = 2147483647; timerCallback(); assert.deepEqual(delays, [2147483647, 5000]);
  time += 5000; timerCallback(); assert.equal(expired, 1); cancel(); assert.equal(clears, 1);
  const cancelAgain = runDeadline(() => expired++, 1000, clock);
  cancelAgain(); time += 1000; timerCallback(); assert.equal(expired, 1);
});

test('长输出保留头尾和失败退出码，可分页回读且不能跨会话或传路径', t => {
  workspace(t); const session = Session.create('output'), other = Session.create('other');
  const text = 'BEGIN\n' + 'x'.repeat(30000) + '\nTEST_FAILURE_AT_END';
  const result = prepareToolOutput(session, { content: text, status: 'error', exitCode: 7, structuredContent: { terminated: true, reward: 0 } }, { turnId: 't' });
  assert.ok(result.content.length <= 12000); assert.match(result.content, /"exitCode":7/); assert.match(result.content, /TEST_FAILURE_AT_END/);
  assert.match(result.content, /read_tool_output/);
  const read = readToolOutput(session, { outputId: result.output.outputId, offset: 29000, limit: 8000 });
  assert.match(read.content, /TEST_FAILURE_AT_END/); assert.match(read.content, /"storageComplete":true/);
  assert.throws(() => readToolOutput(other, { outputId: result.output.outputId }), /当前会话不存在/);
  assert.throws(() => readToolOutput(session, { outputId: '../config.json' }), /无效/);
  assert.throws(() => readToolOutput(session, { outputId: result.output.outputId, limit: 9000 }), /1–8000/);
  assert.equal(session.messages().length, 0, '完整输出不直接进入模型上下文');
  assert.ok(fs.statSync(session.file).size < 1500, '会话/API 只携带引用，不反复携带完整输出');
});

test('单输出和单轮存储有上限，不冒充全部已保存，随会话删除清理', t => {
  workspace(t); const session = Session.create('bounded');
  const oversized = { content: 'a'.repeat(1100000), status: 'ok' };
  const first = prepareToolOutput(session, oversized, { turnId: 't' });
  assert.equal(first.output.storedChars, 1024 * 1024); assert.match(first.content, /超限部分未保存/);
  for (let i = 0; i < 3; i++) prepareToolOutput(session, oversized, { turnId: 't' });
  assert.equal(prepareToolOutput(session, oversized, { turnId: 't' }).output, undefined);
  const output = readToolOutput(session, { outputId: first.output.outputId });
  assert.match(output.content, /"storageComplete":false/);
  Session.remove(session.id); assert.equal(fs.existsSync(session.file), false);
  assert.equal(fs.existsSync(path.join(path.dirname(session.file), `${session.id}-tool-outputs`)), false);
});

test('输出引用随 fork 和工作区迁移复制，损坏与符号链接逃逸被拒绝', t => {
  const root = workspace(t), session = Session.create('portable');
  const result = prepareToolOutput(session, { content: 'p'.repeat(16000) + 'TAIL', status: 'ok' }, { turnId: 't' });
  const args = { outputId: result.output.outputId, offset: 15990 };
  const fork = session.fork(); assert.match(readToolOutput(fork, args).content, /TAIL/);
  const destination = path.join(root, 'moved'); session.moveToWorkspace(destination);
  const moved = Session.load(session.id, path.join(destination, '.agent', 'sessions'));
  assert.match(readToolOutput(moved, args).content, /TAIL/);
  const file = path.join(path.dirname(fork.file), `${fork.id}-tool-outputs`, `${args.outputId}.txt`);
  fs.writeFileSync(file, 'tampered'); assert.throws(() => readToolOutput(fork, args), /已改变或损坏/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-output-outside-')); t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.unlinkSync(file); fs.symlinkSync(path.join(outside, 'private.txt'), file, process.platform === 'win32' ? 'file' : undefined);
  fs.writeFileSync(path.join(outside, 'private.txt'), 'private');
  assert.throws(() => readToolOutput(fork, args), /越界/);
});

test('远端执行环境在并发上下文中隔离，声明不改变允许工具与沙箱', async t => {
  workspace(t); const session = Session.create('env');
  const run = platform => { const context = createRunContext({ session, config: { memory: { enabled: false } }, executionEnvironment: { type: 'container', platform, cwd: '/app', runtimes: ['/bin/sh'] }, allowedTools: ['remote_exec'], sandboxPolicy: { mode: 'read-only', networkAccess: false } });
    return withRunContext(context, async () => { await new Promise(resolve => setImmediate(resolve)); return { prompt: buildSystemPrompt({}), context }; }); };
  const [linux, second] = await Promise.all([run('Linux-one'), run('Linux-two')]);
  assert.match(linux.prompt, /系统：Linux-one/); assert.ok(!linux.prompt.includes('系统：Linux-two'));
  assert.match(second.prompt, /系统：Linux-two/); assert.match(linux.prompt, /宿主仅承载 MLI/);
  assert.deepEqual(linux.context.allowedTools, ['remote_exec']); assert.equal(linux.context.sandboxPolicy.mode, 'read-only');
});

test('三种模型流协议都保留输出截断信号，非法工具 JSON 不降级执行', async () => {
  const collect = async (parser, frames) => { const events = []; for await (const event of parser(new Response(frames.map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('')))) events.push(event); return events; };
  assert.ok((await collect(parseOpenAIStream, [{ choices: [{ delta: {}, finish_reason: 'length' }] }])).some(e => e.type === 'done' && e.reason === 'length'));
  assert.ok((await collect(parseResponsesStream, [{ type: 'response.incomplete', response: { status: 'incomplete', usage: { output_tokens: 2 } } }])).some(e => e.type === 'done' && e.reason === 'incomplete'));
  assert.ok((await collect(parseAnthropicStream, [{ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, { type: 'message_stop' }])).some(e => e.type === 'done' && e.reason === 'max_tokens'));
  for (const argsChunk of ['{"path":', 'null', '[]', '1']) assert.ok(Object.hasOwn(assembleToolCalls([{ type: 'tool_start', index: 0, name: 'write_file', id: 'bad' }, { type: 'tool_delta', index: 0, argsChunk }])[0].args, '_raw'));
  for (const parser of [parseOpenAIStream, parseResponsesStream, parseAnthropicStream]) assert.ok((await collect(parser, [])).some(e => e.type === 'done' && e.reason === 'incomplete'), '流没有正式结束信号不能当完整响应');
});

test('输出预算使用对应协议字段；缺省不额外限制、不注入未知推理参数', () => {
  for (const [protocol, name, field] of [['openai-chat', 'deepseek', 'max_tokens'], ['openai-chat', 'gpt-6', 'max_completion_tokens'], ['openai-responses', 'model', 'max_output_tokens'], ['anthropic', 'claude', 'max_tokens']]) {
    const body = buildRequest({ protocol, baseUrl: 'http://localhost' }, { model: name }, [], '', [], true, 2048).body;
    assert.equal(body[field], 2048); assert.equal(body.reasoning, undefined);
  }
  assert.equal(buildRequest({ protocol: 'openai-chat', baseUrl: 'http://localhost' }, { model: 'deepseek' }, [], '', [], true).body.max_tokens, undefined);
});

async function loopFixture(t, respond, { maxSteps = 12, maxDurationMs = 20000, quality = false, runControl, allowedTools = ['read_file', 'write_file', 'read_tool_output'] } = {}) {
  const root = workspace(t), seen = [];
  fs.writeFileSync(path.join(root, 'input.txt'), 'stable');
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); seen.push(body); const response = await respond(body, seen.length);
    const calls = response.call ? [{ index: 0, id: `call-${seen.length}`, type: 'function', function: { name: response.call.name, arguments: response.call.raw ?? JSON.stringify(response.call.args) } }] : undefined;
    res.setHeader('content-type', 'text/event-stream');
    const usageFrames = (response.usages || []).map(usage => 'data: ' + JSON.stringify({ choices: [], usage }) + '\n\n').join('');
    res.end('data: ' + JSON.stringify({ choices: [{ delta: calls ? { tool_calls: calls } : { content: response.text || '已核对结果。' }, finish_reason: response.reason || (calls ? 'tool_calls' : 'stop') }] }) + '\n\n' + usageFrames + 'data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { disposePlugins(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const config = { providers: [{ id: 'p', name: 'fixture', protocol: 'openai-chat', baseUrl: `http://127.0.0.1:${server.address().port}` }], models: [{ id: 'm', providerId: 'p', model: 'fixture', contextWindow: 128000 }], activeModelId: 'm', account: { enabled: false }, memory: { enabled: false }, agent: { maxSteps, maxDurationMs, runControl, quality: { enabled: quality, noProgressThreshold: 3 }, subagents: { enabled: false } } };
  setConfig(config); setLoopConfig(config); await loadAll({ reload: true });
  const session = Session.create('loop fixture'); session.setMode('auto-all');
  const context = createRunContext({ session, config, modelSelection: resolveModelSelection(), sandboxPolicy: { mode: 'off' }, allowedTools });
  return { root, session, seen, run: prompt => withRunContext(context, () => runTurn(session, prompt)),
    resume: () => { const loaded = Session.load(session.id, session.directory); return withRunContext(context, () => runTurn(loaded, '', [], { resumeCheckpointId: taskRecoveryState(loaded).checkpointId })); },
    checkpoint: state => withRunContext(context, () => saveTaskCheckpoint(session, { ...state, turnId: session.entries().findLast(entry => entry.type === 'turn_start').turnId })) };
}

test('恢复重载会话沿用原 turn、用量和轮数，已写入文件不自动重放', async t => {
  let fixture;
  fixture = await loopFixture(t, async (_, n) => {
    if (n === 1) return { call: { name: 'write_file', args: { path: 'result.txt', content: 'DELIVERED' } }, usages: [{ prompt_tokens: 30, completion_tokens: 10 }] };
    if (n === 2) { setImmediate(() => abortRun(fixture.session.id)); await new Promise(resolve => setTimeout(resolve, 60)); return { text: '中断的输出' }; }
    if (n === 3) return { call: { name: 'read_file', args: { path: 'result.txt' } } };
    return { text: '已核对文件，无需重写。' };
  }, { maxSteps: 4 });
  await fixture.run('写入 result.txt 成品并核对');
  assert.equal(taskRecoveryState(fixture.session).stepCount, 2);
  await fixture.resume();
  const entries = fixture.session.entries(), summary = entries.findLast(entry => entry.type === 'task_summary');
  assert.equal(summary.reason, 'done'); assert.equal(summary.stepCount, 4);
  assert.equal(summary.runtimeControl.promptTokens, 30);
  assert.equal(entries.filter(entry => entry.type === 'turn_start').length, 1);
  assert.equal(entries.filter(entry => entry.type === 'turn_resume').length, 1);
  assert.equal(entries.filter(entry => entry.type === 'tool_end' && entry.name === 'write_file').length, 1);
  assert.equal(entries.filter(entry => entry.role === 'user' && !entry.source).length, 1);
  assert.equal(fs.readFileSync(path.join(fixture.root, 'result.txt'), 'utf8'), 'DELIVERED');
});

test('恢复不重置用户显式预算，时间已用尽时不再请求模型', async t => {
  const fixture = await loopFixture(t, () => ({ text: '继续' }), { maxSteps: 3, maxDurationMs: 1000 });
  fixture.session.append({ type: 'turn_start', turnId: 'saved-task', prompt: '原任务' });
  fixture.checkpoint({ phase: 'working', stepCount: 2, activeDurationMs: 1000 });
  await fixture.resume();
  assert.equal(fixture.seen.length, 0);
  assert.equal(fixture.session.entries().findLast(entry => entry.type === 'task_summary').reason, 'budget_exceeded');
});

test('恢复后仅剩显式轮数可用，不为补验收重新获得全部轮数', async t => {
  const fixture = await loopFixture(t, () => ({ call: { name: 'read_file', args: { path: 'input.txt' } } }), { maxSteps: 3 });
  fixture.session.append({ type: 'turn_start', turnId: 'saved-task', prompt: '持续核对' });
  fixture.checkpoint({ phase: 'working', stepCount: 2, activeDurationMs: 20 });
  await fixture.resume();
  assert.equal(fixture.seen.length, 1);
  assert.equal(fixture.session.entries().findLast(entry => entry.type === 'task_summary').reason, 'max_steps');
});

test('结果未知的副作用恢复时拦截盲目重放和 shell 绕过，再读取真实文件', async t => {
  const fixture = await loopFixture(t, (_, n) => n === 1 ? { call: { name: 'bash', args: { command: 'node mutation.cjs' } } } : n === 2 ? { call: { name: 'write_file', args: { path: 'result.txt', content: 'REPLAY' } } } : n === 3 ? { call: { name: 'read_file', args: { path: 'result.txt' } } } : { text: '已核对原操作，不重放。' }, { allowedTools: ['read_file', 'write_file', 'bash'] });
  fs.writeFileSync(path.join(fixture.root, 'result.txt'), 'SIDE_EFFECT_ALREADY_HAPPENED');
  fs.writeFileSync(path.join(fixture.root, 'mutation.cjs'), "require('node:fs').writeFileSync('result.txt','SHELL_REPLAY');");
  fixture.session.append({ type: 'turn_start', turnId: 'saved-task', prompt: '写入并核对文件' });
  fixture.session.append({ type: 'message', role: 'assistant', turnId: 'saved-task', toolCalls: [{ id: 'unknown', name: 'write_file', args: { path: 'result.txt', content: 'SIDE_EFFECT_ALREADY_HAPPENED' } }] });
  fixture.session.append({ type: 'tool_start', turnId: 'saved-task', callId: 'unknown', name: 'write_file' });
  fixture.checkpoint({ phase: 'tool_pending', activeDurationMs: 20 });
  await fixture.resume();
  assert.equal(fs.readFileSync(path.join(fixture.root, 'result.txt'), 'utf8'), 'SIDE_EFFECT_ALREADY_HAPPENED');
  const entries = fixture.session.entries();
  assert.ok(entries.some(entry => entry.type === 'tool_end' && entry.name === 'write_file' && entry.status === 'denied'));
  assert.ok(entries.some(entry => entry.type === 'tool_end' && entry.name === 'bash' && entry.status === 'denied'));
  assert.ok(entries.some(entry => entry.type === 'runtime_notice' && entry.kind === 'recovery_state_read'));
  assert.equal(entries.findLast(entry => entry.type === 'task_summary').reason, 'done');
});

test('恢复后不核对未知操作不能直接假报完成，用户仍可停止', async t => {
  const fixture = await loopFixture(t, () => ({ text: '已经完成全部操作' }));
  fixture.session.append({ type: 'turn_start', turnId: 'saved-task', prompt: '完成外部操作' });
  fixture.session.append({ type: 'tool_start', turnId: 'saved-task', callId: 'unknown', name: 'bash' });
  fixture.checkpoint({ phase: 'tool_pending', activeDurationMs: 20 });
  await fixture.resume();
  assert.equal(fixture.session.entries().findLast(entry => entry.type === 'task_summary').reason, 'needs_validation');
});

test('长任务超过旧 100 轮上限仍可正常完成，重复结果提示不强行终止', { timeout: 30000 }, async t => {
  const fixture = await loopFixture(t, (_, n) => n <= 101 ? { call: { name: 'read_file', args: { path: 'input.txt' } } } : { text: '已完成验证。' }, { maxSteps: null, maxDurationMs: null });
  await fixture.run('逐轮核对结果');
  const summary = fixture.session.entries().findLast(e => e.type === 'task_summary');
  assert.equal(summary.reason, 'done'); assert.equal(summary.stepCount, 102);
  assert.deepEqual(summary.runtimeControl.limits, { maxSteps: null, maxDurationMs: null });
  assert.ok(summary.runtimeControl.notices.some(n => n.kind === 'repeated_result'));
  assert.ok(!summary.runtimeControl.notices.some(n => n.kind === 'wrap_up'));
});

test('无限任务仍能在执行中被用户停止', async t => {
  let fixture;
  fixture = await loopFixture(t, (_, n) => {
    if (n === 5) setImmediate(() => abortRun(fixture.session.id));
    return { call: { name: 'read_file', args: { path: 'input.txt' } } };
  }, { maxSteps: null, maxDurationMs: null });
  await fixture.run('持续执行直到停止');
  assert.equal(fixture.session.entries().findLast(e => e.type === 'turn_end').reason, 'aborted');
  assert.equal(fixture.seen.length, 5);
});

test('显式时间预算仍会中止尚未完成的模型请求', async t => {
  const fixture = await loopFixture(t, async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return { text: '完成。' };
  }, { maxSteps: null, maxDurationMs: 100 });
  await fixture.run('核对结果');
  assert.equal(fixture.session.entries().findLast(e => e.type === 'turn_end').reason, 'budget_exceeded');
});

test('累计 usage 帧在每次模型响应中只计最终值，多轮仍累加', async t => {
  const fixture = await loopFixture(t, (_, n) => ({
    ...(n === 1 ? { call: { name: 'read_file', args: { path: 'input.txt' } } } : { text: '已核对。' }),
    usages: [{ prompt_tokens: 100, completion_tokens: 5 }, { prompt_tokens: 100, completion_tokens: 10 }, { prompt_tokens: 100, completion_tokens: 10 }],
  }));
  await fixture.run('核对 input.txt');
  const summary = fixture.session.entries().findLast(e => e.type === 'task_summary');
  assert.equal(summary.runtimeControl.promptTokens, 200);
  assert.equal(summary.runtimeControl.completionTokens, 20);
});

test('真实循环在相同结果预警后收尾，无额外用户消息', { timeout: 30000 }, async t => {
  const fixture = await loopFixture(t, body => body.messages[0].content.includes('相同参数和结果已出现') ? { text: '已核对，不再重复读取。' } : { call: { name: 'read_file', args: { path: 'input.txt' } } });
  await fixture.run('核对 input.txt 的内容，不修改文件');
  const summary = fixture.session.entries().findLast(e => e.type === 'task_summary');
  assert.equal(summary.reason, 'done'); assert.equal(summary.stepCount, 4);
  assert.equal(summary.runtimeControl.notices.filter(n => n.kind === 'repeated_result').length, 1);
  assert.equal(fixture.session.entries().filter(e => e.type === 'message' && e.role === 'user').length, 1);
});

test('真实循环收到收尾预算后正常结束；持续调用仍按原上限失败', { timeout: 30000 }, async t => {
  const fixture = await loopFixture(t, body => body.messages[0].content.includes('已进入收尾预算') ? { text: '已完成必要核对。' } : { call: { name: 'read_file', args: { path: 'input.txt' } } }, { maxSteps: 4 });
  await fixture.run('核对内容'); assert.equal(fixture.session.entries().findLast(e => e.type === 'task_summary').reason, 'done');
  assert.equal(fixture.seen.length, 4); assert.ok(fixture.session.entries().some(e => e.type === 'runtime_notice' && e.kind === 'wrap_up'));
  fixture.seen.length = 0;
  await fixture.run('仍核对内容'); assert.equal(fixture.seen.length, 4);
});

test('length 截断的合法工具参数也不能执行，恢复仍在同一原预算内', { timeout: 30000 }, async t => {
  const fixture = await loopFixture(t, (_, n) => n === 1 ? { call: { name: 'write_file', args: { path: 'result.txt', content: 'SHOULD_NOT_WRITE' } }, reason: 'length' } : n === 2 ? { call: { name: 'write_file', args: { path: 'result.txt', content: 'RECOVERED' } } } : { text: '操作已完成。' });
  await fixture.run('执行指定操作并报告');
  assert.equal(fs.readFileSync(path.join(fixture.root, 'result.txt'), 'utf8'), 'RECOVERED');
  assert.equal(fixture.session.entries().filter(e => e.type === 'tool_start' && e.name === 'write_file').length, 1);
  assert.equal(fixture.session.entries().findLast(e => e.type === 'task_summary').reason, 'done');
});

test('截断文本有界恢复，禁用运行提醒也不能误判完整，原步骤上限不增加', { timeout: 30000 }, async t => {
  const fixture = await loopFixture(t, () => ({ text: '无法完整输出', reason: 'length' }), { maxSteps: 10, runControl: { enabled: false } });
  await fixture.run('回答问题');
  assert.equal(fixture.seen.length, 3); assert.equal(fixture.session.entries().findLast(e => e.type === 'task_summary').reason, 'model_output_incomplete');
  assert.match(fixture.seen[1].messages[0].content, /模型响应被截断/);
});

test('收尾提醒不绕过质量门禁：无验证文字交付仍未完成', { timeout: 30000 }, async t => {
  const fixture = await loopFixture(t, (_, n) => n === 1 ? { call: { name: 'write_file', args: { path: 'final.md', content: '未经核对的成品' } } } : { text: '全部完成。' }, { maxSteps: 10, quality: true });
  await fixture.run('保存为 final.md 文件并验证内容');
  assert.equal(fixture.session.entries().findLast(e => e.type === 'task_summary').reason, 'needs_validation');
});

test('原步骤上限真实生效，未完成摘要不显示成功', { timeout: 30000 }, async t => {
  const fixture = await loopFixture(t, () => ({ call: { name: 'read_file', args: { path: 'input.txt' } } }), { maxSteps: 3 });
  await fixture.run('持续检查');
  const summary = fixture.session.entries().findLast(e => e.type === 'task_summary');
  assert.equal(summary.reason, 'max_steps'); assert.match(summary.title, /任务未完成/); assert.equal(fixture.seen.length, 3);
});

test('shell 超长输出保留尾部失败证据，结构化退出码不会被裁掉', { timeout: 15000 }, async t => {
  const root = workspace(t); setConfig({ providers: [], models: [], agent: {}, memory: { enabled: false } }); await loadAll({ reload: true }); t.after(disposePlugins);
  fs.writeFileSync(path.join(root, 'large-output.cjs'), "process.stdout.write('x'.repeat(1200000)+'\\nTAIL_FAILURE'); process.exitCode=3;");
  const result = await withRunContext({ executionRoot: root, sandboxPolicy: { mode: 'off' } }, () => executeTool(getTool('bash'), { command: 'node large-output.cjs' }, { session: { id: 'test' }, timeoutMs: 10000 }));
  assert.equal(result.exitCode, 3); assert.match(result.content, /TAIL_FAILURE/); assert.equal(result.structuredContent.truncated, true);
  assert.ok(result.content.length < 1100000); const payload = prepareToolOutput(null, result); assert.match(payload.content, /TAIL_FAILURE/); assert.match(payload.content, /"exitCode":3/);
});
