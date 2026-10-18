import { confirmAction, useActionPopoverOpen } from './ActionPopover.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Globe, Grid2X2, List, LoaderCircle, Menu, Plus, RefreshCw, Search, Settings2, ShieldCheck, X, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import './app-center.css';

function AppIcon({ app }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [app.url]);
  return <span className="app-center-icon" aria-hidden="true"><span>{app.name.slice(0, 1).toUpperCase()}</span>{!failed && <img src={'/api/app-center/apps/' + app.id + '/icon?v=' + encodeURIComponent(app.url)} alt="" loading="lazy" onLoad={event => { event.currentTarget.style.opacity = '1'; }} onError={() => setFailed(true)}/>}</span>;
}
function appStatus(app, pending) {
  if (app.agentAllowed === false) return { text: '未授权', tone: 'revoked' };
  if (pending || app.loginState === 'required') return { text: pending ? '等待登录' : '未登录', tone: 'waiting' };
  if (app.loginState === 'signed-in' || app.status === 'authorized') return { text: '已登录', tone: 'authorized' };
  return { text: '待确认登录', tone: '' };
}
function AppCard({ app, selected, pending, deleteMode, deleteSelected, onClick, onConfirm, onToggleDelete, confirmDisabled }) {
  const status = appStatus(app, pending);
  const needsConfirmation = app.status !== 'authorized' && app.agentAllowed !== false;
  const removable = app.source !== 'platform';
  return <div className={'app-center-card ' + (selected ? 'selected ' : '') + (deleteMode ? 'delete-mode ' : '') + (deleteSelected ? 'delete-selected' : '')}>
    {deleteMode && removable && <button type="button" className="app-center-card-check" onClick={onToggleDelete} aria-label={(deleteSelected ? '取消选择删除 ' : '选择删除 ') + app.name} aria-pressed={deleteSelected}>{deleteSelected && <Check size={13}/>}</button>}
    <button className="app-center-card-open" onClick={deleteMode ? (removable ? onToggleDelete : undefined) : onClick} disabled={deleteMode && !removable} title={deleteMode ? removable ? (deleteSelected ? '取消选择 ' : '选择 ') + app.name : '平台应用不能删除' : app.description || app.url} aria-label={deleteMode ? removable ? (deleteSelected ? '取消选择删除 ' : '选择删除 ') + app.name : app.name + ' 不可删除' : '打开应用 ' + app.name} aria-pressed={deleteMode && removable ? deleteSelected : undefined}>
    <AppIcon app={app}/><span className="app-center-card-info"><b>{app.name}</b><span className="app-center-card-domain">{new URL(app.url).hostname.replace(/^www\./, '')}</span></span>
    {!needsConfirmation && <span className={'app-center-card-status ' + status.tone}>{pending ? <LoaderCircle size={11} className="spin"/> : status.tone === 'authorized' ? <ShieldCheck size={11}/> : <span className="app-center-status-dot"/>}{status.text}</span>}
    <span className="app-center-card-source">{app.source === 'platform' ? '平台应用' : '我的应用'}</span>
    </button>
    {!deleteMode && needsConfirmation && <button className="app-center-card-confirm" disabled={confirmDisabled} title="网站登录完成后点击，确认登录并允许 Agent 使用此应用" onClick={onConfirm}>确认登录</button>}
  </div>;
}

