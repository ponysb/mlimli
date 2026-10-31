import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ChevronDown, Eye, FileText, LoaderCircle, MessageSquare, MousePointer2, Plus, Trash2, X } from 'lucide-react';
import { annotationMessage, fileRequestMessage, selectionGesture, selectionRect } from './preview-annotations.mjs';
import './preview-annotations.css';

const AnnotationContext = createContext(null);
export function usePreviewAnnotations() { return useContext(AnnotationContext); }

export function AnnotationSurface({ id, label, context = '', resolveContext, displayRects, children, className = '', style }) {
  const api = useContext(AnnotationContext), surface = useRef(null), drag = useRef(null);
  const [rectangle, setRectangle] = useState(null), [hover, setHover] = useState(null);
  const hoverRequest = useRef(0);
  const notes = api?.notes.filter(note => note.surface === id) || [];
  useEffect(() => {
    const element = surface.current;
    if (!element || !api?.reportLocation) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && entries[0].intersectionRatio >= .45) api.reportLocation(label);
    }, { threshold:[.45, .7] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [api?.reportLocation, label]);
  useEffect(() => { hoverRequest.current++; setHover(null); }, [api?.selecting]);
  function point(event) {
    const bounds = surface.current.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
  }
  function resolve(rect, options = {}) {
    if (resolveContext) return resolveContext(rect, options);
    const bounds = surface.current.getBoundingClientRect();
    const target = document.elementsFromPoint(bounds.left + (rect.x + rect.width / 2) * bounds.width, bounds.top + (rect.y + rect.height / 2) * bounds.height)
      .find(element => surface.current.contains(element) && element !== surface.current && !element.closest('.annotation-capture,.annotation-region,.annotation-inline-editor,.annotation-editor-backdrop'));
    const text = [target?.dataset.cell ? `单元格 ${target.dataset.cell}` : '', target?.innerText || target?.getAttribute('alt') || ''].filter(Boolean).join(': ');
    if (!options.pickElement || !target) return { context: String(text).slice(0, 5000) };
    const box = target.getBoundingClientRect();
    return { rect:selectionRect({ x:(box.left - bounds.left) / bounds.width, y:(box.top - bounds.top) / bounds.height }, { x:(box.right - bounds.left) / bounds.width, y:(box.bottom - bounds.top) / bounds.height }), context:String(text).slice(0, 5000) };
  }
  return <div ref={surface} id={`annotation-${id}`} className={`annotation-surface ${className}`} style={style}>
    {children}
    {api?.selecting && <div className="annotation-capture" aria-label={`框选${label}`} onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      hoverRequest.current++; setHover(null);
      const start = point(event);
      drag.current = { start, last:start };
      setRectangle(selectionRect(start, start));
    }} onPointerMove={async event => {
      const p = point(event);
      if (drag.current) { drag.current.last = p; setRectangle(selectionRect(drag.current.start, p)); return; }
      const request = ++hoverRequest.current;
      const result = await resolve({ ...p, width:0, height:0 }, { pickElement:true, hover:true });
      if (request === hoverRequest.current) setHover(result?.rect || null);
    }} onPointerLeave={() => { hoverRequest.current++; setHover(null); }} onPointerUp={async event => {
      if (!drag.current) return;
      const { start, last } = drag.current;
      const { rect, dragged } = selectionGesture(start, last, surface.current.clientWidth, surface.current.clientHeight);
      drag.current = null; setRectangle(null); hoverRequest.current++; setHover(null);
      const resolved = await resolve(rect, { pickElement: !dragged });
      if (!dragged && !resolved?.rect) return;
      api.add({ surface: id, label, rect, ...(typeof resolved === 'object' ? resolved : { context: resolved }) });
    }} onPointerCancel={() => { drag.current = null; setRectangle(null); }} />}
    {notes.map(note => {
      const rect = displayRects ? displayRects[note.id] : note.rect;
      return rect && <button key={note.id} className={`annotation-region ${api.selected === note.id ? 'selected' : ''}`} style={rectStyle(rect)} title={note.text || '填写批注'} aria-label={`批注 ${api.notes.indexOf(note) + 1}`} onClick={() => api.select(note.id)}><span>{api.notes.indexOf(note) + 1}</span></button>;
    })}
    {rectangle && <div className="annotation-region drawing" style={rectStyle(rectangle)} />}
    {hover && api?.selecting && !rectangle && <div className="annotation-region preselected" style={rectStyle(hover)} />}
    {notes.filter(note => note.id === api?.selected).map(note => <InlineAnnotationEditor key={note.id} note={note} rect={displayRects ? displayRects[note.id] : note.rect} surface={surface} api={api} />)}
  </div>;
}

