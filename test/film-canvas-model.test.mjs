import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateGraph, generationContext, mediaKind, replacementMediaData, referenceContext, upstreamNodes, validReferenceRole, snapshot, selectionToolbarPosition } from '../react/src/film-canvas-model.mjs';
const nodes = [
  { id: 'a', type: 'media', position: { x: 0, y: 0 }, data: { title: '参考', assetId: 'asset1' } },
  { id: 'b', type: 'result', position: { x: 320, y: 0 }, data: { title: '镜头', kind: 'video' } },
];
const edges = [{ id: 'edge', source: 'a', target: 'b', label: '首帧' }];

test('选区操作栏在上方居中，随拖动、平移和缩放定位且保持固定尺寸', () => {
  const bounds = { x: 400, y: 300, width: 270, height: 280 };
  const canvas = { width: 1200, height: 900 }, toolbar = { width: 360, height: 44 };
  assert.deepEqual(selectionToolbarPosition(bounds, { x: 0, y: 0, zoom: 1 }, canvas, toolbar), { left: 355, top: 244 });
  assert.deepEqual(selectionToolbarPosition({ ...bounds, x: 450, y: 340 }, { x: 0, y: 0, zoom: 1 }, canvas, toolbar), { left: 405, top: 284 });
  assert.deepEqual(selectionToolbarPosition(bounds, { x: 50, y: 40, zoom: 1 }, canvas, toolbar), { left: 405, top: 284 });
  assert.deepEqual(selectionToolbarPosition(bounds, { x: 0, y: 0, zoom: 2 }, canvas, toolbar), { left: 828, top: 544 });
});

test('选区操作栏在顶部空间不足时翻到下方，并限制在画布边缘内', () => {
  const canvas = { width: 800, height: 600 }, toolbar = { width: 360, height: 44 }, viewport = { x: 0, y: 0, zoom: 1 };
  assert.deepEqual(selectionToolbarPosition({ x: 0, y: 30, width: 270, height: 200 }, viewport, canvas, toolbar), { left: 12, top: 242 });
  assert.deepEqual(selectionToolbarPosition({ x: 700, y: 300, width: 270, height: 200 }, viewport, canvas, toolbar), { left: 428, top: 244 });
  assert.deepEqual(selectionToolbarPosition({ x: 0, y: -200, width: 270, height: 1000 }, viewport, canvas, toolbar), { left: 12, top: 544 });
  const narrow = selectionToolbarPosition({ x: 0, y: 0, width: 270, height: 200 }, viewport, { width: 280, height: 180 }, { width: 256, height: 44 });
  assert.deepEqual(narrow, { left: 12, top: 124 });
});
test('复制选区重映射内部连线，不复制选区外连线', () => {
  let index = 0;
  const copy = duplicateGraph(nodes, edges, ['a', 'b'], () => 'copy' + index++);
  assert.equal(copy.edges[0].source, copy.nodes[0].id);
  assert.equal(copy.edges[0].target, copy.nodes[1].id);
  assert.equal(copy.edges[0].label, '首帧');
  assert.equal(copy.nodes[0].position.x, 48);
  assert.equal(duplicateGraph(nodes, edges, ['a'], () => 'one').edges.length, 0);
});
test('上游上下文跨多级且循环安全，不包含无关分支', () => {
  const all = [...nodes, { id: 'c', type: 'prompt', data: { text: '夜景' } }, { id: 'unrelated', type: 'media', data: {} }];
  const links = [...edges, { source: 'c', target: 'a', label: '提示词' }, { source: 'b', target: 'c', label: '参考' }];
  assert.deepEqual(upstreamNodes(all, links, ['b']).map(node => node.id), ['a', 'b', 'c']);
  const context = generationContext(all, links, ['b'], { b: '风格参考' });
  assert.equal(context.find(node => node.id === 'b').referenceRole, '风格参考');
  assert.equal(context.find(node => node.id === 'c').text, '夜景');
  assert.equal(context.find(node => node.id === 'a').explicitReference, false);
  assert.deepEqual(generationContext(all, links, ['b'], {}, false).map(node => node.id), ['b']);
});
test('引用用途检查媒体类型和已有素材，支持路径识别视频', () => {
  assert.equal(validReferenceRole(nodes[0], '首帧'), true);
  assert.equal(validReferenceRole(nodes[1], '尾帧'), false);
  assert.equal(validReferenceRole({ type: 'result', data: { kind: 'image' } }, '首帧'), false);
  assert.equal(validReferenceRole({ type: 'media', data: { mime: 'audio/wav', path: 'voice.wav' } }, '音频'), true);
  assert.equal(validReferenceRole({ type: 'result', data: { mime: 'audio/wav' } }, '音频'), false);
  assert.equal(mediaKind({ path: 'shots/output.mp4' }), 'video');
});
test('替换素材会更新媒体类型并保留节点制作属性', () => {
  const current = { title: '分镜一', kind: 'image', assetId: 'old', mime: 'image/png', model: 'image-model', params: { seed: 1 }, runId: 'run-1', status: 'error', error: '旧错误', favorite: true, shotId: 'shot-1', versions: [{ id: 'v1' }] };
  const replaced = replacementMediaData(current, { id: 'new', title: 'clip.mp4', kind: 'video', mime: 'video/mp4' });
  assert.equal(replaced.assetId, 'new');
  assert.equal(replaced.kind, 'video');
  assert.equal(replaced.mime, 'video/mp4');
  assert.equal(replaced.title, '分镜一');
  assert.equal(replaced.status, 'completed');
  assert.equal(replaced.model, undefined);
  assert.equal(replaced.params, undefined);
  assert.equal(replaced.runId, undefined);
  assert.equal(replaced.error, undefined);
  assert.equal(replaced.favorite, true);
  assert.equal(replaced.shotId, 'shot-1');
  assert.deepEqual(replaced.versions, [{ id: 'v1' }]);
  assert.equal(replacementMediaData({}, { title: 'sound.wav' }).title, 'sound.wav');
});
test('发送上下文保留媒体与语义关系；历史快照不受之后编辑影响', () => {
  const refs = referenceContext([nodes[1]], edges);
  assert.equal(refs[0].relations[0].label, '首帧');
  const before = snapshot(nodes, edges);
  before.nodes[0].data.title = '修改';
  assert.equal(nodes[0].data.title, '参考');
  const compact = referenceContext([{ ...nodes[0], data: { ...nodes[0].data, versions: [{ id: 'old', data: { text: '历史提示词' } }], actions: { preview() {} } } }], []);
  assert.equal(compact[0].versions, undefined);
  assert.equal(compact[0].actions, undefined);
  assert.equal(compact[0].assetId, 'asset1');
});
