import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';

test('HTTP 记忆管理、版本冲突、项目隔离、开关持久化和真实运行链路回顾', { timeout: 30000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-memory-http-'));
  const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
  const calls = []; let reviewCount = 0, instance, url;
  // A local OpenAI-compatible fixture exercises HTTP, streaming and the actual learner adapter without external credentials.
  const provider = http.createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    const body = JSON.parse(raw); calls.push(body);
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '已完成本次回答。' }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10 } })}\n\ndata: [DONE]\n\n`);
    } else {
      reviewCount++;
      const content = body.messages.at(-1).content;
      const entries = JSON.parse(content.split('<task_records>\n')[1].split('\n</task_records>')[0]);
      const user = entries.find(entry => entry.role === 'user');
      const memories = user.text.includes('始终使用中文回答') ? [{ scope: 'global', kind: 'preference', title: '回答语言', content: '始终使用中文回答。', evidence: [{ entryId: user.entryId, quote: '始终使用中文回答' }] }] : [];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ memories }) } }], usage: { prompt_tokens: 100, completion_tokens: 40 } }));
    }
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const config = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'config.example.json'), 'utf8'));
  config.security.workspaceRoot = path.join(directory, 'workspace'); config.security.sandbox.mode = 'off';
  config.providers[0].protocol = 'openai-chat'; config.providers[0].baseUrl = `http://127.0.0.1:${provider.address().port}/v1`;
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(config));
  async function stop() { if (instance?.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; } }
  t.after(async () => { await stop(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  async function start() { instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot, dataRoot: directory }); url = (await instance.ready).url; }
  await start();
  const request = async (route, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(url + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  async function until(route, predicate) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) { const result = await request(route); if (predicate(result.data)) return result.data; await new Promise(resolve => setTimeout(resolve, 30)); }
    throw new Error(`等待超时 ${route}`);
  }
  const settings = await request('/api/memory/settings'); assert.equal(settings.data.settings.enabled, true);
  assert.equal((await request('/api/memory/settings', { enabled: 'false' })).status, 400);
  const global = (await request('/api/memories', { scope: 'global', kind: 'preference', title: '简洁', content: '简洁回答' })).data.item;
  const local = (await request('/api/memories', { title: '构建', content: '使用 npm test', evidence: '用户确认' })).data.item;
  const route = `/api/memories/project/${local.id}`;
  assert.equal((await request(route, { content: 'bad' }, 'PUT')).status, 400);
  const edited = (await request(route, { expectedRevision: 1, content: '使用 npm run check' }, 'PUT')).data.item;
  assert.equal(edited.revision, 2); assert.equal(edited.history.length, 1);
  assert.equal((await request(route, { expectedRevision: 1, content: 'stale' }, 'PUT')).status, 409);
  const restored = (await request(route + '/restore', { expectedRevision: 2, revision: 1 })).data.item;
  assert.equal(restored.content, '使用 npm test'); assert.equal(restored.revision, 3);
  await request('/api/memory/settings', { reviewBeforeSave: true });
  const root = (await request('/api/session', { title: '记忆集成验证' })).data;
  await request(`/api/session/${root.id}/mode`, { mode: 'auto-all' });
  const write = await request(`/api/session/${root.id}/dev-tool`, { tool: 'write_memory', args: { id: local.id, expectedRevision: 3, title: '构建', content: '使用 pnpm test', evidence: '用户纠正' } });
  assert.equal(write.data.ok, true);
  const proposal = (await request('/api/memories?status=pending')).data.items[0];
  assert.equal((await request(`/api/memories/project/${proposal.id}`, { expectedRevision: 1, status: 'active' }, 'PUT')).status, 400);
  const approved = (await request(`/api/memories/project/${proposal.id}/approve`, { expectedRevision: 1 })).data.item;
  assert.equal(approved.id, local.id); assert.equal(approved.content, '使用 pnpm test');
  await request('/api/memory/settings', { reviewBeforeSave: false });
  await request(`/api/session/${root.id}/message`, { text: '以后请始终使用中文回答，并简洁说明测试结果。' });
  await until('/api/memory/learning', data => data.jobs.some(job => job.status === 'completed'));
  assert.equal(reviewCount, 1);
  const learned = (await request('/api/memories?scope=global')).data.items.find(item => item.title === '回答语言');
  assert.equal(learned.source, 'auto'); assert.equal(learned.origin.sessionId, root.id);
  assert.equal(learned.origin.workspace, config.security.workspaceRoot);
  await until(`/api/session/${root.id}`, data => !data.running);
  await request('/api/memory/settings', { autoLearn: false });
  await request(`/api/session/${root.id}/message`, { text: '请再说明一次你会怎样组织回答。' });
  await until(`/api/session/${root.id}`, data => !data.running);
  assert.ok(calls.filter(call => call.stream).at(-1).messages.some(message => message.role === 'system' && message.content.includes('始终使用中文回答。')));
  assert.equal(reviewCount, 1);
  await request('/api/memory/settings', { enabled: false });
  const denied = await request(`/api/session/${root.id}/dev-tool`, { tool: 'read_memory', args: { id: local.id } });
  assert.equal(denied.data.ok, false); assert.match(denied.data.reason, /已关闭/);
  assert.equal((await request(route, { expectedRevision: approved.revision, status: 'archived' }, 'PUT')).status, 200);
  await stop(); await start();
  assert.equal((await request('/api/memory/settings')).data.settings.enabled, false);
  assert.equal((await request(route)).data.item.status, 'archived');
  assert.equal((await request('/api/memories?query=pnpm')).data.items.length, 1);
  const other = path.join(directory, 'other-project');
  assert.equal((await request('/api/workspaces', { path: other, name: '第二项目' })).status, 200);
  const items = (await request('/api/memories')).data.items;
  assert.ok(items.some(item => item.id === global.id)); assert.ok(!items.some(item => item.id === local.id));
  assert.equal((await request(`/api/memories/global/${global.id}`, { expectedRevision: 1 }, 'DELETE')).status, 200);
  assert.equal((await request(`/api/memories/global/${global.id}`)).status, 404);
});
