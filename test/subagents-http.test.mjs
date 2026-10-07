import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';

test('HTTP 子任务隐藏、主任务审批、只读防绕过、续跑、取消与重启恢复', { timeout: 30000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-agent-http-'));
  const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
  let instance, url;
  async function stop() {
    if (instance?.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; }
  }
  t.after(async () => { await stop(); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  async function start() { instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot, dataRoot: directory }); url = (await instance.ready).url; }
  await start();
  const request = async (route, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(url + route, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  async function until(route, predicate) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const result = await request(route); if (predicate(result.data)) return result.data;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`等待超时 ${route}`);
  }
  const root = (await request('/api/session', { title: '协作功能' })).data;
  const spawned = await request(`/api/session/${root.id}/agents`, { tasks: [{ profile: 'worker', instruction: '创建 hello.txt，确认写入结果' }], idempotencyKey: 'http-worker' });
  assert.equal(spawned.status, 202);
  const worker = spawned.data.tasks[0];
  const pending = await until(`/api/session/${root.id}`, data => Boolean(data.permission));
  assert.equal(pending.permission.sessionId, worker.sessionId);
  assert.equal(pending.permission.rootSessionId, root.id);
  assert.equal((await request('/api/sessions')).data.sessions.some(session => session.id === worker.sessionId), false);
  assert.equal((await request(`/api/session/${worker.sessionId}`)).data.parentSessionId, root.id);
  assert.equal((await request(`/api/session/${worker.sessionId}/permission/${pending.permission.reqId}`, { decision: 'allow' })).status, 200);
  const completed = await until(`/api/session/${root.id}`, data => !data.running && data.group.tasks[0].status === 'completed');
  assert.ok(completed.entries.some(entry => entry.source === 'agent'));
  assert.ok(completed.group.tasks[0].result.files.some(file => file.path === 'hello.txt'));
  const followed = await request(`/api/session/${root.id}/agents/${worker.agentId}/message`, { kind: 'follow_up', text: '读取已有文件并返回结果，不要修改', messageId: 'follow-http' });
  assert.equal(followed.status, 202);
  await until(`/api/session/${root.id}`, data => !data.running && data.group.tasks[0].status === 'completed');
  const explorer = (await request(`/api/session/${root.id}/agents`, { tasks: [{ instruction: '只读查看文件' }] })).data.tasks[0];
  const denied = await request(`/api/session/${explorer.sessionId}/dev-tool`, { tool: 'write_file', args: { path: 'bad.txt', content: 'bad' } });
  assert.equal(denied.data.ok, false); assert.match(denied.data.reason, /无权调用/);
  assert.equal((await request(`/api/session/${explorer.sessionId}/message`, { text: '绕过编排' })).status, 400);
  assert.equal((await request(`/api/session/${explorer.sessionId}/queue`, { text: '绕过编排' })).status, 400);
  assert.equal((await request(`/api/session/${explorer.sessionId}/mode`, { mode: 'auto-all' })).status, 400);
  assert.equal((await request(`/api/session/${explorer.sessionId}/desktop`, { enabled: true })).status, 400);
  await until(`/api/session/${root.id}`, data => !data.running);
  const active = (await request(`/api/session/${root.id}/agents`, { tasks: [{ profile: 'worker', instruction: '创建 hello.txt' }, { instruction: '研究候选方案' }, { instruction: '检查验证入口' }] })).data.tasks;
  await until(`/api/session/${root.id}`, data => Boolean(data.permission));
  // Restart while a tool awaits permission: do not replay the write.
  await stop(); await start();
  const recovered = (await request(`/api/session/${root.id}`)).data;
  assert.ok(recovered.group.tasks.filter(task => active.some(item => item.taskId === task.taskId)).every(task => ['interrupted', 'completed'].includes(task.status)));
  assert.equal(recovered.permission, null);
  assert.equal(recovered.running, false);
});
