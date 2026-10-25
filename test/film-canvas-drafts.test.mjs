import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasDraftKey, readCanvasDraft, writeCanvasDraft } from '../react/src/film-canvas-drafts.mjs';
test('草稿按工作区隔离，保留基础版本与蒙版需求，损坏数据不恢复', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const a = { path: '/project/a' }, b = { path: '/project/b' };
  writeCanvasDraft(storage, a, { graph: { nodes: [], edges: [] }, base: { revision: 2, nodes: [], edges: [] }, draft: '夜景', references: ['a'], editRequest: { mode: 'mask', mask: 'data:image/png;base64,test' } });
  assert.equal(readCanvasDraft(storage, a).draft, '夜景');
  assert.equal(readCanvasDraft(storage, a).base.revision, 2);
  assert.equal(readCanvasDraft(storage, a).editRequest.mode, 'mask');
  assert.equal(readCanvasDraft(storage, b), null);
  storage.setItem(canvasDraftKey(b), '{broken');
  assert.equal(readCanvasDraft(storage, b), null);
});
