import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Code2, FileText, Folder, HardDrive, Monitor, Terminal as TerminalIcon, Wifi } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CircleStop, Copy, FolderOpen, FolderPlus, GitBranch, Menu, PanelRightOpen, Plus, RefreshCw, Server, Shield, SquareTerminal, Trash2, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import './ssh-connections.css';
import {COMMAND_STORAGE,sensitiveCommand} from '../../shared/terminal-assistant.mjs';
import TerminalTools from './TerminalTools.jsx';
import TerminalCommandBar from './TerminalCommandBar.jsx';
import SshDesktop from './SshDesktop.jsx';

const layoutFallback = {
  workspace: { display: 'flex', flex: '1 1 0', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  topbar: { display: 'flex', flex: '0 0 40px', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 },
  title: { display: 'flex', alignItems: 'center', minWidth: 0 },
  actions: { display: 'flex', alignItems: 'center', flex: '0 0 auto' },
  panes: { display: 'grid', flex: '1 1 0', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  pane: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  paneHead: { display: 'flex', flex: '0 0 32px', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 },
  paneTitle: { display: 'flex', alignItems: 'center', minWidth: 0 },
  screen: { flex: '1 1 0', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  status: { display: 'flex', flex: '0 0 24px', alignItems: 'center', minWidth: 0 },
};

function TerminalAction({ title, children, onMouseLeave, onClick, ...props }) {
  const id = useId();
  const button = useRef(null), tooltip = useRef(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = button.current.getBoundingClientRect();
    const box = tooltip.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - 8));
    const top = anchor.bottom + box.height + 14 <= window.innerHeight ? anchor.bottom + 6 : Math.max(8, anchor.top - box.height - 6);
    setPosition({ left, top });
  }, [open, title]);
  useEffect(() => {
    if (!open) return;
    const hide = () => setOpen(false);
    const escape = event => { if (event.key === 'Escape') hide(); };
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('resize', hide); window.removeEventListener('scroll', hide, true); window.removeEventListener('keydown', escape); };
  }, [open]);
  return <><button {...props} ref={button} type="button" aria-label={props['aria-label'] || title} aria-describedby={open ? id : undefined}
    onMouseEnter={() => { setPosition(null); setOpen(true); }} onMouseLeave={event => { setOpen(false); onMouseLeave?.(event); }}
    onFocus={() => { setPosition(null); setOpen(true); }} onBlur={() => setOpen(false)} onClick={event => { setOpen(false); onClick?.(event); }}>{children}</button>
    {open && createPortal(<span ref={tooltip} id={id} role="tooltip" className="terminal-action-tooltip" style={position || { left: 0, top: 0, visibility: 'hidden' }}>{title}</span>, document.body)}</>;
}

