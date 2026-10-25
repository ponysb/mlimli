import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Columns2, Focus, FolderDown, History, Image as ImageIcon, Layers, Link2, Music2, Plus, RotateCcw, Star, X } from 'lucide-react';
import { mediaKind } from './film-canvas-model.mjs';
import './film-canvas-production.css';

const roles = { subject: '主体', scene: '场景', style: '风格' };
const source = data => data?.assetId ? `/api/assets/${encodeURIComponent(data.assetId)}/raw` : data?.path ? `/api/film-canvas/media?path=${encodeURIComponent(data.path)}` : '';
function IconButton({ title, children, ...props }) { return <button type="button" className="fcp-icon" title={title} aria-label={title} {...props}>{children}</button>; }
function Preview({ data, controls = false }) {
  const url = source(data), kind = mediaKind(data);
  if (!url) return <div className="fcp-placeholder"><ImageIcon size={22}/></div>;
  if (kind === 'video') return <video src={url} controls={controls} muted={!controls} preload="metadata" aria-label={data.title || '视频素材'}/>;
  if (kind === 'audio') return <div className="fcp-audio"><Music2 size={24}/>{controls && <audio src={url} controls preload="metadata"/>}</div>;
  return <img src={url} alt={data.title || '图片素材'} loading="lazy"/>;
}

