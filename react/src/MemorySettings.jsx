import { confirmAction } from './ActionPopover.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Archive, BookOpen, Check, Clock, Plus, RefreshCw, Save, Search, Star, Trash2, X } from 'lucide-react';
import './memory-settings.css';

const KIND = { preference: '用户偏好', fact: '稳定事实', lesson: '排错经验', workflow: '可复用方法' };
const STATUS = { active: '已启用', pending: '待审核', archived: '已停用' };
const SOURCE = { user: '用户编辑', auto: '任务后回顾', agent: 'Agent 保存' };
const JOB = { queued: '等待回顾', running: '正在回顾', completed: '回顾完成', failed: '回顾未完成', cancelled: '已取消', interrupted: '运行中断' };
const date = value => value ? new Date(value).toLocaleString() : '尚未召回';
const fresh = () => ({ title: '', content: '', scope: 'project', kind: 'fact', tags: [], evidence: '', pinned: false, status: 'active' });

export default function MemorySettings({ get, post, api, onError, onSaved, onOpenSession, workspace }) {
  const [data, setData] = useState(null), [jobs, setJobs] = useState([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [scope, setScope] = useState('all'), [status, setStatus] = useState('all'), [kind, setKind] = useState('all'), [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null), [dirty, setDirty] = useState(false), [versions, setVersions] = useState(false);
  const mounted = useRef(true), request = useRef(0);
  async function refresh() {
    const current = ++request.current;
    try {
      const [memories, learning] = await Promise.all([get('/api/memories'), get('/api/memory/learning')]);
      if (mounted.current && current === request.current) { setData(memories); setJobs(learning.jobs); }
    } catch (error) { if (mounted.current) onError?.(error); }
  }
  useEffect(() => {
    mounted.current = true; refresh();
    const events = new EventSource('/api/event'); let timer;
    events.onmessage = event => {
      let item; try { item = JSON.parse(event.data); } catch { return; }
      if (['memory_updated', 'memory_settings_updated', 'memory_learning_updated'].includes(item.type)) { clearTimeout(timer); timer = setTimeout(refresh, 150); }
    };
    return () => { mounted.current = false; clearTimeout(timer); events.close(); };
  }, []);
  async function action(work, message) {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await work(); await refresh(); setNotice(message); }
    catch (error) { onError?.(error); }
    finally { setBusy(false); }
  }
  const mayLeave = async () => !dirty || await confirmAction('放弃未保存的修改？', { description: '当前记忆的修改将丢失。', confirmLabel: '放弃', destructive: false });
  async function select(item) {
    if (!await mayLeave()) return;
    await action(async () => { const result = await get(`/api/memories/${item.scope}/${item.id}`); setDraft(result.item); setDirty(false); setVersions(false); }, '');
  }
  const change = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setDirty(true); setNotice(''); };
  async function openSource() { if (!await mayLeave()) return; try { await onOpenSession?.(draft.origin.sessionId); } catch (error) { onError?.(error); } }
  async function save(event) {
    event.preventDefault();
    await action(async () => {
      const result = draft.id ? await api(`/api/memories/${draft.scope}/${draft.id}`, { method: 'PUT', body: { ...draft, expectedRevision: draft.revision } }) : await post('/api/memories', draft);
      setDraft(result.item); setDirty(false);
    }, '记忆已保存');
  }
  async function remove() {
    if (!await confirmAction(`删除“${draft.title}”及其编辑历史？此操作不可恢复。`)) return;
    await action(async () => { await api(`/api/memories/${draft.scope}/${draft.id}`, { method: 'DELETE', body: { expectedRevision: draft.revision } }); setDraft(null); setDirty(false); }, '记忆已删除');
  }
  async function updateSetting(key, value) {
    await action(async () => { const result = await post('/api/memory/settings', { [key]: value }); setData(current => ({ ...current, settings: result.settings })); await onSaved?.(); }, '设置已更新');
  }
  const items = (data?.items || []).filter(item => (scope === 'all' || item.scope === scope) && (status === 'all' || item.status === status) && (kind === 'all' || item.kind === kind) && `${item.title} ${item.content} ${item.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  if (!data) return <div className="page-content"><section className="section-block"><p>正在读取记忆…</p></section></div>;
  const settings = data.settings;
  return <div className="page-content memory-settings">
    <section className="section-block">
      <div className="section-head"><div><h2><BookOpen size={18}/>记忆</h2><p>保留你的偏好和经过实践的经验，让后续任务少走弯路。</p></div><button type="button" disabled={busy} onClick={refresh}><RefreshCw size={14}/>刷新</button></div>
      <label className="setting-toggle"><span><b>使用记忆</b><small>读取全局偏好和当前项目记忆。关闭后停止记忆工具与自动沉淀，保留已有记录。</small></span><input type="checkbox" role="switch" aria-label="使用记忆" checked={settings.enabled} disabled={busy} onChange={event => updateSetting('enabled', event.target.checked)}/></label>
      <label className="setting-toggle"><span><b>自动沉淀经验</b><small>主动保存稳定信息，并在任务结束后回顾用户纠正与可复用方法。回顾会调用当前真实模型，可能产生费用。</small></span><input type="checkbox" role="switch" aria-label="自动沉淀经验" checked={settings.autoLearn} disabled={busy || !settings.enabled} onChange={event => updateSetting('autoLearn', event.target.checked)}/></label>
      <label className="setting-toggle"><span><b>保存前审核</b><small>Agent 新记忆先进入待审核，确认后才用于后续任务；自动回顾提出的替换始终需审核。</small></span><input type="checkbox" role="switch" aria-label="保存前审核" checked={settings.reviewBeforeSave} disabled={busy || !settings.enabled} onChange={event => updateSetting('reviewBeforeSave', event.target.checked)}/></label>
      <label className="setting-toggle"><span><b>允许检索历史会话</b><small>按需检索当前项目过去的讨论和依据，不自动加载全部聊天。</small></span><input type="checkbox" role="switch" aria-label="允许检索历史会话" checked={settings.historyEnabled} disabled={busy || !settings.enabled} onChange={event => updateSetting('historyEnabled', event.target.checked)}/></label>
      <p className="memory-hint">开关即时生效。已出现在当前对话中的内容仍属于该对话；编辑后的记忆会在下一轮重新召回。</p>
      <div className="memory-stats"><span><b>{data.stats.global}</b> 全局记忆</span><span><b>{data.stats.project}</b> 项目记忆</span><span><b>{data.stats.pending}</b> 待审核</span><span><b>{data.stats.recalled}</b> 次召回</span></div>
    </section>
    <section className="section-block">
      <div className="section-head"><div><h2>记忆库</h2><p>全局偏好跨工作区复用，项目信息只在当前工作区使用。</p></div><button type="button" disabled={busy} onClick={async () => { if (await mayLeave()) { setDraft(fresh()); setDirty(false); setVersions(false); } }}><Plus size={14}/>新建记忆</button></div>
      <div className="memory-filters"><label className="memory-search"><Search size={15}/><input aria-label="搜索记忆" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、内容、标签"/></label><select aria-label="记忆范围" value={scope} onChange={event => setScope(event.target.value)}><option value="all">全部范围</option><option value="global">全局</option><option value="project">当前项目</option></select><select aria-label="记忆状态" value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部状态</option>{Object.entries(STATUS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select aria-label="记忆类型" value={kind} onChange={event => setKind(event.target.value)}><option value="all">全部类型</option>{Object.entries(KIND).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div className={`memory-layout ${draft ? 'has-editor' : ''}`}>
        <div className="memory-list" aria-label="记忆条目">{items.map(item => <button type="button" className={`memory-row ${draft?.id === item.id && draft?.scope === item.scope ? 'selected' : ''}`} key={`${item.scope}/${item.id}`} disabled={busy} onClick={() => select(item)}><span className="memory-row-head"><b>{item.pinned && <Star size={13}/>} {item.title}</b><small className={`memory-status ${item.status}`}>{STATUS[item.status]}</small></span><span className="memory-row-meta">{item.scope === 'global' ? '全局' : '项目'} · {KIND[item.kind]} · {SOURCE[item.source] || '已有记忆'}</span><span className="memory-preview">{item.content.slice(0, 140)}</span><small>{date(item.updated)} · 召回 {item.useCount} 次</small></button>)}{!items.length && <div className="empty-list">{query || scope !== 'all' || status !== 'all' || kind !== 'all' ? '没有匹配的记忆' : '记忆库为空。可以手动添加，或在完成任务后沉淀稳定经验。'}</div>}</div>
        {draft && <form className="memory-editor" onSubmit={save}>
          <div className="memory-editor-head"><h3>{draft.id ? '编辑记忆' : '新建记忆'}{dirty && <small>未保存</small>}</h3><button type="button" aria-label="关闭记忆编辑" onClick={async () => { if (await mayLeave()) { setDraft(null); setDirty(false); } }}><X size={16}/></button></div>
          <div className="memory-field-row"><label>范围<select aria-label="编辑记忆范围" value={draft.scope} disabled={Boolean(draft.id)} onChange={event => change('scope', event.target.value)}><option value="project">当前项目</option><option value="global">全局</option></select></label><label>类型<select aria-label="编辑记忆类型" value={draft.kind} onChange={event => change('kind', event.target.value)}>{Object.entries(KIND).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
          <label>标题<input aria-label="记忆标题" maxLength={120} required value={draft.title} onChange={event => change('title', event.target.value)}/></label>
          <label>内容<textarea aria-label="记忆内容" rows={7} maxLength={12000} required value={draft.content} onChange={event => change('content', event.target.value)} placeholder="写下稳定信息；方法可包含适用条件、步骤和验证方式。"/></label>
          <label>标签<input aria-label="记忆标签" value={draft.tagText ?? draft.tags.join(', ')} onChange={event => { change('tagText', event.target.value); change('tags', event.target.value.split(/[,，]/).map(value => value.trim())); }} placeholder="以逗号分隔"/></label>
          <label>依据<textarea aria-label="记忆依据" rows={2} maxLength={1200} value={draft.evidence || ''} onChange={event => change('evidence', event.target.value)} placeholder="用户原话、验证结果或来源"/></label>
          <label className="memory-pin"><input type="checkbox" checked={draft.pinned} onChange={event => change('pinned', event.target.checked)}/>优先召回这条记忆</label>
          {draft.id && <div className="memory-detail-meta"><span>{STATUS[draft.status]} · v{draft.revision} · {SOURCE[draft.source] || '已有记忆'}</span><span>上次召回：{date(draft.lastUsed)}</span>{draft.supersedesId && <span>替换提案：审核后应用到原记忆 v{draft.baseRevision}，保留原条目的版本历史。</span>}{draft.origin?.sessionId && (draft.origin.workspace && draft.origin.workspace !== workspace ? <span>来源项目：{draft.origin.workspace}（切换至该项目后查看来源会话）</span> : <button type="button" onClick={openSource}>查看来源会话</button>)}</div>}
          <div className="memory-editor-actions"><button className="primary-action" type="submit" disabled={busy || !draft.content.trim() || !draft.title.trim()}><Save size={14}/>保存</button>{draft.id && <><button type="button" disabled={busy} onClick={() => select(draft)}><RefreshCw size={14}/>重新读取</button>{draft.status === 'pending' ? <button type="button" disabled={busy || dirty} onClick={() => action(async () => { const result = await post(`/api/memories/${draft.scope}/${draft.id}/approve`, { expectedRevision: draft.revision }); setDraft(result.item); }, '记忆已审核启用')}><Check size={14}/>审核启用</button> : <button type="button" disabled={busy || dirty} onClick={() => action(async () => { const result = await api(`/api/memories/${draft.scope}/${draft.id}`, { method: 'PUT', body: { status: draft.status === 'archived' ? 'active' : 'archived', expectedRevision: draft.revision } }); setDraft(result.item); }, draft.status === 'archived' ? '记忆已启用' : '记忆已停用')}><Archive size={14}/>{draft.status === 'archived' ? '重新启用' : '停用'}</button>}<button type="button" className="memory-delete" disabled={busy} onClick={remove}><Trash2 size={14}/>删除</button></>}</div>
          {draft.history?.length > 0 && <div className="memory-versions"><button type="button" onClick={() => setVersions(value => !value)}><Clock size={14}/>历史版本（{draft.history.length}）</button>{versions && draft.history.slice().reverse().map(version => <div key={version.revision}><span>v{version.revision} · {date(version.updated)}<p>{version.content.slice(0, 220)}</p></span><button type="button" disabled={busy || dirty} onClick={() => action(async () => { const result = await post(`/api/memories/${draft.scope}/${draft.id}/restore`, { revision: version.revision, expectedRevision: draft.revision }); setDraft(result.item); }, '历史内容已恢复为新版本')}>恢复</button></div>)}</div>}
        </form>}
      </div>
      {notice && <p className="memory-notice" role="status"><Check size={14}/>{notice}</p>}
    </section>
    <section className="section-block"><div className="section-head"><div><h2>学习记录</h2><p>查看任务后回顾的进度和结果，记忆条目保留来源与编辑历史。</p></div></div>{jobs.length ? <ol className="memory-learning">{jobs.slice(0, 10).map(job => <li key={job.id}><span className={`memory-learning-dot ${job.status}`}/><div><b>{JOB[job.status] || job.status}</b><small>{date(job.createdAt)}</small><p>{job.message || '正在提炼有依据的偏好和经验'}</p>{job.savedIds.length > 0 && <span>{job.savedIds.filter(item => item.status === 'pending').length ? '有内容等待审核' : '新记忆可用于后续任务'}</span>}</div></li>)}</ol> : <p className="memory-hint">真实模型完成合适的任务后，会在后台回顾稳定经验；mock 模型不会生成长期记忆。</p>}</section>
  </div>;
}
