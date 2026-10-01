import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getWorkspaceRoot, setWorkspaceRoot } from '../core/paths.mjs';
import { Session } from '../core/session.mjs';

test('缺失的工具结果在重建模型上下文时补齐', (t) => {
  const previous = getWorkspaceRoot();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-tool-replay-'));
  t.after(() => { setWorkspaceRoot(previous); fs.rmSync(root, { recursive: true, force: true }); });
  setWorkspaceRoot(root);
  const session = Session.create();
  session.append({ type: 'message', role: 'user', content: '检查文件' });
  session.append({ type: 'message', role: 'assistant', text: '', toolCalls: [
    { id: 'call_1', name: 'read_file', args: { path: 'a.txt' } },
    { id: 'call_2', name: 'read_file', args: { path: 'b.txt' } },
  ] });
  session.append({ type: 'message', role: 'tool', toolCallId: 'call_1', content: 'A' });
  session.append({ type: 'message', role: 'user', content: '继续' });
  session.append({ type: 'message', role: 'tool', toolCallId: 'stale_call', content: '孤立结果' });

  const messages = session.messages();
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant', 'tool', 'tool', 'user']);
  assert.equal(messages[2].toolCallId, 'call_1');
  assert.equal(messages[3].toolCallId, 'call_2');
  assert.match(messages[3].content, /结果未记录/);
  assert.equal(messages[4].content, '继续');
  assert.deepEqual(session.messages({ contextWindow: 2000 }), messages);
});