export default function FilmCanvasProduction({ nodes = [], edges = [], selectedIds = [], onSelect, onLocate, onReference, onCompare, onPatchNodes, onArchive, onRestoreVersion, onClose }) {
  const [tab, setTab] = useState('storyboard'), [role, setRole] = useState('all'), [assignRole, setAssignRole] = useState('subject');
  const [renameId, setRenameId] = useState(null), [rename, setRename] = useState(''), [confirmVersion, setConfirmVersion] = useState(null);
  const [pending, setPending] = useState(false), [notice, setNotice] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groups = useMemo(() => {
    const result = new Map();
    nodes.forEach(node => { const key = node.data?.shotId || '__unassigned'; if (!result.has(key)) result.set(key, { id: key, title: node.data?.shotTitle || '未分镜', order: Number(node.data?.shotOrder) || 0, nodes: [] }); result.get(key).nodes.push(node); });
    return [...result.values()].sort((a, b) => a.id === '__unassigned' ? 1 : b.id === '__unassigned' ? -1 : a.order - b.order);
  }, [nodes]);
  const elements = nodes.filter(node => roles[node.data?.elementRole] && (role === 'all' || node.data.elementRole === role));
  const active = nodes.find(node => selected.has(node.id));
  const versions = Array.isArray(active?.data?.versions) ? active.data.versions : [];
  const comparable = nodes.filter(node => selected.has(node.id) && source(node.data));
  function selectNode(node) { onSelect?.([node.id]); onLocate?.(node.id); setConfirmVersion(null); }
  function patch(ids, data) { onPatchNodes?.(ids, data); }
  function move(group, offset) {
    const ordered = groups.filter(item => item.id !== '__unassigned'), from = ordered.findIndex(item => item.id === group.id), to = from + offset;
    if (to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    ordered.forEach((item, index) => patch(item.nodes.map(node => node.id), { shotOrder: index + 1 }));
  }
  function createShot() {
    if (!selectedIds.length) return;
    const order = Math.max(0, ...groups.filter(item => item.id !== '__unassigned').map(item => item.order)) + 1;
    patch(selectedIds, { shotId: crypto.randomUUID(), shotTitle: `镜头 ${order}`, shotOrder: order });
  }
  async function perform(action) { setPending(true); setNotice(''); try { await action(); } catch (error) { setNotice(error?.message || '操作失败'); } finally { setPending(false); } }
  return <aside className="fc-production" aria-label="影视制作面板">
    <header className="fcp-header"><span><Layers size={15}/>制作台</span><IconButton title="关闭制作台" onClick={onClose}><X size={16}/></IconButton></header>
    <div className="fcp-tabs" role="tablist" aria-label="制作视图">{[['storyboard', '分镜', Columns2], ['elements', '元素', Layers], ['versions', '版本', History]].map(([id, title, Icon]) => <button type="button" id={`fcp-tab-${id}`} key={id} role="tab" aria-selected={tab === id} aria-controls={`fcp-panel-${id}`} onClick={() => { setTab(id); setConfirmVersion(null); }}><Icon size={14}/>{title}</button>)}</div>
    <div className="fcp-content" role="tabpanel" id={`fcp-panel-${tab}`} aria-labelledby={`fcp-tab-${tab}`}>
      {tab === 'storyboard' && <>
        <div className="fcp-toolbar"><span>{groups.filter(group => group.id !== '__unassigned').length} 个镜头 · {nodes.length} 个节点</span><button type="button" disabled={!selectedIds.length} onClick={createShot}><Plus size={13}/>建立分镜</button></div>
        {!nodes.length && <p className="fcp-empty">暂无镜头</p>}
        {groups.map((group, index) => <section className="fcp-shot" key={group.id} aria-label={group.title}>
          <div className="fcp-shot-heading"><span className="fcp-number">{group.id === '__unassigned' ? '—' : String(index + 1).padStart(2, '0')}</span>
            {renameId === group.id ? <form onSubmit={event => { event.preventDefault(); if (rename.trim()) patch(group.nodes.map(node => node.id), { shotTitle: rename.trim() }); setRenameId(null); }}><input autoFocus aria-label="镜头名称" value={rename} maxLength={120} onChange={event => setRename(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenameId(null); }}/><IconButton title="保存镜头名称" type="submit"><Check size={13}/></IconButton></form> : <button type="button" className="fcp-shot-title" disabled={group.id === '__unassigned'} title="重命名镜头" onClick={() => { setRename(group.title); setRenameId(group.id); }}>{group.title}</button>}
            <IconButton title="定位镜头" onClick={() => { onSelect?.(group.nodes.map(node => node.id)); onLocate?.(group.nodes[0].id); }}><Focus size={14}/></IconButton>
            {group.id !== '__unassigned' && <><IconButton title="镜头上移" disabled={index === 0} onClick={() => move(group, -1)}><ArrowUp size={13}/></IconButton><IconButton title="镜头下移" disabled={index >= groups.filter(item => item.id !== '__unassigned').length - 1} onClick={() => move(group, 1)}><ArrowDown size={13}/></IconButton></>}
          </div>
          <div className="fcp-shot-nodes">{group.nodes.map(node => <div className={`fcp-shot-item ${selected.has(node.id) ? 'is-selected' : ''}`} key={node.id}>
            <button type="button" className="fcp-shot-preview" aria-label={`选择 ${node.data?.title || '节点'}`} onClick={() => selectNode(node)}><Preview data={node.data}/></button>
            <div className="fcp-item-caption"><button type="button" onClick={() => selectNode(node)}>{node.data?.title || '未命名节点'}</button><IconButton title={node.data?.favorite ? '取消优选' : '设为优选'} aria-pressed={Boolean(node.data?.favorite)} onClick={() => patch([node.id], { favorite: !node.data?.favorite })}><Star size={13} fill={node.data?.favorite ? 'currentColor' : 'none'}/></IconButton></div>
          </div>)}</div>
          <div className="fcp-shot-footer"><span>{edges.filter(edge => group.nodes.some(node => node.id === edge.target)).length} 条参考</span><button type="button" onClick={() => onReference?.(group.nodes.map(node => node.id))}><Link2 size={12}/>引用镜头</button></div>
        </section>)}
      </>}
      {tab === 'elements' && <>
        <div className="fcp-assign"><select aria-label="元素类型" value={assignRole} onChange={event => setAssignRole(event.target.value)}>{Object.entries(roles).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><button type="button" disabled={!selectedIds.length} onClick={() => patch(selectedIds, { elementRole: assignRole })}><Plus size={13}/>设为元素</button></div>
        <div className="fcp-filter" aria-label="筛选元素">{[['all', '全部'], ...Object.entries(roles)].map(([key, label]) => <button type="button" key={key} aria-pressed={role === key} onClick={() => setRole(key)}>{label}</button>)}</div>
        {!elements.length && <p className="fcp-empty">暂无{role === 'all' ? '' : roles[role]}元素</p>}
        <div className="fcp-elements">{elements.map(node => <article className={`fcp-element ${selected.has(node.id) ? 'is-selected' : ''}`} key={node.id}>
          <button type="button" className="fcp-element-preview" aria-label={`选择 ${node.data.title || '元素'}`} onClick={() => selectNode(node)}><Preview data={node.data}/></button>
          <div className="fcp-element-body"><strong>{node.data.title || '未命名元素'}</strong><small>{roles[node.data.elementRole]}</small><div><button type="button" onClick={() => onReference?.([node.id])}><Link2 size={12}/>引用</button><IconButton title="移除元素标记" onClick={() => patch([node.id], { elementRole: '' })}><X size={12}/></IconButton></div></div>
        </article>)}</div>
      </>}
      {tab === 'versions' && <>
        {!active ? <p className="fcp-empty">未选择节点</p> : <>
          <div className="fcp-version-title"><strong>{active.data?.title || '未命名节点'}</strong><span>{versions.length} 个历史版本</span></div>
          <div className="fcp-current-media"><Preview data={active.data} controls/></div>
          <div className="fcp-version-actions"><span>当前版本</span><button type="button" disabled={!source(active.data) || pending} onClick={() => perform(() => onArchive?.(active.id))}><FolderDown size={13}/>存入资源库</button></div>
          {comparable.length > 1 && comparable.length <= 4 && <button type="button" className="fcp-compare" onClick={() => onCompare?.(comparable.map(node => node.id))}><Columns2 size={14}/>对比所选结果<ChevronRight size={13}/></button>}
          {!versions.length && <p className="fcp-empty">暂无历史版本</p>}
          <ol className="fcp-versions">{versions.map((version, index) => { const data = version.data || version; const date = new Date(version.createdAt); return <li key={version.id || index}>
            <div className="fcp-version-meta"><History size={13}/><span>{Number.isNaN(date.getTime()) ? `版本 ${index + 1}` : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><button type="button" disabled={!version.id || pending} onClick={() => setConfirmVersion(version.id)}><RotateCcw size={12}/>恢复</button></div>
            <div className="fcp-history-media"><Preview data={data} controls/></div>
            {confirmVersion === version.id && <div className="fcp-confirm"><span>恢复此版本？</span><button type="button" disabled={pending} onClick={() => perform(async () => { await onRestoreVersion?.(active.id, version.id); setConfirmVersion(null); })}>{pending ? '恢复中' : '恢复'}</button><button type="button" disabled={pending} onClick={() => setConfirmVersion(null)}>取消</button></div>}
          </li>; })}</ol>
        </>}
      </>}
      {notice && <p className="fcp-notice" role="alert">{notice}</p>}
    </div>
  </aside>;
}
