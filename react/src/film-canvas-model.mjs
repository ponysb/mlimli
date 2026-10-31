export function selectionToolbarPosition(bounds, viewport, canvas, toolbar) {
  const margin = 12, gap = 12;
  const left = viewport.x + (bounds.x + bounds.width / 2) * viewport.zoom - toolbar.width / 2;
  const nodeTop = viewport.y + bounds.y * viewport.zoom;
  const nodeBottom = nodeTop + bounds.height * viewport.zoom;
  const minTop = margin;
  let top = nodeTop - toolbar.height - gap;
  if (top < minTop) top = nodeBottom + gap;
  return {
    left: Math.max(margin, Math.min(left, canvas.width - toolbar.width - margin)),
    top: Math.max(minTop, Math.min(top, canvas.height - toolbar.height - margin)),
  };
}
export function snapshot(nodes, edges) { return JSON.parse(JSON.stringify({ nodes: nodes.map(({ measured, dragging, selected, ...node }) => node), edges: edges.map(({ selected, ...edge }) => edge) })); }
export function duplicateGraph(nodes, edges, ids, makeId) {
  const map = new Map(ids.map(id => [id, makeId()]));
  return { nodes: nodes.filter(node => map.has(node.id)).map(node => ({ ...node, id: map.get(node.id), position: { x: node.position.x + 48, y: node.position.y + 48 }, data: { ...node.data, title: `${node.data.title || '节点'} · 副本` }, selected: true })), edges: edges.filter(edge => map.has(edge.source) && map.has(edge.target)).map(edge => ({ ...edge, id: makeId(), source: map.get(edge.source), target: map.get(edge.target) })) };
}
export function referenceContext(nodes, edges) { return nodes.map(node => {
  const { versions, actions, ...data } = node.data;
  return { id: node.id, type: node.type, ...data, relations: edges.filter(edge => edge.source === node.id || edge.target === node.id).map(({ source, target, label }) => ({ source, target, label: label || '参考' })) };
}); }

export const referenceRoles = ['参考', '主体参考', '场景参考', '风格参考', '首帧', '尾帧', '提示词', '音频'];
export function mediaKind(data = {}) {
  if (data.kind) return data.kind;
  if (String(data.mime).startsWith('video/') || /\.(mp4|webm|mov)$/i.test(data.path || '')) return 'video';
  if (String(data.mime).startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(data.path || '')) return 'audio';
  return 'image';
}
export function replacementMediaData(current = {}, asset = {}) {
  const data = { ...current };
  for (const key of ['assetId', 'path', 'mime', 'kind', 'model', 'params', 'runId', 'sessionId', 'error', 'status']) delete data[key];
  return { ...data, title: current.title || asset.title || '未命名素材', assetId: asset.id, mime: asset.mime, kind: asset.kind, status: 'completed' };
}
export function validReferenceRole(node, role) {
  if (['首帧', '尾帧'].includes(role)) return node.type !== 'prompt' && mediaKind(node.data) === 'image' && Boolean(node.data.assetId || node.data.path);
  if (role === '音频') return node.type !== 'prompt' && mediaKind(node.data) === 'audio' && Boolean(node.data.assetId || node.data.path);
  if (role === '提示词') return node.type === 'prompt' || Boolean(node.data.text);
  return referenceRoles.includes(role);
}
export function upstreamNodes(nodes, edges, ids) {
  const selected = new Set(ids), pending = [...ids];
  while (pending.length) {
    const target = pending.pop();
    for (const edge of edges) if (edge.target === target && !selected.has(edge.source)) { selected.add(edge.source); pending.push(edge.source); }
  }
  return nodes.filter(node => selected.has(node.id));
}
export function generationContext(nodes, edges, ids, roles = {}, includeUpstream = true) {
  const included = includeUpstream ? upstreamNodes(nodes, edges, ids) : nodes.filter(node => ids.includes(node.id));
  const includedIds = new Set(included.map(node => node.id));
  return referenceContext(included, edges.filter(edge => includedIds.has(edge.source) && includedIds.has(edge.target)))
    .map(node => ({ ...node, referenceRole: roles[node.id] || (node.type === 'prompt' ? '提示词' : '参考'), inputRoles: edges.filter(edge => edge.source === node.id && includedIds.has(edge.target)).map(edge => ({ target: edge.target, role: edge.label || '参考' })), explicitReference: ids.includes(node.id) }));
}
