import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PreviewAnnotations from './PreviewAnnotations.jsx';

const hostId = 'workbench-agent';
function readNativeContext() {
  const detail = { value: null };
  window.dispatchEvent(new CustomEvent('workbench-office-context', { detail }));
  return detail.value;
}
function elementFor(node) { return node?.nodeType === 1 ? node : node?.parentElement; }
function visibleRect(element) {
  if (!element) return null;
  const box = element.getBoundingClientRect();
  const x = Math.max(0, box.left), y = Math.max(0, box.top);
  const width = Math.min(innerWidth, box.right) - x, height = Math.min(innerHeight, box.bottom) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
function readSelection(previous, event) {
  const selection = window.getSelection();
  const node = elementFor(selection?.anchorNode);
  const inComposer = !!node?.closest(`#${hostId}`);
  if (inComposer || document.activeElement?.closest(`#${hostId}`)) return previous;
  const native = readNativeContext();
  const range = !selection?.isCollapsed && selection?.rangeCount && node?.closest('.ProseMirror,.pdf-page,.stage-rel')
    ? selection.getRangeAt(0).cloneRange() : null;
  const clickedPage = event?.target?.closest?.('.pdf-page');
  const surface = clickedPage || node?.closest('.pdf-page,.doc-page,.page-wrap') ||
    document.querySelector(native?.kind === 'slides' ? '.stage-rel' : native?.kind === 'spreadsheet' ? '#univer-container' : '.ProseMirror');
  if (!native && !range && !clickedPage) return null;
  const target = native || { kind: surface?.matches('.pdf-page') ? 'pdf' : 'document' };
  if (surface?.dataset.workbenchPage) target.page = Number(surface.dataset.workbenchPage);
  if (surface && range) {
    const page = surface.getBoundingClientRect(), box = range.getBoundingClientRect();
    if (page.width && page.height) target.rect = { x: (box.left - page.left) / page.width, y: (box.top - page.top) / page.height, width: box.width / page.width, height: box.height / page.height };
  }
  return { target, selection: range?.toString() || native?.text || '', surface, range };
}
function OfficeAgent({ path }) {
  const snapshot = useRef(null);
  const [label, setLabel] = useState('');
  const [includeImage, setIncludeImage] = useState(true);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const update = event => {
      if (event?.target?.closest?.(`#${hostId}`) || document.activeElement?.closest(`#${hostId}`)) return;
      try {
        snapshot.current = readSelection(snapshot.current, event);
        setCleared(false);
        const target = snapshot.current?.target;
        setLabel(target ? target.kind === 'spreadsheet' ? `${target.sheetName} · ${target.range}` : target.kind === 'slides' ? `幻灯片 ${target.page} · ${target.objectIds.length} 个对象` : target.kind === 'pdf' ? `PDF 第 ${target.page || '?'} 页选区` : '文档选区' : '');
      } catch { snapshot.current = null; setLabel(''); }
    };
    const pointer = event => {
      if (!event.target?.closest?.(`#${hostId}`)) requestAnimationFrame(() => update(event));
    };
    document.addEventListener('pointerup', pointer);
    document.addEventListener('keyup', update);
    document.addEventListener('selectionchange', update);
    return () => {
      document.removeEventListener('pointerup', pointer);
      document.removeEventListener('keyup', update);
      document.removeEventListener('selectionchange', update);
    };
  }, []);
  async function context() {
    const current = cleared ? null : snapshot.current;
    let capture = null;
    if (current && includeImage) {
      if (!current.surface?.isConnected) throw new Error('选区已失效，请重新选择文档内容');
      // Recompute from the live DOM range after scrolling; never reuse stale viewport coordinates.
      capture = visibleRect(current.range?.commonAncestorContainer?.isConnected ? { getBoundingClientRect: () => current.range.getBoundingClientRect() } : current.surface);
      if (!capture) throw new Error('选区不在可见区域，请滚动到选区后重试，或关闭附带截图');
    }
    const supplied = await window.workbenchAgent.context(current ? {
      location: current.target.kind === 'spreadsheet' ? `工作表 ${current.target.sheetName}；区域 ${current.target.range}` : current.target.page ? `第 ${current.target.page} 页` : 'Word 文档选区',
      selection: current.selection,
      target: current.target,
    } : {});
    if (capture) supplied.live.screenshot = true;
    return { ...supplied, capture };
  }
  async function send(message, supplied) {
    const host = document.getElementById(hostId);
    try {
      // Capture the document beneath the floating composer, without the user's chat draft.
      if (supplied.capture) { host.style.visibility = 'hidden'; await new Promise(resolve => setTimeout(resolve, 50)); }
      const captureToken = supplied.capture ? await window.workbenchAgent.capture(supplied.capture) : null;
      host.style.visibility = '';
      return await window.workbenchAgent.send({ message, captureToken });
    } finally { host.style.visibility = ''; }
  }
  return <PreviewAnnotations composerOnly storageKey={`office-agent:${path}`} path={path} contextProvider={context} onSend={send}>
    <div className="office-agent-selection">
      {label && !cleared ? <><span title={label}>{label}</span><label><input type="checkbox" checked={includeImage} onChange={event => setIncludeImage(event.target.checked)}/>附带可见截图</label><button type="button" onClick={() => { snapshot.current = null; setCleared(true); setLabel(''); }}>清除选区</button></> : <span>选择文档内容后可携带选区与截图</span>}
      <small>请先保存修改，再发送给 Agent</small>
    </div>
  </PreviewAnnotations>;
}
window.workbenchAgent.context().then(({ path }) => {
  const host = document.createElement('div');
  host.id = hostId;
  document.body.append(host);
  createRoot(host).render(<OfficeAgent path={path}/>);
});
