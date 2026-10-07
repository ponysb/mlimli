import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setWorkspaceRoot } from '../core/paths.mjs';
import { Session } from '../core/session.mjs';
import { readSessionView, disposeSessionReader } from '../core/session-view-service.mjs';
import runtime from '../electron/runtime.cjs';

test('大 JSONL 会话首屏从尾部分页读取，并可继续加载更早记录', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-session-page-'));
  setWorkspaceRoot(root);
  try {
    const session = Session.create('分页测试');
    for (let index = 0; index < 420; index += 1) session.append({ type: 'message', role: index % 2 ? 'assistant' : 'user', content: `记录 ${index}` });
    const light = Session.loadLight(session.id);
    const first = light.snapshot(128000, { limit: 60 });
    assert.equal(first.entries.length, 60);
    assert.equal(first.entries.at(-1).id, 420);
    assert.equal(first.history.hasMore, true);

    const older = light.readPage({ limit: 60, before: first.history.oldestId });
    assert.equal(older.entries.length, 60);
    assert.equal(older.entries.at(-1).id, first.history.oldestId - 1);
    assert.equal(older.hasMore, true);
    assert.equal(Session.load(session.id).entries().length, 421);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('分页跨 UTF-8 块边界和无换行末尾时保留正文，损坏行不影响翻页', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-page-utf8-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const session = new Session('utf8', directory);
  const entries = [{ id: 0, type: 'meta', title: 'Boundary' }, { id: 4, type: 'message', role: 'user', content: '中文'.repeat(100000) }, { id: 9, type: 'message', role: 'assistant', text: 'end' }];
  fs.writeFileSync(session.file, `${JSON.stringify(entries[0])}\nnull\nbad-json\n${JSON.stringify(entries[1])}\n${JSON.stringify(entries[2])}`);
  assert.deepEqual(session.readPage({ limit: 2 }).entries, entries.slice(1));
  assert.equal(session.readPage({ limit: 2 }).hasMore, true);
  assert.deepEqual(session.readPage({ limit: 2, before: 4 }).entries, entries.slice(0, 1));
});

test('UI 分页保留早期状态、队列、恢复和上下文；长内容和内联音频按需读取', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-page-state-'));
  t.after(async () => { await disposeSessionReader(); fs.rmSync(directory, { recursive: true, force: true }); });
  const session = Session.create('Full state', { directory });
  session.setMode('auto-all'); session.setDesktopEnabled(true); session.setExpert('meeting', 'Keep transcript');
  const queued = session.enqueue('Queued');
  session.append({ type: 'turn_start', turnId: 'turn', prompt: 'Resume this' });
  session.append({ type: 'task_checkpoint', turnId: 'turn', phase: 'working', stepCount: 1 });
  for (let index = 0; index < 150; index++) session.append({ type: 'step_start', turnId: 'turn', step: index });
  const text = '长录音转写'.repeat(10000);
  const audio = Buffer.from('test-audio');
  const message = session.append({ type: 'message', role: 'user', content: [{ type: 'text', text }, { type: 'audio', mime: 'audio/mpeg', name: 'recording.mp3', dataUrl: `data:audio/mpeg;base64,${audio.toString('base64')}` }] });
  const original = fs.readFileSync(session.file);
  const snapshot = await readSessionView(session.id, 'snapshot', { limit: 10 }, directory);
  assert.equal(snapshot.entries.length, 10);
  assert.equal(snapshot.mode, 'auto-all'); assert.equal(snapshot.desktopEnabled, true); assert.equal(snapshot.expertId, 'meeting');
  assert.equal(snapshot.queue[0].queueId, queued.queueId);
  assert.equal(snapshot.recovery.available, true);
  assert.deepEqual(snapshot.context, session.contextStats());
  assert.equal(snapshot.history.entries, undefined);
  const preview = snapshot.entries.at(-1);
  assert.equal(preview.previewTruncated, true);
  assert.ok(preview.content[0].text.length < text.length);
  assert.equal(preview.content[1].dataUrl, undefined);
  assert.match(preview.content[1].url, /\/media\?path=/);
  const full = await readSessionView(session.id, 'entry', { entryId: message.id }, directory);
  assert.equal(full.content[0].text, text);
  const media = await readSessionView(session.id, 'media', { entryId: message.id, path: '["content",1]' }, directory);
  assert.deepEqual(Buffer.from(media.bytes), audio);
  session.append({ type: 'turn_end', turnId: 'turn', reason: 'done' });
  const updated = await readSessionView(session.id, 'snapshot', { limit: 10 }, directory);
  assert.equal(updated.recovery.available, false);
  assert.equal(updated.entries.at(-1).type, 'turn_end');
  assert.deepEqual(fs.readFileSync(session.file).subarray(0, original.length), original);
  const other = Session.create('Other workspace', { directory: path.join(directory, 'other') });
  assert.equal((await readSessionView(other.id, 'snapshot', { limit: 10 }, other.directory)).title, 'Other workspace');
  assert.equal((await readSessionView(session.id, 'snapshot', { limit: 10 }, directory)).mode, 'auto-all');
});