function InlineAnnotationEditor({ note, rect, surface, api }) {
  const input = useRef(null), form = useRef(null);
  const originalText = useRef(note.text);
  function cancel() { api.cancel(note.id, originalText.current); }
  const [position, setPosition] = useState(null);
  const visible = Boolean(position);
  useEffect(() => { if (visible) input.current?.focus({ preventScroll:true }); }, [visible]);
  useLayoutEffect(() => {
    function place() {
      if (!surface.current || !form.current || !rect) { setPosition(null); return; }
      const bounds = surface.current.getBoundingClientRect(), height = form.current.offsetHeight;
      const minTop = Math.max(8, 8 - bounds.top), maxBottom = Math.min(bounds.height - 8, window.innerHeight - bounds.top - 8);
      const width = Math.min(320, bounds.width - 24);
      const targetTop = rect.y * bounds.height, targetBottom = (rect.y + rect.height) * bounds.height;
      if (targetBottom < minTop || targetTop > maxBottom) { setPosition(null); return; }
      const top = targetTop - height - 12 >= minTop ? targetTop - height - 12 : targetBottom + 12;
      setPosition({ left:Math.max(12, Math.min((rect.x + rect.width / 2) * bounds.width - width / 2, bounds.width - width - 12)), top:Math.max(minTop, Math.min(top, maxBottom - height)), width });
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(surface.current); observer.observe(form.current);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [rect, surface]);
  return <><div className="annotation-editor-backdrop" onPointerDown={event => { event.preventDefault(); cancel(); }} aria-hidden="true" />
  <form ref={form} className="annotation-inline-editor" style={position || { visibility:'hidden', width:'min(320px, calc(100% - 24px))' }} aria-label="编辑批注" onSubmit={event => { event.preventDefault(); if (note.text.trim()) api.finish(); }}>
    <textarea ref={input} aria-label="批注修改要求" placeholder="描述你的更改…" rows={1} value={note.text} onChange={event => api.update(note.id, event.target.value)} onKeyDown={event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (note.text.trim()) api.finish(); }
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation(); cancel(); }
    }} />
    <button type="button" className="annotation-inline-cancel" aria-label="取消批注" onClick={cancel}><X size={14}/><span className="annotation-cancel-tooltip" role="tooltip">取消</span></button>
    <button type="submit" aria-label="完成批注" disabled={!note.text.trim()}><ArrowUp size={16}/></button>
  </form></>;
}

