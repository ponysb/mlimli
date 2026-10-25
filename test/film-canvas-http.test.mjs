import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

test('真实 HTTP：保存、批量、版本、归档、隔离和非法输入验收', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-http-')), workspace = path.join(root, '中文工作区 空格%25');
  fs.mkdirSync(workspace); fs.copyFileSync(new URL('../config.example.json', import.meta.url), path.join(root, 'config.json'));
  fs.writeFileSync(path.join(workspace, 'first.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', 'base64'));
  fs.copyFileSync(path.join(workspace, 'first.png'), path.join(workspace, 'second.png'));
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, MLI_AGENT_DATA_DIR: root, MLI_AGENT_WORKSPACE: workspace, MLI_AGENT_PORT: String(port), MLI_ACCOUNT_ENABLED: 'false', MLI_ACCOUNT_SESSION_FILE: path.join(root, 'account.json') }, stdio: 'ignore' });
  const baseUrl = `http://127.0.0.1:${port}`;
  const request = async (url, body, headers = {}) => { const response = await fetch(baseUrl + url, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, value: await response.json() }; };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await request('/api/runtime')).status === 200) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const empty = (await request('/api/film-canvas')).value.canvas;
    const workspaceHeaders = { 'x-mli-workspace-encoded': encodeURIComponent(workspace) };
    assert.doesNotThrow(() => new Headers(workspaceHeaders));
    assert.equal((await request('/api/film-canvas', null, workspaceHeaders)).status, 200);
    assert.equal((await request('/api/film-canvas', null, { 'x-mli-workspace-encoded': encodeURIComponent(path.join(root, '其他工作区')) })).status, 409);
    assert.equal((await request('/api/film-canvas', null, { 'x-mli-workspace-encoded': '%broken' })).status, 400);
    const value = { base: empty, nodes: [{ id: 'shot', type: 'result', position: { x: 0, y: 0 }, data: { title: '验收', path: 'first.png', kind: 'image' } }], edges: [] };
    let response = await fetch(baseUrl + '/api/film-canvas', { method: 'PUT', headers: { 'content-type': 'application/json', ...workspaceHeaders }, body: JSON.stringify(value) });
    assert.equal(response.status, 200);
    let result = await request('/api/film-canvas/actions', { action: 'batch', updates: [{ nodeId: 'shot', patch: { data: { path: 'second.png', status: 'completed' } } }] });
    assert.equal(result.status, 200); assert.equal(result.value.canvas.nodes[0].data.versions.length, 1);
    const versionId = result.value.canvas.nodes[0].data.versions[0].id;
    result = await request('/api/film-canvas/actions', { action: 'restore-version', nodeId: 'shot', versionId });
    assert.equal(result.value.canvas.nodes[0].data.path, 'first.png');
    assert.equal(result.value.canvas.nodes[0].data.versions.length, 2);
    result = await request('/api/film-canvas/actions', { action: 'archive', nodeId: 'shot' });
    const assetId = result.value.canvas.nodes[0].data.assetId;
    assert.ok(assetId);
    assert.equal((await request('/api/film-canvas/actions', { action: 'archive', nodeId: 'shot' })).value.canvas.nodes[0].data.assetId, assetId);
    assert.equal((await fetch(baseUrl + `/api/assets/${assetId}/raw`)).status, 200);
    for (const endpoint of [`/api/assets/${assetId}/raw`, '/api/film-canvas/media?path=first.png']) {
      const partial = await fetch(baseUrl + endpoint, { headers: { range: 'bytes=0-7' } });
      assert.equal(partial.status, 206); assert.equal((await partial.arrayBuffer()).byteLength, 8);
      assert.match(partial.headers.get('content-range'), /^bytes 0-7\//);
      const suffix = await fetch(baseUrl + endpoint, { headers: { range: 'bytes=-5' } });
      assert.equal(suffix.status, 206); assert.equal((await suffix.arrayBuffer()).byteLength, 5);
      for (const range of ['bytes=999999-', 'bytes=9-2', 'bytes=0-1,3-4', 'bytes=-']) assert.equal((await fetch(baseUrl + endpoint, { headers: { range } })).status, 416);
    }
    assert.equal((await request('/api/film-canvas', null, { 'x-mli-workspace': '/wrong' })).status, 409);
    assert.equal((await request('/api/film-canvas/actions', { action: '__proto__' })).status, 400);
    assert.equal((await request('/api/film-canvas/actions', { action: 'batch', updates: [{ nodeId: 'shot', patch: { data: { title: 'must rollback' } } }, { nodeId: 'missing', patch: { data: {} } }] })).status, 400);
    assert.equal((await request('/api/film-canvas')).value.canvas.nodes[0].data.title, '验收');
    assert.notEqual((await fetch(baseUrl + '/api/film-canvas/media?path=../config.json')).status, 200);
    result = await request('/api/film-canvas/actions', { action: 'delete', nodeIds: ['shot'] });
    assert.equal(result.value.canvas.nodes.length, 0);
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