export default function AppCenter({ get, post, onError, onToggle, request, onResume, overlayVisible = false, sidebarOpen }) {
  const [data, setData] = useState({ apps: [], pending: [] }), [selected, setSelected] = useState(null), [page, setPage] = useState(null), [address, setAddress] = useState(''), [busy, setBusy] = useState(false), [form, setForm] = useState(null), [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [deleteMode, setDeleteMode] = useState(false), [deleteSelection, setDeleteSelection] = useState([]);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem('mli-app-center-layout') === 'list' ? 'list' : 'cards'; } catch { return 'cards'; } });
  const surface = useRef(null), mounted = useRef(true), openSequence = useRef(0), active = useRef(null), resumed = useRef(null);
  const actionPopoverOpen = useActionPopoverOpen();
  const desktop = window.desktop, supported = Boolean(desktop?.openApp);
  const fail = error => { if (mounted.current) onError?.(error); };
  async function refresh(force = false) { const result = await get('/api/app-center' + (force ? '?refresh=1' : '')); if (mounted.current) setData(result); return result; }
  useEffect(() => {
    mounted.current = true; refresh().catch(fail);
    const timer = setInterval(() => refresh().catch(() => {}), 2000);
    const unsubscribe = desktop?.onAppBrowserChanged?.(value => { if (mounted.current && value.appId === active.current) { setPage(value); if (!value.loading) setAddress(value.url); } });
    return () => { mounted.current = false; openSequence.current++; clearInterval(timer); unsubscribe?.(); desktop?.setAppBrowserBounds?.(null).catch(() => {}); };
  }, []);
  useEffect(() => { try { localStorage.setItem('mli-app-center-layout', layout); } catch {} }, [layout]);
  async function open(id) {
    setSelected(id); active.current = id; setNotice(''); setPage(null); setAddress(data.apps.find(item => item.id === id)?.url || '');
    if (!supported) return;
    const sequence = ++openSequence.current; setBusy(true);
    try { const value = await desktop.openApp(id); if (mounted.current && sequence === openSequence.current) { setPage(value); setAddress(value.url); await refresh(); } }
    catch (error) { fail(error); }
    finally { if (mounted.current && sequence === openSequence.current) setBusy(false); }
  }
  function home() { openSequence.current++; active.current = null; setSelected(null); setPage(null); setBusy(false); }
  useEffect(() => { if (request?.appId) { refresh().catch(fail); open(request.appId); } }, [request?.requestId]);
  const app = data.apps.find(item => item.id === selected);
  useEffect(() => {
    if (request?.requestId && resumed.current !== request.requestId && data.apps.some(item => item.id === request.appId && item.status === 'authorized' && item.agentAllowed !== false)) {
      resumed.current = request.requestId;
      if (request.sessionId) onResume?.(request.rootSessionId || request.sessionId);
    }
  }, [data, request]);
  useEffect(() => {
    if (!supported || !surface.current || !app || form || overlayVisible || actionPopoverOpen) { desktop?.setAppBrowserBounds?.(null).catch(() => {}); return; }
    let frame, ended = false;
    const update = () => { const rect = surface.current?.getBoundingClientRect(); if (rect && !ended) desktop.setAppBrowserBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }).catch(fail); };
    const observer = new ResizeObserver(update); observer.observe(surface.current); window.addEventListener('resize', update);
    const positionTimer = window.setInterval(update, 120);
    // Position can change during a sidebar transition without resizing the surface.
    desktop.openApp(app.id).then(() => { const start = performance.now(); const track = () => { update(); if (performance.now() - start < 350) frame = requestAnimationFrame(track); }; track(); }).catch(fail);
    return () => { ended = true; cancelAnimationFrame(frame); window.clearInterval(positionTimer); observer.disconnect(); window.removeEventListener('resize', update); desktop.setAppBrowserBounds(null).catch(() => {}); };
  }, [app?.id, supported, Boolean(form), overlayVisible, actionPopoverOpen, sidebarOpen, dockCollapsed]);
  const waiting = data.pending.filter(item => item.appId === selected);
  async function permission(allowed) { setBusy(true); try { await post('/api/app-center/apps/' + selected + '/permission', { allowed }); await refresh(); } catch (error) { fail(error); } finally { if (mounted.current) setBusy(false); } }
  async function clearLogin() {
    setBusy(true);
    try { await desktop.clearAppLogin(selected); await post('/api/app-center/apps/' + selected + '/clear-login', {}); setPage(null); await refresh(); setNotice('已清除本机登录数据'); }
    catch (error) { fail(error); } finally { if (mounted.current) setBusy(false); }
  }
  async function cancelWaiting() { setBusy(true); try { await post('/api/app-center/apps/' + selected + '/cancel', {}); await refresh(); } catch (error) { fail(error); } finally { if (mounted.current) setBusy(false); } }
  async function remove(appId = selected) {
    const target = data.apps.find(item => item.id === appId);
    if (!target || !await confirmAction('删除“' + target.name + '”并清除它的本机登录数据？', { confirmLabel: '删除' })) return;
    setBusy(true);
    try { await desktop?.clearAppLogin?.(appId); const response = await fetch('/api/app-center/apps/' + appId, { method: 'DELETE' }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setForm(null); if (selected === appId) home(); await refresh(); }
    catch (error) { fail(error); } finally { if (mounted.current) setBusy(false); }
  }
  function startDelete() { setDeleteMode(true); setDeleteSelection([]); setFilter('user'); }
  function cancelDelete() { setDeleteMode(false); setDeleteSelection([]); }
  function toggleDelete(appId) { setDeleteSelection(items => items.includes(appId) ? items.filter(id => id !== appId) : [...items, appId]); }
  async function removeSelected() {
    const targets = data.apps.filter(item => deleteSelection.includes(item.id) && item.source !== 'platform');
    if (!targets.length) return;
    const summary = targets.length === 1 ? `删除“${targets[0].name}”并清除它的本机登录数据？` : `删除选中的 ${targets.length} 个应用，并清除它们的本机登录数据？`;
    if (!await confirmAction(summary, { confirmLabel: `删除 ${targets.length} 个应用` })) return;
    setBusy(true);
    try {
      for (const target of targets) {
        await desktop?.clearAppLogin?.(target.id);
        const response = await fetch('/api/app-center/apps/' + target.id, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
      }
      cancelDelete(); await refresh(); setNotice(`已删除 ${targets.length} 个应用`);
    } catch (error) { await refresh().catch(() => {}); fail(error); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try {
      const { app } = await post('/api/app-center/apps', { ...form, origins: form.origins.split('\n').map(s => s.trim()).filter(Boolean), loginPaths: form.loginPaths.split('\n').map(s => s.trim()).filter(Boolean) });
      setForm(null); await refresh(); await open(app.id);
    } catch (error) { fail(error); } finally { if (mounted.current) setBusy(false); }
  }
  const newForm = () => setForm({ name: '', url: '', origins: '', loginPaths: '/login\n/signin\n/sign-in\n/auth\n/oauth\n/sso' });
  async function confirmLogin(appId) {
    setBusy(true);
    try { await desktop.authorizeApp(appId); await refresh(); setNotice('已确认登录，允许 Agent 使用此应用；可在“管理应用”中关闭。'); }
    catch (error) { fail(error); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function navigate(action, url) { setBusy(true); try { const value = await desktop.navigateApp({ action, url }); setPage(value); setAddress(value.url); } catch (error) { fail(error); } finally { if (mounted.current) setBusy(false); } }
  const visible = data.apps.filter(item => (filter === 'all' || (filter === 'platform' ? item.source === 'platform' : item.source !== 'platform')) && (item.name + ' ' + item.url + ' ' + (item.description || '')).toLowerCase().includes(query.trim().toLowerCase()));
  const controls = <div className="app-center-controls"><div className="app-center-tabs" role="tablist" aria-label="应用来源">{[['all', '全部应用'], ['platform', '平台应用'], ['user', '我的应用']].map(([key, label]) => <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} disabled={deleteMode && key !== 'user'} onClick={() => setFilter(key)}>{label}<small>{data.apps.filter(item => key === 'all' || (key === 'platform' ? item.source === 'platform' : item.source !== 'platform')).length}</small></button>)}</div><div className="app-center-search-row"><label className="app-center-search"><Search size={14}/><input aria-label="搜索应用" placeholder="搜索应用" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button title="清空搜索" onClick={() => setQuery('')}><X size={13}/></button>}</label><div className="app-center-layout" role="group" aria-label="应用布局"><button title="卡片布局" aria-label="卡片布局" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}><Grid2X2 size={15}/></button><button title="列表布局" aria-label="列表布局" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={15}/></button></div></div></div>;
  const applications = <div className={'app-center-grid ' + (layout === 'list' ? 'app-center-list' : '')}>{visible.map(item => <AppCard key={item.id} app={item} selected={selected === item.id} pending={data.pending.some(w => w.appId === item.id)} deleteMode={deleteMode} deleteSelected={deleteSelection.includes(item.id)} onClick={() => open(item.id)} onConfirm={() => confirmLogin(item.id)} onToggleDelete={() => toggleDelete(item.id)} confirmDisabled={busy || !supported || !desktop?.authorizeApp}/>)}{!app && !deleteMode && <button className="app-center-add-card" onClick={newForm}><span className="app-center-icon"><Plus size={26}/></span><b>添加应用</b></button>}{!visible.length && <p className="app-center-empty">{query ? '没有匹配的应用' : '暂无应用'}</p>}</div>;
  const status = app && appStatus(app, waiting.length > 0);
  return <section className={'app-center-page ' + (app ? 'browsing' : '')}>
    {!app && <header className="app-center-head"><div><button className="mobile-menu" title="切换导航" aria-label="切换导航" onClick={onToggle}><Menu size={18}/></button><Grid2X2 size={17}/><h1>应用台</h1>{deleteMode && <span className="app-center-delete-count">已选择 {deleteSelection.length} 个</span>}</div><div className="app-center-head-actions">{deleteMode ? <><button className="secondary-action" disabled={busy} onClick={cancelDelete}>取消</button><button className="app-center-delete-confirm" disabled={busy || !deleteSelection.length} onClick={removeSelected}><Trash2 size={13}/>删除所选</button></> : <><button className="app-center-refresh" title="更新平台应用" disabled={busy} onClick={() => refresh(true).catch(fail)}><RefreshCw size={15}/></button><button className="app-center-delete-start" disabled={busy || !data.apps.some(item => item.source !== 'platform')} onClick={startDelete}><Trash2 size={13}/>删除应用</button><button className="primary-action" disabled={busy} onClick={newForm}><Plus size={15}/>添加应用</button></>}</div></header>}
    {!supported && <div className="app-center-notice">请在桌面端打开应用浏览器</div>}
    {data.catalogError && <p className="app-center-catalog-notice" role="status">{data.catalogError}</p>}
    {app ? <div className="app-center-body"><aside className="app-center-dock" hidden={dockCollapsed}><div className="app-center-dock-head"><button className="app-center-home" onClick={home}><ArrowLeft size={14}/>所有应用</button><button title="收起应用侧栏" aria-label="收起应用侧栏" aria-expanded="true" onClick={() => setDockCollapsed(true)}><PanelLeftClose size={16}/></button></div>{controls}{applications}</aside><div className="app-center-browser">
      {dockCollapsed && <button className="app-center-expand-dock" title="展开应用侧栏" aria-label="展开应用侧栏" aria-expanded="false" onClick={() => setDockCollapsed(false)}><PanelLeftOpen size={16}/></button>}
      <div className="app-center-toolbar"><button title="后退" disabled={!supported || !page?.canGoBack || busy} onClick={() => navigate('back')}><ArrowLeft size={16}/></button><button title="前进" disabled={!supported || !page?.canGoForward || busy} onClick={() => navigate('forward')}><ArrowRight size={16}/></button><button title="刷新页面" disabled={!supported || busy} onClick={() => navigate('reload')}><RefreshCw size={15}/></button><form onSubmit={event => { event.preventDefault(); if (supported && !busy) navigate('url', /^https?:\/\//i.test(address) ? address : 'https://' + address); }}><Globe size={13}/><input aria-label="应用网址" value={address} placeholder={app.url} disabled={!supported} onChange={event => setAddress(event.target.value)}/></form><button title="管理应用" aria-label="管理应用" onClick={() => setForm({ ...app, origins: app.origins.join('\n'), loginPaths: app.loginPaths.join('\n') })}><Settings2 size={16}/></button></div>
      {notice && <p className="app-center-notice" role="status">{notice}</p>}<div className="app-center-surface" ref={surface}>{(!supported || !page || page.loading) && <div className="app-center-placeholder">{supported ? <><LoaderCircle className="spin" size={20}/><span>{page?.loading || busy ? '正在加载…' : '尚未打开页面'}</span></> : <><Globe size={24}/><span>请使用桌面端</span></>}</div>}</div><footer><span className={status.tone}>{status.text}</span>{waiting.length > 0 && <><span>{waiting.length} 个任务等待{app.agentAllowed === false ? '授权' : '登录'}</span><button disabled={busy} onClick={cancelWaiting}>取消等待</button></>}<span className="app-center-storage">本机登录会话</span></footer>
    </div></div> : <div className="app-center-launchpad">{controls}{applications}</div>}
    {form && <div className="dialog-layer"><form className="dialog-card app-center-dialog" onSubmit={save}><header><h3>{form.id ? '管理应用' : '添加应用'}</h3><button type="button" title="关闭" disabled={busy} onClick={() => setForm(null)}><X size={18}/></button></header><label>应用网址<input required autoFocus={!form.id} disabled={form.source === 'platform'} maxLength={3000} placeholder="example.com 或 https://example.com" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })}/></label>{form.id && <label className="app-center-permission"><span>允许 Agent 使用</span><input type="checkbox" checked={app?.agentAllowed !== false} disabled={busy} onChange={event => permission(event.target.checked)}/></label>}<details open={Boolean(form.id)}><summary>{form.id ? '应用信息' : '名称与高级设置'}</summary><label>应用名称<input disabled={form.source === 'platform'} maxLength={100} value={form.name} placeholder="默认使用网站域名" onChange={event => setForm({ ...form, name: event.target.value })}/></label></details><footer>{form.id && <><button type="button" disabled={busy || !supported} onClick={async () => { await clearLogin(); setForm(null); }}>清除登录</button>{form.source !== 'platform' && <button type="button" disabled={busy} onClick={() => remove(form.id)}><Trash2 size={14}/>删除应用</button>}</>}<button type="submit" className="primary-action" disabled={busy}>{busy ? '处理中…' : form.id ? '保存并打开' : '添加并打开'}</button></footer></form></div>}
  </section>;
}
