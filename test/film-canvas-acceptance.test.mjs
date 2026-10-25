import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateGraph, generationContext, mediaKind, snapshot, upstreamNodes, validReferenceRole } from '../react/src/film-canvas-model.mjs';
import { mergeFilmCanvas } from '../core/film-canvas-merge.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getWorkspaceRoot, setWorkspaceRoot } from '../core/paths.mjs';
import { readFilmCanvas, writeFilmCanvas } from '../core/film-canvas.mjs';

const node = (id, data = {}, type = 'media') => ({ id, type, position: { x: 0, y: 0 }, data: { title: id, ...data } });
const edge = (id, source, target, label = '参考') => ({ id, source, target, label });
const graph = (nodes = [], edges = []) => ({ nodes, edges });

test('CTX-01: dependency closure includes shared ancestors once and excludes downstream/unrelated nodes', () => {
  const nodes = ['subject', 'style', 'image', 'video', 'other'].map(id => node(id));
  const edges = [edge('a', 'subject', 'image'), edge('b', 'style', 'image'), edge('c', 'image', 'video'), edge('d', 'subject', 'video')];
  assert.deepEqual(upstreamNodes(nodes, edges, ['video', 'video']).map(item => item.id), ['subject', 'style', 'image', 'video']);
  assert.deepEqual(upstreamNodes(nodes, edges, ['image']).map(item => item.id), ['subject', 'style', 'image']);
});

test('CTX-02: cyclic, dangling and unknown selections terminate without inventing nodes', () => {
  const nodes = [node('a'), node('b'), node('unrelated')];
  const edges = [edge('a-b', 'a', 'b'), edge('b-a', 'b', 'a'), edge('missing', 'ghost', 'a')];
  assert.deepEqual(upstreamNodes(nodes, edges, ['b']).map(item => item.id), ['a', 'b']);
  assert.deepEqual(upstreamNodes(nodes, edges, ['missing']), []);
  assert.deepEqual(upstreamNodes(nodes, edges, []), []);
});

test('CTX-03: context retains typed provenance and excludes relations outside the sent graph', () => {
  const nodes = [node('prompt', { text: '追踪主体' }, 'prompt'), node('first', { path: 'first.png' }), node('shot', { kind: 'video', params: { duration: 5 } }, 'result'), node('other')];
  const edges = [edge('p', 'prompt', 'shot', '提示词'), edge('f', 'first', 'shot', '首帧'), edge('o', 'shot', 'other')];
  const context = generationContext(nodes, edges, ['shot'], { shot: '风格参考' });
  assert.equal(context.find(item => item.id === 'prompt').referenceRole, '提示词');
  assert.equal(context.find(item => item.id === 'first').explicitReference, false);
  assert.equal(context.find(item => item.id === 'shot').explicitReference, true);
  assert.equal(context.find(item => item.id === 'shot').params.duration, 5);
  assert.ok(context.find(item => item.id === 'shot').relations.some(item => item.label === '首帧'));
  assert.ok(context.every(item => item.relations.every(relation => relation.target !== 'other')));
  const explicit = generationContext(nodes, edges, ['shot'], {}, false);
  assert.deepEqual(explicit.map(item => item.id), ['shot']);
  assert.deepEqual(explicit[0].relations, []);
});

test('CTX-04: first/last frame roles require existing still media; unsupported roles are rejected', () => {
  for (const role of ['首帧', '尾帧']) {
    assert.equal(validReferenceRole(node('image', { mime: 'image/png', assetId: 'asset' }), role), true);
    assert.equal(validReferenceRole(node('pending', { kind: 'image' }, 'result'), role), false);
    assert.equal(validReferenceRole(node('video', { kind: 'video', path: 'shot.mp4' }), role), false);
    assert.equal(validReferenceRole(node('text', { path: 'still.png' }, 'prompt'), role), false);
  }
  assert.equal(validReferenceRole(node('audio', { path: 'voice.WAV' }), '音频'), true);
  assert.equal(validReferenceRole(node('image', { path: 'still.png' }), '音频'), false);
  assert.equal(validReferenceRole(node('empty'), '提示词'), false);
  assert.equal(validReferenceRole(node('text', { text: '对白' }), '提示词'), true);
  assert.equal(validReferenceRole(node('empty'), 'unknown'), false);
  assert.equal(mediaKind({ mime: 'video/quicktime' }), 'video');
});

