import React, { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { Download, LoaderCircle, Minus, Plus, RefreshCw } from 'lucide-react';
import { AnnotationSurface } from './PreviewAnnotations.jsx';
import { pdfPointFallback, pdfTextHit } from './preview-annotations.mjs';

GlobalWorkerOptions.workerSrc = worker;
if (!Promise.withResolvers) Promise.withResolvers = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function PdfPage({ document, number }) {
  const canvas = useRef(null), host = useRef(null);
  const [visible, setVisible] = useState(false), [context, setContext] = useState(''), [error, setError] = useState(''), [textRegions, setTextRegions] = useState([]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '600px' });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let stopped = false, task;
    (async () => {
      const page = await document.getPage(number);
      if (stopped) return;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1600 / original.width) });
      canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
      task = page.render({ canvasContext: canvas.current.getContext('2d'), viewport });
      await task.promise;
      const text = await page.getTextContent();
      if (!stopped) {
        setContext(text.items.map(item => item.str || '').join(' '));
        setTextRegions(text.items.filter(item => item.str?.trim()).map(item => {
          const [a,b,c,d,e,f] = item.transform, [va,vb,vc,vd,ve,vf] = viewport.transform;
          const x = va * e + vc * f + ve, y = vb * e + vd * f + vf;
          const height = Math.hypot(vc * d + va * c, vd * d + vb * c);
          return { text:item.str, rect:{ x:x / viewport.width, y:(y - height) / viewport.height, width:item.width * viewport.scale / viewport.width, height:height / viewport.height } };
        }));
      }
    })().catch(e => { if (!stopped) setError(e.message); });
    return () => { stopped = true; task?.cancel(); };
  }, [document, number, visible]);
  return <article ref={host} className="annotated-pdf-page">
    <header>第 {number} 页</header>
    <AnnotationSurface id={`pdf-${number}`} label={`第 ${number} 页`} context={context} resolveContext={(rect, { pickElement } = {}) => {
      const regions = pickElement
        ? [pdfTextHit(textRegions, rect)].filter(Boolean)
        : textRegions.filter(item => rect.x < item.rect.x + item.rect.width && rect.x + rect.width > item.rect.x && rect.y < item.rect.y + item.rect.height && rect.y + rect.height > item.rect.y);
      const region = regions[0];
      return {
        context:regions.map(item => item.text).join(' '),
        ...(pickElement ? { rect:region?.rect || pdfPointFallback(rect) } : {}),
      };
    }}>
      {error ? <p role="alert">{error}</p> : <canvas ref={canvas} aria-label={`第 ${number} 页`} />}
    </AnnotationSurface>
  </article>;
}

export default function AnnotatedPdf({ src }) {
  const [document, setDocument] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [zoom, setZoom] = useState(100), [page, setPage] = useState(1);
  const host = useRef(null);
  useEffect(() => {
    let stopped = false;
    setDocument(null); setError(''); setPage(1);
    const task = getDocument({ url: src, isEvalSupported: false });
    task.promise.then(pdf => { if (!stopped) setDocument(pdf); }).catch(e => { if (!stopped) setError(e.message); });
    return () => { stopped = true; task.destroy().catch(() => {}); };
  }, [src, revision]);
  if (error) return <div className="office-preview-state" role="alert"><b>PDF 加载失败</b><span>{error}</span><button onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} />重试</button></div>;
  if (!document) return <div className="office-preview-state"><LoaderCircle className="spin" size={24} />正在加载 PDF…</div>;
  return <div className="pdf-reader" ref={host}>
    <nav className="pdf-reader-toolbar" aria-label="PDF 阅读工具">
      <input type="number" aria-label="跳转到页" min={1} max={document.numPages} value={page} onChange={event => {
        const number = Number(event.target.value);
        if (number >= 1 && number <= document.numPages) { setPage(number); host.current.querySelector(`#annotation-pdf-${number}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      }} /><span>/ {document.numPages}</span>
      <button title="缩小" aria-label="缩小 PDF" disabled={zoom <= 50} onClick={() => setZoom(value => value - 25)}><Minus size={14} /></button><output>{zoom}%</output><button title="放大" aria-label="放大 PDF" disabled={zoom >= 200} onClick={() => setZoom(value => value + 25)}><Plus size={14} /></button>
      <a href={src} download title="下载 PDF" aria-label="下载 PDF"><Download size={15} /></a>
    </nav>
    <div className="annotated-pdf"><div style={{ width: `${zoom}%`, margin: '0 auto' }}>{Array.from({ length: document.numPages }, (_, index) => <PdfPage key={index} document={document} number={index + 1} />)}</div></div>
  </div>;
}
