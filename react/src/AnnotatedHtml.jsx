import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { AnnotationSurface, usePreviewAnnotations } from './PreviewAnnotations.jsx';

// The bridge runs inside the opaque sandbox. Only messages from this frame are accepted.
function previewBridge(channel) {
  let anchors = [], scheduled = false;
  function targetBounds(element, text) {
    if (text) {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = range.getBoundingClientRect();
      if (bounds.width && bounds.height) return bounds;
    }
    return element.getBoundingClientRect();
  }
  function layout() {
    scheduled = false;
    const rects = {};
    for (const note of anchors) {
      try {
        const element = document.querySelector(note.anchor.selector);
        if (!element) continue;
        const bounds = targetBounds(element, note.anchor.text), local = note.anchor.local;
        rects[note.id] = { x: (bounds.left + local.x * bounds.width) / innerWidth, y: (bounds.top + local.y * bounds.height) / innerHeight, width: local.width * bounds.width / innerWidth, height: local.height * bounds.height / innerHeight };
      } catch { /* The document may have removed the target element. */ }
    }
    parent.postMessage({ channel, type: 'layout', rects }, '*');
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(layout); } }
  addEventListener('scroll', schedule, true);
  addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(document.documentElement);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.channel !== channel) return;
    if (event.data.type === 'track') { anchors = event.data.notes; schedule(); return; }
    const { id } = event.data;
    let { rect } = event.data;
    if (!rect) return;
    const target = document.elementFromPoint((rect.x + rect.width / 2) * innerWidth, (rect.y + rect.height / 2) * innerHeight);
    if (event.data.pickElement) {
      if (!target || target === document.body || target === document.documentElement) {
        parent.postMessage({ channel, id, text: '' }, '*'); return;
      }
      const bounds = targetBounds(target, /^(H[1-6]|P|SPAN|B|STRONG|EM|A|LI|LABEL|TD|TH)$/.test(target.tagName));
      const left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
      rect = { x: left / innerWidth, y: top / innerHeight, width: (Math.min(innerWidth, bounds.right) - left) / innerWidth, height: (Math.min(innerHeight, bounds.bottom) - top) / innerHeight };
      if (rect.width <= 0 || rect.height <= 0) { parent.postMessage({ channel, id, text: '' }, '*'); return; }
    }
    if (event.data.hover) { parent.postMessage({ channel, id, rect, text: '' }, '*'); return; }
    let anchor;
    if (target) {
      const parts = [];
      for (let element = target; element && element !== document.documentElement; element = element.parentElement) {
        parts.unshift(`${element.tagName.toLowerCase()}:nth-child(${Array.from(element.parentElement.children).indexOf(element) + 1})`);
      }
      const text = /^(H[1-6]|P|SPAN|B|STRONG|EM|A|LI|LABEL|TD|TH)$/.test(target.tagName);
      const bounds = targetBounds(target, text);
      if (bounds.width && bounds.height) anchor = { selector: 'html > ' + parts.join(' > '), text, local: { x: (rect.x * innerWidth - bounds.left) / bounds.width, y: (rect.y * innerHeight - bounds.top) / bounds.height, width: rect.width * innerWidth / bounds.width, height: rect.height * innerHeight / bounds.height } };
    }
    const elements = [];
    for (const y of [rect.y, rect.y + rect.height / 2, rect.y + rect.height]) {
      for (const x of [rect.x, rect.x + rect.width / 2, rect.x + rect.width]) {
        const element = document.elementFromPoint(x * innerWidth, y * innerHeight);
        if (element && !elements.includes(element)) elements.push(element);
      }
    }
    parent.postMessage({ channel, id, anchor, rect, text: `视口 ${innerWidth}×${innerHeight}，滚动位置 x=${scrollX}, y=${scrollY}。\n` + elements.map(element => `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}: ${(element.innerText || element.getAttribute('alt') || '').slice(0, 1500)}`).join('\n') }, '*');
  });
  const ready = () => parent.postMessage({ channel, type:'ready' }, '*');
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', ready, { once:true });
  else ready();
}

export default function AnnotatedHtml({ src, name, markup, surfaceId = 'html', label = 'HTML 页面选区' }) {
  const frame = useRef(null), requests = useRef(new Map());
  const [document, setDocument] = useState(null), [error, setError] = useState('');
  const channel = useRef(crypto.randomUUID());
  const api = usePreviewAnnotations();
  const [rects, setRects] = useState({}), [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    frame.current?.contentWindow.postMessage({ channel: channel.current, type: 'track', notes: (api?.notes || []).filter(note => note.surface === surfaceId && note.anchor) }, '*');
  }, [api?.notes, loaded]);
  useEffect(() => {
    const controller = new AbortController();
    setDocument(null); setError(''); setReady(false); setRects({});
    const source = markup !== undefined ? Promise.resolve(markup) : fetch(src, { signal: controller.signal, cache:'no-store' }).then(response => {
      if (!response.ok) throw new Error(`HTML 加载失败（${response.status}）`);
      return response.text();
    });
    source.then(text => {
      if (controller.signal.aborted) return;
      const html = new DOMParser().parseFromString(text, 'text/html');
      const base = html.createElement('base'); base.href = new URL(src || '.', location.href).href;
      html.head.prepend(base);
      const script = html.createElement('script'); script.textContent = `(${previewBridge.toString()})(${JSON.stringify(channel.current)})`;
      html.head.prepend(script);
      if (!controller.signal.aborted) setDocument({ src, markup, content:'<!doctype html>' + html.documentElement.outerHTML });
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [src, markup]);
  useEffect(() => {
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel.current) return;
      if (event.data.type === 'ready') { setReady(true); setLoaded(value => value + 1); return; }
      if (event.data.type === 'layout') {
        const valid = Object.fromEntries(Object.entries(event.data.rects || {}).filter(([, rect]) => rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]))));
        setRects(valid); return;
      }
      const pending = requests.current.get(event.data.id);
      if (pending && typeof event.data.text === 'string') pending({ context: event.data.text.slice(0, 5000), anchor: event.data.anchor, ...(event.data.rect ? { rect: event.data.rect } : {}) });
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); requests.current.forEach(resolve => resolve('')); requests.current.clear(); };
  }, []);
  function context(rect, { pickElement = false, hover = false } = {}) {
    return new Promise(resolve => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { requests.current.delete(id); resolve('HTML 当前视口'); }, 800);
      requests.current.set(id, text => { clearTimeout(timer); requests.current.delete(id); resolve(text); });
      frame.current?.contentWindow.postMessage({ channel: channel.current, id, rect, pickElement, hover }, '*');
    });
  }
  if (error) return <div className="file-empty" role="alert">{error}</div>;
  const prepared = document && document.src === src && document.markup === markup;
  return <AnnotationSurface id={surfaceId} label={label} className="full-preview" resolveContext={context} displayRects={rects}>
    {prepared && <iframe key={src} ref={frame} onLoad={() => { setReady(true); setLoaded(value => value + 1); }} className="html-preview" srcDoc={document.content} title={`${name} 预览`} sandbox="allow-scripts allow-forms" />}
    {(!prepared || !ready) && <div className="html-preview-loading" role="status"><LoaderCircle className="spin" size={20}/>正在加载预览…</div>}
  </AnnotationSurface>;
}
