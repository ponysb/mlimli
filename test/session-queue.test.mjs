import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setWorkspaceRoot } from '../core/paths.mjs';
import { Session } from '../core/session.mjs';

test('排队消息持久化、调整、取回及消费', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-queue-'));
  setWorkspaceRoot(directory);
  try {
    const session = Session.create('队列测试');
    const next = session.enqueue('下一项任务');
    const adjustment = session.enqueue('调整当前任务');
    assert.deepEqual(Session.load(session.id).queued().map((item) => item.text), ['下一项任务', '调整当前任务']);
    assert.equal(session.messages().length, 0);
    session.adjustQueued(adjustment.queueId);
    assert.equal(session.queued()[1].mode, 'adjust');
    session.removeQueued(next.queueId);
    assert.deepEqual(session.queued().map((item) => item.text), ['调整当前任务']);
    session.append({ type: 'message', role: 'user', content: adjustment.text, queuedId: adjustment.queueId });
    assert.equal(session.queued().length, 0);
    assert.equal(Session.load(session.id).messages()[0].content, '调整当前任务');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
