import React, { useEffect, useRef, useState } from 'react';
import { AppWindow, ArrowLeft, ArrowRight, Camera, ChevronRight, Download, Eraser, ExternalLink, File, Globe, History, KeyRound, LoaderCircle, Minus, MoreHorizontal, MousePointer2, Plus, Printer, Puzzle, RefreshCw, Search, Settings2, Smartphone, SquareTerminal, Trash2, Wrench, X } from 'lucide-react';
import './browser-workspace.css';

function normalizeAddress(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^[a-z][a-z\d+.-]*:/i.test(text) ? text : 'https://' + text;
}

const EDGE_EXTENSION_STORE = 'https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home';

export default function BrowserWorkspace({ browserId, initialUrl = '', active, onFiles, onTerminal, onOpenApp, onState, onError }) {
  const [address, setAddress] = useState(initialUrl), [page, setPage] = useState(null), [apps, setApps] = useState([]), [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null), [extensions, setExtensions] = useState([]), [zoom, setZoom] = useState(1), [findOpen, setFindOpen] = useState(false), [findText, setFindText] = useState('');
  const [history, setHistory] = useState([]), [downloads, setDownloads] = useState([]), [menuNotice, setMenuNotice] = useState('');
  const [pickerActive, setPickerActive] = useState(false);
  const surface = useRef(null), mounted = useRef(true);
  const desktop = window.desktop, supported = Boolean(desktop?.openUrl);
  const fail = error => { if (mounted.current) onError?.(error); };

  useEffect(() => {
    mounted.current = true;
    fetch('/api/app-center').then(response => response.json()).then(data => { if (mounted.current) setApps(data.apps || []); }).catch(() => {});
    const unsubscribe = desktop?.onAppBrowserChanged?.(value => {
      if (mounted.current && value.browserId === browserId) {
        setPage(value); setBusy(Boolean(value.loading));
        if (value.url) setAddress(value.url);
        onState?.(value);
      }
    });
    const unsubscribeCopied = desktop?.onAppBrowserCopied?.(value => {
      if (!mounted.current || value?.browserId !== browserId) return;
      setMenuNotice(value.message || '元素信息已复制');
      window.setTimeout(() => setMenuNotice(current => current === (value.message || '元素信息已复制') ? '' : current), 1800);
    });
    const unsubscribeMenu = desktop?.onAppBrowserMenuAction?.(value => {
      if (!mounted.current || value?.browserId !== browserId) return;
      const action = value.action;
      if (action === 'find') { setFindOpen(true); setMenu(null); return; }
      if (action === 'load-extension') { addExtension(); return; }
      if (action === 'extension-store') { open(EDGE_EXTENSION_STORE); return; }
      if (action === 'zoom') { changeZoom(Number(value.value) || 0); return; }
      if (action === 'zoom-reset') { desktop.browserPageAction({ browserId, action: 'zoom', factor: 1 }).then(() => setZoom(1)).catch(fail); return; }
      if (action === 'settings') { showExtensions(); return; }
      if (action === 'downloads' || action === 'history') { openPanel(action); return; }
      pageAction(action);
    });
    return () => { mounted.current = false; unsubscribe?.(); unsubscribeCopied?.(); unsubscribeMenu?.(); };
  }, [browserId]);

  // Opening/navigation is deliberately separate from menu and overlay state.
  // Changing a toolbar menu must never call openUrl again, otherwise Chromium
  // starts a second navigation and can report ERR_NETWORK_CHANGED.
  useEffect(() => {
    if (!active || !supported || !page?.url) return undefined;
    let ended = false;
    desktop.openUrl({ browserId, url: page.url }).then(state => {
      if (!ended && state?.url && state.url !== page.url) { setPage(state); setAddress(state.url); onState?.(state); }
    }).catch(fail);
    return () => { ended = true; };
  }, [active, supported, browserId]);

  useEffect(() => {
    if (!active || !supported || !surface.current || !page?.url || findOpen) {
      desktop?.setAppBrowserBounds?.(null).catch(() => {});
      return undefined;
    }
    let ended = false;
    const update = () => {
      const rect = surface.current?.getBoundingClientRect();
      if (rect && !ended) {
        // The native page view must never be resized when a toolbar menu opens.
        // Menus are rendered above the page, so changing this width causes a
        // visible re-layout and can make Chromium report ERR_NETWORK_CHANGED.
        desktop.setAppBrowserBounds({ x: rect.x, y: rect.y, width: Math.max(1, rect.width), height: rect.height }).catch(fail);
      }
    };
    const observer = new ResizeObserver(update); observer.observe(surface.current); window.addEventListener('resize', update);
    const timer = window.setInterval(update, 120); update();
    return () => { ended = true; clearInterval(timer); observer.disconnect(); window.removeEventListener('resize', update); desktop.setAppBrowserBounds(null).catch(() => {}); };
  }, [active, supported, browserId, Boolean(page?.url), menu, findOpen]);

  useEffect(() => {
    if (!active || !initialUrl || page?.url || !supported) return;
    open(initialUrl);
  }, [active, initialUrl, supported]);

  useEffect(() => {
    if (!pickerActive || !supported || !page?.url) return undefined;
    let stopped = false;
    const poll = async () => { try { const result = await desktop.browserPageAction({ browserId, action: 'element-picker-pick' }); if (!stopped && result?.active === false) setPickerActive(false); } catch {} };
    const timer = window.setInterval(poll, 220); poll();
    return () => { stopped = true; clearInterval(timer); };
  }, [pickerActive, supported, browserId, Boolean(page?.url)]);

  async function open(value) {
    const url = normalizeAddress(value);
    if (!url || !supported) return;
    setBusy(true);
    try { if (pickerActive) await desktop.browserPageAction({ browserId, action: 'element-picker-stop' }).catch(() => {}); setPickerActive(false); const state = await desktop.openUrl({ browserId, url }); if (mounted.current) { setPage(state); setAddress(state.url); onState?.(state); } }
    catch (error) { fail(error); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function navigate(action) {
    setBusy(true);
    try { if (pickerActive) await desktop.browserPageAction({ browserId, action: 'element-picker-stop' }).catch(() => {}); setPickerActive(false); const state = await desktop.navigateApp({ action }); if (mounted.current) { setPage(state); setAddress(state.url); onState?.(state); } }
    catch (error) { fail(error); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function showExtensions() {
    try { const rect = document.querySelector('.browser-extension-trigger')?.getBoundingClientRect(); await desktop.browserPageAction({ browserId, action: 'menu-overlay', kind: 'extensions', x: rect?.left || 0, y: rect?.bottom || 0 }); setMenu(null); }
    catch (error) { fail(error); }
  }
  async function addExtension() {
    try { const result = await desktop.addBrowserExtension(); if (result) setExtensions(result.extensions || []); }
    catch (error) { fail(error); }
  }
  async function removeExtension(extensionPath) {
    try { setExtensions(await desktop.removeBrowserExtension(extensionPath)); }
    catch (error) { fail(error); }
  }
  async function changeZoom(delta) {
    const factor = Math.max(.5, Math.min(2, Math.round((zoom + delta) * 10) / 10));
    try { await desktop.browserPageAction({ browserId, action: 'zoom', factor }); setZoom(factor); }
    catch (error) { fail(error); }
  }
  async function find(event) {
    event.preventDefault();
    try { await desktop.browserPageAction({ browserId, action: 'find', text: findText }); }
    catch (error) { fail(error); }
  }
  async function closeFind() {
    setFindOpen(false); setFindText('');
    try { await desktop.browserPageAction({ browserId, action: 'stop-find' }); } catch {}
  }
  async function pageAction(action, options = {}) {
    try {
      const result = await desktop.browserPageAction({ browserId, action, ...options });
      if (action === 'history') setHistory(result?.items || []);
      if (action === 'downloads') setDownloads(result?.items || []);
      if (result?.message) setMenuNotice(result.message);
      return result;
    } catch (error) { fail(error); return null; }
  }
  async function openPanel(name) {
    setMenuNotice('');
    if (name === 'history') await pageAction('history');
    if (name === 'downloads') await pageAction('downloads');
    setMenu(name);
  }

  function openMenu(name) {
    if (menu === name) { setMenu(null); return; }
    const button = name === 'extensions' ? document.querySelector('.browser-extension-trigger') : document.querySelector('.browser-toolbar-menu button[aria-label="更多"]');
    const rect = button?.getBoundingClientRect();
    desktop.browserPageAction({ browserId, action: 'menu-overlay', kind: name === 'extensions' ? 'extensions' : 'more', x: rect?.left || 0, y: rect?.bottom || 0 }).catch(fail);
    setMenu(null);
  }
  async function runMenuAction(action, keepOpen = false) {
    const result = await pageAction(action);
    if (!keepOpen && result) setMenu(null);
  }
  async function clearBrowsingData() {
    if (!window.confirm('清除这个标签页的 Cookie、缓存和浏览历史？已加载的扩展程序会保留。')) return;
    const result = await pageAction('clear-data');
    if (result) { setHistory([]); setMenuNotice('浏览数据已清除'); }
  }

  async function togglePicker() {
    const next = !pickerActive;
    try {
      const result = await desktop.browserPageAction({ browserId, action: next ? 'element-picker-start' : 'element-picker-stop' });
      setPickerActive(Boolean(next && result?.active !== false));
      setMenu(null);
    } catch (error) { fail(error); }
  }

  return <section className="browser-workspace">
    <div className="browser-start-toolbar" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
      <button title="后退" aria-label="后退" disabled={!page?.canGoBack || busy} onClick={() => navigate('back')}><ArrowLeft size={18}/></button>
      <button title="前进" aria-label="前进" disabled={!page?.canGoForward || busy} onClick={() => navigate('forward')}><ArrowRight size={18}/></button>
      <button title="刷新" aria-label="刷新" disabled={!page?.url || busy} onClick={() => navigate('reload')}>{busy ? <LoaderCircle className="spin" size={17}/> : <RefreshCw size={17}/>}</button>
      <form onSubmit={event => { event.preventDefault(); open(address); }}><Globe size={16}/><input autoFocus={!initialUrl} aria-label="网址" placeholder="搜索或输入网址" value={address} onChange={event => setAddress(event.target.value)}/></form>
      <button className={pickerActive ? 'active' : ''} title="检查网页元素" aria-label="检查网页元素" aria-pressed={pickerActive} disabled={!page?.url || busy} onClick={togglePicker}><MousePointer2 size={17}/></button>
      <div className="browser-toolbar-menu">
        <button className={`browser-extension-trigger ${menu === 'extensions' ? 'active' : ''}`} title="扩展程序" aria-label="扩展程序" aria-expanded={menu === 'extensions'} onClick={showExtensions}><Puzzle size={15} strokeWidth={1.7}/></button>
        {menu === 'extensions' && <div className="browser-menu browser-extension-menu">
          <header><b>扩展程序</b><small>{extensions.length}</small></header>
          <div className="browser-extension-list">{extensions.map(extension => <div key={extension.path}><span><b>{extension.name}</b><small>{extension.version || extension.error}</small></span><button title={'移除 ' + extension.name} aria-label={'移除 ' + extension.name} onClick={() => removeExtension(extension.path)}><Trash2 size={14}/></button></div>)}{!extensions.length && <p>未加载扩展程序</p>}</div>
          <button onClick={addExtension}><Puzzle size={16}/><span>加载本地扩展</span></button>
          <button onClick={() => open(EDGE_EXTENSION_STORE)}><ExternalLink size={16}/><span>访问 Edge 外接程序商店</span></button>
        </div>}
      </div>
      <div className="browser-toolbar-menu">
        <button className={menu === 'more' ? 'active' : ''} title="更多" aria-label="更多" aria-expanded={menu === 'more'} onClick={() => openMenu('more')}><MoreHorizontal size={19}/></button>
        {menu === 'more' && <div className="browser-menu browser-more-menu">
          <button disabled={!page?.url} onClick={() => { setFindOpen(true); setMenu(null); }}><Search size={15}/><span>在页面中查找</span></button>
          <button disabled={!page?.url} onClick={() => runMenuAction('print')}><Printer size={15}/><span>打印</span></button>
          <div className="browser-zoom-row"><span>缩放</span><button title="缩小" aria-label="缩小" onClick={() => changeZoom(-.1)}><Minus size={15}/></button><b>{Math.round(zoom * 100)}%</b><button title="放大" aria-label="放大" onClick={() => changeZoom(.1)}><Plus size={15}/></button></div>
          <button disabled={!page?.url} onClick={() => runMenuAction('device-toolbar')}><Smartphone size={15}/><span>设备工具栏</span></button>
          <button disabled={!page?.url} onClick={() => runMenuAction('devtools')}><Wrench size={15}/><span>开发者工具</span></button>
          <button disabled={!page?.url} onClick={() => runMenuAction('screenshot')}><Camera size={15}/><span>截取屏幕截图</span></button>
          <div className="browser-menu-separator"/>
          <button onClick={() => openPanel('downloads')}><Download size={15}/><span>下载</span><ChevronRight className="browser-menu-chevron" size={15}/></button>
          <button onClick={() => openPanel('history')}><History size={15}/><span>历史记录</span><ChevronRight className="browser-menu-chevron" size={15}/></button>
          <button disabled title="Agent 工具浏览器不保存或导入密码"><KeyRound size={15}/><span>密码和自动填充</span><small className="browser-menu-note">不保存密码</small></button>
          <button disabled={!page?.url} onClick={clearBrowsingData}><Eraser size={15}/><span>清除浏览数据</span></button>
          <div className="browser-menu-separator"/>
          <button onClick={() => openMenu('settings')}><Settings2 size={15}/><span>浏览器设置</span><ChevronRight className="browser-menu-chevron" size={15}/></button>
        </div>}
        {menu === 'history' && <div className="browser-menu browser-detail-menu">
          <header><button title="返回" aria-label="返回更多菜单" onClick={() => setMenu('more')}><ArrowLeft size={15}/></button><b>历史记录</b></header>
          <div className="browser-menu-list">{history.map((item, index) => <button key={`${item.url}-${item.at}-${index}`} onClick={() => { open(item.url); setMenu(null); }}><span><b>{item.title || item.url}</b><small>{item.url}</small></span></button>)}{!history.length && <p>暂无浏览历史</p>}</div>
          <button disabled={!history.length} onClick={clearBrowsingData}><Eraser size={15}/><span>清除浏览数据</span></button>
        </div>}
        {menu === 'downloads' && <div className="browser-menu browser-detail-menu">
          <header><button title="返回" aria-label="返回更多菜单" onClick={() => setMenu('more')}><ArrowLeft size={15}/></button><b>下载</b></header>
          <div className="browser-menu-list">{downloads.map((item, index) => <div key={`${item.path}-${index}`}><span><b>{item.name}</b><small>{item.state === 'completed' ? '已完成' : item.state === 'cancelled' ? '已取消' : item.state === 'interrupted' ? '下载失败' : '下载中'}</small></span></div>)}{!downloads.length && <p>暂无下载记录</p>}</div>
          <button onClick={() => runMenuAction('open-downloads')}><ExternalLink size={15}/><span>打开下载文件夹</span></button>
        </div>}
        {menu === 'settings' && <div className="browser-menu browser-detail-menu">
          <header><button title="返回" aria-label="返回更多菜单" onClick={() => setMenu('more')}><ArrowLeft size={15}/></button><b>浏览器设置</b></header>
          <div className="browser-settings-summary"><b>Agent 工具浏览器</b><small>网站数据按标签页隔离；关闭标签页时自动清理。扩展程序配置会保留。</small></div>
          <button onClick={showExtensions}><Puzzle size={15}/><span>管理扩展程序</span><ChevronRight className="browser-menu-chevron" size={15}/></button>
          <button disabled={!page?.url} onClick={clearBrowsingData}><Eraser size={15}/><span>立即清除浏览数据</span></button>
        </div>}
      </div>
      {menuNotice && <div className="browser-menu-notice" role="status">{menuNotice}</div>}
    </div>
    {findOpen && <form className="browser-find" onSubmit={find}><Search size={14}/><input autoFocus aria-label="在页面中查找" value={findText} onChange={event => setFindText(event.target.value)} placeholder="在页面中查找"/><button type="submit">查找</button><button type="button" title="关闭查找" aria-label="关闭查找" onClick={closeFind}><X size={15}/></button></form>}
    <div className="browser-surface" ref={surface} hidden={!page?.url} />
    {!page?.url && <div className="browser-start-page">
      <h2>工具</h2>
      <div className="browser-start-tools">
        <button onClick={onFiles}><File size={20}/><span>文件</span></button>
        <button onClick={onTerminal}><SquareTerminal size={20}/><span>终端</span></button>
      </div>
      <h2>应用</h2>
      <div className="browser-start-apps">
        {apps.slice(0, 8).map(app => <div className="browser-start-app" key={app.id}>
          <button className="browser-start-app-main" title={`直接打开 ${app.url}`} onClick={() => open(app.url)}>
            <span className="browser-app-icon"><Globe size={22}/></span><b>{app.name}</b><small>{new URL(app.url).hostname.replace(/^www\./, '')}</small>
          </button>
          <button className="browser-start-app-center" title="在应用台打开" aria-label={`在应用台打开 ${app.name}`} onClick={event => { event.stopPropagation(); onOpenApp?.(app.id); }}>
            <AppWindow size={14}/>
          </button>
        </div>)}
        {!apps.length && <p>暂无应用</p>}
      </div>
    </div>}
  </section>;
}