test('EDIT-01: duplicate selected subgraph preserves provenance, fresh IDs, offsets and source immutability', () => {
  const original = graph([node('a', { path: 'still.png' }), node('b', { kind: 'video', params: { duration: 5 } }, 'result'), node('c')], [edge('internal', 'a', 'b', '首帧'), edge('external', 'b', 'c')]);
  const before = structuredClone(original);
  let next = 0;
  const copy = duplicateGraph(original.nodes, original.edges, ['a', 'b'], () => `copy-${++next}`);
  assert.equal(new Set([...copy.nodes, ...copy.edges].map(item => item.id)).size, 3);
  assert.equal(copy.edges.length, 1);
  assert.deepEqual([copy.edges[0].source, copy.edges[0].target, copy.edges[0].label], ['copy-1', 'copy-2', '首帧']);
  assert.ok(copy.nodes.every(item => item.position.x === 48 && item.position.y === 48 && item.selected));
  assert.equal(copy.nodes[1].data.params.duration, 5);
  assert.deepEqual(original, before);
});

test('SAVE-01: snapshots remove transient interaction flags while retaining media and editor state', () => {
  const original = graph([{ ...node('a', { path: 'still.png', favorite: true, shotId: 'shot-1' }), selected: true, dragging: true, measured: { width: 200 } }], [{ ...edge('e', 'a', 'a'), selected: true }]);
  const saved = snapshot(original.nodes, original.edges);
  assert.equal('selected' in saved.nodes[0], false);
  assert.equal('dragging' in saved.nodes[0], false);
  assert.equal('measured' in saved.nodes[0], false);
  assert.equal('selected' in saved.edges[0], false);
  assert.equal(saved.nodes[0].data.favorite, true);
  saved.nodes[0].data.shotId = 'changed';
  assert.equal(original.nodes[0].data.shotId, 'shot-1');
});

test('SAVE-02: local node deletion and independent remote addition merge without dangling edges', () => {
  const base = graph([node('a'), node('b')], [edge('ab', 'a', 'b')]);
  const local = graph([node('b')], []);
  const remote = structuredClone(base);
  remote.nodes.push(node('c')); remote.edges.push(edge('bc', 'b', 'c'));
  const merged = mergeFilmCanvas(base, local, remote);
  assert.deepEqual(new Set(merged.nodes.map(item => item.id)), new Set(['b', 'c']));
  assert.deepEqual(merged.edges.map(item => item.id), ['bc']);
});

test('SAVE-03: remote deletion and independent local edit preserve both intentions', () => {
  const base = graph([node('a'), node('b')], [edge('ab', 'a', 'b')]);
  const local = structuredClone(base); local.nodes[1].data.title = '本地标题';
  const merged = mergeFilmCanvas(base, local, graph([node('b')], []));
  assert.deepEqual(merged.nodes.map(item => item.id), ['b']);
  assert.equal(merged.nodes[0].data.title, '本地标题');
  assert.deepEqual(merged.edges, []);
});

test('SAVE-04: same deletion on both sides is idempotent and inputs remain unchanged', () => {
  const base = graph([node('a'), node('b')], [edge('ab', 'a', 'b')]);
  const removed = graph([node('b')], []), before = structuredClone(base);
  assert.deepEqual(mergeFilmCanvas(base, removed, removed), removed);
  assert.deepEqual(base, before);
});

test('SAVE-05: conflicting additions under the same node ID never overwrite silently', () => {
  assert.throws(() => mergeFilmCanvas(graph(), graph([node('same', { title: '用户' })]), graph([node('same', { title: 'Agent' })])), { statusCode: 409 });
});

