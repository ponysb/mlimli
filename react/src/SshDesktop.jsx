import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Activity, Database, Settings2, Wrench, ChevronLeft, ChevronRight, Code2, Download, FileText, Folder, FolderOpen, FolderPlus, Grid2X2, HardDrive, Home, List, LoaderCircle, Monitor, RefreshCw, Search, Server, Terminal, Trash2, Upload, X } from 'lucide-react';
import './ssh-desktop.css';
import SshSystemManager from './SshSystemManager.jsx';
import SshAppCenter from './SshAppCenter.jsx';
import SshMonitor from './SshMonitor.jsx';
import SshToolbox from './SshToolbox.jsx';
import SshDesktopSettings from './SshDesktopSettings.jsx';
import SshDesktopIcon from './SshDesktopIcon.jsx';
import SshLaunchpad from './SshLaunchpad.jsx';
import { readDesktopPreferences, preferenceKey } from './ssh-desktop-preferences.mjs';

const apps = { finder: { title: 'Finder', icon: FolderOpen }, monitor: { title: '活动监视器', icon: Activity }, editor: { title: '文本编辑', icon: FileText }, terminal: { title: '终端', icon: Terminal }, system: { title: '服务器管理', icon: Server }, applications: { title: '应用中心', icon: Grid2X2 }, databases: {title:'数据库',icon:Database}, development:{title:'开发工具',icon:Code2}, utilities:{title:'实用工具',icon:Wrench}, settings:{title:'系统设置',icon:Settings2} };
const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const parent = p => p.split('/').slice(0, -1).join('/') || '/';
const join = (p, n) => `${p === '/' ? '' : p}/${n}`;
export default function SshDesktop({ connection, visible, panes, TerminalPane, onMetrics, onStart, onInput, onResize, onStop, onClear, onAddPane, onSaveConnection }) {
  const host = useRef(null), upload = useRef(null), drag = useRef(null), requestId = useRef(0), fileRequest = useRef(0);
  const [windows, setWindows] = useState([{ id: 'finder', x: 42, y: 55, w: 850, h: 530, order: 1 }]);
  const [active, setActive] = useState('finder'), [folder, setFolder] = useState('/'), [pathDraft, setPathDraft] = useState('/'), [entries, setEntries] = useState([]), [selected, setSelected] = useState(null), [history, setHistory] = useState(['/']), [historyIndex, setHistoryIndex] = useState(0);
  const [query, setQuery] = useState(''), [grid, setGrid] = useState(false), [hidden, setHidden] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [metrics, setMetrics] = useState(null), [editor, setEditor] = useState(null), [saved, setSaved] = useState(''), [fileLoading, setFileLoading] = useState(false), [fileError, setFileError] = useState(''), [openingFile, setOpeningFile] = useState(null), [dialog, setDialog] = useState(null), [menu, setMenu] = useState(null), [clock, setClock] = useState(new Date()), [undo, setUndo] = useState(null), [inlineFolder, setInlineFolder] = useState(null);
  const [preferences, setPreferences] = useState(() => readDesktopPreferences(connection.id));
  const [moving, setMoving] = useState(false);
  const [launchpad, setLaunchpad] = useState(false);
  const [launchpadClosing,setLaunchpadClosing]=useState(false);
  const launchpadTimer=useRef(null);
  useEffect(()=>()=>clearTimeout(launchpadTimer.current),[]);
  const closeLaunchpad = React.useCallback(() => {
    const reduced=host.current?.classList.contains('reduce-motion')||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced){setLaunchpad(false);return;}
    setLaunchpadClosing(true);
    clearTimeout(launchpadTimer.current);
    launchpadTimer.current=setTimeout(()=>{setLaunchpad(false);setLaunchpadClosing(false);},180);
  }, []);
  function showLaunchpad(){clearTimeout(launchpadTimer.current);setLaunchpadClosing(false);setLaunchpad(true);} 
  function launchApp(id) { closeLaunchpad(); if(id==='terminal'&&!panes.some(p=>p.id==='desktop-terminal'))onAddPane('desktop-terminal'); open(id); }
  const transitionTimers = useRef(new Map());
  useEffect(() => () => { transitionTimers.current.forEach(clearTimeout); }, []);
  function updatePreferences(value) {
    try { localStorage.setItem(preferenceKey(connection.id), JSON.stringify(value)); setPreferences(value); }
    catch { setError('偏好保存失败，本机存储空间可能不足；请尝试更小的壁纸。'); }
  }
  useEffect(() => { setHidden(preferences.showHidden); }, [preferences.showHidden]);
  function transitionWindow(id, action) {
    if (transitionTimers.current.has(id)) return;
    const node = host.current?.querySelector(`.sd-app-${id}`);
    const target = host.current?.querySelector(`.sd-dock-app.${id}`);
    const a = node?.getBoundingClientRect(), b = target?.getBoundingClientRect();
    if (a && b) { node.style.setProperty('--sd-flight-x', `${b.x+b.width/2-a.x-a.width/2}px`); node.style.setProperty('--sd-flight-y', `${b.y+b.height/2-a.y-a.height/2}px`); }
    setWindows(items => items.map(w => w.id === id ? { ...w, motion: action } : w));
    const reduced = preferences.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => {
      transitionTimers.current.delete(id);
      setWindows(items => action === 'closing' ? items.filter(w => w.id !== id) : items.map(w => w.id === id ? { ...w, minimized: true, motion: null } : w));
      setActive(current => current === id ? '' : current);
    }, reduced ? 0 : 220);
    transitionTimers.current.set(id, timer);
  }
  const iconDrag = useRef(null), suppressIconClick = useRef(false);
  const [draggedIcon, setDraggedIcon] = useState(null);
  const [dockMotion, setDockMotion] = useState(null);
  const dockDrop = useRef(null);
  useLayoutEffect(() => {
    const drop = dockDrop.current;
    if (!drop) return;
    dockDrop.current = null;
    const button = host.current?.querySelector(`[data-dock-id="${drop.id}"]`);
    if (!button || preferences.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = button.getBoundingClientRect();
    button.animate([
      {transform:`translate3d(${drop.left-rect.left}px,${drop.top-rect.top}px,0)`},
      {transform:'translate3d(0,0,0)'}
    ], {duration:240,easing:'cubic-bezier(.2,.8,.25,1)'});
  }, [dockMotion, preferences]);
  const dockIds = Object.keys(apps).filter(id => !['databases','development','utilities'].includes(id));
  const dockOrder = [...new Set([...(Array.isArray(preferences.dockOrder) ? preferences.dockOrder.filter(id => dockIds.includes(id)) : []), ...dockIds])];
  const iconPosition = preferences.serverIconPosition;
  const serverIconStyle = iconPosition && Number.isFinite(iconPosition.x) && Number.isFinite(iconPosition.y) ? {right:'auto',left:`calc(${iconPosition.x*100}% - ${iconPosition.x*100}px)`,top:`calc(40px + ${iconPosition.y*100}% - ${iconPosition.y*200}px)`} : undefined;
  function beginIconDrag(event, kind, id) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect(), bounds = host.current.getBoundingClientRect();
    iconDrag.current = {kind,id,px:event.clientX,py:event.clientY,x:rect.left-bounds.left,y:rect.top-bounds.top,started:false,original:preferences,next:preferences};
    if (kind === 'dock') {
      iconDrag.current.slots = [...host.current.querySelectorAll('[data-dock-id]')].map(button => {
        const r = button.getBoundingClientRect();
        return {id:button.dataset.dockId,left:r.left,top:r.top,width:r.width};
      });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveIcon(event) {
    const d=iconDrag.current; if(!d)return;
    const dx=event.clientX-d.px,dy=event.clientY-d.py;
    if(!d.started && Math.hypot(dx,dy)<5)return;
    d.started=true; suppressIconClick.current=true; setDraggedIcon(d.id);
    if(d.kind==='desktop') {
      const bounds=host.current.getBoundingClientRect();
      d.next={...d.next,serverIconPosition:{x:Math.max(0,Math.min(1,(d.x+dx)/Math.max(1,bounds.width-100))),y:Math.max(0,Math.min(1,(d.y+dy-40)/Math.max(1,bounds.height-200)))}};
    } else {
      const slots=d.slots, originalIndex=slots.findIndex(slot=>slot.id===d.id);
      const center=slots[originalIndex].left+slots[originalIndex].width/2+dx;
      let targetIndex=0, nearest=Infinity;
      slots.forEach((slot,index)=>{const distance=Math.abs(center-slot.left-slot.width/2);if(distance<nearest){nearest=distance;targetIndex=index;}});
      const order=slots.map(slot=>slot.id);
      order.splice(originalIndex,1);order.splice(targetIndex,0,d.id);
      d.next={...d.next,dockOrder:order};
      const offsets=Object.fromEntries(slots.map(slot=>[slot.id,slots[order.indexOf(slot.id)].left-slot.left]));
      // Keep the captured DOM node in place; move it with the pointer while its neighbours make room.
      setDockMotion({id:d.id,dx,dy:Math.max(-90,Math.min(35,dy)),offsets});
      return;
    }
    setPreferences(d.next);
  }
  function finishIconDrag(cancelled=false) {
    const d=iconDrag.current; if(!d)return;
    if(d.started) {
      if(d.kind==='dock') {
        const rect=host.current.querySelector(`[data-dock-id="${d.id}"]`)?.getBoundingClientRect();
        if(rect)dockDrop.current={id:d.id,left:rect.left,top:rect.top};
      }
      if(cancelled)setPreferences(d.original);else updatePreferences(d.next);
    }
    setDockMotion(null);
    iconDrag.current=null;setDraggedIcon(null);
    // The browser dispatches click after pointerup; keep it from launching the dragged item.
    setTimeout(()=>{suppressIconClick.current=false;},0);
  }
  const base = `/api/ssh/connections/${connection.id}/desktop`;
  async function api(endpoint, options) { const response = await fetch(`${base}/${endpoint}`, options); const body = await response.json(); if (!response.ok) throw new Error(body.error || '服务器操作失败'); return body; }
  async function browse(path, record = true) { const id = ++requestId.current; setLoading(true); setError(''); try { const value = await api(`files?path=${encodeURIComponent(path)}`); if (id !== requestId.current) return; setFolder(value.path); setPathDraft(value.path); setEntries(value.entries); setSelected(null); setQuery(''); if (record) { setHistory(items => [...items.slice(0, historyIndex + 1), value.path]); setHistoryIndex(historyIndex + 1); } } catch (e) { if (id === requestId.current) setError(e.message); } finally { if (id === requestId.current) setLoading(false); } }
  useEffect(() => { browse('/', false); const timer = setInterval(() => setClock(new Date()), 1000); return () => { ++requestId.current; clearInterval(timer); }; }, [connection.id]);
  useEffect(() => { if (!visible) return; let cancelled = false, timer; async function sample() { try { const value = await onMetrics(connection.id); if (!cancelled) setMetrics(value); } catch (error) { if(!cancelled)setMetrics({sampledAt:Date.now(),reason:error.message||'监控采样失败'}); } finally { if (!cancelled) timer = setTimeout(sample, 5000); } } sample(); return () => { cancelled = true; clearTimeout(timer); }; }, [visible, connection.id]);
  useEffect(() => {
    if (!visible || !host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width < 1 || height < 1) return;
      setWindows(items => items.map(w => {
        const availableWidth = Math.max(280, width - 16), availableHeight = Math.max(200, height - 115);
        const nextWidth = Math.min(w.w, availableWidth), nextHeight = Math.min(w.h, availableHeight);
        return { ...w, w: nextWidth, h: nextHeight, x: Math.max(8, Math.min(w.x, width - nextWidth - 8)), y: Math.max(35, Math.min(w.y, height - nextHeight - 80)) };
      }));
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);
  function focus(id) { const timer = transitionTimers.current.get(id); if (timer) { clearTimeout(timer); transitionTimers.current.delete(id); } setActive(id); setWindows(items => items.map(item => item.id === id ? { ...item, minimized: false, motion: item.minimized ? 'restoring' : null, order: Math.max(0, ...items.map(w => w.order)) + 1 } : item)); }
  function open(id) { if (windows.some(w => w.id === id)) { focus(id); return; } const size = host.current?.getBoundingClientRect(); setWindows(items => [...items, { id, x: preferences.windowLayout === 'center' ? Math.max(8, ((size?.width || 1000) - 850) / 2) : Math.min(85 + items.length * 24, 150), y: preferences.windowLayout === 'center' ? 55 : Math.min(55 + items.length * 22, Math.max(35, (size?.height || 680) - 400)), w: Math.min(id === 'monitor' ? 630 : 850, (size?.width || 1000) - 60), h: Math.min(530, (size?.height || 680) - 145), order: Date.now() }]); setActive(id); }
  function close(id) { if (id === 'editor') { ++fileRequest.current; setFileLoading(false); } if (id === 'terminal') onStop('desktop-terminal'); if (id === 'editor' && editor && editor.content !== saved) { setDialog({ type: 'discard', value: '', title: '关闭并放弃未保存的修改？' }); return; } transitionWindow(id, 'closing'); }
  function maximize(id) { const size = host.current.getBoundingClientRect(); setWindows(items => items.map(w => w.id === id ? w.restore ? { ...w, ...w.restore, restore: null } : { ...w, restore: { x: w.x, y: w.y, w: w.w, h: w.h }, x: 8, y: 35, w: size.width - 16, h: size.height - 119 } : w)); }
  function pointerDown(e, w, resize = false) { if (!resize && e.target.closest('button')) return; e.preventDefault(); setMoving(true); focus(w.id); drag.current = { id: w.id, px: e.clientX, py: e.clientY, ...w, resize }; e.currentTarget.setPointerCapture(e.pointerId); }
  function move(e) { if (iconDrag.current) { moveIcon(e); return; } if (!drag.current) return; const d = drag.current, size = host.current.getBoundingClientRect(); setWindows(items => items.map(w => w.id !== d.id ? w : d.resize ? { ...w, w: Math.max(420, Math.min(size.width - w.x, d.w + e.clientX - d.px)), h: Math.max(280, Math.min(size.height - 80 - w.y, d.h + e.clientY - d.py)) } : { ...w, x: Math.max(0, Math.min(size.width - 100, d.x + e.clientX - d.px)), y: Math.max(33, Math.min(size.height - 115, d.y + e.clientY - d.py)) })); }
  async function openFile(entry) {
    if (entry.type === 'directory') return browse(entry.path);
    if (editor && editor.content !== saved) { setError('请先保存或关闭当前文本文件'); return; }
    const id = ++fileRequest.current;
    setFileLoading(true); setFileError(''); setOpeningFile(entry); setEditor(null); setSaved(''); open('editor');
    try {
      const file = await api(`file?path=${encodeURIComponent(entry.path)}`);
      if (id !== fileRequest.current) return;
      if (typeof file.content !== 'string') throw new Error('服务器未返回有效文件内容');
      setEditor(file); setSaved(file.content);
    } catch (e) { if (id === fileRequest.current) setFileError(e.message || '无法打开文件'); }
    finally { if (id === fileRequest.current) setFileLoading(false); }
  }
  async function save() { if (!editor || busy) return; setBusy(true); try { await api('file', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editor) }); setSaved(editor.content); setNotice('文件已保存'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function operation(value) { setBusy(true); setError(''); try { const result = await api('operation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }); if (value.action === 'trash') { setUndo(result); setNotice('已移入所在目录的废纸篓'); } else { setNotice('操作完成'); if (value.action === 'restore') setUndo(null); } await browse(folder, false); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); } }
  async function uploadFiles(files) { for (const file of files) { if (file.size > 10 * 1024 * 1024) { setError(`${file.name} 超过 10 MB 上传上限`); break; } const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); if (!await operation({ action: 'upload', path: join(folder, file.name), content })) break; } if (upload.current) upload.current.value = ''; }
  async function download(entry) { try { const response = await fetch(`${base}/download?path=${encodeURIComponent(entry.path)}`); if (!response.ok) throw new Error((await response.json()).error); const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = entry.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError(e.message); } }
  function ask(type) { if (type === 'mkdir') { let name = '未命名文件夹', n = 2; while (entries.some(e => e.name === name)) name = `未命名文件夹 ${n++}`; setInlineFolder({ name }); setMenu(null); return; } setError(''); setMenu(null); setDialog({ type, title: type === 'mkdir' ? '新建文件夹' : type === 'new' ? '新建文本文件' : type === 'rename' ? '重命名' : `将“${selected?.name}”移入废纸篓？`, value: type === 'rename' ? selected.name : type === 'new' ? '未命名.txt' : type === 'mkdir' ? '未命名文件夹' : '' }); }
  async function createInlineFolder(e) {
    e.preventDefault(); const name = inlineFolder.name.trim();
    if (!name || /[/\\\0]/.test(name) || ['.','..'].includes(name)) { setInlineFolder(value => ({ ...value, error: '请输入有效的文件夹名称' })); return; }
    if (await operation({ action: 'mkdir', path: join(folder, name) })) { setInlineFolder(null); setSelected({ name, path: join(folder, name), type: 'directory' }); }
  }
  async function submit(e) { e.preventDefault(); const d = dialog; if (d.type === 'discard') { setEditor(null); setWindows(items => items.filter(w => w.id !== 'editor')); setDialog(null); return; } if (!['trash'].includes(d.type) && (!d.value.trim() || /[/\\\0]/.test(d.value) || ['.', '..'].includes(d.value))) { setDialog(value => ({ ...value, error: '名称不能为空，也不能包含路径分隔符' })); return; } const ok = await operation(d.type === 'new' ? { action: 'upload', path: join(folder, d.value), content: '' } : d.type === 'mkdir' ? { action: 'mkdir', path: join(folder, d.value) } : { action: d.type, path: selected.path, name: d.value }); if (ok) setDialog(null); else setDialog(value => ({ ...value, error: '操作未完成，请查看服务器返回的错误后重试。' })); }
  useEffect(() => { if (!dialog) return; const previous = document.activeElement; const input = host.current?.querySelector('.sd-dialog input'); input?.focus(); if(input){const dot=dialog.value?.lastIndexOf('.');input.setSelectionRange(0,(dialog.type==='new'||dialog.type==='rename')&&dot>0?dot:input.value.length);} const trap = event => { const modal = host.current?.querySelector('.sd-dialog'); if (!modal) return; if (event.key === 'Tab') { const nodes = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled)')]; const first = nodes[0], last = nodes[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }; window.addEventListener('keydown', trap); return () => { window.removeEventListener('keydown', trap); previous?.focus?.(); }; }, [Boolean(dialog)]);
  useEffect(() => { if (!visible) return; const key = e => { if(launchpad)return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm' && active && active !== 'terminal' && !dialog) { e.preventDefault(); transitionWindow(active, 'minimizing'); } if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w' && active && active !== 'terminal' && !dialog) { e.preventDefault(); close(active); } if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Period' && active === 'finder') { e.preventDefault(); updatePreferences({ ...preferences, showHidden: !hidden }); } if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'n' && active === 'finder') { e.preventDefault(); ask('mkdir'); } if (e.key === 'Escape' && !busy) { setInlineFolder(null); setMenu(null); setDialog(null); } if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && active === 'editor') { e.preventDefault(); save(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  const filtered = entries.filter(e => (hidden || !e.name.startsWith('.')) && e.name.toLowerCase().includes(query.toLowerCase()));
  function tool(label, Icon, action, disabled = false) { return <button type="button" title={label} aria-label={label} onClick={action} disabled={disabled}><Icon size={17}/></button>; }
  const home = connection.username === 'root' ? '/root' : `/home/${connection.username}`;
  return <div ref={host} className={`ssh-desktop ${moving ? 'is-moving' : ''} ${preferences.reduceMotion ? 'reduce-motion' : ''} ${preferences.reduceTransparency ? 'reduce-transparency' : ''} ${!preferences.dockMagnification ? 'no-dock-magnification' : ''} wallpaper-${preferences.wallpaper}`} style={{'--sd-dock-size': `${preferences.dockSize}px`}} onPointerMove={move} onPointerUp={() => { finishIconDrag(); drag.current = null; setMoving(false); }} onPointerCancel={() => { finishIconDrag(true); drag.current = null; setMoving(false); }} onClick={() => setMenu(null)}>
    <div className="sd-wallpaper" style={preferences.wallpaper === 'custom' && preferences.customWallpaper ? {backgroundImage:`url("${preferences.customWallpaper}")`,backgroundSize:'cover',backgroundPosition:'center'} : undefined}><i/><i/><i/></div>
    <header className="sd-menubar"><div><span className="sd-brand">✦</span><b>{apps[active]?.title || 'Finder'}</b><button onClick={showLaunchpad}>应用</button><button onClick={() => { open('finder'); ask('new'); }}>新建文件</button><button onClick={() => { open('finder'); browse(home); }}>个人目录</button><button onClick={() => setWindows(items => items.map(w => ({ ...w, minimized: true })))}>显示桌面</button></div><div><span className="sd-online"/><span>{connection.name}</span><span>{clock.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</span><span>{clock.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div></header>
    <button className={`sd-server-icon ${draggedIcon === 'server' ? 'is-dragging' : ''}`} style={serverIconStyle} onPointerDown={e=>beginIconDrag(e,'desktop','server')} onDragStart={e=>e.preventDefault()} onClick={() => { if(suppressIconClick.current)return; if (preferences.openOn === 'single') { open('finder'); browse('/'); } }} onDoubleClick={() => { if(suppressIconClick.current)return; open('finder'); browse('/'); }}><span><HardDrive size={38}/></span><b>{connection.name}</b><small>Linux 服务器</small></button>
    {windows.map(w => { const Icon = apps[w.id].icon; return <section key={w.id} hidden={w.minimized} className={`sd-window ${active === w.id ? 'focused' : ''} sd-app-${w.id} ${w.motion || ''}`} style={{ left: w.x, top: w.y, width: w.w, height: w.h, maxWidth: 'calc(100% - 16px)', maxHeight: 'calc(100% - 115px)', zIndex: w.order > 100 ? 20 + windows.filter(i => i.order < w.order).length : 10 + w.order }} onPointerDown={() => focus(w.id)}>
      <div className="sd-window-surface">
      <header className="sd-titlebar" onPointerDown={e => pointerDown(e, w)} onDoubleClick={event => { if (!event.target.closest('button')) maximize(w.id); }}><div className="sd-traffic"><button aria-label={`关闭${apps[w.id].title}`} onClick={() => close(w.id)}><X size={9}/></button><button aria-label={`最小化${apps[w.id].title}`} onClick={() => transitionWindow(w.id, 'minimizing')}>−</button><button aria-label={`缩放${apps[w.id].title}`} onClick={() => maximize(w.id)}>↗</button></div><strong><Icon size={14}/><span>{w.id === 'finder' ? folder.split('/').pop() || connection.name : w.id === 'editor' && editor ? `${editor.path.split('/').pop()}${editor.content !== saved ? ' · 已修改' : ''}` : apps[w.id].title}</span></strong><span/>
      </header>
      {w.id === 'finder' && <div className="sd-finder"><aside><label>个人收藏</label>{[[Home, '个人目录', home], [HardDrive, '服务器', '/'], [Folder, '临时文件', '/tmp'], [FileText, '系统日志', '/var/log'], [Folder, '配置文件', '/etc']].map(([I, name, path]) => <button className={folder === path ? 'selected' : ''} key={path} onClick={() => browse(path)}><I size={16}/>{name}</button>)}<label>位置</label><button onClick={() => browse(connection.workspaceRoot || home)}><Server size={16}/>{connection.name}</button><button onClick={() => browse(join(folder, '.mli-trash'))}><Trash2 size={16}/>当前目录废纸篓</button><div className="sd-sidebar-bottom"><span className="sd-online"/> SSH 已连接<small>{connection.username}@{connection.host}</small></div></aside><div className="sd-files" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); uploadFiles(e.dataTransfer.files); }}>
        <div className="sd-toolbar"><div>{tool('后退', ChevronLeft, () => { setHistoryIndex(historyIndex - 1); browse(history[historyIndex - 1], false); }, historyIndex === 0)}{tool('前进', ChevronRight, () => { setHistoryIndex(historyIndex + 1); browse(history[historyIndex + 1], false); }, historyIndex >= history.length - 1)}{tool('上级目录', FolderOpen, () => browse(parent(folder)))}</div><div>{tool('新建文件夹', FolderPlus, () => ask('mkdir'), busy)}{tool('上传文件', Upload, () => upload.current.click(), busy)}{tool('刷新', RefreshCw, () => browse(folder, false), busy)}{tool(grid ? '列表视图' : '图标视图', grid ? List : Grid2X2, () => setGrid(!grid))}</div><label className="sd-search"><Search size={14}/><input aria-label="搜索当前目录" placeholder="搜索" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
        <form className="sd-path" onSubmit={e => { e.preventDefault(); browse(pathDraft); }}><HardDrive size={13}/><input aria-label="远程路径" value={pathDraft} onChange={e => setPathDraft(e.target.value)}/><button>前往</button></form>
        <div className={`sd-file-list ${grid ? 'grid' : ''}`} tabIndex={0} aria-label="文件列表" onKeyDown={e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'Enter' && selected) openFile(selected); if (e.key === 'F2' && selected) ask('rename'); }}>
          {!grid && <div className="sd-columns"><span>名称</span><span>修改日期</span><span>大小</span><span>权限</span></div>}
          {inlineFolder && <form className="sd-inline-folder" onSubmit={createInlineFolder}><Folder className="sd-folder" size={grid ? 48 : 20}/><input autoFocus onFocus={e => e.target.select()} aria-label="新文件夹名称" value={inlineFolder.name} onChange={e => setInlineFolder({ name: e.target.value })} disabled={busy}/><button type="submit" disabled={busy}>{busy ? '创建中…' : '创建'}</button><button type="button" onClick={() => setInlineFolder(null)} disabled={busy}>取消</button>{inlineFolder.error && <small>{inlineFolder.error}</small>}</form>}{loading ? <div className="sd-empty"><LoaderCircle className="spin"/>正在读取目录…</div> : filtered.length ? filtered.map(entry => <button key={entry.path} className={`sd-file ${selected?.path === entry.path ? 'selected' : ''}`} onClick={() => setSelected(entry)} onDoubleClick={() => openFile(entry)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSelected(entry); const r = host.current.getBoundingClientRect(); setMenu({ x: Math.min(e.clientX - r.left, r.width - 190), y: Math.min(e.clientY - r.top, r.height - 235) }); }}><span className="sd-file-name">{entry.type === 'directory' ? <Folder className="sd-folder"/> : <FileText className="sd-document"/>}<b>{entry.name}</b></span><span>{new Date(entry.modified).toLocaleDateString()}</span><span>{entry.type === 'directory' ? '—' : bytes(entry.size)}</span><span>{entry.mode.toString(8)}</span></button>) : <div className="sd-empty"><FolderOpen size={40}/>{query ? '没有找到匹配的文件' : '此文件夹为空'}</div>}
        </div><div className="sd-selection-tools">{tool('打开', FolderOpen, () => openFile(selected), !selected || busy)}{tool('下载', Download, () => download(selected), !selected || selected.type === 'directory' || busy)}<button disabled={!selected || busy} onClick={() => ask('rename')}>重命名</button>{tool('移入废纸篓', Trash2, () => ask('trash'), !selected || busy)}<label><input type="checkbox" checked={hidden} onChange={e => updatePreferences({ ...preferences, showHidden: e.target.checked })}/>显示隐藏文件</label></div><footer>{filtered.length} 个项目{selected && `，已选择“${selected.name}”`}<span>{folder.endsWith('/.mli-trash') ? '右键项目可恢复到原目录' : '拖入文件即可上传 · 单文件 10 MB'}</span></footer><input ref={upload} type="file" multiple hidden onChange={e => uploadFiles(e.target.files)}/>
      </div></div>}
      {w.id === 'terminal' && <TerminalPane pane={panes.find(p => p.id === 'desktop-terminal') || { id: 'desktop-terminal' }} workspace={null} index={0} canClose={false} connectionName={connection.name} backendKey={`desktop:${connection.id}`} sshConnectionId={connection.id} onStart={onStart} onInput={onInput} onResize={onResize} onStop={() => onStop('desktop-terminal')} onClear={() => onClear('desktop-terminal')}/>}
      {w.id === 'editor' && <div className="sd-editor"><div className="sd-editor-toolbar"><span title={editor?.path || openingFile?.path}>{editor?.path || openingFile?.path || '从 Finder 中双击文件以打开'}</span><button disabled={!editor || busy || fileLoading || saved === editor.content} onClick={save}>{busy ? '保存中…' : '保存'} <kbd>⌘ S</kbd></button></div>
        {fileLoading ? <div className="sd-preview-state" role="status"><LoaderCircle className="spin" size={26}/><b>正在读取文件…</b><span>{openingFile?.name}</span></div> : fileError ? <div className="sd-preview-state" role="alert"><FileText size={38}/><b>无法预览此文件</b><span>{fileError}</span><div><button onClick={() => openFile(openingFile)}>重新读取</button><button onClick={() => download(openingFile)}>下载到本地</button></div></div> : editor ? <><textarea aria-label="远程文件内容" spellCheck={false} value={editor.content} onChange={e => setEditor(value => ({ ...value, content: e.target.value }))}/>{editor.content === '' && <span className="sd-empty-file">这是一个空文件，可以直接输入内容</span>}</> : <div className="sd-preview-state"><FileText size={38}/><b>选择文件以打开</b><span>在 Finder 中双击文本或日志文件</span></div>}
        <footer><span>{fileLoading ? '读取中' : fileError ? '预览不可用' : editor ? 'UTF-8' : '未打开文件'}</span><span>{editor ? `${bytes(new TextEncoder().encode(editor.content).length)} · ${editor.content.split('\n').length} 行${editor.content !== saved ? ' · 未保存' : ''}` : ''}</span></footer></div>}
      {w.id === 'applications' && <SshAppCenter connection={connection} onOpen={id => { if (id === 'terminal' && !panes.some(p => p.id === 'desktop-terminal')) onAddPane('desktop-terminal'); open(id); }}/>}
      {['databases','development','utilities'].includes(w.id) && <SshToolbox connection={connection} tool={w.id} onOpen={id=>{if(id==='terminal'&&!panes.some(p=>p.id==='desktop-terminal'))onAddPane('desktop-terminal');open(id);}}/>}
      {w.id === 'settings' && <SshDesktopSettings connection={connection} metrics={metrics} preferences={preferences} onChange={updatePreferences} onSaveConnection={onSaveConnection} onOpen={open}/>}
      {w.id === 'system' && <SshSystemManager connection={connection} visible={visible && !w.minimized}/>}
      {w.id === 'monitor' && <SshMonitor connection={connection} metrics={metrics}/>}
      <div className="sd-resize" onPointerDown={e => pointerDown(e, w, true)}/>
      </div>
    </section>; })}
    <nav className={`sd-dock sd-app-strip ${dockMotion ? 'is-sorting' : ''}`} aria-label="桌面应用"><button className="sd-dock-app launchpad" aria-label="打开启动台" data-title="启动台" aria-expanded={launchpad} onClick={()=>launchpad&&!launchpadClosing?closeLaunchpad():showLaunchpad()}><span><SshDesktopIcon app="launchpad"/></span><i/></button><div className="sd-dock-divider"/>{dockOrder.map(id => { const app=apps[id]; const Icon = app.icon; return <button key={id} className={`sd-dock-app ${id} ${draggedIcon === id ? 'is-dragging' : ''}`} data-dock-id={id} style={dockMotion ? {transform:`translate3d(${dockMotion.id===id ? dockMotion.dx : dockMotion.offsets[id] || 0}px,${dockMotion.id===id ? dockMotion.dy : 0}px,0)`} : undefined} onPointerDown={e=>beginIconDrag(e,'dock',id)} onDragStart={e=>e.preventDefault()} aria-label={app.title} data-title={app.title} aria-pressed={active === id && windows.some(w => w.id === id && !w.minimized)} onClick={() => { if(suppressIconClick.current)return; if (id === 'terminal' && !panes.some(p => p.id === 'desktop-terminal')) onAddPane('desktop-terminal'); open(id); }}><span><SshDesktopIcon app={id}/></span><i className={windows.some(w => w.id === id) ? 'running' : ''}/></button>; })}<div className="sd-dock-divider"/><button className="sd-dock-app trash" aria-label="打开废纸篓" data-title="废纸篓" onClick={() => { open('finder'); browse(join(folder, '.mli-trash')); }}><span><SshDesktopIcon app="trash"/></span><i/></button></nav>
    {(error || notice) && <div className={`sd-toast ${error ? 'error' : ''}`} role="status"><span>{error || notice}</span>{!error && undo && <button disabled={busy} onClick={() => operation({ action: 'restore', path: undo.path, destination: undo.originalPath })}>撤销</button>}<button aria-label="关闭提示" onClick={() => { setError(''); setNotice(''); }}><X size={15}/></button></div>}
    {launchpad && <SshLaunchpad closing={launchpadClosing} connection={connection} apps={apps} onOpen={launchApp} onClose={closeLaunchpad}/>}
    {menu && <div className="sd-context" style={{ left: menu.x, top: menu.y }} onClick={e => e.stopPropagation()}><button onClick={() => { openFile(selected); setMenu(null); }}>打开</button>{selected?.type === 'file' && <button onClick={() => { download(selected); setMenu(null); }}>下载到本地</button>}<button onClick={() => ask('rename')}>重命名…</button>{parent(selected?.path || '') .endsWith('/.mli-trash') && /^[a-f0-9-]{36}-/.test(selected?.name || '') && <button onClick={() => { operation({ action: 'restore', path: selected.path, destination: join(parent(parent(selected.path)), selected.name.slice(37)) }); setMenu(null); }}>恢复到原目录</button>}<hr/><button onClick={() => ask('mkdir')}>新建文件夹…</button><button onClick={() => ask('new')}>新建文本文件…</button><hr/><button onClick={() => ask('trash')}>移入废纸篓</button></div>}
    {dialog && <div className="sd-dialog-backdrop"><form className={`sd-dialog sd-file-dialog ${dialog.type==='trash'||dialog.type==='discard'?'is-destructive':''}`} role="dialog" aria-modal="true" aria-labelledby="sd-dialog-title" onSubmit={submit}><div className="sd-file-dialog-heading"><SshDesktopIcon app={dialog.type==='trash'?'trash':dialog.type==='new'?'editor':'finder'}/><div><h3 id="sd-dialog-title">{dialog.title}</h3>{!['trash','discard'].includes(dialog.type)&&<p title={folder}>保存到 <span>{folder==='/'?'服务器根目录':folder}</span></p>}</div></div>{dialog.type === 'trash' ? <p>项目会移到所在目录的 .mli-trash 文件夹，可通过撤销恢复。</p> : dialog.type !== 'discard' && <><label htmlFor="sd-item-name">名称</label><input id="sd-item-name" autoComplete="off" spellCheck={false} autoFocus aria-label="名称" value={dialog.value} onChange={e => setDialog({ ...dialog, value: e.target.value, error: '' })}/></>}<p className="sd-dialog-error" role="alert">{dialog.error}</p><div><button disabled={busy} type="button" onClick={() => setDialog(null)}>取消</button><button disabled={busy || (!['trash', 'discard'].includes(dialog.type) && !dialog.value.trim())} type="submit">{busy ? '处理中…' : dialog.type === 'new' || dialog.type === 'mkdir' ? '创建' : dialog.type === 'rename' ? '重命名' : dialog.type === 'trash' ? '移入废纸篓' : '放弃修改'}</button></div></form></div>}
  </div>;
}
