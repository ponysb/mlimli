import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { onEvent } from '../core/events.mjs';
import { authorize, isReadOnlyCommand, resolveRequest } from '../core/permissions.mjs';
import { setWorkspaceRoot } from '../core/paths.mjs';
import { discoverArtifacts, summarizeChanges, workspaceSnapshot } from '../core/task-summary.mjs';
import { usageNumbers } from '../core/llm.mjs';
import { parseOpenAIStream } from '../core/stream.mjs';
import { shouldCompact } from '../core/compact.mjs';
import { appendApiLog, getApiLog, listApiLogs, queryApiLogs } from '../core/api-logs.mjs';
import { pptxRenderSlides } from '../plugins/office/lib/ooxml.mjs';
import { writeZip } from '../plugins/office/lib/zip.mjs';

test('人工审批只自动执行明确的只读命令', () => {
  for (const command of ['rg --files', 'git status --short', 'git diff --stat', 'cat README.md', 'dir']) assert.equal(isReadOnlyCommand(command), true, command);
  for (const command of ['npm test', 'git branch new-name', 'git diff --output=copy.txt', 'rg --pre=echo x', 'cat file > out', 'git status && del file', 'date -s tomorrow']) assert.equal(isReadOnlyCommand(command), false, command);
});

test('消息条数不单独触发压缩', () => {
  const messages = Array.from({ length: 600 }, () => ({ role: 'tool', content: 'ok' }));
  const session = { messages: () => messages };
  assert.equal(shouldCompact(session, { contextWindow: 128000, compactAtPercent: 75 }).need, false);
});

test('本任务允许只复用相同命令或同一文件路径', async () => {
  const session = { id: `permission-${Date.now()}`, mode: 'default', desktopEnabled: false };
  let prompts = 0;
  const unsubscribe = onEvent((event) => {
    if (event.type !== 'permission_request' || event.sessionId !== session.id) return;
    prompts++;
    resolveRequest(event.request.reqId, 'allow_session');
  });
  try {
    const bash = { name: 'bash', permission: 'L2' };
    assert.equal((await authorize({ session, tool: bash, args: { command: 'rg --files' } })).decision, 'auto');
    assert.equal((await authorize({ session, tool: bash, args: { command: 'npm test' } })).decision, 'allow_session');
    assert.equal((await authorize({ session, tool: bash, args: { command: 'npm test' } })).decision, 'rule');
    assert.equal((await authorize({ session, tool: bash, args: { command: 'npm run build' } })).decision, 'allow_session');
    const write = { name: 'write_file', permission: 'L1' };
    await authorize({ session, tool: write, args: { path: 'a.html', content: 'first' } });
    assert.equal((await authorize({ session, tool: write, args: { path: 'a.html', content: 'second' } })).decision, 'rule');
    await authorize({ session, tool: write, args: { path: 'b.html', content: 'different' } });
    assert.equal(prompts, 4);
  } finally { unsubscribe(); }
});

test('工作区扫描跳过内部目录后仍能识别 HTML 成果', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-workflow-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  setWorkspaceRoot(root);
  fs.writeFileSync(path.join(root, 'z-readme.txt'), 'existing');
  const before = workspaceSnapshot();
  fs.writeFileSync(path.join(root, 'preview.html'), '<h1>Preview</h1>');
  const after = workspaceSnapshot();
  assert.ok(after.has('z-readme.txt'));
  const changes = summarizeChanges(before, after);
  assert.deepEqual(changes.map((file) => file.path), ['preview.html']);
  assert.deepEqual(discoverArtifacts(after, '完成 preview.html', changes), [{ path: 'preview.html', type: 'html' }]);
  assert.deepEqual(discoverArtifacts(after, '完成 preview.html', []), [{ path: 'preview.html', type: 'html' }]);
});

