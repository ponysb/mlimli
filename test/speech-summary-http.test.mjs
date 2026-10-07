import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import runtime from '../electron/runtime.cjs';

test('a saved meeting creates a real model conversation with the full transcript and role', { timeout: 30000 }, async context => {
  const root = path.resolve(import.meta.dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-meeting-summary-'));
  const requests = [];
  let instance;
  const model = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks)); requests.push(body);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '# 会议纪要\n\n小李负责开发，周五交付。' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  });
  model.listen(0, '127.0.0.1'); await once(model, 'listening');
  context.after(async () => {
    if (instance?.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; }
    model.closeAllConnections(); await new Promise(resolve => model.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'));
  config.providers[0].protocol = 'openai-chat'; config.providers[0].baseUrl = `http://127.0.0.1:${model.address().port}`;
  config.models[0].capabilities = { file: false, audio: false };
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(config));
  const id = crypto.randomUUID(), destination = path.join(directory, 'meetings', id);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'meeting.json'), JSON.stringify({ id, kind: 'meeting', title: '需求评审', createdAt: Date.now(), state: 'finished', role: 'actions', workspace: path.join(directory, 'workspace'), segments: [{ id: 1, text: '小李负责开发，周五交付。', speaker: 'speaker-1', start: 0, end: 3 }], participants: { 'speaker-1': { name: '小李', role: '开发负责人' } } }));
  instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory });
  const { url } = await instance.ready;
  const summarize = (body = {}) => fetch(`${url}/api/speech/sessions/${id}/summary`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const response = await summarize(); assert.equal(response.status, 202);
  const summary = await response.json(); let session;
  for (let i = 0; i < 100; i++) {
    session = await (await fetch(`${url}/api/session/${summary.sessionId}`)).json();
    if (session.entries.some(entry => entry.type === 'turn_end') && !session.running) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(session.entries.findLast(entry => entry.type === 'turn_end')?.reason, 'done');
  assert.equal(session.expertId, 'meeting-secretary');
  assert.equal(session.meetingId, id);
  assert.equal((await (await fetch(`${url}/api/session/${summary.sessionId}?limit=120`)).json()).meetingId, id);
  assert.match(JSON.stringify(requests[0]), /项目协调员/); assert.match(JSON.stringify(requests[0]), /小李（开发负责人）/);
  assert.match(JSON.stringify(session.entries), /会议纪要/);
  const count = requests.filter(request => request.stream).length;
  const second = await (await summarize()).json(); assert.equal(second.sessionId, summary.sessionId); assert.equal(requests.filter(request => request.stream).length, count);
  const third = await (await summarize({ regenerate: true })).json(); assert.notEqual(third.sessionId, summary.sessionId);
  assert.equal((await (await fetch(`${url}/api/session/${third.sessionId}?limit=120`)).json()).meetingId, id);
  assert.equal((await (await fetch(`${url}/api/session/${summary.sessionId}?limit=120`)).json()).meetingId, id);
});
