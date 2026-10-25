import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setWorkspaceRoot } from '../core/paths.mjs';
import { addFilmCanvasNode, connectFilmCanvasNodes, filmCanvasMediaPath, readFilmCanvas, saveFilmCanvasEdits, updateFilmCanvasNode, writeFilmCanvas } from '../core/film-canvas.mjs';
import { filmCanvasTools } from '../core/film-canvas-tools.mjs';

test('AI 影视画布持久化、节点引用、连线校验和工作区媒体边界', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'film-canvas-'));
  const previous = process.cwd();
  try {
    setWorkspaceRoot(root);
    fs.writeFileSync(path.join(root, 'shot.png'), 'image');
    const first = addFilmCanvasNode({ type: 'media', data: { title: '参考画面', path: 'shot.png' } });
    const firstId = first.nodes[0].id;
    const second = addFilmCanvasNode({ type: 'result', data: { title: '生成结果', status: 'running' } });
    const secondId = second.nodes[1].id;
    connectFilmCanvasNodes(firstId, secondId, '参考');
    updateFilmCanvasNode(secondId, { data: { title: '完成结果', status: 'ready' }, position: { x: 400, y: 120 } });
    const saved = readFilmCanvas();
    assert.equal(saved.nodes[1].data.title, '完成结果');
    assert.equal(saved.nodes[1].position.x, 400);
    assert.equal(saved.edges[0].source, firstId);
    const local = structuredClone(saved);
    local.nodes[1].position.x = 700;
    updateFilmCanvasNode(secondId, { data: { title: '完成结果', status: 'completed', path: 'shot.png' } });
    const merged = saveFilmCanvasEdits({ ...local, base: saved });
    assert.equal(merged.nodes[1].position.x, 700);
    assert.equal(merged.nodes[1].data.status, 'completed');
    assert.ok(merged.revision > saved.revision);
    assert.equal(readFilmCanvas().updatedAt, merged.updatedAt);
    assert.throws(() => saveFilmCanvasEdits(local), { statusCode: 409 });
    const updateTool = filmCanvasTools.find(tool => tool.name === 'film_canvas_update_node');
    updateTool.run({ nodeId: secondId, status: 'cancelled', kind: 'video', model: 'test-model', runId: 'test-run', params: { duration: 5 }, error: '已取消' });
    const toolNode = readFilmCanvas().nodes.find(node => node.id === secondId);
    assert.equal(toolNode.data.kind, 'video');
    assert.equal(toolNode.data.params.duration, 5);
    assert.equal(toolNode.data.status, 'cancelled');
    assert.equal(filmCanvasMediaPath('shot.png').size, 5);
    assert.throws(() => filmCanvasMediaPath('../outside.png'), /路径/);
    fs.symlinkSync(path.join(root, '..'), path.join(root, 'escape'));
    assert.throws(() => filmCanvasMediaPath('escape/outside.png'), /路径/);
    assert.throws(() => filmCanvasMediaPath('https://example.com/image.png'), /路径/);
    fs.writeFileSync(path.join(root, 'private.txt'), 'private');
    assert.throws(() => filmCanvasMediaPath('private.txt'), /仅支持/);
    assert.throws(() => writeFilmCanvas({ nodes: saved.nodes, edges: [{ source: firstId, target: 'missing' }] }), /不存在/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    setWorkspaceRoot(previous);
  }
});