test('历史工具生成图片不会在下一轮重复注入模型上下文', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-session-context-media-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const session = Session.create('Context media', { directory });
  const media = session.saveAttachments([{ name: 'generated.png', mime: 'image/png', dataUrl: 'data:image/png;base64,' + Buffer.from('png').toString('base64') }], { imagesOnly: false })[0];
  session.append({ type: 'message', role: 'assistant', text: '已生成图片', toolCalls: [{ id: 'call-1', name: 'verify_media', args: {} }] });
  session.append({ type: 'message', role: 'tool', toolCallId: 'call-1', content: '完成', media: [media] });
  assert.equal(session.messages().some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image')), true);
  session.append({ type: 'message', role: 'user', content: '继续处理文字' });
  assert.equal(session.messages().some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image')), false);
});

test('读取 65 MB 会话时 HTTP 健康检查仍响应，首屏和附件不携带完整历史', { timeout: 25000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-page-http-')), dataRoot = path.join(root, 'data');
  const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
  runtime.prepareData(runtimeRoot, dataRoot);
  const directory = path.join(dataRoot, 'workspace', '.agent', 'sessions'); fs.mkdirSync(directory, { recursive: true });
  const session = Session.create('Large history', { directory });
  session.setMode('auto-all');
  const attachment = session.saveAttachments([{ name: 'recording.mp3', dataUrl: 'data:audio/mpeg;base64,' + Buffer.from('saved-audio').toString('base64') }], { imagesOnly: false })[0];
  const output = 'x'.repeat(16384);
  for (let index = 0; index < 4096; index++) session.append({ type: 'message', role: 'tool', toolCallId: `call-${index}`, content: output });
  session.append({ type: 'message', role: 'user', content: [{ type: 'text', text: 'Latest task' }, attachment] });
  const originalSize = fs.statSync(session.file).size;
  let instance;
  t.after(async () => {
    if (instance?.child.exitCode === null) { const exit = once(instance.child, 'exit'); instance.child.kill('SIGKILL'); await exit; }
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot, dataRoot, environment: { MLI_ACCOUNT_ENABLED: 'false', MLI_ACCOUNT_APP_SECRET: '', MLI_RUNTIME_MANAGED: '0' } });
  const { url } = await instance.ready;
  const snapshotPromise = fetch(`${url}/api/session/${session.id}?limit=12`).then(response => response.json());
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal((await fetch(url + '/api/runtime', { signal: AbortSignal.timeout(2000) })).status, 200);
  const snapshot = await snapshotPromise;
  assert.equal(snapshot.entries.length, 12); assert.equal(snapshot.mode, 'auto-all');
  assert.equal(snapshot.history.hasMore, true); assert.equal(snapshot.entries.at(-1).role, 'user');
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 200000);
  const older = await (await fetch(`${url}/api/session/${session.id}/entries?before=${snapshot.history.oldestId}&limit=12`)).json();
  assert.equal(older.entries.length, 12); assert.equal(older.newestId, snapshot.history.oldestId - 1);
  assert.equal(await (await fetch(url + attachment.url)).text(), 'saved-audio');
  assert.equal((await fetch(`${url}/api/session/missing?limit=12`)).status, 404);
  assert.equal((await fetch(`${url}/api/session/${session.id}/entries?before=invalid`)).status, 400);
  assert.equal(fs.statSync(session.file).size, originalSize);
});