test('流式用量保留缓存读取和响应元数据', async () => {
  const frame = JSON.stringify({ id: 'resp-1', model: 'demo', usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } }, choices: [] });
  const response = new Response(`data: ${frame}\n\n: mli-billing {"points":2.5,"balanceAfter":10}\n\ndata: [DONE]\n\n`);
  const events = [];
  for await (const event of parseOpenAIStream(response)) events.push(event);
  assert.equal(events.find((event) => event.type === 'metadata')?.metadata.id, 'resp-1');
  const counts = usageNumbers(events.find((event) => event.type === 'usage')?.usage, {}, '');
  assert.equal(counts.cacheReadTokens, 40);
  assert.equal(counts.promptTokens, 100);
  assert.equal(events.find((event) => event.type === 'billing')?.points, 2.5);
  const deepseek = usageNumbers({ prompt_tokens: 10, completion_tokens: 2, prompt_cache_hit_tokens: 3, prompt_cache_miss_tokens: 7 }, {}, '');
  assert.equal(deepseek.cacheCreationTokens, 0);
  assert.equal(deepseek.cacheReadTokens, 3);
  assert.equal(deepseek.cacheMissTokens, 7);
});

test('流式计费错误传给客户端', async () => {
  const response = new Response('data: {"error":{"code":"MISSING_USAGE","message":"上游未返回用量"}}\n\ndata: [DONE]\n\n');
  const events = [];
  for await (const event of parseOpenAIStream(response)) events.push(event);
  assert.deepEqual(events, [{ type: 'error', message: '上游未返回用量' }]);
});

test('调用日志只读取最近记录且详情按需获取', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-logs-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  setWorkspaceRoot(root);
  for (let index = 1; index <= 3; index++) appendApiLog({ id: `call-${index}`, sessionId: 'session-1', request: { text: `request-${index}` }, response: { text: `response-${index}`, usage: { prompt_tokens: index } }, metrics: { totalTokens: index } });
  const summaries = listApiLogs({ limit: 2, summary: true });
  assert.deepEqual(summaries.map((row) => row.id), ['call-3', 'call-2']);
  assert.equal(summaries[0].request, undefined);
  assert.equal(summaries[0].response.usage.prompt_tokens, 3);
  assert.equal(getApiLog('call-2').request.text, 'request-2');
});

test('调用日志分页只返回当前页但总数和统计覆盖全部匹配记录', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-log-query-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  setWorkspaceRoot(root);
  const rows = [
    { id: 'query-1', ts: 1700000000001, provider: { model: 'model-a' }, metrics: { totalTokens: 10, cost: 0.1, totalMs: 100, currency: 'USD' } },
    { id: 'query-2', ts: 1700000000002, provider: { model: 'model-b' }, metrics: { totalTokens: 20, cost: 0.2, totalMs: 200, currency: 'USD' } },
    { id: 'query-3', ts: 1700000000003, provider: { model: 'model-a' }, metrics: { totalTokens: 30, cost: 0.3, totalMs: 300, currency: 'USD' } },
  ];
  rows.forEach(appendApiLog);
  const page = queryApiLogs({ limit: 1, offset: 1, from: 1700000000000, to: 1700000001000 });
  assert.deepEqual(page.logs.map((row) => row.id), ['query-2']);
  assert.equal(page.total, 3);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.models, ['model-a', 'model-b']);
  assert.equal(page.summary.totalTokens, 60);
  assert.equal(page.summary.totalCost, 0.6);
  assert.equal(page.summary.averageMs, 200);
  const filtered = queryApiLogs({ limit: 100, model: 'model-a', from: 1700000000000, to: 1700000001000 });
  assert.equal(filtered.total, 2);
  assert.equal(filtered.summary.totalTokens, 40);
});

test('PPTX 预览按幻灯片生成独立画布', () => {
  const presentation = Buffer.from('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldSz cx="12191695" cy="6858000"/></p:presentation>');
  const slide = Buffer.from('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12191695" cy="6858000"/></a:xfrm><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="2400" b="1"/><a:t>预览测试</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  const buffer = writeZip([{ name: 'ppt/presentation.xml', data: presentation }, { name: 'ppt/slides/slide1.xml', data: slide }]);
  const slides = pptxRenderSlides(buffer);
  assert.equal(slides.length, 1);
  assert.match(slides[0], /viewBox="0 0 1219\.1695 685\.8/);
  assert.match(slides[0], /预览测试/);
});