test('SAVE-06: independent nested generation parameters and canvas positions merge field by field', () => {
  const base = graph([node('shot', { params: { duration: 5, seed: 1 }, status: 'running' }, 'result')]);
  const local = structuredClone(base), remote = structuredClone(base);
  local.nodes[0].position.x = 640; local.nodes[0].data.params.duration = 8;
  remote.nodes[0].data.params.seed = 2; remote.nodes[0].data.status = 'completed'; remote.nodes[0].data.path = 'done.mp4';
  const merged = mergeFilmCanvas(base, local, remote);
  assert.deepEqual(merged.nodes[0].data.params, { duration: 8, seed: 2 });
  assert.equal(merged.nodes[0].position.x, 640);
  assert.equal(merged.nodes[0].data.path, 'done.mp4');
});

test('SAVE-07: edge role conflicts require resolution and keep independent node changes', () => {
  const base = graph([node('a'), node('b')], [edge('ab', 'a', 'b')]);
  const local = structuredClone(base), remote = structuredClone(base);
  local.edges[0].label = '首帧'; remote.edges[0].label = '主体参考';
  local.nodes[0].position.x = 100; remote.nodes[1].data.favorite = true;
  assert.throws(() => mergeFilmCanvas(base, local, remote), { statusCode: 409 });
  for (const preference of ['local', 'remote']) {
    const merged = mergeFilmCanvas(base, local, remote, preference);
    assert.equal(merged.edges[0].label, preference === 'local' ? '首帧' : '主体参考');
    assert.equal(merged.nodes[0].position.x, 100);
    assert.equal(merged.nodes[1].data.favorite, true);
  }
});

test('SAVE-08: conflicting array changes require resolution rather than inventing version order', () => {
  const base = graph([node('a', { versions: [] })]);
  const local = structuredClone(base), remote = structuredClone(base);
  local.nodes[0].data.versions = [{ id: 'local' }]; remote.nodes[0].data.versions = [{ id: 'remote' }];
  assert.throws(() => mergeFilmCanvas(base, local, remote), { statusCode: 409 });
});

test('QA-05: maximum 500-node/1000-edge canvas round-trips, over-limit writes stay atomic', () => {
  const previous = getWorkspaceRoot(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'film-capacity-'));
  try {
    setWorkspaceRoot(root);
    const nodes = Array.from({ length: 500 }, (_, index) => node(`node-${index}`, { text: `镜头 ${index}` }));
    const edges = Array.from({ length: 1000 }, (_, index) => edge(`edge-${index}`, `node-${index % 500}`, `node-${(index % 500 + (index < 500 ? 1 : 2)) % 500}`));
    const result = writeFilmCanvas(graph(nodes, edges));
    assert.equal(result.nodes.length, 500);
    assert.equal(result.edges.length, 1000);
    assert.deepEqual(readFilmCanvas(), result);
    const filename = path.join(root, '.agent', 'film-canvases', 'default.json'), bytes = fs.readFileSync(filename, 'utf8');
    assert.throws(() => writeFilmCanvas(graph([...nodes, node('overflow')], edges)), /超出限制/);
    assert.equal(fs.readFileSync(filename, 'utf8'), bytes);
    assert.throws(() => writeFilmCanvas(graph(nodes, [...edges, edge('overflow', 'node-0', 'node-2')])), /超出限制/);
    assert.equal(fs.readFileSync(filename, 'utf8'), bytes);
  } finally {
    setWorkspaceRoot(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('QA-05: size limit rejects large valid metadata without damaging last saved graph', () => {
  const previous = getWorkspaceRoot(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'film-byte-limit-'));
  try {
    setWorkspaceRoot(root);
    const before = writeFilmCanvas(graph([node('safe')]));
    const oversized = graph([node('large', { params: { promptArchive: 'x'.repeat(8 * 1024 * 1024) } })]);
    assert.throws(() => writeFilmCanvas(oversized), /8 MB/);
    assert.deepEqual(readFilmCanvas(), before);
  } finally {
    setWorkspaceRoot(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
