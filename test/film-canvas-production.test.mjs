import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getWorkspaceRoot, setWorkspaceRoot } from '../core/paths.mjs';
import { listAssets } from '../core/assets.mjs';
import { addFilmCanvasNode, archiveFilmCanvasNode, arrangeFilmCanvasNodes, batchUpdateFilmCanvasNodes, connectFilmCanvasNodes, deleteFilmCanvasNodes, disconnectFilmCanvasEdges, groupFilmCanvasNodes, readFilmCanvas, readFilmCanvasVersions, restoreFilmCanvasVersion, updateFilmCanvasNode, writeFilmCanvas } from '../core/film-canvas.mjs';
import { filmCanvasTools } from '../core/film-canvas-tools.mjs';

function workspace(run) {
  const previous = getWorkspaceRoot(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'film-production-'));
  try { setWorkspaceRoot(root); run(root); }
  finally { setWorkspaceRoot(previous); fs.rmSync(root, { recursive: true, force: true }); }
}
const add = (id, data = {}) => addFilmCanvasNode({ id, type: 'result', position: { x: 0, y: 0 }, data });

test('media replacements retain restorable versions across saves and restores', () => workspace(() => {
  add('result', { path: 'first.png', mime: 'image/png', kind: 'image', model: 'a', params: { seed: 1 }, title: '镜头' });
  updateFilmCanvasNode('result', { data: { path: 'second.mp4', mime: 'video/mp4', kind: 'video', model: 'b', params: { duration: 5 }, title: '镜头', status: 'completed' } });
  const [first] = readFilmCanvasVersions('result');
  assert.ok(first.id);
  assert.ok(first.createdAt > 0);
  assert.equal(first.data.path, 'first.png');
  assert.deepEqual(first.data.params, { seed: 1 });
  updateFilmCanvasNode('result', { position: { x: 2, y: 3 } });
  assert.equal(readFilmCanvasVersions('result').length, 1);
  restoreFilmCanvasVersion('result', first.id);
  const node = readFilmCanvas().nodes[0];
  assert.equal(node.data.path, 'first.png');
  assert.equal(node.data.kind, 'image');
  assert.equal(node.data.title, '镜头');
  assert.equal(node.data.status, 'completed');
  assert.equal(node.data.versions.length, 2);
  assert.equal(node.data.versions[1].data.path, 'second.mp4');
  assert.equal(node.data.versions[1].data.versions, undefined);
  assert.throws(() => restoreFilmCanvasVersion('result', 'missing'), /版本不存在/);
}));

test('invalid graph and batch writes remain atomic and preserve metadata', () => workspace(() => {
  add('a', { title: 'a' }); add('b', { title: 'b' });
  const before = readFilmCanvas();
  assert.throws(() => batchUpdateFilmCanvasNodes([{ nodeId: 'a', patch: { data: { title: 'changed' } } }, { nodeId: 'b', patch: { position: { x: NaN, y: 0 } } }]), /节点无效/);
  assert.deepEqual(readFilmCanvas(), before);
  assert.throws(() => batchUpdateFilmCanvasNodes([{ nodeId: 'missing', patch: { data: {} } }]), /节点不存在/);
  assert.throws(() => batchUpdateFilmCanvasNodes([{ nodeId: 'a', patch: { id: 'other' } }]), /字段无效/);
  assert.throws(() => writeFilmCanvas({ ...before, nodes: [...before.nodes, before.nodes[0]] }), /节点无效/);
  assert.throws(() => updateFilmCanvasNode('a', { data: { favorite: 'yes' } }), /收藏/);
  assert.throws(() => updateFilmCanvasNode('a', { data: { status: 'unknown' } }), /状态/);
  assert.throws(() => batchUpdateFilmCanvasNodes([{ nodeId: 'a', patch: { data: null } }]), /数据无效/);
  assert.throws(() => updateFilmCanvasNode('a', { data: { versions: [{ id: 'bad', createdAt: 1, data: { versions: [] } }] } }), /不能嵌套/);
  assert.throws(() => connectFilmCanvasNodes('a', 'a'), /无效/);
  batchUpdateFilmCanvasNodes([{ nodeId: 'a', patch: { data: { favorite: true, elementRole: 'character' } } }, { nodeId: 'b', patch: { data: { text: '保留原图' } } }]);
  assert.equal(readFilmCanvas().nodes[0].data.title, 'a');
  assert.equal(readFilmCanvas().nodes[0].data.favorite, true);
  assert.equal(readFilmCanvas().nodes[1].data.text, '保留原图');
}));

