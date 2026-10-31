import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
const AnnotatedPdf = lazy(() => import('./AnnotatedPdf.jsx'));

export default function TypesettingPreview({ path, content, revision }) {
  const [source, setSource] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [compiled, setCompiled] = useState(null), [retry, setRetry] = useState(0);
  const draft = useRef(content);
  draft.current = content;
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    const snapshot = draft.current;
    setSource(''); setError(''); setLoading(true); setCompiled(null);
    fetch('/api/file/typesetting-preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: snapshot }), signal: controller.signal,
    }).then(async response => {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `编译失败（${response.status}）`);
      }
      return response.blob();
    }).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setSource(objectUrl); setCompiled(snapshot);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, revision, retry]);
  return <div className="typesetting-preview">
    {compiled !== null && compiled !== content && <p role="status" className="typesetting-stale">源码已更新，点击“重新编译”更新预览。</p>}
    {loading ? <div className="office-preview-state"><LoaderCircle size={24} className="spin"/>正在编译排版文档…</div> : error ? <div className="office-preview-state" role="alert"><b>排版预览失败</b><pre className="typesetting-diagnostics">{error}</pre><button onClick={() => setRetry(value => value + 1)}><RefreshCw size={14}/>重试编译</button></div> : source && <Suspense fallback={<div className="office-preview-state">正在加载 PDF…</div>}><AnnotatedPdf src={source}/></Suspense>}
  </div>;
}
