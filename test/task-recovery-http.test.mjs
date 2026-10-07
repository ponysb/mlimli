import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';

test('真实运行时重启后的 HTTP 检查点恢复：不重放、拒绝旧 ID 和重复恢复', { timeout: 35000 }, async t => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-resume-http-'));
  let instance, url, calls = 0;
  const provider = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); calls++;
    assert.ok(body.messages.some(message => message.role === 'user' && message.content === '保存 result.txt 并核对交付'));
    // Simulate a crash during the second model request, after a durable file write.
    if (calls === 2) return;
    if (calls === 3) await new Promise(resolve => setTimeout(resolve, 150));
    const call = calls === 1 ? { name: 'write_file', args: { path: 'result.txt', content: 'PERSISTED_PRODUCT' } } : calls === 3 ? { name: 'read_file', args: { path: 'result.txt' } } : null;
    const delta = call ? { tool_calls: [{ index: 0, id: `call-${calls}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] } : { content: '文件已核对并交付。' };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  async function stop() {
    if (instance?.child.exitCode === null && !instance.child.signalCode) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; }
  }
  t.after(async () => { await stop(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'));
  config.security.workspaceRoot = path.join(directory, 'workspace'); config.security.sandbox.mode = 'off';
  config.memory = { enabled: false, autoLearn: false }; config.agent.quality.enabled = false; config.agent.subagents.enabled = false;
  config.providers[0].protocol = 'openai-chat'; config.providers[0].baseUrl = `http://127.0.0.1:${provider.address().port}/v1`;
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(config));
  const start = async () => { instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory }); url = (await instance.ready).url; };
  const request = async (route, body, status = 200) => {
    const res = await fetch(url + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(res.status, status, route); return res.json();
  };
  const until = async predicate => { const deadline = Date.now() + 7000; while (Date.now() < deadline) { const result = await predicate(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('恢复流程等待超时'); };
  await start();
  const session = await request('/api/session', { title: '恢复任务' });
  await request(`/api/session/${session.id}/mode`, { mode: 'auto-all' });
  await request(`/api/session/${session.id}/message`, { text: '保存 result.txt 并核对交付' }, 202);
  const before = await until(async () => { const state = await request(`/api/session/${session.id}`); return calls === 2 && state.recovery.available ? state : null; });
  const originalTurn = before.entries.findLast(entry => entry.type === 'turn_start').turnId;
  await stop(); await start();
  const loaded = await request(`/api/session/${session.id}`);
  assert.equal(loaded.running, false); assert.equal(loaded.recovery.turnId, originalTurn);
  assert.equal(loaded.recovery.stepCount, 2);
  await request(`/api/session/${session.id}/resume`, { checkpointId: loaded.recovery.checkpointId - 1 }, 409);
  assert.equal(calls, 2, '过期检查点不启动模型');
  await request(`/api/session/${session.id}/resume`, { checkpointId: loaded.recovery.checkpointId }, 202);
  await request(`/api/session/${session.id}/resume`, { checkpointId: loaded.recovery.checkpointId }, 409);
  const completed = await until(async () => { const state = await request(`/api/session/${session.id}`); return !state.running && state.entries.findLast(entry => entry.type === 'turn_end')?.reason === 'done' ? state : null; });
  assert.equal(calls, 4);
  assert.equal(completed.entries.filter(entry => entry.type === 'turn_start').length, 1);
  assert.equal(completed.entries.filter(entry => entry.type === 'turn_resume').length, 1);
  assert.equal(completed.entries.filter(entry => entry.type === 'tool_end' && entry.name === 'write_file').length, 1);
  assert.equal(fs.readFileSync(path.join(directory, 'workspace/result.txt'), 'utf8'), 'PERSISTED_PRODUCT');
  assert.equal(completed.recovery.available, false);
  await request(`/api/session/${session.id}/resume`, { checkpointId: loaded.recovery.checkpointId }, 409);
});