test('arrange, shot grouping, edge deletion and cascading node deletion', () => workspace(() => {
  add('a'); add('b'); add('c');
  let graph = connectFilmCanvasNodes('a', 'b', '首帧');
  const firstEdge = graph.edges[0].id;
  graph = connectFilmCanvasNodes('b', 'c', '参考');
  assert.throws(() => writeFilmCanvas({ ...graph, edges: [...graph.edges, graph.edges[0]] }), /连线无效/);
  groupFilmCanvasNodes({ nodeIds: ['a', 'b'], shotId: 'shot-1', shotTitle: '开场', shotOrder: 1 });
  arrangeFilmCanvasNodes({ nodeIds: ['a', 'b'], layout: 'row', gap: 40, origin: { x: 10, y: 20 } });
  graph = readFilmCanvas();
  assert.equal(graph.nodes[0].data.shotId, 'shot-1');
  assert.equal(graph.nodes[1].data.shotTitle, '开场');
  assert.equal(graph.nodes[2].data.shotId, undefined);
  assert.deepEqual(graph.nodes[0].position, { x: 10, y: 20 });
  assert.ok(graph.nodes[1].position.x >= 330);
  assert.throws(() => arrangeFilmCanvasNodes({ layout: 'diagonal' }), /排列/);
  assert.throws(() => groupFilmCanvasNodes({ nodeIds: ['missing'] }), /不存在/);
  disconnectFilmCanvasEdges([firstEdge]);
  assert.equal(readFilmCanvas().edges.length, 1);
  deleteFilmCanvasNodes(['b']);
  assert.equal(readFilmCanvas().edges.length, 0);
  assert.deepEqual(readFilmCanvas().nodes.map(node => node.id), ['a', 'c']);
}));

test('explicit resource archival stays inside temp workspace and is idempotent', () => workspace(root => {
  fs.writeFileSync(path.join(root, 'image.png'), Buffer.from('test image'));
  add('a', { title: '生成图片', path: 'image.png', runId: 'run-1' });
  assert.equal(listAssets().length, 0);
  let graph = archiveFilmCanvasNode('a');
  const assetId = graph.nodes[0].data.assetId;
  assert.ok(assetId);
  assert.equal(graph.nodes[0].data.path, 'image.png');
  assert.equal(readFilmCanvasVersions('a').length, 0);
  assert.equal(listAssets().length, 1);
  assert.equal(listAssets()[0].metadata.runId, 'run-1');
  graph = archiveFilmCanvasNode('a');
  assert.equal(graph.nodes[0].data.assetId, assetId);
  assert.equal(listAssets().length, 1);
  assert.ok(fs.existsSync(path.join(root, '.agent', 'assets', listAssets()[0].file)));
  add('outside', { path: '../outside.png' });
  assert.throws(() => archiveFilmCanvasNode('outside'), /路径/);
  assert.equal(listAssets().length, 1);
}));

test('media history has a bounded size without overwriting the current result', () => workspace(() => {
  add('a', { path: '0.png' });
  for (let index = 1; index <= 105; index++) updateFilmCanvasNode('a', { data: { path: `${index}.png` } });
  const node = readFilmCanvas().nodes[0];
  assert.equal(node.data.path, '105.png');
  assert.equal(node.data.versions.length, 100);
  assert.equal(node.data.versions[0].data.path, '5.png');
  assert.equal(new Set(node.data.versions.map(version => version.id)).size, 100);
}));

test('Agent tools expose and exercise production fields and graph capabilities', () => workspace(() => {
  const call = (name, args) => JSON.parse(filmCanvasTools.find(item => item.name === name).run(args).content);
  const node = call('film_canvas_add_node', { type: 'result', title: '关键帧', favorite: true, elementRole: 'style', kind: 'image' }).nodes[0];
  call('film_canvas_update_node', { nodeId: node.id, favorite: false, shotId: 'shot', shotTitle: '室内', shotOrder: 2, status: 'completed' });
  assert.equal(readFilmCanvas().nodes[0].data.favorite, false);
  assert.equal(readFilmCanvas().nodes[0].data.status, 'completed');
  assert.deepEqual(call('film_canvas_versions', { nodeId: node.id }), []);
  call('film_canvas_arrange', { nodeIds: [node.id], layout: 'column' });
  call('film_canvas_batch_update', { updates: [{ nodeId: node.id, patch: { data: { text: '柔和日光' } } }] });
  assert.equal(readFilmCanvas().nodes[0].data.text, '柔和日光');
  call('film_canvas_group', { nodeIds: [node.id], shotTitle: '新分镜' });
  assert.equal(readFilmCanvas().nodes[0].data.shotTitle, '新分镜');
  call('film_canvas_delete_nodes', { nodeIds: [node.id] });
  assert.equal(readFilmCanvas().nodes.length, 0);
}));
