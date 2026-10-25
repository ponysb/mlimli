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
  async function start() { instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot, dataRoot: directory, managed: true }); url = (await instance.ready).url; }
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
    const last = (await request(route)).data;
    throw new Error(`等待超时 ${route}: ${JSON.stringify({ running: last.running, permission: last.permission?.tool, tasks: last.group?.tasks?.map(task => ({ status: task.status, result: task.result })) })}`);
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
  const runtimeInfo = (await request('/api/runtime')).data;
  await request('/api/runtime/lease', { id: 'swarm-background-test', instance: runtimeInfo.instance });
  const released = await request('/api/runtime/lease', { id: 'swarm-background-test', instance: runtimeInfo.instance, release: true });
  assert.equal(released.data.background, true);
  assert.equal((await request(`/api/session/${root.id}`)).status, 200);
  // Restart while a tool awaits permission: do not replay the write.
  await stop(); await start();
  const recovered = await until(`/api/session/${root.id}`, data => !data.running && data.group.tasks.filter(task => active.some(item => item.taskId === task.taskId)).every(task => ['interrupted', 'completed', 'cancelled', 'failed'].includes(task.status)));
  assert.ok(recovered.group.tasks.filter(task => active.some(item => item.taskId === task.taskId)).every(task => ['interrupted', 'completed', 'cancelled', 'failed'].includes(task.status)));
  assert.equal(recovered.permission, null);
  assert.equal(recovered.running, false);
  assert.ok(recovered.group.activity.some(item => item.kind === 'recovered'));
  // Exercise the real HTTP -> permission -> file tool -> isolated delivery path.
  const isolatedRoot = (await request('/api/session', { title: '隔离交付审批' })).data;
  const isolated = (await request(`/api/session/${isolatedRoot.id}/agents`, { tasks: [{ instruction: '创建 hello.txt', capabilities: ['read', 'write'], writablePaths: ['hello.txt'] }] })).data.tasks[0];
  const isolatedApproval = await until(`/api/session/${isolatedRoot.id}`, data => Boolean(data.permission));
  assert.equal(isolatedApproval.permission.sessionId, isolated.sessionId);
  assert.equal(isolatedApproval.permission.tool, 'write_file');
  assert.equal(isolatedApproval.group.tasks[0].status, 'waiting_permission');
  await request(`/api/session/${isolated.sessionId}/permission/${isolatedApproval.permission.reqId}`, { decision: 'allow' });
  const submitted = await until(`/api/session/${isolatedRoot.id}`, data => data.group.tasks[0].status === 'completed' && !data.running);
  assert.equal(submitted.group.tasks[0].delivery.status, 'pending');
  const read = await request(`/api/session/${isolated.sessionId}/dev-tool`, { tool: 'read_file', args: { path: 'hello.txt' } });
  assert.equal(read.data.ok, true);
  const wrongWrite = await request(`/api/session/${isolated.sessionId}/dev-tool`, { tool: 'write_file', args: { path: 'outside.txt', content: 'no' } });
  assert.equal(wrongWrite.data.ok, false); assert.match(wrongWrite.data.reason, /声明/);
  const integrateRequest = request(`/api/session/${isolatedRoot.id}/dev-tool`, { tool: 'agent_integrate', args: { taskId: isolated.taskId } });
  const integrationApproval = await until(`/api/session/${isolatedRoot.id}`, data => data.permission?.tool === 'agent_integrate');
  await request(`/api/session/${isolatedRoot.id}/permission/${integrationApproval.permission.reqId}`, { decision: 'allow' });
  const integrated = await integrateRequest;
  assert.equal(integrated.data.ok, true);
  assert.equal(JSON.parse(integrated.data.result.content).status, 'integrated');
  await stop(); await start();
  const persisted = await request(`/api/session/${isolatedRoot.id}`);
  assert.equal(persisted.data.group.tasks[0].delivery.status, 'integrated');
});