export function TerminalPane({ pane, workspace, index, canClose, connectionName, backendKey, sshConnectionId: explicitSshId = '', onStart, onInput, onResize, onStop, onClear, onClose }) {
  const host = useRef(null), controller = useRef(null), latest = useRef({}), terminalId = useRef(null), pendingInput = useRef([]);
  const [copyStatus, setCopyStatus] = useState('复制终端内容');
  const [commandBar,setCommandBar]=useState(false),[toolsOpen,setToolsOpen]=useState(false),[commandDraft,setCommandDraft]=useState('');
  const [agentQuestion,setAgentQuestion]=useState('');
  const terminal = pane.terminal;
  const busy = pane.launching || terminal?.status === 'starting' || (terminal?.interactive && terminal?.status === 'running');
  const failed = terminal?.status === 'exited' && terminal.code !== 0;
  const cwd = terminal?.cwd || (connectionName ? `SSH · ${connectionName}` : workspace?.path) || '';
  const windowsShell = /^[a-z]:[\\/]|^\\\\/i.test(cwd);
  latest.current = { onInput, onResize, onStart, paneId: pane.id, sshConnectionId: explicitSshId };
  const targetKey=explicitSshId||backendKey||workspace?.id||'local';
  useEffect(()=>{terminalId.current=null;setToolsOpen(false);setCommandDraft('');setAgentQuestion('');},[targetKey]);

  useEffect(() => {
    const screen = new Terminal({ fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace', fontSize: 13, lineHeight: 1.35, cursorStyle: 'bar', cursorWidth: 2, cursorBlink: true, scrollback: 10000, convertEol: true, theme: { background: '#111514', foreground: '#d8dfdc', cursor: '#8fc6aa', selectionBackground: '#6e9f883d', black:'#242a28',red:'#ff6b68',green:'#54ce88',yellow:'#f0c46a',blue:'#69a7ff',magenta:'#d38df0',cyan:'#52d6cf',white:'#d8dfdc',brightBlack:'#78827d',brightRed:'#ff8581',brightGreen:'#80e5a9',brightYellow:'#ffdb83',brightBlue:'#8dbbff',brightMagenta:'#e3a5f5',brightCyan:'#81e8df',brightWhite:'#ffffff' } });
    const fit = new FitAddon(); screen.loadAddon(fit); screen.open(host.current);
    const state = { screen, processed: 0, disposed: false }; controller.current = state;
    screen.attachCustomKeyEventHandler(event => { if (event.ctrlKey && event.key.toLowerCase() === 'c' && screen.hasSelection()) { if (event.type === 'keydown') navigator.clipboard.writeText(screen.getSelection()).catch(() => {}); return false; } return true; });
    screen.onData(data => { const id = terminalId.current; if (id) latest.current.onInput?.(id, data); else pendingInput.current.push(data); });
    const resize = () => { if (!host.current?.clientWidth || !host.current?.clientHeight) return; fit.fit(); latest.current.onResize?.(terminalId.current, { cols: screen.cols, rows: screen.rows }); };
    const start = async () => { fit.fit(); const id = await latest.current.onStart?.(pane.id, { cols: screen.cols, rows: screen.rows, sshConnectionId: explicitSshId || latest.current.sshConnectionId }); if (!id || state.disposed) return; terminalId.current = id; for (const data of pendingInput.current.splice(0)) latest.current.onInput?.(id, data); latest.current.onResize?.(id, { cols: screen.cols, rows: screen.rows }); };
    const observer = new ResizeObserver(resize); observer.observe(host.current); start(); screen.focus();
    return () => { state.disposed = true; observer.disconnect(); controller.current = null; terminalId.current=null; pendingInput.current=[]; screen.dispose(); };
  }, [workspace?.id, pane.id, backendKey, explicitSshId]);

  useEffect(() => { const state = controller.current; if (!state) return; const lines = terminal?.lines || []; if (lines.length < state.processed) { state.screen.clear(); state.processed = 0; } for (const line of lines.slice(state.processed)) state.screen.write(line.text || ''); state.processed = lines.length; }, [terminal]);
  async function copyOutput() { const screen = controller.current?.screen; if (!screen) return; const buffer = screen.buffer.active; const text = screen.getSelection() || Array.from({ length: buffer.length }, (_, line) => buffer.getLine(line)?.translateToString(true) || '').join('\n').trimEnd(); try { await navigator.clipboard.writeText(text); setCopyStatus('已复制'); } catch { setCopyStatus('无法访问剪贴板'); } }
  function clearOutput() { controller.current?.screen.clear(); onClear(); controller.current?.screen.focus(); }
  return <section className="terminal-pane" style={layoutFallback.pane} aria-label={`终端 ${index + 1}`}>
    <header className="terminal-pane-head" style={layoutFallback.paneHead}><span style={layoutFallback.paneTitle}><SquareTerminal size={14}/><b>{connectionName || (windowsShell ? 'cmd' : 'sh')}</b>{index > 0 && <small>{index + 1}</small>}</span><div className="terminal-pane-actions" style={layoutFallback.actions}><TerminalAction title="常用命令、收藏与 AI 助手" aria-label="打开命令助手" aria-pressed={toolsOpen} onClick={()=>setToolsOpen(v=>!v)}><PanelRightOpen size={14}/></TerminalAction><TerminalAction title="彩色命令栏：命令、参数、字符串着色；原生 Shell 高亮取决于服务器配置" aria-label="切换彩色命令栏" aria-pressed={commandBar} onClick={()=>setCommandBar(value=>!value)}><Code2 size={14}/></TerminalAction>{busy && <TerminalAction title="停止终端" aria-label="停止终端" onClick={onStop}><CircleStop size={14}/></TerminalAction>}<TerminalAction title={copyStatus} aria-label="复制终端内容" onClick={copyOutput} onMouseLeave={() => setCopyStatus('复制终端内容')}><Copy size={13}/></TerminalAction><TerminalAction title="清空终端" aria-label="清空终端" onClick={clearOutput}><Trash2 size={13}/></TerminalAction>{canClose && <TerminalAction title="终止并关闭此终端" aria-label="终止并关闭此终端" onClick={onClose}><X size={15}/></TerminalAction>}</div></header>
    <div className="terminal-body"><div ref={host} className="terminal-screen" style={layoutFallback.screen} aria-label={`项目终端 ${index + 1}`}/>{toolsOpen&&<TerminalTools defaultPlatform={windowsShell?'cmd':(explicitSshId||backendKey)?'linux':navigator.platform.toLowerCase().includes('mac')?'mac':'linux'} key={targetKey} target={targetKey} targetName={`${connectionName||'本机'} · 面板 ${index+1}`} getTerminalId={()=>terminalId.current} agentQuestion={agentQuestion} getSelection={()=>controller.current?.screen.getSelection()||''} onFill={command=>{setCommandDraft(command);setCommandBar(true);}} onExecute={async command=>{const id=terminalId.current;if(!id)throw Error('终端尚未连接，未发送命令');await latest.current.onInput?.(id,`${command}\r`);return true;}}/>}</div>{commandBar&&<TerminalCommandBar target={targetKey} platform={windowsShell?'cmd':(explicitSshId||backendKey)?'linux':navigator.platform.toLowerCase().includes('mac')?'mac':'linux'} onAskAgent={text=>{setAgentQuestion(text);setToolsOpen(true);}} value={commandDraft} onChange={setCommandDraft} onSend={async command=>{const id=terminalId.current;if(!id)return false;await latest.current.onInput?.(id,`${command}\r`);if(!sensitiveCommand(command)){try{const data=JSON.parse(localStorage.getItem(COMMAND_STORAGE)||'{}');localStorage.setItem(COMMAND_STORAGE,JSON.stringify({...data,history:[{command,scope:targetKey,name:command.slice(0,70),time:Date.now()},...(data.history||[]).filter(x=>x.command!==command||x.scope!==targetKey)].slice(0,50)}));}catch{}}return true;}}/>}<footer className="terminal-bottom-bar" style={layoutFallback.status}><span className={`terminal-status ${busy ? 'running' : failed ? 'failed' : ''}`}>{busy ? '交互中' : failed ? `退出码 ${terminal.code ?? '未知'}` : terminal?.status === 'stopped' ? '已停止' : '就绪'}</span><span className="terminal-directory" title={cwd}>{cwd}</span></footer>
  </section>;
}

function formatBytes(value) { const bytes = Number(value) || 0; return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

export function SshConnectionDialog({ connections, activeIds, initialConnectionId, workspaces = [], activeWorkspace, onClose, onReload, onSave, onProbe, onTrustAndConnect, onDisconnect, onDelete, onSetWorkspace, onAddWorkspace, onSelectWorkspace, onMetrics, onGitInfo, onGitRemote, onError }) {
  const empty = { name: '', host: '', port: '22', username: '', authMode: 'password', privateKeyPath: '', agentSocket: '', passphrase: '', password: '' };
  const [draft, setDraft] = useState(empty), [fingerprints, setFingerprints] = useState({}), [busy, setBusy] = useState(''), [roots, setRoots] = useState({}), [metrics, setMetrics] = useState({}), [git, setGit] = useState({}), [gitDrafts, setGitDrafts] = useState({}), [gitOpen, setGitOpen] = useState('');
  const [authDraft, setAuthDraft] = useState(null);
  const [secureStorage, setSecureStorage] = useState(false), [rememberPassword, setRememberPassword] = useState(undefined);
  const pendingCredential = useRef(null);
  useEffect(() => { window.desktop?.sshCredentialStatus?.().then(value => setSecureStorage(value.available)).catch(() => {}); }, []);
  const [selectedId, setSelectedId] = useState(initialConnectionId || connections[0]?.id || '');
  const connection = connections.find(item => item.id === selectedId);
  useEffect(() => { setAuthDraft(null); setRememberPassword(undefined); const pending = pendingCredential.current; pendingCredential.current = null; setDraft(value => ({ ...value, password: pending?.id === selectedId ? pending.password : '', passphrase: pending?.id === selectedId ? pending.passphrase : '' })); }, [selectedId]);
  useEffect(() => { if (selectedId && !connections.some(item => item.id === selectedId)) setSelectedId(connections[0]?.id || ''); }, [connections, selectedId]);
  useEffect(() => { const close = event => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  useEffect(() => {
    const ids = connections.filter(item => item.id === selectedId && activeIds.includes(item.id)).map(item => item.id);
    if (!ids.length) return undefined;
    let cancelled = false;
    let timer;
    const refresh = async () => { await Promise.all(ids.map(async id => {
      try { const value = await onMetrics(id); if (!cancelled) setMetrics(current => ({ ...current, [id]: value })); }
      catch (error) { if (!cancelled) setMetrics(current => ({ ...current, [id]: { supported: false, sampledAt: Date.now(), reason: error.message } })); }
    })); if (!cancelled) timer = window.setTimeout(refresh, 5000); };
    refresh();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [connections.map(item => `${item.id}:${item.workspaceRoot || ''}`).join('|'), activeIds.join('|'), selectedId]);
  async function save() {
    setBusy('save');
    try { const saved = await onSave({ name: draft.name, host: draft.host, port: Number(draft.port), username: draft.username, authMode: draft.authMode, privateKeyPath: draft.privateKeyPath, agentSocket: draft.agentSocket, password: draft.password, rememberPassword: secureStorage && rememberPassword === true }); pendingCredential.current = { id: saved?.id, password: draft.password, passphrase: draft.passphrase }; setDraft(empty); if (saved?.id) setSelectedId(saved.id); await onReload(); }
    catch (error) { onError(error.message); }
    finally { setBusy(''); }
  }
  async function probe(id) {
    setBusy(id);
    try { const result = await onProbe(id); setFingerprints(value => ({ ...value, [id]: result })); }
    catch (error) { onError(error.message); }
    finally { setBusy(''); }
  }
  async function trustAndConnect(connection) {
    setBusy(connection.id);
    try {
      let fingerprint;
      if (!connection.hostKeyFingerprint) {
        const observed = await onProbe(connection.id);
        setFingerprints(value => ({ ...value, [connection.id]: observed }));
        if (observed.changed) throw new Error('主机指纹已变化，连接已阻止。请核验服务器身份。');
        if (!observed.trusted && !window.confirm(`首次连接，请核对服务器身份：\n${connection.username}@${connection.host}:${connection.port}\n${observed.fingerprint}\n\n是否信任并连接？`)) return;
        fingerprint = observed.trusted ? undefined : observed.fingerprint;
      }
      await onTrustAndConnect(connection.id, fingerprint, draft.passphrase, draft.password, rememberPassword);
      await onReload();
    } catch (error) { onError(error.message); }
    finally { setDraft(value => ({ ...value, passphrase: '', password: '' })); setBusy(''); }
  }
  async function loadGit(connectionId) {
    setBusy(`git:${connectionId}`);
    try {
      const value = await onGitInfo(connectionId);
      setGit(current => ({ ...current, [connectionId]: value }));
      setGitDrafts(current => ({ ...current, [connectionId]: { ...(current[connectionId] || {}), ...(value.remotes || []).reduce((out, remote) => ({ ...out, [remote.name]: remote.url }), {}) } }));
    } catch (error) { onError(error.message); }
    finally { setBusy(''); }
  }
  async function saveRemote(connectionId, action, name, url, previousName) {
    setBusy(`git:${connectionId}`);
    try { const value = await onGitRemote(connectionId, { action, name, url, previousName }); setGit(current => ({ ...current, [connectionId]: value })); await loadGit(connectionId); }
    catch (error) { onError(error.message); }
    finally { setBusy(''); }
  }
  const active = connection && activeIds.includes(connection.id);
  const observed = connection && fingerprints[connection.id];
  const metric = connection && metrics[connection.id];
  const projectWorkspace = connection && workspaces.find(item => item.kind === 'ssh' && item.connectionId === connection.id && item.remotePath === connection.workspaceRoot);
  const projectActive = Boolean(projectWorkspace && projectWorkspace.id === activeWorkspace?.id);
  const gitInfo = connection && git[connection.id];
  const status = item => activeIds.includes(item.id) ? '已连接' : item.hostKeyFingerprint ? '已信任 · 未连接' : '待验证';
  const perform = async action => { setBusy(connection.id); try { await action(); await onReload(); } catch (error) { onError(error.message); } finally { setBusy(''); } };
  return <div className="dialog-layer ssh-manager-layer" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="dialog-card wide ssh-connection-dialog" role="dialog" aria-modal="true" aria-label="SSH 服务器连接" aria-busy={Boolean(busy)}>
      <header><div className="ssh-manager-heading"><Server size={20}/><div><h3>SSH 服务器</h3><p>连接服务器，在远程目录中开展工作</p></div></div><button type="button" data-tooltip="关闭 SSH 管理" aria-label="关闭 SSH 服务器管理" onClick={onClose}><X size={18}/></button></header>
      <div className="ssh-manager-layout">
        <aside className="ssh-server-sidebar" aria-label="服务器连接列表">
          <div className="ssh-list-heading"><span>我的服务器 <b>{connections.length}</b></span><button type="button" data-tooltip="添加服务器" aria-label="添加服务器" disabled={Boolean(busy)} onClick={() => setSelectedId('')}><Plus size={16}/></button></div>
          <div className="ssh-server-list">{connections.map(item => <button type="button" className={`ssh-server-row ${selectedId === item.id ? 'selected' : ''}`} aria-pressed={selectedId === item.id} key={item.id} disabled={Boolean(busy)} onClick={() => setSelectedId(item.id)}><span className="ssh-server-avatar"><Server size={18}/></span><span className="ssh-server-row-copy"><strong>{item.name}</strong><span>{item.username}@{item.host}:{item.port}</span><small className={activeIds.includes(item.id) ? 'online' : ''}><i/>{status(item)}</small></span></button>)}{!connections.length && <div className="ssh-list-empty"><Server size={25}/><b>还没有服务器</b><p>添加第一台服务器，开始远程工作。</p></div>}</div>
          <button type="button" className={`ssh-add-server ${!connection ? 'selected' : ''}`} disabled={Boolean(busy)} onClick={() => setSelectedId('')}><Plus size={15}/>添加 SSH 连接</button>
          <p className="ssh-sidebar-note"><Shield size={13}/>凭据保留在本机</p>
        </aside>
        <main className="ssh-detail-panel">{connection ? <>
          <div className="ssh-detail-title"><span className="ssh-eyebrow">服务器详情</span><div className="ssh-detail-title-row"><h2>{connection.name}</h2><span className={`ssh-state-badge ${active ? 'online' : ''}`}>{status(connection)}</span></div><p className="ssh-host-address">{connection.username}@{connection.host}:{connection.port}</p></div>
          <section className="ssh-section ssh-auth-section"><div className="ssh-section-heading"><h4><Shield size={16}/>连接与认证</h4><span>{connection.authMode === 'password' ? '登录密码' : connection.authMode === 'key' ? '本机私钥' : '本机密钥代理（SSH Agent）'}</span></div>
            <details className={`ssh-trust-box ${observed?.changed ? 'has-error' : ''}`} open={observed?.changed || undefined}><summary>{observed?.changed ? '主机指纹已变化，连接已阻止' : connection.hostKeyFingerprint ? '已固定主机指纹' : observed ? '请核对服务器指纹' : '首次连接时确认服务器身份'}</summary><p>{observed?.fingerprint || connection.hostKeyFingerprint || '点击连接时自动检查，首次确认后无需重复操作。'}</p></details>
            {!active && <div className="ssh-auth-settings"><label>认证方式<select aria-label="连接认证方式" value={authDraft?.authMode || connection.authMode} onChange={event => setAuthDraft({ authMode: event.target.value, privateKeyPath: '', agentSocket: '' })}><option value="password">登录密码</option><option value="agent">本机密钥代理（SSH Agent）</option><option value="key">本机私钥文件</option></select></label>{authDraft?.authMode === 'key' && <label>私钥文件<input aria-label="连接私钥文件" placeholder="本机私钥绝对路径" value={authDraft.privateKeyPath} onChange={event => setAuthDraft(value => ({ ...value, privateKeyPath: event.target.value }))}/></label>}{authDraft && <button type="button" className="ssh-secondary-button" disabled={Boolean(busy)} onClick={() => perform(async () => { await onSave({ id: connection.id, ...authDraft }); setAuthDraft(null); setDraft(value => ({ ...value, password: '', passphrase: '' })); })}>保存认证方式</button>}<p className="ssh-section-help">{authDraft ? '保存认证方式后再连接。' : connection.authMode === 'password' ? '使用服务器登录密码；可选择通过系统安全存储加密记住。' : connection.authMode === 'agent' ? '使用本机 SSH Agent 托管的密钥登录，与 AI Agent 无关；服务器需已配置对应公钥。' : '私钥对应的公钥须已添加到服务器；私钥口令只用于解锁本机密钥。'}</p></div>}
            {!active && connection.authMode === 'password' && <div className="ssh-password-controls"><label className="ssh-passphrase">服务器登录密码<input aria-label="服务器登录密码" type="password" autoComplete="off" placeholder={connection.passwordSaved ? '已保存，留空自动使用' : '输入登录密码'} value={draft.password} onChange={event => setDraft(value => ({ ...value, password: event.target.value }))}/></label><div className="ssh-remember-row"><label className="ssh-remember"><input type="checkbox" disabled={!secureStorage} checked={secureStorage && (rememberPassword ?? Boolean(connection.passwordSaved))} onChange={event => setRememberPassword(event.target.checked)}/>记住密码</label><span>{!secureStorage ? '系统安全存储不可用，仅限本次连接' : (rememberPassword ?? Boolean(connection.passwordSaved)) ? '使用系统安全存储加密' : '密码仅用于本次连接'}</span><button type="button" className="ssh-password-save" disabled={Boolean(busy) || !secureStorage || !draft.password} onClick={() => perform(async () => { await onSave({ id: connection.id, password: draft.password, rememberPassword: true }); setDraft(value => ({ ...value, password: '' })); })}>保存</button></div></div>}
            {!active && connection.authMode === 'key' && <label className="ssh-passphrase">私钥口令 <span>可选，仅用于本次连接</span><input type="password" autoComplete="new-password" value={draft.passphrase} onChange={event => setDraft(value => ({ ...value, passphrase: event.target.value }))}/></label>}
            <div className="ssh-button-row"><button type="button" className="ssh-secondary-button" disabled={Boolean(busy)} onClick={() => probe(connection.id)}><Shield size={15}/>{busy === connection.id ? '处理中…' : '检查主机指纹'}</button>{active ? <button type="button" className="ssh-secondary-button" disabled={Boolean(busy)} onClick={() => perform(() => onDisconnect(connection.id))}><CircleStop size={15}/>断开连接</button> : <button type="button" className="ssh-primary-button" disabled={Boolean(busy) || Boolean(authDraft) || Boolean(observed?.changed)} onClick={() => trustAndConnect(connection)}><Server size={15}/>{busy === connection.id ? '连接中…' : '连接'}</button>}</div>
          </section>
          {active ? <>
            <section className="ssh-section"><div className="ssh-section-heading"><h4><FolderOpen size={16}/>远程工作目录</h4></div><p className="ssh-section-help">选择服务器上的项目目录，文件与命令都在这里执行。</p><div className="ssh-root-field"><input aria-label={`${connection.name} 远程项目路径`} placeholder="/home/user/project" value={roots[connection.id] ?? connection.workspaceRoot ?? ''} onChange={event => setRoots(value => ({ ...value, [connection.id]: event.target.value }))}/><button type="button" className="ssh-secondary-button" disabled={Boolean(busy)} onClick={() => perform(() => onSetWorkspace(connection.id, roots[connection.id] ?? connection.workspaceRoot))}>保存目录</button></div><button type="button" className="ssh-primary-button" disabled={Boolean(busy) || !connection.workspaceRoot || projectActive} onClick={() => perform(() => projectWorkspace ? onSelectWorkspace(projectWorkspace.id) : onAddWorkspace(connection.id))}><FolderPlus size={15}/>{projectActive ? '当前项目工作区' : projectWorkspace ? '打开项目工作区' : '添加为项目工作区'}</button></section>
            <section className="ssh-section"><div className="ssh-section-heading"><h4><Server size={16}/>服务器状态</h4><button type="button" data-tooltip="刷新服务器状态" aria-label="刷新服务器状态" disabled={Boolean(busy)} onClick={() => perform(async () => { const value = await onMetrics(connection.id); setMetrics(current => ({ ...current, [connection.id]: value })); })}><RefreshCw size={15}/></button></div>{metric && (metric.cpu || metric.memory || metric.load || metric.disk) ? <><div className="ssh-metric-grid">{[['CPU', metric.cpu?.utilizationPercent, '%'], ['内存', metric.memory?.usedPercent, '%'], ['负载', metric.load?.one, ''], ['磁盘', metric.disk?.usedPercent, '%']].map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{value == null ? '—' : `${typeof value === 'number' ? Math.round(value * 10) / 10 : value}${unit}`}</strong>{label === '磁盘' && <small>{metric.disk ? `${metricCapacity(metric.disk.usedBytes)} / ${metricCapacity(metric.disk.totalBytes)} · ${metric.disk.path || '/'}` : '磁盘数据不可用'}</small>}{label === 'CPU' && value == null && <small>CPU 采样不可用</small>}</div>)}</div>{metric.reason && <p className="ssh-section-help">{metric.reason}</p>}<p className="ssh-section-help">每 5 秒更新 · 最近采样 {new Date(metric.sampledAt).toLocaleTimeString()}</p></> : <p className="ssh-section-help">{metric?.reason || '正在读取服务器状态…'}</p>}</section>
            <section className="ssh-section"><div className="ssh-section-heading"><h4><GitBranch size={16}/>Git 远端</h4><button type="button" className="ssh-secondary-button" disabled={Boolean(busy) || !connection.workspaceRoot} onClick={async () => { const next = gitOpen === connection.id ? '' : connection.id; setGitOpen(next); if (next) await loadGit(connection.id); }}>{gitOpen === connection.id ? '收起' : '管理远端'}</button></div><p className="ssh-section-help">支持 GitHub、GitLab、Gitee 及自建 Git 服务。</p>{gitOpen === connection.id && <div className="ssh-git-panel"><div><b>{gitInfo?.branch ? `分支 ${gitInfo.branch}` : 'Git 仓库'}</b><button data-tooltip="刷新 Git 状态" aria-label="刷新 Git 状态" disabled={Boolean(busy)} onClick={() => loadGit(connection.id)}><RefreshCw size={13}/></button></div>{gitInfo?.status && <pre>{gitInfo.status}</pre>}{(gitInfo?.remotes || []).map(remote => <div className="ssh-git-remote" key={remote.name}><input aria-label={`${remote.name} Git remote 地址`} value={gitDrafts[connection.id]?.[remote.name] ?? remote.url} onChange={event => setGitDrafts(value => ({ ...value, [connection.id]: { ...(value[connection.id] || {}), [remote.name]: event.target.value } }))}/><button data-tooltip={`保存 ${remote.name}`} aria-label={`保存 ${remote.name} Git remote`} disabled={Boolean(busy)} onClick={() => saveRemote(connection.id, 'set-url', remote.name, gitDrafts[connection.id]?.[remote.name] ?? remote.url)}><Server size={13}/></button><button data-tooltip={`删除 ${remote.name}`} aria-label={`删除 ${remote.name} Git remote`} disabled={Boolean(busy)} onClick={() => saveRemote(connection.id, 'remove', remote.name)}><Trash2 size={13}/></button></div>)}<div className="ssh-git-remote"><input aria-label="新 Git remote 名称" placeholder="origin" value={gitDrafts[connection.id]?.__newName || ''} onChange={event => setGitDrafts(value => ({ ...value, [connection.id]: { ...(value[connection.id] || {}), __newName: event.target.value } }))}/><input aria-label="GitHub、GitLab、Gitee 或自托管 Git 地址" placeholder="git@your-git.example:group/project.git" value={gitDrafts[connection.id]?.__newUrl || ''} onChange={event => setGitDrafts(value => ({ ...value, [connection.id]: { ...(value[connection.id] || {}), __newUrl: event.target.value } }))}/><button data-tooltip="添加 Git remote" aria-label="添加 Git remote" disabled={Boolean(busy)} onClick={async () => { const name = gitDrafts[connection.id]?.__newName || 'origin'; const url = gitDrafts[connection.id]?.__newUrl || ''; await saveRemote(connection.id, 'add', name, url); setGitDrafts(value => ({ ...value, [connection.id]: { ...(value[connection.id] || {}), __newName: '', __newUrl: '' } })); }}><Plus size={14}/></button></div><small>支持 GitHub、GitLab、Gitee 和兼容 SSH/HTTPS 的自托管服务；地址不能带凭据，使用服务器 SSH Agent 或 Git credential helper。</small></div>}</section>
          </> : <div className="ssh-disconnected-note"><FolderOpen size={20}/><div><b>连接后，打开远程项目</b><p>浏览文件、运行终端，并查看服务器占用与 Git 远端。</p></div></div>}
          <footer className="ssh-detail-footer"><span>删除配置不会删除服务器上的文件</span><button type="button" className="ssh-danger-button" disabled={Boolean(busy) || active} data-tooltip={active ? '请先断开连接再删除' : '删除此连接配置'} onClick={() => { if (window.confirm(`删除连接“${connection.name}”？服务器文件不会被删除。`)) perform(() => onDelete(connection.id)); }}><Trash2 size={14}/>删除连接</button></footer>
        </> : <div className="ssh-connection-form"><div className="ssh-detail-title"><span className="ssh-eyebrow">新连接</span><h2>添加 SSH 服务器</h2><p>填写服务器信息和登录密码，保存后即可连接。</p></div><form className="dialog-form" onSubmit={event => { event.preventDefault(); save(); }}><label>连接名称<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label>主机<input autoCapitalize="off" autoCorrect="off" value={draft.host} onChange={event => setDraft({ ...draft, host: event.target.value })} placeholder="server.example.com"/></label><label>端口<input type="number" min="1" max="65535" value={draft.port} onChange={event => setDraft({ ...draft, port: event.target.value })}/></label><label>用户名<input autoCapitalize="off" autoCorrect="off" value={draft.username} onChange={event => setDraft({ ...draft, username: event.target.value })}/></label><label>认证方式<select value={draft.authMode} onChange={event => setDraft({ ...draft, authMode: event.target.value })}><option value="agent">本机密钥代理（SSH Agent）</option><option value="key">本机私钥文件</option><option value="password">登录密码</option></select></label>{draft.authMode === 'key' ? <label>私钥文件<div className="ssh-key-picker"><input value={draft.privateKeyPath} onChange={event => setDraft({ ...draft, privateKeyPath: event.target.value })} placeholder="选择本机私钥"/><button type="button" title="选择私钥文件" aria-label="选择 SSH 私钥文件" data-tooltip="选择本机私钥文件" onClick={async () => { const value = await window.desktop?.chooseSshKey?.(); if (value) setDraft({ ...draft, privateKeyPath: value }); }}><FolderOpen size={15}/></button></div></label> : draft.authMode === 'agent' ? <label>Agent Socket（可选）<input value={draft.agentSocket} onChange={event => setDraft({ ...draft, agentSocket: event.target.value })} placeholder="默认使用系统 SSH_AUTH_SOCK"/></label> : <><label>服务器登录密码<input aria-label="新服务器登录密码" type="password" autoComplete="new-password" value={draft.password} onChange={event => setDraft({ ...draft, password: event.target.value })}/></label><label className="ssh-remember"><input type="checkbox" disabled={!secureStorage} checked={secureStorage && rememberPassword === true} onChange={event => setRememberPassword(event.target.checked)}/>记住密码（系统加密）</label>{!secureStorage && <p className="ssh-section-help">系统安全存储不可用，密码仅用于本次连接。</p>}</>}{draft.authMode === 'key' && <label>私钥口令（仅本次连接，不保存）<input type="password" autoComplete="new-password" value={draft.passphrase} onChange={event => setDraft({ ...draft, passphrase: event.target.value })}/></label>}<div className="dialog-actions"><button className="primary-action" type="submit" disabled={Boolean(busy) || !draft.name.trim() || !draft.host.trim() || !draft.username.trim()}><Plus size={14}/>保存连接</button></div></form><p>首次连接自动检查服务器指纹。勾选记住密码后使用系统安全存储加密保存；私钥内容和私钥口令不会保存。</p></div>}</main>
      </div>
    </section>
  </div>;
}

function metricPercent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : '—';
}
function metricCapacity(value) {
  if (!Number.isFinite(value)) return '—';
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GiB` : `${(value / 1024 ** 2).toFixed(0)} MiB`;
}
function TerminalServerStatus({ connection, connected, onMetrics, onOpen }) {
  const [sample, setSample] = useState(null), [error, setError] = useState('');
  const latest = useRef(onMetrics); latest.current = onMetrics;
  useEffect(() => {
    setSample(null); setError('');
    if (!connected) return;
    let cancelled = false, timer;
    async function refresh() {
      try { const value = await latest.current(connection.id); if (!cancelled) { setSample(value); setError(value.reason || ''); } }
      catch (error) { if (!cancelled) { setSample(null); setError(error.message); } }
      finally { if (!cancelled) timer = window.setTimeout(refresh, 5000); }
    }
    refresh();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [connection.id, connection.workspaceRoot, connected]);
  const detail = !connected ? 'SSH 已断开' : error || (sample ? `CPU ${sample.cpu?.cores || '—'} 核 · 内存 ${metricCapacity(sample.memory?.usedBytes)} / ${metricCapacity(sample.memory?.totalBytes)} · 磁盘 ${sample.disk?.path || '/'} ${metricCapacity(sample.disk?.usedBytes)} / ${metricCapacity(sample.disk?.totalBytes)} · 最近采样 ${new Date(sample.sampledAt).toLocaleTimeString()}` : '正在采样…');
  return <TerminalAction className="terminal-server-status" title={detail} onClick={onOpen} aria-label={`${connection.name} 服务器实时监控`}>
    <span className={`terminal-server-dot ${connected ? 'online' : ''}`}/><span className="terminal-server-summary">{!connected ? '未连接' : error ? '采样异常' : '服务器状态'}</span>
    {connected && <span className="terminal-server-values"><span>CPU <b>{metricPercent(sample?.cpu?.utilizationPercent)}</b></span><span>内存 <b>{metricPercent(sample?.memory?.usedPercent)}</b></span><span>磁盘 <b>{metricPercent(sample?.disk?.usedPercent)}</b></span></span>}
  </TerminalAction>;
}

export default function TerminalWorkspace({ panes, workspace, workspaces = [], sshConnections = [], activeSshIds = [], sshConnectionId = '', onSelectSsh, onSelectWorkspace, onSshSave, onSshProbe, onSshTrustAndConnect, onSshDisconnect, onSshDelete, onSshSetWorkspace, onSshMetrics, onSshGitInfo, onSshGitRemote, onAddSshWorkspace, onReloadSsh, onError, onStart, onInput, onResize, onStop, onClear, onAddPane, onClosePane, onClose, onToggle }) {
  const connection = sshConnections.find(item => item.id === sshConnectionId);
  const [manageSsh, setManageSsh] = useState(false);
  const [requestedConnectionId, setRequestedConnectionId] = useState('');
  const [connectingId, setConnectingId] = useState('');
  const connectionAttempt = useRef(false);
  const [desktopMode, setDesktopMode] = useState(false);
  const [desktopLoaded, setDesktopLoaded] = useState(false);
  const connected = Boolean(connection && activeSshIds.includes(connection.id));
  useEffect(() => { setDesktopMode(false); setDesktopLoaded(false); }, [sshConnectionId]);
  async function selectBackend(id) {
    if (connectionAttempt.current) return;
    if (!id || activeSshIds.includes(id)) {
      if (id !== sshConnectionId) await onSelectSsh(id);
      return;
    }
    const target = sshConnections.find(item => item.id === id);
    if (!target) return;
    setRequestedConnectionId(id);
    // First-use trust and unsaved passwords stay in the existing credential dialog.
    if (!target.hostKeyFingerprint || (target.authMode === 'password' && !target.passwordSaved)) {
      setManageSsh(true);
      return;
    }
    connectionAttempt.current = true;
    setConnectingId(id);
    try { await onSshTrustAndConnect(id); }
    catch (error) { onError(error.message); setManageSsh(true); }
    finally { connectionAttempt.current = false; setConnectingId(''); }
  }
  return <div className="terminal-workspace" style={layoutFallback.workspace}><header className="terminal-topbar" style={layoutFallback.topbar}><div className="terminal-title" style={layoutFallback.title}><TerminalAction className="mobile-menu" title="展开导航" onClick={onToggle}><Menu size={18}/></TerminalAction><SquareTerminal size={15}/><b>终端</b><select className="terminal-backend-select" aria-label="终端执行位置" title="选择 SSH 服务器后自动连接" disabled={Boolean(connectingId)} value={sshConnectionId} onChange={event => selectBackend(event.target.value)}><option value="">本机终端{panes.filter(p => p.id !== 'desktop-terminal').length > 1 ? ` · ${panes.filter(p => p.id !== 'desktop-terminal').length}` : ''}</option>{sshConnections.map(item => <option key={item.id} value={item.id}>{activeSshIds.includes(item.id) ? '● ' : ''}SSH · {item.name}{item.id === sshConnectionId && panes.filter(p => p.id !== 'desktop-terminal').length > 1 ? ` · ${panes.filter(p => p.id !== 'desktop-terminal').length}` : ''}{activeSshIds.includes(item.id) ? '' : ' · 选择连接'}</option>)}</select>{connectingId && <span className="terminal-connecting" role="status">连接中…</span>}{connection && !connected && !connectingId && <TerminalAction title="连接此服务器" aria-label="连接此服务器" onClick={() => selectBackend(connection.id)}><Server size={15}/></TerminalAction>}</div>{connection && <TerminalServerStatus connection={connection} connected={activeSshIds.includes(connection.id)} onMetrics={onSshMetrics} onOpen={() => setManageSsh(true)}/>}<div className="terminal-actions" style={layoutFallback.actions}>{connected && <button type="button" className="ssh-view-switch" title={desktopMode ? '返回终端' : '切换虚拟桌面'} aria-label={desktopMode ? '返回终端' : '切换虚拟桌面'} aria-pressed={desktopMode} onClick={() => { setDesktopLoaded(true); setDesktopMode(value => !value); }}>{desktopMode ? <SquareTerminal size={14}/> : <Monitor size={14}/>}<span>{desktopMode ? '返回终端' : '虚拟桌面'}</span></button>}<TerminalAction title="管理 SSH 服务器" aria-label="管理 SSH 服务器" onClick={() => setManageSsh(true)}><Server size={15}/></TerminalAction><TerminalAction title="添加终端" aria-label="添加终端" onClick={() => onAddPane()}><PanelRightOpen size={15}/></TerminalAction><TerminalAction title="终止并关闭终端" aria-label="终止并关闭终端" onClick={onClose}><X size={16}/></TerminalAction></div></header><div hidden={desktopMode && connected} className={`terminal-panes ${panes.length > 1 ? 'is-split' : ''}`} style={layoutFallback.panes}>{panes.filter(pane => pane.id !== 'desktop-terminal').map((pane, index) => <TerminalPane key={pane.id} pane={pane} workspace={workspace} index={index} canClose={panes.length > 1} connectionName={connection?.name} backendKey={sshConnectionId} onStart={(paneId, size) => onStart(paneId, { ...size, sshConnectionId })} onInput={onInput} onResize={onResize} onStop={() => onStop(pane.id)} onClear={() => onClear(pane.id)} onClose={() => onClosePane(pane.id)}/>)}</div>{connected && desktopLoaded && <div className="ssh-desktop-host" hidden={!desktopMode}><SshDesktop key={connection.id} connection={connection} visible={desktopMode} panes={panes} TerminalPane={TerminalPane} onMetrics={onSshMetrics} onSaveConnection={onSshSave} onStart={onStart} onInput={onInput} onResize={onResize} onStop={onStop} onClear={onClear} onAddPane={onAddPane} onClosePane={onClosePane}/></div>}{manageSsh && <SshConnectionDialog initialConnectionId={requestedConnectionId || sshConnectionId} connections={sshConnections} activeIds={activeSshIds} workspaces={workspaces} activeWorkspace={workspace} onClose={() => { setManageSsh(false); setRequestedConnectionId(''); }} onReload={onReloadSsh} onSave={onSshSave} onProbe={onSshProbe} onTrustAndConnect={onSshTrustAndConnect} onDisconnect={onSshDisconnect} onDelete={onSshDelete} onSetWorkspace={onSshSetWorkspace} onAddWorkspace={onAddSshWorkspace} onSelectWorkspace={onSelectWorkspace} onMetrics={onSshMetrics} onGitInfo={onSshGitInfo} onGitRemote={onSshGitRemote} onError={onError}/>}</div>;
}
