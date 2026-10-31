// Bound untrusted editor data before crossing into the workbench renderer.
function boundedValue(value, depth = 0) {
  if (depth > 12) return '[结构已截取]';
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (/^data:|^blob:/i.test(value)) return '[媒体内容见截图或原文件]';
    const text = value.replace(/\0/g, '');
    return text.length > 2000 ? `${text.slice(0, 2000)}[已截取]` : text;
  }
  if (Array.isArray(value)) return value.slice(0, 200).map(item => boundedValue(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 40)
    .filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key))
    .map(([key, item]) => [key, boundedValue(item, depth + 1)]));
  return null;
}
function sanitizeOfficeContext(live = {}) {
  const safe = {};
  for (const key of ['location', 'selection']) {
    if (typeof live?.[key] !== 'string' || !live[key].trim()) continue;
    const text = live[key].replace(/\0/g, '');
    safe[key] = text.length > 5000 ? `${text.slice(0, 5000)}\n[内容已截取]` : text;
  }
  if (live?.target && typeof live.target === 'object' && !Array.isArray(live.target)) {
    const target = boundedValue(live.target);
    if (JSON.stringify(target).length < JSON.stringify(live.target).length) target.truncated = true;
    // Keep location fields even when the selected fragment is too large.
    if (JSON.stringify(target).length <= 24000) safe.target = target;
    else {
      const { fragment, cells, objects, ...location } = target;
      safe.target = { ...location, truncated: true, detailOmitted: '选区结构过大，详情请读取原文件并参考截图' };
      if (JSON.stringify(safe.target).length > 24000) safe.target = { truncated: true, detailOmitted: '选区结构过大' };
    }
  }
  return safe;
}
function captureRect(rect, viewport, zoom = 1) {
  if (!rect || ['x', 'y', 'width', 'height'].some(k => !Number.isFinite(rect[k]))) throw new Error('无效选区截图范围');
  if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(zoom) || zoom <= 0) throw new Error('选区不在当前可见区域，请滚动到选区后重试');
  const x = Math.max(0, Math.floor(rect.x * zoom));
  const y = Math.max(0, Math.floor(rect.y * zoom));
  const right = Math.min(viewport.width, Math.ceil((rect.x + rect.width) * zoom));
  const bottom = Math.min(viewport.height, Math.ceil((rect.y + rect.height) * zoom));
  if (right <= x || bottom <= y) throw new Error('选区不在当前可见区域，请滚动到选区后重试');
  return { x, y, width: right - x, height: bottom - y };
}
async function captureOfficeSelection(contents, rect) {
  const viewport = await contents.executeJavaScript('({width:innerWidth,height:innerHeight})');
  const zoom = contents.getZoomFactor();
  const bounds = captureRect(rect, { width: Math.floor(viewport.width * zoom), height: Math.floor(viewport.height * zoom) }, zoom);
  let image;
  try { image = await contents.capturePage(bounds, { stayHidden: true, stayAwake: true }); }
  catch {
    // PPT can remain fully rendered in canvas while Chromium has no display surface.
    // Ask its own renderer for this exact viewport crop, not a full-screen capture.
    const dataUrl = await contents.executeJavaScript(`(() => {
      const detail = { rect: ${JSON.stringify(rect)}, dataUrl: null };
      window.dispatchEvent(new CustomEvent('workbench-office-capture', { detail }));
      return detail.dataUrl;
    })()`);
    if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 14 * 1024 * 1024) {
      throw new Error('当前文档截图不可用，请关闭“附带可见截图”后重试');
    }
    image = require('electron').nativeImage.createFromDataURL(dataUrl);
  }
  if (image.isEmpty()) throw new Error('未能截取选区，请重试或关闭附带截图');
  const dimensions = image.getSize();
  const scale = Math.min(1, 1800 / Math.max(dimensions.width, dimensions.height));
  if (scale < 1) image = image.resize({ width: Math.max(1, Math.round(dimensions.width * scale)), height: Math.max(1, Math.round(dimensions.height * scale)) });
  const bytes = image.toPNG();
  if (bytes.length > 10 * 1024 * 1024) throw new Error('选区截图过大，请缩小选区');
  return { name: '文档选区.png', mime: 'image/png', dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };
}
module.exports = { boundedValue, sanitizeOfficeContext, captureRect, captureOfficeSelection };
