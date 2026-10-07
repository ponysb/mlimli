import React, { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpCircle, ChevronRight, Download, LoaderCircle, RefreshCw, RotateCw } from 'lucide-react';
import './desktop-updates.css';

let updateState = null;
let unsubscribeDesktop;
const listeners = new Set();
function publish(value) { updateState = value; listeners.forEach(listener => listener()); }
function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1 && window.desktop?.getUpdateStatus) {
    let active = true, revision = 0;
    const unsubscribe = window.desktop.onUpdateChanged(value => { revision++; if (active) publish(value); });
    window.desktop.getUpdateStatus().then(value => { if (active && revision === 0) publish(value); }).catch(() => {});
    unsubscribeDesktop = () => { active = false; unsubscribe(); };
  }
  return () => { listeners.delete(listener); if (!listeners.size) { unsubscribeDesktop?.(); unsubscribeDesktop = null; } };
}
function useDesktopUpdate() {
  const state = useSyncExternalStore(subscribe, () => updateState, () => null);
  async function action(method) {
    try { publish(await window.desktop[method]()); }
    catch (error) { publish({ ...updateState, message: error.message }); }
  }
  return [state, action];
}
function UpdateActions({ state, action }) {
  if (state.status === 'available' && state.canInstall !== false) return <button className="primary-action" onClick={() => action('downloadUpdate')}><Download size={14}/>下载更新</button>;
  if (state.status === 'downloaded' && state.canInstall !== false) return <button className="primary-action" onClick={() => action('installUpdate')}><RefreshCw size={14}/>重启更新</button>;
  return <button disabled={['unsupported', 'checking', 'downloading', 'installing'].includes(state.status)} onClick={() => action('checkForUpdates')}><RefreshCw size={14}/>{state.status === 'checking' ? '正在检查…' : '检查更新'}</button>;
}
function statusText(state) {
  if (state.status === 'installing') return '正在退出应用并安装更新…';
  if (state.status === 'downloading') return `正在下载 v${state.version} · ${Math.round(state.percent)}%`;
  if (state.status === 'downloaded') return `v${state.version} 已下载，重启后完成更新`;
  if (state.status === 'available') return `发现新版本 v${state.version}`;
  if (state.status === 'checking') return '正在检查更新…';
  return state.message || '启动时自动检查，也可手动检查更新。';
}
export function DesktopUpdateSidebar() {
  const [state, action] = useDesktopUpdate();
  const [open, setOpen] = useState(false), [placement, setPlacement] = useState(null);
  const anchor = useRef(null), popup = useRef(null), closeTimer = useRef(null);
  const tooltipId = useId();
  const visible = Boolean(state?.version && ['available', 'checking', 'downloading', 'downloaded', 'installing', 'error'].includes(state.status));
  function showNotes() { clearTimeout(closeTimer.current); setOpen(true); }
  function hideNotes() { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 180); }
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => { if (!visible) setOpen(false); }, [visible]);
  useLayoutEffect(() => {
    if (!open || !visible) return;
    const position = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
      const rect = anchor.current.getBoundingClientRect();
      const panelWidth = Math.min(340, width - 24);
      const panelHeight = popup.current.getBoundingClientRect().height;
      const fitsRight = rect.right + 12 + panelWidth <= x + width - 12;
      const left = fitsRight ? rect.right + 12 : Math.max(x + 12, Math.min(rect.left, x + width - panelWidth - 12));
      const top = Math.max(y + 12, Math.min(fitsRight ? rect.bottom - panelHeight : rect.top - panelHeight - 10, y + height - panelHeight - 12));
      setPlacement({ left, top, width: panelWidth, maxHeight: height - 24 });
    };
    const outside = event => { if (!anchor.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { clearTimeout(closeTimer.current); setOpen(false); } };
    position();
    const observer = new ResizeObserver(position); observer.observe(popup.current); observer.observe(anchor.current);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    viewportListeners('addEventListener', position);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      viewportListeners('removeEventListener', position);
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
    };
  }, [open, visible]);
  if (!visible) return null;
  const busy = ['checking', 'downloading', 'installing'].includes(state.status);
  const label = state.status === 'error' ? '更新失败' : state.status === 'downloading' ? '正在下载' : state.status === 'installing' ? '正在安装' : state.status === 'downloaded' ? '更新已就绪' : '发现新版';
  const command = state.status === 'error' ? { label: '重试更新', method: 'checkForUpdates', Icon: RotateCw } : state.canInstall !== false && state.status === 'available' ? { label: '下载更新', method: 'downloadUpdate', Icon: Download } : state.canInstall !== false && state.status === 'downloaded' ? { label: '重启更新', method: 'installUpdate', Icon: RefreshCw } : null;
  return <div ref={anchor} className="desktop-update-sidebar" data-status={state.status} aria-label="应用更新" onPointerEnter={showNotes} onPointerLeave={hideNotes} onFocus={showNotes} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !popup.current?.contains(event.relatedTarget)) hideNotes(); }}>
    <div className="desktop-update-sidebar-row">
      <button className="desktop-update-summary" type="button" aria-label={`查看 v${state.version} 更新日志`} aria-describedby={open ? tooltipId : undefined} aria-expanded={open} onClick={showNotes}>
        <span className="desktop-update-symbol">{busy ? <LoaderCircle size={17} className="spin"/> : <ArrowUpCircle size={18}/>}</span>
        <span className="desktop-update-label" aria-live="polite"><b>{label}</b><span>v{state.version}</span></span>
        {!command && <ChevronRight size={14} className="desktop-update-chevron"/>}
      </button>
      {command && <button className="desktop-update-command" type="button" aria-label={command.label} title={command.label} onClick={() => action(command.method)}><command.Icon size={16}/></button>}
    </div>
    {state.status === 'downloading' && <progress aria-label="更新下载进度" max="100" value={state.percent}/>}
    {open && createPortal(<div ref={popup} id={tooltipId} className="desktop-update-log" role="tooltip" tabIndex={0} style={placement || { visibility: 'hidden', width: 'min(340px, calc(100vw - 24px))' }} onPointerEnter={showNotes} onPointerLeave={hideNotes} onFocus={showNotes} onBlur={event => { if (!anchor.current?.contains(event.relatedTarget)) hideNotes(); }}>
      <header><span className="desktop-update-log-icon"><ArrowUpCircle size={18}/></span><div><strong>更新日志</strong><span>v{state.currentVersion} <ChevronRight size={11}/> v{state.version}</span></div><span className="desktop-update-log-status">{state.status === 'downloaded' ? '已下载' : '新版本'}</span></header>
      <div className="desktop-update-log-body">{state.releaseNotes?.trim() || '此版本暂无更新说明。'}</div>
      {state.status === 'downloading' && <footer>正在下载 · {Math.round(state.percent)}%</footer>}
      {state.canInstall === false && <footer>开发模式 · 自动安装不可用</footer>}
      {state.message && <footer className="desktop-update-log-error" role="alert">{state.message}</footer>}
    </div>, document.body)}
  </div>;
}

function viewportListeners(method, listener) {
  window.visualViewport?.[method]('resize', listener);
  window.visualViewport?.[method]('scroll', listener);
}
export function DesktopUpdateSettings() {
  const [state, action] = useDesktopUpdate();
  if (!state) return <div className="page-content"><section className="section-block"><h2>应用更新</h2><p>{window.desktop?.isElectron ? '正在读取更新状态…' : '请在 Windows 桌面安装版中检查应用更新。'}</p></section></div>;
  return <div className="page-content"><section className="section-block desktop-update-settings"><div className="section-head"><div><h2>应用更新</h2><p>当前版本 v{state.currentVersion}</p></div><UpdateActions state={state} action={action}/></div>{state.mode === 'development' && <p>当前为开发模式，可检查新版；自动安装需使用 Windows 安装版。</p>}<p aria-live="polite">{statusText(state)}</p>{state.status === 'downloading' && <progress aria-label="更新下载进度" max="100" value={state.percent}/>} {state.message && ['available', 'downloading', 'downloaded', 'installing'].includes(state.status) && <p role="alert">{state.message}</p>}{state.releaseNotes && <div className="desktop-update-notes"><h3>更新说明</h3><p>{state.releaseNotes}</p></div>}</section></div>;
}
