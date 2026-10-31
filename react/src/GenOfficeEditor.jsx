import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import './genoffice.css';

export default function GenOfficeEditor({ file, workspace, active, onPreview, onError, onCollaborate }) {
  const container = useRef(null);
  const id = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const savePending = useRef(false);
  useEffect(() => window.desktop.onGenOfficeAgentRequest?.(async request => {
    if (request.path !== file.path || request.workspace !== workspace.path || !active) return;
    let accepted = false;
    try { accepted = await onCollaborate?.(request.message, request.attachments || []) === true; }
    catch (err) { onError(err); }
    finally { window.desktop.genOfficeAgentResult({ requestId: request.requestId, accepted }).catch(() => {}); }
  }), [file.path, workspace.path, active, onCollaborate, onError]);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError('');
    window.desktop.genOfficeOpen({ path: file.path, workspace: workspace.path }).then(result => {
      if (disposed) return;
      id.current = result.id;
      setLoading(false);
    }).catch(err => { if (!disposed) { setError(err.message); setLoading(false); } });
    const unsubscribe = window.desktop.onGenOfficeFailed?.(value => { if (value.id === id.current) { setError(value.error); setLoading(false); } });
    return () => { disposed = true; unsubscribe?.(); if (id.current) window.desktop.genOfficeBounds({ id: id.current }).catch(() => {}); };
  }, [file.path, workspace.path]);
  useEffect(() => {
    const update = () => {
      const rect = container.current?.getBoundingClientRect();
      if (!id.current) return;
      window.desktop.genOfficeBounds(active && !loading && !error && rect ? { id: id.current, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } } : { id: id.current }).catch(() => {});
    };
    const observer = new ResizeObserver(update);
    if (container.current) observer.observe(container.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    update();
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [active, loading, error]);
  async function preview() {
    try { if (!id.current || await window.desktop.genOfficeClose(id.current)) onPreview(); } catch (err) { onError(err); }
  }
  async function save() {
    if (!id.current || savePending.current) return;
    savePending.current = true;
    setSaving(true); setSaveStatus('');
    try {
      const saved = await window.desktop.genOfficeSave(id.current);
      setSaveStatus(saved ? '已保存' : '未保存，请重试');
      if (!saved) onError(new Error('文档未保存，请检查编辑器后重试'));
    } catch (err) { setSaveStatus('保存失败'); onError(err); }
    finally { savePending.current = false; setSaving(false); }
  }
  return <div className="genoffice-editor">
    <div className="genoffice-bar"><span><i />文档编辑 <small>本地文件</small></span><div className="genoffice-actions"><small role="status">{saveStatus}</small><button className="genoffice-save" onClick={save} disabled={loading || !!error || saving}>{saving ? <LoaderCircle className="spin" size={14}/> : <Save size={14}/>} {saving ? '保存中…' : '保存'}</button><button onClick={preview} disabled={saving}>返回预览</button></div></div>
    <div className="genoffice-canvas" ref={container}>{loading ? <div className="file-empty"><LoaderCircle className="spin" size={22} />正在打开编辑器…</div> : error ? <div className="file-empty"><b>编辑器暂不可用</b><span>{error}</span><button onClick={preview}>返回预览</button></div> : null}</div>
  </div>;
}
