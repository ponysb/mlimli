import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getWorkspaceRoot, setWorkspaceRoot } from '../core/paths.mjs';
import { Session } from '../core/session.mjs';

test('兼容旧版 MLI Agent 会话并以压缩上下文导入', (t) => {
  const previous = getWorkspaceRoot();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-session-compat-'));
  t.after(() => { setWorkspaceRoot(previous); fs.rmSync(root, { recursive: true, force: true }); });
  const legacyDir = path.join(root, '.mlimli', '.agent-sessions');
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, 'session-old.jsonl'), [
    JSON.stringify({ role: 'user', content: '继续完善洪荒传的章纲', timestamp: Date.now() }),
    JSON.stringify({ role: 'assistant', content: '已经完成卷一和卷二的章节规划。', timestamp: Date.now() }),
  ].join('\n'));
  setWorkspaceRoot(root);
  const sessions = Session.list();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].source, 'legacy-import');
  const imported = Session.load(sessions[0].id);
  assert.equal(imported.chain()[1].type, 'compaction');
  assert.equal(imported.chain()[1].source, 'legacy-import');
  assert.match(imported.chain()[1].summary, /继续完善洪荒传的章纲/);
  assert.match(imported.messages()[0].content, /历史会话已导入/);
});