function rectStyle(rect) {
  return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` };
}

export default function PreviewAnnotations({ storageKey, path, onSend, contextProvider, toolbarTarget, children, composerOnly = false }) {
  const sendTooltipId = useId();
  const [notes, setNotes] = useState(() => { try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(saved) ? saved.filter(note => note && typeof note.id === 'string' && typeof note.surface === 'string' && note.rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(note.rect[key]) && note.rect[key] >= 0 && note.rect[key] <= 1) && typeof note.text === 'string') : []; } catch { return []; } });
  const [open, setOpen] = useState(false), [selecting, setSelecting] = useState(false), [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [instruction, setInstruction] = useState('');
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const sending = useRef(false);
  const liveContext = useRef({});
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(notes)); } catch { setError('批注暂时无法保存到本地，请在关闭前发送。'); } }, [notes, storageKey]);
  function finish() { setNotes(value => value.filter(note => note.id !== selected || note.text.trim())); setSelected(null); }
  function cancel(id, originalText) {
    setNotes(value => originalText.trim() ? value.map(note => note.id === id ? { ...note, text:originalText } : note) : value.filter(note => note.id !== id));
    setSelected(null);
  }
  function select(id) { setNotes(value => value.filter(note => note.id === id || note.id !== selected || note.text.trim())); setSelected(id); setOpen(false); }
  function toggleOverview() { finish(); setSelecting(false); setOpen(value => !value); }
  function startSelection() { finish(); setOpen(false); setSelecting(true); }
  function update(id, text) { setNotes(value => value.map(note => note.id === id ? { ...note, text } : note)); }
  function add(anchor) {
    const note = { ...anchor, id: crypto.randomUUID(), text: '' };
    setNotes(value => [...value, note]); select(note.id);
  }
  async function send() {
    if (sending.current || !onSend || (!notes.length && !instruction.trim()) || notes.some(note => !note.text.trim())) return;
    sending.current = true;
    setBusy(true); setError('');
    try {
      const supplied = await contextProvider?.() || {};
      const selection = String(window.getSelection?.()?.toString() || '').trim();
      const context = { live:{ ...(supplied.live || {}), ...liveContext.current, ...(!contextProvider && selection ? { selection:selection.slice(0, 5000) } : {}) } };
      const message = notes.length ? annotationMessage(path, notes, instruction, context) : fileRequestMessage(path, instruction, context);
      if (await onSend(message, supplied) === true) {
        try { localStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
        setNotes([]); setSelected(null); setInstruction(''); setOpen(false); setSelecting(false);
      } else setError('未能发送批注，草稿已保留，请重试。');
    } catch (e) { setError(e.message || '发送失败，草稿已保留。'); }
    finally { sending.current = false; setBusy(false); }
  }
  const toolbar = <div className={`annotation-toolbar ${toolbarTarget ? 'annotation-toolbar-inline' : ''}`}>
        <div className="annotation-modes" role="group" aria-label="预览模式"><button title="浏览文件" aria-label="浏览文件" aria-pressed={!selecting} onClick={() => setSelecting(false)}><Eye size={14} />浏览</button><button title="框选区域并添加批注" aria-pressed={selecting} disabled={busy} onClick={() => { if (selecting) setSelecting(false); else startSelection(); }}><MousePointer2 size={14} />框选批注</button></div>
        <button className="annotation-panel-toggle" title="批注与 Agent 协作" aria-expanded={open} onClick={toggleOverview}><MessageSquare size={15} />批注{notes.length > 0 && <span className="annotation-count">{notes.length}</span>}</button>
      </div>;
  const reportLocation = React.useCallback(location => { liveContext.current = { location:String(location || '').slice(0, 500) }; }, []);
  return <AnnotationContext.Provider value={{ notes, selecting: selecting && !busy && !selected, selected, add, select, update, finish, cancel, reportLocation, request: text => { setInstruction(text); setCollapsed(false); }, startSelection }}>
    <div className={`annotated-preview ${open ? 'comments-open' : ''} ${selecting ? 'is-selecting' : ''}`} onKeyDown={event => { if (event.key === 'Escape') { setSelecting(false); setSelected(null); } }}>
      {!composerOnly && (toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar)}
      <div className="annotation-body">
        <div className="annotation-document" onKeyDown={event => { if (event.key === 'Escape') setSelecting(false); }}>{children}</div>
        {open && <aside className="annotation-sidebar" aria-label="文件批注">
          <header><span><b>批注</b><small>{notes.length} 条修改请求</small></span><button title="收起批注" aria-label="收起批注" onClick={() => setOpen(false)}><X size={16} /></button></header>
          <div className="annotation-list">
            {!notes.length && <div className="annotation-empty"><MessageSquare size={26} /><span>暂无批注</span><button onClick={startSelection}><Plus size={14} />添加批注</button></div>}
            {notes.map((note, index) => <section key={note.id} className={`annotation-item ${selected === note.id ? 'active' : ''}`}>
              <div><button onClick={() => { select(note.id); document.getElementById(`annotation-${note.surface}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}><span className="annotation-number">{index + 1}</span>{note.label}</button><button title="删除批注" aria-label={`删除批注 ${index + 1}`} disabled={busy} onClick={() => { setNotes(value => value.filter(item => item.id !== note.id)); if (selected === note.id) setSelected(null); }}><Trash2 size={14} /></button></div>
              <button className="annotation-note-text" onClick={() => select(note.id)}>{note.text || '填写修改要求…'}</button>
            </section>)}
          </div>
          {notes.length > 0 && <div className="annotation-sidebar-bottom"><button className="annotation-add" disabled={busy} onClick={startSelection}><Plus size={14} />添加批注</button><button aria-expanded={supplementOpen} onClick={() => setSupplementOpen(value => !value)}><MessageSquare size={14} />补充要求{instruction && <span className="annotation-dot" />}</button>{supplementOpen && <textarea className="annotation-instruction" aria-label="补充协作要求" placeholder="补充要求（可选）" value={instruction} disabled={busy} onChange={event => setInstruction(event.target.value)} />}</div>}
        </aside>}
      </div>
      <form className={`preview-agent-composer ${collapsed ? 'collapsed' : ''} ${open ? 'overview-open' : ''}`} aria-label="与 Agent 协作" onSubmit={event => { event.preventDefault(); send(); }}>
        <header><FileText size={14}/><span>{path.split('/').pop()}</span>{notes.length > 0 && <button type="button" className="preview-agent-notes" onClick={toggleOverview}>{notes.length} 条批注</button>}<button type="button" className="preview-agent-collapse" aria-label={collapsed ? '展开协作输入框' : '收起协作输入框'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><ChevronDown size={15}/><span className="preview-agent-tooltip" role="tooltip">{collapsed ? '展开' : '收起'}</span></button></header>
        {!collapsed && <div className="preview-agent-input"><textarea rows={1} aria-label="文件协作要求" placeholder="与 Agent 协作…" value={instruction} disabled={busy} onChange={event => setInstruction(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(); } }}/><span className="annotation-send-control"><button type="submit" className="preview-agent-send" aria-label="发送给 Agent" aria-describedby={sendTooltipId} disabled={busy || !onSend || (!notes.length && !instruction.trim()) || notes.some(note => !note.text.trim())}>{busy ? <LoaderCircle className="spin" size={16}/> : <ArrowUp size={17}/>}</button><span id={sendTooltipId} className="preview-agent-tooltip" role="tooltip">{!onSend ? '请切换到文件所属工作目录并保存修改后发送' : busy ? '正在发送' : '发送'}</span></span></div>}
      </form>
      {error && <div className="annotation-error" role="alert">{error}</div>}
    </div>
  </AnnotationContext.Provider>;
}
