import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import runtime from '../electron/runtime.cjs';

test('HTTP attachment flow lets a text-only agent read and modify a file with original replay intact', { timeout: 30000 }, async context => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-attachment-http-'));
  let instance;
  context.after(async () => {
    if (instance?.child.exitCode === null) {
      const exited = once(instance.child, 'exit'); instance.child.kill(); await exited;
    }
    model.closeAllConnections();
    await new Promise(resolve => model.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const requests = []; let workingPath;
  const model = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks)); requests.push(body);
    const messages = body.messages;
    const toolReplies = messages.filter(message => message.role === 'tool');
    if (!workingPath) {
      const parts = messages.find(message => message.role === 'user').content;
      assert.ok(parts.every(part => part.type === 'text'));
      const reference = parts.find(part => part.text.includes('可编辑的工作区副本')).text;
      workingPath = JSON.parse(reference.match(/可编辑的工作区副本：(".*?")。/)[1]);
    }
    const tool = toolReplies.length === 0 ? { name: 'read_attachment', args: { path: workingPath } } : toolReplies.length === 1 ? { name: 'write_file', args: { path: workingPath, content: 'Modified using attached content: hello input' } } : null;
    if (toolReplies.length === 1) assert.ok(toolReplies[0].content.includes('hello input'));
    const delta = tool ? { tool_calls: [{ index: 0, id: `call-${toolReplies.length}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } : { content: 'File updated.' };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
  });
  model.listen(0, '127.0.0.1'); await once(model, 'listening');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8'));
  config.providers[0].protocol = 'openai-chat'; config.providers[0].baseUrl = `http://127.0.0.1:${model.address().port}`;
  config.models[0].capabilities = { image: false, file: false, pdf: false, audio: false };
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(config));
  instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory });
  const { url } = await instance.ready;
  const post = async (route, body) => fetch(url + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const session = await (await post('/api/session', { title: 'Attachment test' })).json();
  await post(`/api/session/${session.id}/mode`, { mode: 'auto-all' });
  const invalid = await post(`/api/session/${session.id}/message`, { text: 'bad input', attachments: [{ name: 'bad.txt', dataUrl: 'bad' }] });
  assert.equal(invalid.status, 400);
  const response = await post(`/api/session/${session.id}/message`, { text: 'Read then modify the attached file.', attachments: [{ name: 'input.txt', dataUrl: 'data:text/plain;base64,' + Buffer.from('hello input').toString('base64') }] });
  assert.equal(response.status, 202);
  let snapshot;
  for (let attempt = 0; attempt < 100; attempt++) {
    snapshot = await (await fetch(`${url}/api/session/${session.id}`)).json();
    if (snapshot.entries.some(entry => entry.type === 'turn_end') && !snapshot.running) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(snapshot.entries.findLast(entry => entry.type === 'turn_end')?.reason, 'done');
  assert.equal(fs.readFileSync(path.join(directory, 'workspace', workingPath), 'utf8'), 'Modified using attached content: hello input');
  const attachment = snapshot.entries.find(entry => entry.role === 'user').content.find(part => part.attachmentId);
  const download = await fetch(url + attachment.url);
  assert.equal(await download.text(), 'hello input');
  assert.ok(download.headers.get('content-disposition').startsWith('attachment;'));
  assert.equal(requests.length, 3);
});
