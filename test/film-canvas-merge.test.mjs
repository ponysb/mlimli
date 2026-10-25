import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFilmCanvas } from '../core/film-canvas-merge.mjs';
import { snapshot } from '../react/src/film-canvas-model.mjs';

const base = { nodes: [{ id: 'shot', type: 'result', position: { x: 0, y: 0 }, data: { status: 'running', title: '镜头' } }], edges: [] };
test('移动节点与 Agent 完成结果按字段合并，保留新节点', () => {
  const local = structuredClone(base), remote = structuredClone(base);
  local.nodes[0].position.x = 500;
  remote.nodes[0].data.status = 'completed'; remote.nodes[0].data.path = 'shot.mp4';
  remote.nodes.push({ id: 'new', type: 'media', position: { x: 1, y: 1 }, data: {} });
  const merged = mergeFilmCanvas(base, local, remote);
  assert.equal(merged.nodes[0].position.x, 500);
  assert.equal(merged.nodes[0].data.path, 'shot.mp4');
  assert.equal(merged.nodes.length, 2);
});
test('相同字段冲突与删除正在修改的节点不能静默覆盖', () => {
  const local = structuredClone(base), remote = structuredClone(base);
  local.nodes[0].data.title = '本地'; remote.nodes[0].data.title = 'Agent';
  assert.throws(() => mergeFilmCanvas(base, local, remote), { statusCode: 409 });
  local.nodes = [];
  assert.throws(() => mergeFilmCanvas(base, local, remote), { statusCode: 409 });
});
test('选中和拖动状态不进入持久化快照', () => {
  const nodes = [{ ...base.nodes[0], selected: true, dragging: true, measured: { width: 100 } }];
  assert.deepEqual(snapshot(nodes, [{ id: 'e', selected: true }]), { nodes: base.nodes, edges: [{ id: 'e' }] });
});
test('显式解决冲突只选择冲突字段，保留双方非冲突内容', () => {
  const local = structuredClone(base), remote = structuredClone(base);
  local.nodes[0].data.title = '本地'; local.nodes[0].position.x = 300;
  remote.nodes[0].data.title = '远端'; remote.nodes[0].data.path = 'result.png';
  const own = mergeFilmCanvas(base, local, remote, 'local');
  assert.equal(own.nodes[0].data.title, '本地');
  assert.equal(own.nodes[0].data.path, 'result.png');
  const other = mergeFilmCanvas(base, local, remote, 'remote');
  assert.equal(other.nodes[0].data.title, '远端');
  assert.equal(other.nodes[0].position.x, 300);
});
