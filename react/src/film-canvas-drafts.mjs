export const canvasDraftKey = workspace => `mli-film-canvas-draft:${workspace?.path || workspace?.id || 'default'}`;
export function readCanvasDraft(storage, workspace) {
  try {
    const value = JSON.parse(storage.getItem(canvasDraftKey(workspace)) || 'null');
    return value && value.graph && Array.isArray(value.graph.nodes) && Array.isArray(value.graph.edges) ? value : null;
  } catch { return null; }
}
export function writeCanvasDraft(storage, workspace, value) {
  storage.setItem(canvasDraftKey(workspace), JSON.stringify({ ...value, savedAt: Date.now() }));
}
