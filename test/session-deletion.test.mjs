import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Session } from '../core/session.mjs';
import { readSessionView, disposeSessionReader } from '../core/session-view-service.mjs';

test('deleting a response removes linked tools, summary and stale compaction from context, pages and forks', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-delete-response-'));
  t.after(async () => { await disposeSessionReader(); fs.rmSync(directory, { recursive: true, force: true }); });
  const session = Session.create('删除验证', { directory });
  session.append({ type: 'message', role: 'user', content: '保留用户问题', turnId: 'one' });
  session.append({ type: 'step_start', turnId: 'one', step: 0 });
  session.append({ type: 'message', role: 'assistant', text: 'DELETE_RESPONSE', turnId: 'one', toolCalls: [{ id: 'call', name: 'read', args: {} }] });
  session.append({ type: 'message', role: 'tool', content: 'DELETE_TOOL', toolCallId: 'call', turnId: 'one' });
  session.append({ type: 'step_end', text: 'DELETE_RESPONSE', turnId: 'one', step: 0 });
  const summary = session.append({ type: 'task_summary', turnId: 'one', summaryText: 'DELETE_RESPONSE' });
  session.append({ type: 'compaction', summary: 'DELETE_RESPONSE DELETE_TOOL' });
  session.append({ type: 'message', role: 'user', content: '另一个问题', turnId: 'two' });
  await readSessionView(session.id, 'snapshot', { limit: 120 }, directory);
  session.deleteEntry(summary.id);
  const loaded = Session.load(session.id, directory);
  for (const value of [loaded.messages(), loaded.chain(), loaded.readPage(), await readSessionView(session.id, 'snapshot', { limit: 120 }, directory), loaded.fork().messages()]) {
    assert.ok(!JSON.stringify(value).includes('DELETE_RESPONSE'));
    assert.ok(!JSON.stringify(value).includes('DELETE_TOOL'));
  }
  assert.ok(JSON.stringify(loaded.messages()).includes('保留用户问题'));
  loaded.append({ type: 'compaction', summary: '新的安全摘要' });
  assert.ok(JSON.stringify(loaded.messages()).includes('新的安全摘要'));
  assert.throws(() => loaded.deleteEntry(summary.id), /不存在/);
  assert.throws(() => loaded.deleteEntry(0), /不可删除/);
});

test('deleting a user message also removes its recovery prompt and attached media access', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-delete-user-'));
  t.after(async () => { await disposeSessionReader(); fs.rmSync(directory, { recursive: true, force: true }); });
  const session = Session.create('删除用户验证', { directory });
  const user = session.append({ type: 'message', role: 'user', content: [{ type: 'text', text: 'DELETE_PROMPT' }, { type: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=', name: 'image.png', mime: 'image/png' }], turnId: 'one' });
  session.append({ type: 'turn_start', turnId: 'one', prompt: 'DELETE_PROMPT' });
  session.append({ type: 'task_checkpoint', turnId: 'one', phase: 'working' });
  session.append({ type: 'message', role: 'assistant', text: '保留回答', turnId: 'one' });
  session.append({ type: 'task_summary', turnId: 'one', promptText: 'DELETE_PROMPT', summaryText: '保留回答' });
  session.deleteEntry(user.id);
  assert.ok(!JSON.stringify(session.chain()).includes('DELETE_PROMPT'));
  assert.ok(!JSON.stringify(session.readPage()).includes('DELETE_PROMPT'));
  assert.ok(JSON.stringify(session.messages()).includes('保留回答'));
  assert.equal(session.snapshot().recovery.available, false);
  assert.equal(await readSessionView(session.id, 'entry', { entryId: user.id }, directory), null);
  assert.equal(await readSessionView(session.id, 'media', { entryId: user.id, path: '["content",1]' }, directory), null);
  const attachmentId = user.content[1].attachmentId;
  assert.equal(session.attachment(attachmentId), null);
});
