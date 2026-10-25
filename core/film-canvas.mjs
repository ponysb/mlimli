import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getWorkspaceRoot, resolveReadable } from './paths.mjs';
import { mergeFilmCanvas } from './film-canvas-merge.mjs';
import { addAsset, getAsset } from './assets.mjs';

const MAX_BYTES = 8 * 1024 * 1024;
const id = () => crypto.randomUUID();
const mediaKeys = ['assetId', 'path', 'mime', 'kind', 'model', 'params', 'text'];
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\x00-\x1f]/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function validateData(data) {
  if (!record(data)) throw new Error('画布节点数据无效');
  for (const key of ['title', 'text', 'assetId', 'path', 'mime', 'model', 'error', 'runId', 'sessionId', 'shotId', 'shotTitle', 'elementRole']) {
    if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > (key === 'text' ? 12000 : key === 'path' ? 4096 : 1000))) throw new Error(`画布节点字段无效：${key}`);
  }
  if (data.status !== undefined && !['ready', 'queued', 'running', 'error', 'completed', 'cancelled'].includes(data.status)) throw new Error('画布节点状态无效');
  if (data.kind !== undefined && !['image', 'video', 'audio'].includes(data.kind)) throw new Error('画布媒体类型无效');
  if (data.favorite !== undefined && typeof data.favorite !== 'boolean') throw new Error('收藏字段无效');
  if (data.shotOrder !== undefined && (!Number.isFinite(data.shotOrder) || data.shotOrder < 0)) throw new Error('分镜排序无效');
  if (data.params !== undefined && !record(data.params)) throw new Error('生成参数无效');
  if (data.versions !== undefined) {
    if (!Array.isArray(data.versions) || data.versions.length > 100) throw new Error('媒体版本数据无效');
    const ids = new Set();
    for (const version of data.versions) {
      if (!validId(version.id) || ids.has(version.id) || !Number.isFinite(version.createdAt) || !record(version.data)) throw new Error('媒体版本数据无效');
      ids.add(version.id);
      if (version.data.versions !== undefined) throw new Error('媒体版本不能嵌套');
      validateData(version.data);
    }
  }
}
const file = () => {
  const directory = path.join(getWorkspaceRoot(), '.agent', 'film-canvases');
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, 'default.json');
};
function validate(value) {
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error('画布数据格式无效');
  if (value.nodes.length > 500 || value.edges.length > 1000) throw new Error('画布节点或连线数量超出限制');
  const nodeIds = new Set();
  for (const node of value.nodes) {
    if (!validId(node?.id) || nodeIds.has(node.id) || !['media', 'prompt', 'result'].includes(node.type) || !node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) throw new Error('画布节点无效');
    validateData(node.data);
    nodeIds.add(node.id);
  }
  const edgeIds = new Set();
  for (const edge of value.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error('画布连线引用了不存在的节点');
    if (!validId(edge.id) || edgeIds.has(edge.id) || edge.source === edge.target || (edge.label !== undefined && (typeof edge.label !== 'string' || edge.label.length > 120))) throw new Error('画布连线无效');
    edgeIds.add(edge.id);
  }
  const result = { version: 1, revision: Number.isSafeInteger(value.revision) ? value.revision : 0, nodes: value.nodes, edges: value.edges, updatedAt: value.updatedAt || Date.now() };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw new Error('画布数据超过 8 MB');
  return result;
}
export function readFilmCanvas() {
  try { return validate(JSON.parse(fs.readFileSync(file(), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, revision: 0, nodes: [], edges: [], updatedAt: 0 }; throw error; }
}
export function writeFilmCanvas(value, { captureVersions = true } = {}) {
  const current = readFilmCanvas();
  validate(value);
  const previous = new Map(current.nodes.map(node => [node.id, node]));
  const nodes = value.nodes.map(node => {
    const old = previous.get(node.id);
    if (!old) return node;
    const versions = [...(old.data.versions || []), ...(node.data.versions || []).filter(version => !(old.data.versions || []).some(existing => existing.id === version.id))];
    if (captureVersions && (old.data.assetId || old.data.path) && (old.data.assetId !== node.data.assetId || old.data.path !== node.data.path)) {
      versions.push({ id: id(), createdAt: Date.now(), data: Object.fromEntries(mediaKeys.filter(key => old.data[key] !== undefined).map(key => [key, old.data[key]])) });
    }
    return versions.length ? { ...node, data: { ...node.data, versions: versions.slice(-100) } } : node;
  });
  const result = validate({ ...value, nodes, revision: current.revision + 1, updatedAt: Date.now() }), target = file(), temporary = `${target}.${id()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(result, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, target);
  return result;
}
export function saveFilmCanvasEdits(value) {
  const current = readFilmCanvas();
  if (!value.base || !Number.isSafeInteger(value.base.revision)) {
    const error = new Error('缺少画布基础版本，请刷新后重试'); error.statusCode = 409; throw error;
  }
  validate(value.base); validate(value);
  return writeFilmCanvas(mergeFilmCanvas(value.base, value, current));
}
export function addFilmCanvasNode(node) {
  const canvas = readFilmCanvas(), next = { id: node.id || id(), type: node.type || 'media', position: node.position || { x: 80 + canvas.nodes.length * 36, y: 80 + canvas.nodes.length * 36 }, data: node.data || {} };
  return writeFilmCanvas({ ...canvas, nodes: [...canvas.nodes, next] });
}
export function updateFilmCanvasNode(nodeId, patch) {
  const canvas = readFilmCanvas(), exists = canvas.nodes.some(node => node.id === nodeId);
  if (!exists) throw new Error('画布节点不存在');
  return writeFilmCanvas({ ...canvas, nodes: canvas.nodes.map(node => node.id === nodeId ? { ...node, ...patch, id: node.id } : node) });
}
export function connectFilmCanvasNodes(source, target, label = '') {
  const canvas = readFilmCanvas();
  if (source === target || !canvas.nodes.some(node => node.id === source) || !canvas.nodes.some(node => node.id === target)) throw new Error('连线节点无效');
  const edge = { id: id(), source, target, label: String(label).slice(0, 120), type: 'smoothstep' };
  return writeFilmCanvas({ ...canvas, edges: [...canvas.edges, edge] });
}
function selectedNodes(canvas, nodeIds) {
  if (!Array.isArray(nodeIds) || !nodeIds.length || nodeIds.some(nodeId => !validId(nodeId)) || new Set(nodeIds).size !== nodeIds.length) throw new Error('节点选择无效');
  const selected = new Set(nodeIds);
  if (canvas.nodes.filter(node => selected.has(node.id)).length !== selected.size) throw new Error('画布节点不存在');
  return selected;
}
export function deleteFilmCanvasNodes(nodeIds) {
  const canvas = readFilmCanvas(), selected = selectedNodes(canvas, nodeIds);
  return writeFilmCanvas({ ...canvas, nodes: canvas.nodes.filter(node => !selected.has(node.id)), edges: canvas.edges.filter(edge => !selected.has(edge.source) && !selected.has(edge.target)) });
}
export function disconnectFilmCanvasEdges(edgeIds) {
  const canvas = readFilmCanvas();
  if (!Array.isArray(edgeIds) || !edgeIds.length || edgeIds.some(edgeId => !validId(edgeId) || !canvas.edges.some(edge => edge.id === edgeId))) throw new Error('画布连线不存在');
  return writeFilmCanvas({ ...canvas, edges: canvas.edges.filter(edge => !edgeIds.includes(edge.id)) });
}
export function batchUpdateFilmCanvasNodes(updates) {
  const canvas = readFilmCanvas();
  if (!Array.isArray(updates) || !updates.length) throw new Error('批量修改不能为空');
  selectedNodes(canvas, updates.map(update => update?.nodeId));
  const patches = new Map(updates.map(({ nodeId, patch }) => {
    if (!record(patch) || Object.keys(patch).some(key => !['data', 'position', 'type'].includes(key))) throw new Error('节点修改字段无效');
    if (patch.data !== undefined) validateData(patch.data);
    return [nodeId, patch];
  }));
  return writeFilmCanvas({ ...canvas, nodes: canvas.nodes.map(node => {
    const patch = patches.get(node.id);
    return patch ? { ...node, ...patch, id: node.id, data: patch.data ? { ...node.data, ...patch.data } : node.data } : node;
  }) });
}
export function arrangeFilmCanvasNodes({ nodeIds, layout = 'grid', gap = 64, origin } = {}) {
  const canvas = readFilmCanvas(), selected = selectedNodes(canvas, nodeIds || canvas.nodes.map(node => node.id));
  if (!['grid', 'row', 'column'].includes(layout) || !Number.isFinite(gap) || gap < 0 || gap > 2000) throw new Error('排列参数无效');
  const nodes = canvas.nodes.filter(node => selected.has(node.id));
  const start = origin || { x: Math.min(...nodes.map(node => node.position.x)), y: Math.min(...nodes.map(node => node.position.y)) };
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) throw new Error('排列起点无效');
  const columns = layout === 'row' ? nodes.length : layout === 'column' ? 1 : Math.ceil(Math.sqrt(nodes.length));
  const width = Math.max(280, ...nodes.map(node => Number(node.measured?.width || node.width) || 280)) + gap;
  const height = Math.max(240, ...nodes.map(node => Number(node.measured?.height || node.height) || 240)) + gap;
  return batchUpdateFilmCanvasNodes(nodes.map((node, index) => ({ nodeId: node.id, patch: { position: { x: start.x + index % columns * width, y: start.y + Math.floor(index / columns) * height } } })));
}
export function groupFilmCanvasNodes({ nodeIds, shotId = id(), shotTitle = '', shotOrder = 0 } = {}) {
  if (!validId(shotId)) throw new Error('分镜编号无效');
  selectedNodes(readFilmCanvas(), nodeIds);
  return batchUpdateFilmCanvasNodes(nodeIds.map(nodeId => ({ nodeId, patch: { data: { shotId, shotTitle, shotOrder } } })));
}
export function readFilmCanvasVersions(nodeId) {
  const node = readFilmCanvas().nodes.find(node => node.id === nodeId);
  if (!node) throw new Error('画布节点不存在');
  return node.data.versions || [];
}
export function restoreFilmCanvasVersion(nodeId, versionId) {
  const canvas = readFilmCanvas(), node = canvas.nodes.find(node => node.id === nodeId);
  if (!node) throw new Error('画布节点不存在');
  const version = (node.data.versions || []).find(item => item.id === versionId);
  if (!version) throw new Error('媒体版本不存在');
  const data = { ...node.data };
  for (const key of mediaKeys) delete data[key];
  Object.assign(data, version.data, { status: 'completed', error: '' });
  return updateFilmCanvasNode(nodeId, { data });
}
export function archiveFilmCanvasNode(nodeId) {
  const canvas = readFilmCanvas(), node = canvas.nodes.find(node => node.id === nodeId);
  if (!node) throw new Error('画布节点不存在');
  if (node.data.assetId && getAsset(node.data.assetId)) return canvas;
  if (!node.data.path) throw new Error('节点没有可归档的工作区媒体');
  filmCanvasMediaPath(node.data.path);
  const asset = addAsset({ workspacePath: node.data.path, title: node.data.title, source: 'agent', metadata: { canvasNodeId: nodeId, runId: node.data.runId || '', sessionId: node.data.sessionId || '' } });
  return writeFilmCanvas({ ...canvas, nodes: canvas.nodes.map(item => item.id === nodeId ? { ...item, data: { ...item.data, assetId: asset.id, mime: asset.mime, kind: asset.kind } } : item) }, { captureVersions: false });
}
export function filmCanvasMediaPath(relativePath) {
  if (typeof relativePath !== 'string' || /^[a-z][a-z0-9+.-]*:/i.test(relativePath)) throw new Error('画布媒体路径必须是本地工作区文件');
  const absolute = resolveReadable(relativePath);
  const root = path.resolve(getWorkspaceRoot()) + path.sep;
  if (!path.resolve(absolute).startsWith(root)) throw new Error('画布媒体仅允许引用当前工作区文件');
  const stat = fs.statSync(absolute);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) throw new Error('画布媒体不存在或超过 100 MB');
  const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' })[path.extname(absolute).toLowerCase()];
  if (!mime) throw new Error('画布媒体仅支持图片、视频和音频');
  return { path: absolute, name: path.basename(absolute), size: stat.size, mime };
}
