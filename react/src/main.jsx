import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import CodeMirror from '@uiw/react-codemirror';
import { Streamdown } from 'streamdown';
import { QRCodeSVG } from 'qrcode.react';
import { javascript } from '@codemirror/lang-javascript';
import { json as jsonLanguage } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { Activity, Archive, ArrowUp, Bot, BookOpen, Check, ChevronDown, ChevronRight, ChevronsUp, CircleStop, Clipboard, ClipboardPaste, Code2, Coins, Copy, ExternalLink, Eye, File, FileCode2, FileImage, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, GitBranch, Images, LayoutDashboard, Library, ListTree, LoaderCircle, LogOut, Menu, MoreHorizontal, Package, Paperclip, Pencil, Plus, RefreshCw, Save, Scissors, Search, Server, Settings2, Shield, ShieldAlert, Sparkles, SquareTerminal, Trash2, Upload, UserRound, Wrench, X } from 'lucide-react';
import './style.css';
import 'streamdown/styles.css';
import ExpertSkillLibrary from './ExpertSkillLibrary.jsx';
import ConversationAvatar from './ConversationAvatar.jsx';
import TerminalWorkspace from './TerminalWorkspace.jsx';
import { applyTerminalEvent, createTerminalSession } from './terminal-session.mjs';

const api = async (url, opts = {}) => { let r; try { r = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined }); } catch (cause) { const error = new Error(`无法连接本地 Agent：${cause.message}`); error.details = { stage: 'local_api', name: cause.name, message: cause.message, cause: cause.cause?.message || '', url }; throw error; } const d = await r.json().catch(() => ({})); if (!r.ok) { const error = new Error(d.error || `HTTP ${r.status}`); error.code = d.code; error.details = { stage: 'local_api', status: r.status, code: d.code || '', message: d.error || '', url }; throw error; } return d; };
const get = (url) => api(url); const post = (url, body = {}) => api(url, { method: 'POST', body });
const MODE = { default: { label: '人工审批', desc: '只读工具和安全查询自动执行；写入、其他命令及敏感操作需审批', tone: 'safe' }, 'auto-all': { label: '完全访问', desc: '自动允许文件修改和命令执行', tone: 'danger' } };

function App() {
  const [view, setView] = useState('workbench'), [info, setInfo] = useState(null), [account, setAccount] = useState(null), [accountOpen, setAccountOpen] = useState(false), [workspaces, setWorkspaces] = useState([]), [sessions, setSessions] = useState([]), [current, setCurrent] = useState(null), [running, setRunning] = useState(false), [draft, setDraft] = useState(''), [attachments, setAttachments] = useState([]), [pendingMode, setPendingMode] = useState('default'), [pendingExpert, setPendingExpert] = useState(null), [live, setLive] = useState(null), [permission, setPermission] = useState(null), [connection, setConnection] = useState({ status: 'connecting', attempt: 0 }), [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 800), [error, setError] = useState(null), [selectedFile, setSelectedFile] = useState(null), [fileRevision, setFileRevision] = useState(0), [selectedAsset, setSelectedAsset] = useState(null), [assetRevision, setAssetRevision] = useState(0), [terminal, setTerminal] = useState(null);
  const currentId = useRef(null), terminalId = useRef(null), terminalLaunch = useRef(false), terminalEvents = useRef([]), stageRef = useRef(null), followOutput = useRef(true), eventSourceRef = useRef(null), reconnectTimerRef = useRef(null), eventStreamActive = useRef(true), reconnectAttempt = useRef(0); const activeWorkspace = workspaces.find((w) => w.active);
  async function loadInfo() { const d = await get('/api/info'); setInfo(d); setAccount(d.account); setWorkspaces(d.workspaces || []); }
  async function reloadConfiguration() { await loadInfo(); if (currentId.current) { const d = await get(`/api/session/${currentId.current}`); setCurrent(d); setRunning(Boolean(d.running)); setPermission(d.permission || null); } }
  async function loadSessions(selectFirst = false) { const d = await get('/api/sessions'); setSessions(d.sessions || []); if (selectFirst && !currentId.current && d.sessions?.[0]) await loadSession(d.sessions[0].id); }
  async function loadSession(id, { preserveScroll = false } = {}) { if (!id) return; const d = await get(`/api/session/${id}`); currentId.current = id; setPendingExpert(null); if (!preserveScroll) followOutput.current = true; setCurrent(d); setRunning(Boolean(d.running)); setLive(null); setPermission(d.permission || null); setView('task'); if (window.innerWidth <= 800) setSidebarOpen(false); if (!preserveScroll) requestAnimationFrame(() => requestAnimationFrame(() => scrollConversationToBottom())); }
  useEffect(() => { eventStreamActive.current = true; Promise.all([loadInfo(), loadSessions(false)]).catch((e) => setError(toUiError(e, 'initial_load'))); connectEvents(); return () => { eventStreamActive.current = false; clearTimeout(reconnectTimerRef.current); eventSourceRef.current?.close(); }; }, []);
  useEffect(() => { const key = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openWorkbench(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  useLayoutEffect(() => { if (view === 'task' && followOutput.current) requestAnimationFrame(() => scrollConversationToBottom()); }, [view, current?.id, current?.entries?.length, live, permission]);
  function scrollConversationToBottom() { const stage = stageRef.current; if (stage) stage.scrollTop = stage.scrollHeight; }
  function trackConversationScroll() { const stage = stageRef.current; if (!stage) return; followOutput.current = stage.scrollHeight - stage.scrollTop - stage.clientHeight <= 32; }
  function connectEvents(manual = false) { clearTimeout(reconnectTimerRef.current); eventSourceRef.current?.close(); if (manual) reconnectAttempt.current = 0; setConnection({ status: 'connecting', attempt: reconnectAttempt.current }); const es = new EventSource('/api/event'); eventSourceRef.current = es; es.onmessage = (message) => { try { const event = JSON.parse(message.data); if (event.type === 'server_connected') { reconnectAttempt.current = 0; setConnection({ status: 'connected', attempt: 0 }); } handleEvent(event); } catch {} }; es.onerror = () => { es.close(); if (!eventStreamActive.current) return; reconnectAttempt.current += 1; const attempt = reconnectAttempt.current, delayMs = Math.min(10000, 1000 * (2 ** Math.min(attempt - 1, 3))); setConnection({ status: 'retrying', attempt, delayMs }); reconnectTimerRef.current = setTimeout(() => connectEvents(), delayMs); }; }
  function handleEvent(e) {
    if (e.type === 'server_connected') return;
    if (e.type === 'account_updated') { setAccount(e.account); return; }
    if (e.type === 'catalog_updated' || e.type === 'plugins_reloaded') { loadInfo().catch(() => {}); return; }
    if (['terminal_started', 'terminal_output', 'terminal_exit'].includes(e.type)) {
      if (terminalLaunch.current && e.terminalId !== terminalId.current) { terminalEvents.current.push(e); return; }
      setTerminal((value) => applyTerminalEvent(value, e));
      return;
    }
    if (e.type === 'workspace_changed') { openWorkbench(); loadInfo().then(() => loadSessions(false)); return; }
    if (['session_created', 'session_updated'].includes(e.type)) loadSessions();
    if (e.type === 'session_deleted') { if (e.sessionId === currentId.current) openWorkbench(); loadSessions(false); return; }
    if (e.sessionId && e.sessionId !== currentId.current) return;
    if (e.type === 'queue_updated') setCurrent((x) => x ? { ...x, queue: e.queue } : x);
    else if (e.type === 'user_message') { if (e.entry) setCurrent((x) => { if (!x) return x; const entries = [...(x.entries || [])], optimistic = entries.findIndex((item) => item.optimistic && item.clientMessageId && item.clientMessageId === e.entry.clientMessageId); if (optimistic >= 0) entries[optimistic] = e.entry; else if (!entries.some((item) => item.id === e.entry.id)) entries.push(e.entry); return { ...x, entries, queue: (x.queue || []).filter((item) => item.queueId !== e.entry.queuedId) }; }); }
    else if (e.type === 'message_start') { setRunning(true); setLive((x) => { const sameTurn = Boolean(x) && x.turnId === e.turnId && Array.isArray(x.steps); const steps = sameTurn ? x.steps.map((item) => item.status === 'running' ? { ...item, status: 'ok' } : item) : []; if (!steps.some((item) => item.step === e.step)) steps.push({ step: e.step, startedAt: e.startedAt, text: '', thinking: '', tools: [], status: 'running' }); return { turnId: e.turnId, steps }; }); }
    else if (e.type === 'text_delta') setLive((x) => updateLiveStep(x, e, (step) => ({ ...step, retry: null, text: `${step.text || ''}${e.text || ''}` })));
    else if (e.type === 'thinking_delta') setLive((x) => updateLiveStep(x, e, (step) => ({ ...step, retry: null, thinking: `${step.thinking || ''}${e.text || ''}` })));
    else if (e.type === 'tool_call') setLive((x) => updateLiveStep(x, e, (step) => ({ ...step, retry: null, tools: step.tools.some((tool) => tool.id === e.call.id) ? step.tools : [...step.tools, { ...e.call, decision: e.decision, startedAt: e.startedAt, status: 'running' }] })));
    else if (e.type === 'tool_result') { setLive((x) => updateLiveStep(x, e, (step) => ({ ...step, tools: step.tools.map((tool) => tool.id === e.callId ? { ...tool, ...e, id: tool.id } : tool) }))); setFileRevision((x) => x + 1); }
    else if (e.type === 'model_retry') setLive((x) => updateLiveStep(x, e, (step) => ({ ...step, retry: { attempt: e.attempt, maxAttempts: e.maxAttempts, delayMs: e.delayMs, message: e.message } })));
    else if (e.type === 'permission_request') setPermission(e.request);
    else if (e.type === 'permission_resolved') setPermission(null);
    else if (e.type === 'context_update') { setCurrent((x) => x ? { ...x, context: e.context } : x); setLive((x) => x ? { ...x, context: e.context } : x); }
    else if (e.type === 'compaction') setLive((x) => ({ ...(x || { turnId: e.turnId, steps: [] }), compaction: { used: e.used, summary: e.summary } }));
    else if (e.type === 'turn_end') { setRunning(false); setLive(null); loadSession(currentId.current, { preserveScroll: true }); }
    else if (e.type === 'error') { setRunning(false); setLive(null); setError({ message: e.message || 'Agent 运行失败', details: e.details }); loadSession(currentId.current, { preserveScroll: true }); }
  }
  function openWorkbench() { currentId.current = null; followOutput.current = true; setCurrent(null); setLive(null); setPermission(null); setRunning(false); setPendingMode('default'); setView('workbench'); }
  async function addWorkspace() { const path = window.desktop?.chooseDirectory ? await window.desktop.chooseDirectory() : window.prompt('输入工作目录绝对路径'); if (path) await post('/api/workspaces', { path }); }
  async function activateWorkspace(id) { await post(`/api/workspaces/${id}/activate`); }
  async function createSessionInWorkspace(id) { if (id && id !== activeWorkspace?.id) await post(`/api/workspaces/${id}/activate`); await loadInfo(); await loadSessions(false); openWorkbench(); }
  async function addDroppedWorkspace(path) { if (!path) return; try { await post('/api/workspaces', { path }); await loadInfo(); await loadSessions(true); } catch (e) { setError(toUiError(e, 'workspace_add')); } }
  async function deleteSession(id, title) { if (id === currentId.current && running) { setError({ message: '会话正在运行，停止后才能删除', details: { stage: 'session_delete', sessionId: id } }); return; } if (!window.confirm(`确定删除会话“${title || '未命名会话'}”吗？此操作不可撤销。`)) return; try { await api(`/api/session/${id}`, { method: 'DELETE' }); if (id === currentId.current) openWorkbench(); await loadSessions(false); } catch (e) { setError(toUiError(e, 'session_delete')); } }
  async function send() { const value = draft.trim(); if ((!value && !attachments.length) || !activeWorkspace) return; const pending = attachments, clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`; setDraft(''); setAttachments([]); if (running && current) { try { const result = await post(`/api/session/${current.id}/queue`, { text: value, attachments: pending.map(({ dataUrl, name, mime }) => ({ dataUrl, name, mime })) }); setCurrent((x) => x ? { ...x, queue: result.queue } : x); } catch (e) { setDraft(value); setAttachments(pending); setError(toUiError(e, 'queue_send')); } return; } setRunning(true); try { let target = current; if (!target) { const created = await post('/api/session', { title: value.slice(0, 40) || '图片任务' }); currentId.current = created.id; if (pendingMode === 'auto-all') await post(`/api/session/${created.id}/mode`, { mode: pendingMode }); if (pendingExpert?.id) await post(`/api/session/${created.id}/expert`, { expertId: pendingExpert.id }); target = await get(`/api/session/${created.id}`); setPendingExpert(null); setView('task'); await loadSessions(); } const optimistic = { id: `optimistic-${clientMessageId}`, type: 'message', role: 'user', content: pending.length ? [{ type: 'text', text: value }, ...pending.map((item) => ({ type: 'image', dataUrl: item.dataUrl, name: item.name, mime: item.mime }))] : value, clientMessageId, optimistic: true, ts: Date.now() }; setCurrent({ ...target, mode: target.mode || pendingMode, entries: [...(target.entries || []), optimistic] }); await post(`/api/session/${target.id}/message`, { text: value, clientMessageId, attachments: pending.map(({ dataUrl, name, mime }) => ({ dataUrl, name, mime })) }); } catch (e) { setRunning(false); setCurrent((x) => x ? ({ ...x, entries: (x.entries || []).filter((item) => item.clientMessageId !== clientMessageId) }) : x); setAttachments(pending); setDraft(value); if (e.code === 'ACCOUNT_REQUIRED' || e.details?.status === 401) setAccountOpen(true); setError(toUiError(e, 'message_send')); } }
  async function adjustQueued(item) { try { const result = await post(`/api/session/${current.id}/queue/${item.queueId}/adjust`); setCurrent((x) => x ? { ...x, queue: result.queue } : x); } catch (e) { setError(toUiError(e, 'queue_adjust')); } }
  async function editQueued(item) { try { const restored = await Promise.all((item.attachments || []).map(async (part) => { const response = await fetch(part.url); if (!response.ok) throw new Error('附件读取失败'); const blob = await response.blob(); const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); return { id: part.attachmentId, dataUrl, name: part.name, mime: part.mime }; })); const result = await api(`/api/session/${current.id}/queue/${item.queueId}`, { method: 'DELETE' }); setDraft(result.entry.text); setAttachments(restored); setCurrent((x) => x ? { ...x, queue: result.queue } : x); } catch (e) { setError(toUiError(e, 'queue_edit')); } }
  async function setMode(mode) { if (!current) { setPendingMode(mode); return; } if (running) return; await post(`/api/session/${current.id}/mode`, { mode }); await loadSession(current.id); }
  async function setDesktop(enabled) { if (!current) return; await post(`/api/session/${current.id}/desktop`, { enabled }); await loadSession(current.id); }
  async function applyExpert(expert) { if (!expert) return; if (running) { setError({ message: '会话运行中，不能切换专家', details: { stage: 'expert_switch' } }); return; } try { let target = current; if (!target) { if (!activeWorkspace) throw new Error('请先添加或选择工作目录'); const created = await post('/api/session', { title: `${expert.name} · 新会话` }); currentId.current = created.id; await post(`/api/session/${created.id}/expert`, { expertId: expert.id }); await loadSessions(); await loadSession(created.id); return; } await post(`/api/session/${target.id}/expert`, { expertId: expert.id }); await loadSession(target.id); } catch (e) { setError(toUiError(e, 'expert_switch')); } }
  async function clearExpert() { if (!current) { setPendingExpert(null); return; } if (running) { setError({ message: '会话运行中，不能取消专家引用', details: { stage: 'expert_clear' } }); return; } try { await post(`/api/session/${current.id}/expert`, { expertId: '' }); await loadSession(current.id); } catch (e) { setError(toUiError(e, 'expert_clear')); } }
  async function changeSessionWorkspace() { if (!current || running) return; const path = window.desktop?.chooseDirectory ? await window.desktop.chooseDirectory() : window.prompt('输入新的工作目录绝对路径', activeWorkspace?.path || ''); if (!path) return; try { await post(`/api/session/${current.id}/workspace`, { path }); await loadInfo(); await loadSessions(); await loadSession(current.id); } catch (e) { setError(toUiError(e, 'workspace_change')); } }
  function openFile(file) { setSelectedFile(file); setView('file'); if (window.innerWidth <= 800) setSidebarOpen(false); }
  function openTerminal() { setView('terminal'); if (window.innerWidth <= 800) setSidebarOpen(false); }
  async function runTerminal(command) { if (!String(command || '').trim() || terminalLaunch.current || terminal?.status === 'running' || terminal?.status === 'starting') return false; terminalLaunch.current = true; terminalEvents.current = []; try { const result = await post('/api/terminal/run', { command }); terminalId.current = result.terminalId; const events = terminalEvents.current; setTerminal((value) => createTerminalSession(value, result, events)); setView('terminal'); return true; } catch (e) { setError(toUiError(e, 'terminal_run')); return false; } finally { terminalLaunch.current = false; terminalEvents.current = []; } }
  async function stopTerminal() { if (!terminal?.terminalId) return; try { await post(`/api/terminal/${terminal.terminalId}/stop`); } catch (e) { setError(toUiError(e, 'terminal_stop')); } }
  function clearTerminal() { setTerminal((value) => value ? { ...value, lines: [] } : value); }
  function closeTerminal() { if (terminal?.status === 'running' || terminal?.status === 'starting') return; terminalId.current = null; setTerminal(null); setView('file'); }
  function openAsset(asset) { setSelectedAsset(asset); setView('asset'); if (window.innerWidth <= 800) setSidebarOpen(false); }
  const entries = useMemo(() => current?.entries || [], [current]);
  const hasSessionContext = entries.some((entry) => !['meta', 'state'].includes(entry.type)) || Boolean(live);
  const stop = () => current && post(`/api/session/${current.id}/abort`);
  async function copyConversation() {
    if (!current) return;
    const text = (current.entries || []).filter((entry) => entry.type === 'message' || entry.type === 'task_summary').map((entry) => {
      const role = entry.role === 'user' ? '用户' : entry.role === 'tool' ? '工具' : entry.type === 'task_summary' ? '任务结果' : 'Agent';
      const body = Array.isArray(entry.content) ? entry.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n') : (entry.text || entry.content || entry.summaryText || '');
      return `${role}:\n${body}`;
    }).filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(text); } catch { setError({ message: '复制失败，请检查剪贴板权限', details: { stage: 'conversation_copy' } }); }
  }
  async function forkCurrentSession() {
    if (!current || running) return;
    try { const result = await post(`/api/session/${current.id}/fork`); await loadSessions(false); await loadSession(result.id); } catch (e) { setError(toUiError(e, 'session_fork')); }
  }
  async function refreshAccount() { try { const data = await post('/api/account/refresh'); setAccount(data); } catch (e) { setError(toUiError(e, 'account_refresh')); } }
  async function handleLogin(next) { setAccount(next); try { await reloadConfiguration(); } catch (e) { setError(toUiError(e, 'account_login_refresh')); } }
  async function logout() { const data = await post('/api/account/logout'); setAccount(data); setAccountOpen(false); }
  const toggleSidebar = () => setSidebarOpen((x) => !x);
  const composer = <Composer draft={draft} setDraft={setDraft} attachments={attachments} setAttachments={setAttachments} onSend={send} onStop={stop} onAdjustQueued={adjustQueued} onEditQueued={editQueued} onClearExpert={clearExpert} current={current} pendingMode={pendingMode} pendingExpert={pendingExpert} running={running} permission={permission} connection={connection} onReconnect={() => connectEvents(true)} onPermissionResolved={() => setPermission(null)} info={info} workspace={activeWorkspace} onWorkspace={current ? changeSessionWorkspace : addWorkspace} onMode={setMode} onModelsChanged={reloadConfiguration} onError={(value) => setError(toUiError(value, 'composer'))}/>;
return <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}><Sidebar view={view} onView={(next) => { if (next === 'workbench') openWorkbench(); else setView(next); if (window.innerWidth <= 800) setSidebarOpen(false); }} workspaces={workspaces} sessions={sessions} current={current} activeWorkspace={activeWorkspace} account={account} onAccount={() => setAccountOpen(true)} onNew={createSessionInWorkspace} onAddWorkspace={addWorkspace} onDropWorkspace={addDroppedWorkspace} onActivate={activateWorkspace} onSelect={loadSession} onDelete={deleteSession} onOpenFile={openFile} onOpenTerminal={openTerminal} selectedFile={selectedFile} fileRevision={fileRevision} onFileRevision={() => setFileRevision((x) => x + 1)} onToggle={toggleSidebar}/>{!sidebarOpen && <button className="sidebar-reopen" title="展开导航" onClick={toggleSidebar}><Menu size={18}/></button>}<button className="mobile-nav-toggle" title="切换导航" onClick={toggleSidebar}><Menu size={18}/></button><main className="workspace-main">{view === 'task' && current && hasSessionContext ? <><TaskTopbar workspace={activeWorkspace} current={current} onToggle={toggleSidebar}/><div className="main-stage" ref={stageRef} onScroll={trackConversationScroll}><Conversation entries={entries} live={live} running={running} sessionId={current.id} onOpenFile={openFile} onAssetAdded={() => setAssetRevision((x) => x + 1)} onCopy={copyConversation} onFork={forkCurrentSession}/></div>{composer}</> : ['task', 'workbench'].includes(view) ? <WorkbenchState workspace={activeWorkspace} draft={draft} setDraft={setDraft} composer={composer} onWorkspace={addWorkspace}/> : view === 'library' ? <AssetLibraryPage revision={assetRevision} selected={selectedAsset} onSelect={setSelectedAsset} onMutated={() => setAssetRevision((x) => x + 1)} onError={(value) => setError(toUiError(value, 'asset_library'))} onToggle={toggleSidebar}/> : view === 'plugins' ? <PluginCenter info={info} onReload={reloadConfiguration} onError={(value) => setError(toUiError(value, 'plugin_center'))} onToggle={toggleSidebar}/> : view === 'experts' ? <ExpertLibrary info={info} current={current} pending={pendingExpert} running={running} onApply={applyExpert} onClear={clearExpert} onToggle={toggleSidebar} onRefresh={reloadConfiguration}/> : view === 'file' ? <FileWorkspace file={selectedFile} workspace={activeWorkspace} onToggle={toggleSidebar} onSaved={() => setFileRevision((x) => x + 1)} onError={(value) => setError(toUiError(value, 'file'))}/> : view === 'terminal' ? <TerminalWorkspace terminal={terminal} workspace={activeWorkspace} onRun={runTerminal} onStop={stopTerminal} onClear={clearTerminal} onClose={closeTerminal} onToggle={toggleSidebar}/> : <Page view={view} info={info} current={current} onSaved={reloadConfiguration} onDesktop={setDesktop} onMode={setMode} onError={(value) => setError(toUiError(value, view))}/>} {error && <ErrorToast error={error} onClose={() => setError(null)}/>}</main>{accountOpen && <AccountDialog account={account} onLogin={handleLogin} onRefresh={refreshAccount} onLogout={logout} onClose={() => setAccountOpen(false)}/>}</div>;
}

function updateLiveStep(live, event, updater) {
  const base = live && live.turnId === event.turnId && Array.isArray(live.steps) ? live : { turnId: event.turnId, steps: [] };
  const steps = [...base.steps];
  let index = steps.findIndex((item) => item.step === event.step);
  if (index < 0) { steps.push({ step: event.step ?? 0, text: '', thinking: '', tools: [], status: 'running' }); index = steps.length - 1; }
  steps[index] = updater(steps[index]);
  return { ...base, steps };
}

function Sidebar({ view, onView, workspaces, sessions, current, activeWorkspace, account, onAccount, onNew, onAddWorkspace, onDropWorkspace, onActivate, onSelect, onDelete, onOpenFile, onOpenTerminal, selectedFile, fileRevision, onFileRevision, onToggle }) {
  const [searching, setSearching] = useState(false), [query, setQuery] = useState(''), [section, setSection] = useState('project'), [dragging, setDragging] = useState(false);
  const visibleSessions = sessions.filter((s) => (s.title || '未命名会话').toLowerCase().includes(query.trim().toLowerCase()));
  async function drop(event) { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; const path = file && window.desktop?.getPathForFile ? window.desktop.getPathForFile(file) : ''; if (path) await onDropWorkspace(path); else onAddWorkspace(); }
  return <aside className="sidebar"><div className="sidebar-brand"><button className="brand-button" onClick={onToggle}><span className="brand-mark">M</span><strong>魔力工作台</strong></button><button className="icon-button" title="搜索当前项目的会话" onClick={() => { setSection('project'); setSearching(true); requestAnimationFrame(() => document.querySelector('.session-search input')?.focus()); }}><Search size={16} /></button></div><nav className="main-nav"><button className={view === 'workbench' ? 'active' : ''} onClick={() => onView('workbench')}><LayoutDashboard size={16}/>工作台</button><button className={view === 'library' ? 'active' : ''} onClick={() => onView('library')}><Library size={16}/>资源库</button><button className={view === 'models' ? 'active' : ''} onClick={() => onView('models')}><Bot size={16}/>模型</button><button className={view === 'analytics' ? 'active' : ''} onClick={() => onView('analytics')}><Activity size={16}/>调用分析</button><button className={view === 'experts' ? 'active' : ''} onClick={() => onView('experts')}><BookOpen size={16}/>专家库</button></nav><div className="explorer-tabs" role="tablist"><button role="tab" aria-selected={section === 'project'} className={section === 'project' ? 'active' : ''} onClick={() => setSection('project')}>会话</button><button role="tab" aria-selected={section === 'files'} className={section === 'files' ? 'active' : ''} onClick={() => setSection('files')}><FolderOpen size={14}/><span>文件</span></button><button className="tab-add" onClick={onAddWorkspace} title="添加工作目录"><Plus size={15}/></button></div>{section === 'project' ? <>{searching && <div className="session-search"><Search size={14}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索会话"/><button title="关闭搜索" onClick={() => { setSearching(false); setQuery(''); }}><X size={14}/></button></div>}<div className={`project-list ${dragging ? 'dragging' : ''}`} onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }} onDrop={drop}>{dragging && <div className="project-drop"><FolderPlus size={20}/>松开以添加工作目录</div>}{workspaces.map((w) => <div className="project-group" key={w.id}><div className="project-row"><button className="project-open" onClick={() => w.active ? onView('workbench') : onActivate(w.id)}><Folder size={16}/><span><b>{w.name}</b></span><ChevronRight className={w.active ? 'project-chevron open' : 'project-chevron'} size={14}/></button><button className="project-create" title={`在 ${w.name} 新建会话`} onClick={() => onNew(w.id)}><Plus size={14}/></button></div>{w.active && <div className="project-sessions"><div className="session-label"><span>会话</span><span>{query ? `${visibleSessions.length} / ${sessions.length}` : sessions.length}</span></div>{visibleSessions.map((s) => <div className={`session-row ${s.id === current?.id && view === 'task' ? 'active' : ''}`} key={s.id}><button className="session-open" onClick={() => onSelect(s.id)} title={s.title || '未命名会话'}><span className="session-dot"/><span>{s.title || '未命名会话'}</span></button><button className="session-delete" title="删除会话" aria-label={`删除会话 ${s.title || '未命名会话'}`} onClick={() => onDelete(s.id, s.title)}><Trash2 size={13}/></button></div>)}{query && !visibleSessions.length && <div className="session-empty">没有匹配的会话</div>}</div>}</div>)}</div></> : <FileExplorer workspace={activeWorkspace} selectedFile={selectedFile} revision={fileRevision} onOpen={onOpenFile} onOpenTerminal={onOpenTerminal} onMutated={onFileRevision}/>}<div className="sidebar-spacer"/><div className="sidebar-footer"><button className={view === 'settings' ? 'active' : ''} onClick={() => onView('settings')}><Settings2 size={16}/>设置</button><button className="account-row" onClick={onAccount}><div className="avatar">{String(account?.user?.nickname || account?.user?.email || 'U').slice(0, 1).toUpperCase()}</div><span><b>{account?.user?.nickname || account?.user?.email || '账户'}</b><small>{Number(account?.user?.magicValue || 0).toLocaleString()} 魔力值</small></span><ChevronRight size={14}/></button></div></aside>;
}

function LoginScreen({ account, onLogin, onClose }) { return <AuthDialog account={account} onLogin={onLogin} onClose={onClose}/>; }
function AuthDialog({ account, onLogin, onClose }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function refreshCaptcha() {
    try { const result = await get('/api/account/captcha'); setCaptcha(result.svg || ''); setCaptchaInput(''); }
    catch (reason) { setError(reason.message); }
  }
  useEffect(() => { if (mode !== 'login') { setError(''); setNotice(''); refreshCaptcha(); } }, [mode]);
  async function sendCode() {
    if (!email.trim() || !captchaInput.trim()) { setError('请先填写邮箱和验证码'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await post('/api/account/captcha/verify', { code: captchaInput.trim() });
      await post(mode === 'register' ? '/api/account/register-code' : '/api/account/reset-code', { email: email.trim() });
      setNotice('验证码已发送，请检查邮箱'); setCode('');
    } catch (reason) { setError(reason.message); await refreshCaptcha(); }
    finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'login') { await onLogin(await post('/api/account/login', { email, password })); return; }
      if (!code.trim()) throw new Error('请输入邮箱验证码');
      if (mode === 'register') {
        await post('/api/account/register', { email: email.trim(), password, code: code.trim() });
        setMode('login'); setPassword(''); setCode(''); setNotice('注册成功，请登录');
      } else {
        await post('/api/account/reset-password', { email: email.trim(), code: code.trim(), newPassword });
        setMode('login'); setPassword(''); setNewPassword(''); setCode(''); setNotice('密码已重置，请登录');
      }
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  const title = mode === 'login' ? '登录后继续' : mode === 'register' ? '注册账户' : '找回密码';
  return <Modal title="MLIAPI 账户" onClose={onClose}><div className="auth-dialog"><div className="login-brand"><span><Bot size={20}/></span><div><b>魔力工作台</b><small>统一账户</small></div></div><div className="login-copy"><h1>{title}</h1><p>{mode === 'login' ? '登录后使用 MLIAPI 官方模型。' : mode === 'register' ? '注册后即可使用 MLIAPI 官方模型。' : '通过邮箱验证码重置账户密码。'}</p></div><div className="auth-switch"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>登录</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>注册</button><button type="button" className={mode === 'forgot' ? 'active' : ''} onClick={() => setMode('forgot')}>找回密码</button></div><form onSubmit={submit}><label>邮箱<input autoFocus type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com"/></label>{mode === 'login' && <label>密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入密码"/></label>}{mode !== 'login' && <><label>人机验证码<div className="captcha-row">{captcha ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captcha)}`} alt="人机验证码"/> : <span className="captcha-placeholder">验证码加载失败</span>}<button type="button" onClick={refreshCaptcha} title="刷新验证码"><RefreshCw size={15}/></button></div><input value={captchaInput} onChange={(event) => setCaptchaInput(event.target.value)} placeholder="输入图中的字符"/></label><label>{mode === 'register' ? '设置密码' : '新密码'}<input type="password" autoComplete="new-password" value={mode === 'register' ? password : newPassword} onChange={(event) => mode === 'register' ? setPassword(event.target.value) : setNewPassword(event.target.value)} placeholder="至少 6 位"/></label><label>邮箱验证码<div className="code-row"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入 6 位验证码"/><button type="button" onClick={sendCode} disabled={busy || !email || !captchaInput}>{busy ? '发送中' : '发送验证码'}</button></div></label></>}{error && <div className="login-error">{error}</div>}{notice && <div className="login-notice">{notice}</div>}<button className="primary-action" disabled={busy || !email || (mode === 'login' ? !password : !code || !(mode === 'register' ? password : newPassword))}>{busy ? <><LoaderCircle className="spin" size={15}/>处理中</> : mode === 'login' ? '登录' : mode === 'register' ? '注册' : '重置密码'}</button></form></div></Modal>;
}

function PaymentCode({ order, payType }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = /^(https?:\/\/|data:image\/)/i.test(order.qrcodeUrl || '') ? order.qrcodeUrl : '';
  const qrValue = order.codeUrl || (!imageUrl ? order.qrcodeUrl : '');
  const label = { wxpay: '微信支付', alipay: '支付宝', qqpay: 'QQ 钱包' }[payType] || '扫码支付';
  return <div className="payment-code"><div className="payment-code-image">{imageUrl && !imageFailed ? <img src={imageUrl} alt={`${label}二维码`} onError={() => setImageFailed(true)}/> : qrValue ? <QRCodeSVG value={qrValue} size={204} level="M" aria-label={`${label}二维码`}/> : <span>二维码暂不可用</span>}</div><strong>{label}</strong></div>;
}

function AccountDialog({ account, onLogin, onRefresh, onLogout, onClose }) {
  const user = account?.user || {};
  const [buying, setBuying] = useState(false), [packages, setPackages] = useState([]), [selected, setSelected] = useState(''), [payType, setPayType] = useState('wxpay'), [order, setOrder] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [paid, setPaid] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false), [nickname, setNickname] = useState(user.nickname || '');
  if (!account?.authenticated) return <AuthDialog account={account} onLogin={onLogin} onClose={onClose}/>;
  async function saveNickname(event) {
    event.preventDefault();
    const value = nickname.trim();
    if (!value || value.length > 32 || /[\r\n]/.test(value)) { setError('昵称须为 1 到 32 个字符，且不能换行'); return; }
    setBusy(true); setError('');
    try { await api('/api/account/nickname', { method: 'PUT', body: { nickname: value } }); setEditingNickname(false); await onRefresh(); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  async function openPackages() {
    setBuying(true); setError('');
    try { const result = await get('/api/account/packages'); setPackages(result.packages || []); setSelected(result.packages?.find((item) => item.requiredLevel === 0 ? user.level === 1 : user.level >= item.requiredLevel)?.id || ''); }
    catch (reason) { setError(reason.message); }
  }
  async function purchase() {
    setBusy(true); setError('');
    try { setOrder(await post('/api/account/orders', { packageId: selected, payType, wallet: 'magic' })); setPaid(false); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  async function checkOrder() {
    if (!order) return;
    setBusy(true); setError('');
    try { const result = await get(`/api/account/orders/${encodeURIComponent(order.outTradeNo)}`); if (result.payStatus === 1) { setPaid(true); await onRefresh(); } }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  const paymentLink = /^https?:\/\//i.test(order?.codeUrl || '') ? order.codeUrl : '';
  return <Modal title={buying ? '购买套餐' : '账户'} onClose={onClose}>{buying ? <div className="purchase-dialog"><button className="purchase-back" onClick={() => { setBuying(false); setOrder(null); }}>返回账户</button>{error && <p className="purchase-error">{error}</p>}{!order ? <><div className="purchase-list">{packages.map((item) => { const unavailable = item.requiredLevel === 0 ? user.level !== 1 : user.level < item.requiredLevel; return <label key={item.id} className={selected === item.id ? 'selected' : ''}><input type="radio" name="package" value={item.id} checked={selected === item.id} disabled={unavailable} onChange={() => setSelected(item.id)}/><span><b>{item.name}</b><small>{unavailable ? '当前等级不可购买' : Number(item.bonusMagicValue || 0) ? `赠送 ${Number(item.bonusMagicValue || 0).toLocaleString()} 魔力值` : item.description || '会员套餐'}</small></span><strong>¥{item.price}</strong></label>; })}</div><div className="purchase-method"><span>支付方式</span><b>微信支付</b></div><button className="primary-action" disabled={busy || !selected} onClick={purchase}>{busy ? '正在创建订单...' : '确认支付'}</button></> : <div className="purchase-order"><div className="purchase-order-summary"><b>{paid ? '支付已完成' : '等待付款'}</b><strong>¥{order.totalFee}</strong></div>{!paid && <PaymentCode key={order.outTradeNo} order={order} payType={payType}/>}<span className="purchase-order-id">订单号 {order.outTradeNo}</span>{!paid && <>{paymentLink && <a href={paymentLink} target="_blank" rel="noreferrer">打开支付页面 <ExternalLink size={14}/></a>}<button disabled={busy} onClick={checkOrder}><RefreshCw size={14}/>我已付款，查询状态</button></>}</div>}</div> : <div className="account-dialog"><div className="account-profile"><div className="account-avatar"><UserRound size={22}/></div><span><b>{user.nickname || '未设置昵称'}</b><small>{user.email}</small></span><button className="nickname-edit-button" title="修改昵称" aria-label="修改昵称" onClick={() => { setNickname(user.nickname || ''); setError(''); setEditingNickname(true); }}><Pencil size={15}/></button></div>{editingNickname && <form className="nickname-form" onSubmit={saveNickname}><label>昵称<input autoFocus value={nickname} maxLength={32} onChange={(event) => setNickname(event.target.value)}/></label><button type="submit" disabled={busy || !nickname.trim()} title="保存昵称"><Check size={16}/></button><button type="button" title="取消修改" onClick={() => { setEditingNickname(false); setError(''); }}><X size={16}/></button></form>}{error && <p className="purchase-error">{error}</p>}<div className="account-balance"><span><Coins size={16}/>可用魔力值</span><b>{Number(user.magicValue || 0).toLocaleString()}</b></div><button className="account-purchase" onClick={openPackages}><Coins size={17}/><span>购买魔力值套餐</span><ChevronRight size={17}/></button><div className="account-actions"><button onClick={onRefresh}><RefreshCw size={14}/>刷新余额</button><button className="account-logout" onClick={onLogout}><LogOut size={14}/>退出登录</button></div></div>}</Modal>;
}
function TaskTopbar({ workspace, current, onToggle }) { return <header className="topbar"><div className="topbar-title"><button className="mobile-menu" onClick={onToggle}><Menu size={18}/></button><FolderOpen size={17}/><div><small>{workspace?.name || '选择项目'}</small><b>{current?.title || '新任务'}</b></div></div></header>; }
function WorkbenchState({ workspace, setDraft, composer, onWorkspace }) {
  const suggestions = ['整理当前项目的文件并生成目录索引', '根据这些资料整理一份工作报告', '读取项目代码，分析结构和待办事项', '润色这份文稿，保留原意和语气'];
  return <div className="workbench-state"><div className="workbench-state-content"><div className="workbench-mark"><LayoutDashboard size={25}/></div><h1>魔力工作台</h1><p>{workspace ? `在「${workspace.name}」里，整理资料、编写文档或推进项目。` : '选择工作目录，开始你的任务。'}</p>{composer}<div className="workbench-capabilities"><button onClick={() => setDraft('整理当前工作目录的文件，按类型和用途生成目录索引，先给出整理建议')}><FolderOpen size={19}/><span><b>资料整理</b><small>梳理文件与项目资料</small></span></button><button onClick={() => setDraft('读取当前项目资料，整理一份工作报告，并保存为文档')}><FileText size={19}/><span><b>文档办公</b><small>整理报告、文档与表格</small></span></button><button onClick={() => setDraft('读取当前项目代码，分析项目结构和运行方式，并整理待办事项')}><Code2 size={19}/><span><b>开发项目</b><small>阅读代码并推进开发</small></span></button><button onClick={() => setDraft('读取当前项目的文稿，梳理内容并给出写作、续写或润色建议')}><BookOpen size={19}/><span><b>写作创作</b><small>构思、续写与润色</small></span></button></div><div className="workbench-suggestions">{suggestions.map((item) => <button key={item} onClick={() => setDraft(item)}>{item}</button>)}</div>{!workspace && <button className="workbench-add-project" onClick={onWorkspace}><FolderPlus size={15}/>添加工作目录</button>}</div></div>;
}

function AssetLibraryPage({ revision, selected, onSelect, onMutated, onError }) {
  const [assets, setAssets] = useState([]), [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [busy, setBusy] = useState(false), input = useRef(null);
  async function load() { try { const data = await get('/api/assets'); setAssets(data.assets || []); if (selected && !data.assets?.some((item) => item.id === selected.id)) onSelect(null); } catch (error) { onError(error); } }
  useEffect(() => { load(); }, [revision]);
  async function importFiles(files) { setBusy(true); try { if (window.desktop?.importMediaAssets) await window.desktop.importMediaAssets(); else for (const file of files || []) await post('/api/assets', { dataUrl: await readFileDataUrl(file), title: file.name, source: 'import' }); await load(); onMutated(); } catch (error) { onError(error); } finally { setBusy(false); } }
  async function remove(item) { if (!window.confirm(`从资源库删除“${item.title}”吗？`)) return; try { await api(`/api/assets/${item.id}`, { method: 'DELETE' }); if (selected?.id === item.id) onSelect(null); await load(); onMutated(); } catch (error) { onError(error); } }
  const visible = assets.filter((item) => (filter === 'all' || item.kind === filter) && item.title.toLowerCase().includes(query.trim().toLowerCase()));
  const counts = { all: assets.length, image: assets.filter((item) => item.kind === 'image').length, video: assets.filter((item) => item.kind === 'video').length, audio: assets.filter((item) => item.kind === 'audio').length };
  return <div className="collection-page"><header className="collection-header"><div><h1>资源库</h1><p>集中管理项目可复用的图片、视频与音频，Agent 可通过资源工具读取。</p></div><div><input ref={input} hidden type="file" multiple accept="image/*,video/*,audio/*" onChange={(event) => { importFiles(event.target.files); event.target.value = ''; }}/><button className="collection-primary" disabled={busy} onClick={() => window.desktop?.importMediaAssets ? importFiles() : input.current?.click()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Upload size={15}/>}导入资源</button></div></header><div className="collection-toolbar"><div className="collection-filters">{[['all', '全部'], ['image', '图片'], ['video', '视频'], ['audio', '音频']].map(([key, label]) => <button className={filter === key ? 'active' : ''} onClick={() => setFilter(key)} key={key}>{label}<small>{counts[key]}</small></button>)}</div><label className="collection-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资源"/></label></div>{visible.length ? <div className={`library-layout ${selected ? 'has-preview' : ''}`}><section className="library-grid">{visible.map((item) => <button className={selected?.id === item.id ? 'active' : ''} onClick={() => onSelect(item)} key={item.id}><div className="library-thumb">{item.kind === 'image' ? <img src={`/api/assets/${item.id}/raw`} alt={item.title}/> : item.kind === 'video' ? <video src={`/api/assets/${item.id}/raw`} muted/> : <span><File size={28}/><small>音频</small></span>}<i>{item.kind === 'image' ? '图片' : item.kind === 'video' ? '视频' : '音频'}</i></div><span><b>{item.title}</b><small>{formatBytes(item.size)} · {new Date(item.created).toLocaleDateString()}</small></span></button>)}</section>{selected && <aside className="asset-preview-panel"><header><span><b>{selected.title}</b><small>{selected.mime} · {formatBytes(selected.size)}</small></span><button title="关闭预览" onClick={() => onSelect(null)}><X size={15}/></button></header><div>{selected.kind === 'image' ? <img src={`/api/assets/${selected.id}/raw`} alt={selected.title}/> : selected.kind === 'video' ? <video src={`/api/assets/${selected.id}/raw`} controls/> : <audio src={`/api/assets/${selected.id}/raw`} controls/>}</div><footer><span>来源：{selected.source || 'user'}</span><button onClick={() => remove(selected)}><Trash2 size={14}/>删除资源</button></footer></aside>}</div> : <div className="collection-empty"><span><Images size={30}/></span><b>{assets.length ? '没有匹配的资源' : '资源库为空'}</b><p>{assets.length ? '调整搜索词或资源类型。' : '导入素材，或将 Agent 生成的结果加入资源库。'}</p>{!assets.length && <button className="collection-primary" onClick={() => window.desktop?.importMediaAssets ? importFiles() : input.current?.click()}><Upload size={15}/>导入第一个资源</button>}</div>}</div>;
}

function PluginCenter({ info, onReload, onError }) {
  const [query, setQuery] = useState(''), [tab, setTab] = useState('plugins'), [busy, setBusy] = useState(false), [selected, setSelected] = useState(null), [remote, setRemote] = useState([]), [remoteBusy, setRemoteBusy] = useState(false);
  const data = info?.plugins || {}, plugins = data.plugins || [], skills = data.skills || [], tools = data.tools || [];
  const cards = plugins.map((plugin) => ({ ...plugin, skills: skills.filter((skill) => skill.path?.toLowerCase().includes(`plugins\\${plugin.name.toLowerCase()}\\`) || skill.path?.toLowerCase().includes(`plugins/${plugin.name.toLowerCase()}/`)) }));
  const visible = cards.filter((plugin) => `${plugin.name} ${plugin.description} ${plugin.tools.join(' ')} ${plugin.skills.map((skill) => skill.name).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function reload() { setBusy(true); try { await post('/api/plugins/reload'); await onReload(); } catch (error) { onError(error); } finally { setBusy(false); } }
  async function loadRemote() { setRemoteBusy(true); try { const data = await get('/api/account/plugins'); setRemote(data.plugins || []); } catch (error) { onError(error); } finally { setRemoteBusy(false); } }
  async function installRemote(item) { setRemoteBusy(true); try { await post(`/api/account/plugins/${encodeURIComponent(item.id)}/install`, { sha256: item.sha256 }); await post('/api/plugins/reload'); await onReload(); setTab('plugins'); } catch (error) { onError(error); } finally { setRemoteBusy(false); } }
  useEffect(() => { if (tab === 'remote') loadRemote(); }, [tab]);
  const remoteVisible = remote.filter((item) => `${item.name} ${item.description || ''} ${item.author || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="collection-page plugin-page"><header className="collection-header"><div><h1>插件中心</h1><p>查看 Agent 已加载的工具与 Skill，也可以从账户插件仓库安装插件。</p></div><label className="collection-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索插件或能力"/></label></header><div className="plugin-overview"><div><Package size={18}/><span><small>已加载插件</small><b>{plugins.length}</b></span></div><div><Wrench size={18}/><span><small>可用工具</small><b>{tools.length}</b></span></div><div><BookOpen size={18}/><span><small>可读 Skill</small><b>{skills.length}</b></span></div><button onClick={reload} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14}/> : <RefreshCw size={14}/>}重新加载</button></div><div className="plugin-tabs"><button className={tab === 'plugins' ? 'active' : ''} onClick={() => setTab('plugins')}>已安装插件</button><button className={tab === 'remote' ? 'active' : ''} onClick={() => setTab('remote')}>账户插件仓库 <small>{remote.length || ''}</small></button><button className={tab === 'skills' ? 'active' : ''} onClick={() => setTab('skills')}>Skills <small>{skills.length}</small></button></div>{tab === 'plugins' ? <section className="plugin-grid">{visible.map((plugin, index) => <button onClick={() => setSelected(plugin)} key={plugin.name}><span className={`plugin-icon tone-${index % 3}`}>{plugin.name === 'desktop' ? <Bot size={21}/> : plugin.name === 'office' ? <FileText size={21}/> : <Package size={21}/>}</span><span className="plugin-copy"><span><b>{plugin.name}</b><i>已加载</i></span><p>{plugin.description || '本地 Agent 插件'}</p><small>{plugin.tools.length} 个工具 · {plugin.skills.length} 个 Skill · v{plugin.version}</small></span><ChevronRight size={16}/></button>)}{!visible.length && <div className="collection-empty"><Package size={28}/><b>没有匹配的插件</b><p>插件来自应用目录中的 plugins 文件夹。</p></div>}</section> : tab === 'remote' ? <section className="plugin-grid">{remoteVisible.map((item, index) => <article className="plugin-remote-card" key={item.id}><span className={`plugin-icon tone-${index % 3}`}><Server size={21}/></span><span className="plugin-copy"><span><b>{item.name}</b><i>v{item.version}</i></span><p>{item.description || '账户插件仓库中的插件'}</p><small>{item.author || '未填写作者'} · {Math.round(item.size / 1024)} KB</small></span><button className="collection-primary" disabled={remoteBusy} onClick={() => installRemote(item)}>安装</button></article>)}{!remoteBusy && !remoteVisible.length && <div className="collection-empty"><Package size={28}/><b>没有可安装的插件</b><p>请先登录账户，或在后台插件管理上传并发布插件。</p></div>}</section> : <section className="skill-list">{skills.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(query.trim().toLowerCase())).map((skill) => <div key={`${skill.name}-${skill.path}`}><span><BookOpen size={17}/></span><div><b>{skill.name}</b><p>{skill.description}</p><small>{skill.path}</small></div></div>)}</section>}{selected && <Modal title={selected.name} onClose={() => setSelected(null)}><div className="plugin-detail"><p>{selected.description}</p><div><small>版本</small><b>{selected.version}</b></div><h4>工具</h4><div className="plugin-tags">{selected.tools.map((tool) => <span key={tool}><Wrench size={12}/>{tool}</span>)}</div><h4>Skills</h4>{selected.skills.length ? <div className="plugin-skill-detail">{selected.skills.map((skill) => <div key={skill.name}><b>{skill.name}</b><span>{skill.description}</span></div>)}</div> : <p className="plugin-muted">此插件没有声明 Skill。</p>}</div></Modal>}</div>;
}
function buildConversationTimeline(entries, running) {
  const structuredTurns = new Set(entries.filter((e) => ['turn_start', 'step_start', 'step_end', 'tool_start', 'tool_end', 'turn_end'].includes(e.type) && e.turnId).map((e) => e.turnId));
  const legacyResults = new Map(entries.filter((e) => e.type === 'message' && e.role === 'tool').map((e) => [e.toolCallId, e]));
  const nodes = [], steps = new Map(), lastAssistantByTurn = new Map();
  for (const entry of entries) {
    if (entry.type === 'meta' || entry.type === 'state' || entry.type === 'turn_start' || entry.type === 'turn_end') continue;
    if (entry.type === 'message') {
      if (entry.role === 'assistant' && entry.turnId && entry.text?.trim()) lastAssistantByTurn.set(entry.turnId, entry.text);
      if (entry.role === 'user') nodes.push({ kind: 'message', item: entry });
      else if (!structuredTurns.has(entry.turnId) && entry.role === 'assistant') nodes.push({ kind: 'message', item: { ...entry, toolCalls: (entry.toolCalls || []).map((call) => ({ ...call, ...(legacyResults.get(call.id) || {}) })) } });
      else if (!structuredTurns.has(entry.turnId) && entry.role === 'tool' && !entries.some((item) => item.type === 'message' && item.role === 'assistant' && item.toolCalls?.some((call) => call.id === entry.toolCallId))) nodes.push({ kind: 'message', item: entry });
      continue;
    }
    if (entry.type === 'step_start') {
      const node = { kind: 'step', key: `${entry.turnId}:${entry.step}`, turnId: entry.turnId, step: entry.step, startedAt: entry.startedAt, text: '', thinking: '', tools: [], status: running ? 'running' : 'interrupted' };
      steps.set(node.key, node); nodes.push(node); continue;
    }
    if (entry.type === 'step_end') {
      if (entry.text?.trim()) lastAssistantByTurn.set(entry.turnId, entry.text);
      const key = `${entry.turnId}:${entry.step}`;
      const node = steps.get(key) || { kind: 'step', key, turnId: entry.turnId, step: entry.step, tools: [] };
      Object.assign(node, entry, { kind: 'step', key, tools: node.tools, status: entry.status || 'ok' });
      if (!steps.has(key)) { steps.set(key, node); nodes.push(node); }
      continue;
    }
    if (entry.type === 'tool_start') {
      const key = `${entry.turnId}:${entry.step}`;
      let node = steps.get(key);
      if (!node) { node = { kind: 'step', key, turnId: entry.turnId, step: entry.step, tools: [], status: running ? 'running' : 'interrupted' }; steps.set(key, node); nodes.push(node); }
      node.tools.push({ ...entry, id: entry.callId, status: running ? 'running' : 'interrupted' }); continue;
    }
    if (entry.type === 'tool_end') {
      const node = steps.get(`${entry.turnId}:${entry.step}`);
      if (node) { const index = node.tools.findIndex((tool) => tool.id === entry.callId); const tool = { ...(index >= 0 ? node.tools[index] : {}), ...entry, id: entry.callId }; if (index >= 0) node.tools[index] = tool; else node.tools.push(tool); }
      continue;
    }
    if (entry.type === 'compaction') nodes.push({ kind: 'compaction', item: entry });
    if (entry.type === 'task_summary') {
      const fullText = lastAssistantByTurn.get(entry.turnId);
      const clipped = /\n…\[已截断，原始长度 \d+\]$/.test(entry.summaryText || '');
      nodes.push({ kind: 'summary', item: clipped && fullText ? { ...entry, summaryText: fullText.trim() } : entry });
    }
  }
  return nodes;
}

function Conversation({ entries, live, running, sessionId, onOpenFile, onAssetAdded, onCopy, onFork }) {
  const [outlineTip, setOutlineTip] = useState(null);
  const tooltipTimer = useRef(null);
  useEffect(() => () => clearTimeout(tooltipTimer.current), []);
  function showOutlineTip(event, label, key, preview) {
    clearTimeout(tooltipTimer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(400, window.innerWidth - 72);
    const maxHeight = Math.min(300, Math.floor(window.innerHeight * .5));
    setOutlineTip({ key, label, preview, width, left: Math.min(rect.right + 12, window.innerWidth - width - 8), top: Math.max(8, Math.min(rect.top - 8, window.innerHeight - maxHeight - 8)) });
  }
  function hideOutlineTip() {
    clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setOutlineTip(null), 180);
  }
  const timeline = useMemo(() => buildConversationTimeline(entries, running), [entries, running]);
  const liveKeys = new Set((live?.steps || []).map((step) => `${live.turnId}:${step.step}`));
  const visible = timeline.filter((node) => node.kind !== 'step' || !liveKeys.has(node.key));
  const renderNode = (node, key) => node.kind === 'compaction' ? <Compaction key={key} item={node.item}/> : node.kind === 'summary' ? <TaskSummary key={key} item={node.item} onOpenFile={onOpenFile}/> : node.kind === 'step' ? <RunStep key={key} item={node} sessionId={sessionId} onAssetAdded={onAssetAdded}/> : <Message key={key} item={node.item} sessionId={sessionId} onAssetAdded={onAssetAdded}/>;
  const content = [];
  for (let index = 0; index < visible.length; index++) {
    const node = visible[index];
    if (node.kind === 'message' && node.item.role === 'user') {
      const end = visible.findIndex((entry, at) => at > index && (entry.kind === 'summary' || (entry.kind === 'message' && entry.item.role === 'user')));
      if (end > index && visible[end].kind === 'summary') {
        const summary = visible[end].item;
        const records = visible.slice(index + 1, end);
        const candidates = records.flatMap((entry) => entry.kind === 'step' ? (entry.tools || []).map((tool) => tool.args?.path) : entry.kind === 'message' ? (entry.item.toolCalls || []).map((tool) => tool.args?.path) : []).filter(Boolean);
        const recordCount = summary.toolCount || records.reduce((count, entry) => count + (entry.kind === 'step' ? entry.tools?.length || 0 : entry.item?.toolCalls?.length || 0), 0);
        content.push(renderNode(node, `user-${index}`));
        if (records.length) content.push(<details className="turn-record" key={`record-${index}`}><summary><ChevronRight size={14}/>运行记录<span>{summary.durationMs == null ? '用时未记录' : formatDuration(summary.durationMs)} · {recordCount} 次工具调用</span></summary><div>{records.map((entry, offset) => renderNode(entry, `record-${index}-${offset}`))}</div></details>);
        content.push(<TaskSummary key={`summary-${index}`} item={summary} candidates={candidates} onOpenFile={onOpenFile}/>);
        index = end;
        continue;
      }
    }
    content.push(renderNode(node, `${node.kind}-${index}`));
  }
  const tasks = visible.flatMap((node, index) => {
    if (node.kind !== 'message' || node.item.role !== 'user') return [];
    const end = visible.findIndex((entry, at) => at > index && (entry.kind === 'summary' || (entry.kind === 'message' && entry.item.role === 'user')));
    const summary = end > index && visible[end].kind === 'summary' ? visible[end].item.summaryText : '';
    const preview = String(summary || '').trim().split(/\n\s*\n/)[0].replace(/[`*#]/g, '').trim();
    return [{ ...node, preview }];
  });
  const tipLines = outlineTip?.label.split(/\r?\n/) || [];
  const tipTitle = (outlineTip?.preview || tipLines.length > 1) ? tipLines[0] : Array.from(outlineTip?.label || '').slice(0, 28).join('');
  const tipBody = outlineTip?.preview || (tipLines.length > 1 ? tipLines.slice(1).join('\n').trim() : Array.from(outlineTip?.label || '').slice(28).join(''));
  return <div className={`conversation ${tasks.length ? 'has-outline' : ''}`}>
    {tasks.length > 0 && <nav className="conversation-outline" aria-label="任务导航" onScroll={() => setOutlineTip(null)}>{tasks.map((node, index) => { const text = Array.isArray(node.item.content) ? node.item.content.find((part) => part.type === 'text')?.text : node.item.content || node.item.text || ''; const label = String(text).trim() || `任务 ${index + 1}`; const key = node.item.id || index; return <button key={key} aria-label={label} aria-describedby={outlineTip?.key === key ? 'conversation-outline-tooltip' : undefined} onMouseEnter={(event) => showOutlineTip(event, label, key, node.preview)} onMouseLeave={hideOutlineTip} onFocus={(event) => showOutlineTip(event, label, key, node.preview)} onBlur={hideOutlineTip} onClick={() => { setOutlineTip(null); document.getElementById(`turn-anchor-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><ListTree size={13}/></button>; })}</nav>}
    {outlineTip && createPortal(<div id="conversation-outline-tooltip" className="conversation-outline-tooltip" role="tooltip" style={{ left: outlineTip.left, top: outlineTip.top, width: outlineTip.width }} onMouseEnter={() => clearTimeout(tooltipTimer.current)} onMouseLeave={hideOutlineTip}><div className="outline-tooltip-title"><ListTree size={16}/><b>{tipTitle}</b></div>{tipBody && <div className="outline-tooltip-body">{tipBody}</div>}</div>, document.body)}
    <div className="conversation-body"><div className="conversation-intro"><span className="intro-dot"/><b>Agent 工作流</b><small>运行过程已保存，可在重新打开会话后完整回放。</small></div>{content.map((node, index) => React.isValidElement(node) && node.type === Message ? React.cloneElement(node, { key: node.key, anchorId: node.props.item?.role === 'user' ? `turn-anchor-${node.props.item.id || index}` : undefined }) : node)}{live?.compaction && <Compaction item={live.compaction}/>} {live && <Live live={live} sessionId={sessionId} onAssetAdded={onAssetAdded}/>}<div className="conversation-actions"><button onClick={onCopy} title="复制对话" aria-label="复制对话"><Clipboard size={15}/></button><button onClick={onFork} disabled={running} title="分支到新聊天" aria-label="分支到新聊天"><GitBranch size={15}/></button></div></div>
  </div>;
}
function Message({ item, sessionId, onAssetAdded, anchorId }) { const user = item.role === 'user', tool = item.role === 'tool', parts = Array.isArray(item.content) ? item.content : [], text = parts.length ? parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n') : (item.text || item.content || ''); return <article id={anchorId} className={`message-card ${user ? 'user-message' : tool ? 'tool-message' : 'agent-message'} ${item.optimistic ? 'is-sending' : ''}`}>{tool ? <div className="message-avatar"><SquareTerminal size={15}/></div> : <ConversationAvatar role={item.role}/>}<div className="message-body">{!user && <div className="message-meta"><b>{tool ? '工具结果' : '魔力工作台'}</b>{tool && <small>已回灌到上下文</small>}</div>}{text && <div className="message-content">{tool ? <pre>{formatContent(text)}</pre> : <Markdown text={text}/>}</div>}<MessageMedia items={[...parts.filter((part) => part.type !== 'text'), ...(item.media || [])]} sessionId={sessionId} onAssetAdded={onAssetAdded}/>{item.optimistic && <div className="message-delivery"><LoaderCircle className="spin" size={11}/>正在发送</div>}{item.toolCalls?.length ? <div className="embedded-tools">{item.toolCalls.map((t) => <Tool key={t.id} item={t} sessionId={sessionId} onAssetAdded={onAssetAdded}/>)}</div> : null}</div></article>; }
function RunStep({ item, sessionId, onAssetAdded, live = false }) { const hasBody = item.text || item.thinking || item.tools?.length; return <article className={`run-entry ${live ? 'is-live' : ''}`}><ConversationAvatar/><div className="run-entry-body"><div className="message-meta"><b>魔力工作台</b></div>{item.text && <div className="message-content"><Markdown text={item.text}/></div>}{item.thinking && <details className="thinking-block"><summary>{live && item.status === 'running' ? <LoaderCircle className="spin" size={13}/> : <ChevronRight size={13}/>}思考摘要</summary><div>{item.thinking}</div></details>}{item.retry && <div className="retry-status"><RefreshCw className="spin" size={13}/><span><b>模型连接中断，正在重试 {item.retry.attempt}/{item.retry.maxAttempts}</b><small>{item.retry.message} · {Math.ceil(item.retry.delayMs / 1000)} 秒后重连</small></span></div>}{item.tools?.length ? <div className="step-tools">{item.tools.map((tool) => <Tool key={tool.id} item={tool} sessionId={sessionId} onAssetAdded={onAssetAdded}/>)}</div> : null}{!hasBody && !item.retry && item.status === 'running' && <div className="run-placeholder"><LoaderCircle className="spin" size={13}/>正在工作…</div>}{item.status === 'interrupted' && <div className="run-interrupted"><ShieldAlert size={13}/>运行已中断</div>}</div></article>; }
function Live({ live, sessionId, onAssetAdded }) { return <div className="live-run">{live.steps?.map((step) => <RunStep key={`${live.turnId}:${step.step}`} item={step} live sessionId={sessionId} onAssetAdded={onAssetAdded}/>)}</div>; }
function Tool({ item, sessionId, onAssetAdded }) { const [open, setOpen] = useState(false), status = item.status || 'ok', label = status === 'running' ? '正在运行' : status === 'denied' ? '已拒绝' : status === 'error' ? '运行失败' : status === 'interrupted' ? '运行中断' : '已运行'; return <div className={`tool-activity ${status}`}><button className="tool-summary" onClick={() => setOpen(!open)}><span className={`tool-status ${status}`}>{status === 'running' ? <LoaderCircle className="spin" size={13}/> : ['error', 'denied', 'interrupted'].includes(status) ? <X size={13}/> : <Check size={13}/>}</span><small>{label}</small><b>{item.name}</b><span>{preview(item.args)}</span>{item.durationMs != null && <time>{formatDuration(item.durationMs)}</time>}<ChevronDown className={open ? 'rotated' : ''} size={14}/></button>{open && <div className="tool-expanded"><pre>{JSON.stringify(item.args || {}, null, 2)}{item.content ? `\n\n${formatContent(item.content)}` : ''}</pre>{item.errorDetails && <ErrorDetails details={item.errorDetails}/>}</div>}<MessageMedia items={item.media || []} sessionId={sessionId} onAssetAdded={onAssetAdded}/></div>; }
function Compaction({ item }) { const imported = item.source === 'legacy-import'; return <details className="compaction-card"><summary><Archive size={14}/>{imported ? '历史上下文已导入' : '上下文已压缩'}<small>{imported ? '已转换为当前会话摘要' : item.used ? `${item.used.toLocaleString()} tokens` : '保留完整历史'}</small></summary><div>{item.summary}</div></details>; }

function MessageMedia({ items, sessionId, onAssetAdded }) { const media = items.filter((item, index) => (item?.url || item?.dataUrl) && items.findIndex((x) => (x.url || x.dataUrl) === (item.url || item.dataUrl)) === index); if (!media.length) return null; async function collect(item) { if (!item.attachmentId) return; const title = window.prompt('资源名称', item.name || '会话资源'); if (title === null) return; await post(`/api/session/${sessionId}/attachment/${item.attachmentId}/asset`, { title }); onAssetAdded(); } return <div className="message-media">{media.map((item, index) => { const source = item.url || item.dataUrl; return <figure key={item.attachmentId || `${item.name}-${index}`}>{item.type === 'image' ? <img src={source} alt={item.name}/> : item.type === 'video' ? <video src={source} controls/> : <audio src={source} controls/>}<figcaption><span>{item.name}</span>{item.attachmentId && <button onClick={() => collect(item)}><Plus size={13}/>加入资源库</button>}</figcaption></figure>; })}</div>; }

function TaskSummary({ item, candidates = [], onOpenFile }) {
  const files = item.files || [], additions = files.reduce((sum, file) => sum + (file.additions || 0), 0), deletions = files.reduce((sum, file) => sum + (file.deletions || 0), 0);
  const [expanded, setExpanded] = useState(false), [errorOpen, setErrorOpen] = useState(false), [previewPath, setPreviewPath] = useState(''), [legacyArtifacts, setLegacyArtifacts] = useState([]);
  const visible = expanded ? files : files.slice(0, 4);
  const artifacts = item.artifacts?.length ? item.artifacts : [...files.filter((file) => file.status !== 'deleted' && /\.(html?|pdf|svg|png|jpe?g|webp)$/i.test(file.path)), ...legacyArtifacts];
  useEffect(() => {
    if (item.artifacts?.length) return;
    const names = [...new Set([...candidates, ...(String(item.summaryText || '').match(/[\w./\\-]+\.html?/gi) || [])].map((value) => String(value).replaceAll('\\', '/')).filter((value) => /\.html?$/i.test(value) && !value.includes('..') && !value.includes(':'))) ].slice(0, 4);
    let active = true;
    Promise.all(names.map(async (name) => { try { return await get(`/api/file/meta?path=${encodeURIComponent(name)}`); } catch { return null; } })).then((items) => { if (active) setLegacyArtifacts(items.filter(Boolean)); });
    return () => { active = false; };
  }, [item.turnId, item.summaryText]);
  const title = item.reason === 'max_steps' ? '任务已结束' : (item.title || '任务已完成');
  async function open(file) {
    if (file.status === 'deleted') return;
    if (window.desktop?.openWorkspaceFile) await window.desktop.openWorkspaceFile(file.path);
    else if (/\.html?$/i.test(file.path)) setPreviewPath(file.path);
    else onOpenFile({ name: file.path.split('/').pop(), path: file.path, type: 'file' });
  }
  return <article className="agent-response"><ConversationAvatar/><div className="agent-response-body"><div className="message-meta"><b>魔力工作台</b></div><section className={`task-summary ${item.reason && !['done', 'max_steps'].includes(item.reason) ? 'not-done' : ''}`}>
    <div className="task-summary-head"><span className="summary-icon">{['done', 'max_steps', undefined].includes(item.reason) ? <Check size={17}/> : <ShieldAlert size={17}/>}</span><span><b>{title}</b><small>{[item.durationMs != null && formatDuration(item.durationMs), item.toolCount != null && `${item.toolCount} 次工具调用`].filter(Boolean).join(' · ') || (files.length ? `已变更 ${files.length} 个文件` : '未检测到文件变更')}</small></span><div><i>+{additions}</i><em>-{deletions}</em></div></div>
    {item.summaryText && <div className="summary-text"><Markdown text={item.summaryText}/></div>}
    {item.error && <div className="summary-error"><div><span>{item.error}</span>{item.errorDetails && <button onClick={() => setErrorOpen(!errorOpen)}>错误详情<ChevronDown className={errorOpen ? 'rotated' : ''} size={13}/></button>}</div>{errorOpen && <ErrorDetails details={item.errorDetails}/>}</div>}
    {artifacts.length > 0 && <div className="summary-artifacts">{artifacts.map((file) => <div className="summary-artifact" key={file.path}><span className="artifact-icon"><FileCode2 size={19}/></span><span><b>{file.path.split('/').pop()}</b><small>{file.path}</small></span><button onClick={() => open(file)}><ExternalLink size={14}/>{/\.html?$/i.test(file.path) ? '打开预览' : '打开文件'}</button></div>)}</div>}
    {visible.map((file) => <button className="summary-file" key={file.path} onClick={() => open(file)} disabled={file.status === 'deleted'}><span>{file.path}</span><small className={file.status}>{file.status === 'created' ? '新增' : file.status === 'deleted' ? '删除' : '修改'}</small><i>+{file.additions || 0}</i><em>-{file.deletions || 0}</em>{file.status !== 'deleted' && <ExternalLink size={13}/>}</button>)}
    {files.length > 4 && <button className="summary-more" onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : `再显示 ${files.length - 4} 个文件`}<ChevronDown className={expanded ? 'rotated' : ''} size={14}/></button>}
    {previewPath && <div className="artifact-preview-backdrop" onClick={() => setPreviewPath('')}><div className="artifact-preview" onClick={(event) => event.stopPropagation()}><header><b>{previewPath}</b><button title="关闭预览" onClick={() => setPreviewPath('')}><X size={18}/></button></header><iframe title={previewPath} src={`/api/file/raw?path=${encodeURIComponent(previewPath)}`} sandbox="allow-scripts allow-forms"/></div></div>}
  </section></div></article>;
}

function AssetLibrary({ selected, revision, onOpen, onMutated }) { const [assets, setAssets] = useState([]), input = useRef(null); async function load() { const d = await get('/api/assets'); setAssets(d.assets || []); } useEffect(() => { load().catch(() => {}); }, [revision]); async function remove(event, item) { event.stopPropagation(); if (!window.confirm(`从资源库删除“${item.title}”吗？`)) return; await api(`/api/assets/${item.id}`, { method: 'DELETE' }); if (selected?.id === item.id) onOpen(null); await load(); onMutated(); } async function importFiles(files) { for (const file of files) await post('/api/assets', { dataUrl: await readFileDataUrl(file), title: file.name, source: 'import' }); await load(); onMutated(); } async function chooseImport() { if (window.desktop?.importMediaAssets) { await window.desktop.importMediaAssets(); await load(); onMutated(); } else input.current?.click(); } return <div className="asset-library"><div className="file-explorer-head"><span>项目资源库</span><div><input ref={input} hidden type="file" multiple accept="image/*,video/*,audio/*" onChange={(e) => { importFiles(e.target.files); e.target.value = ''; }}/><button title="导入资源" onClick={chooseImport}><Plus size={14}/></button><button title="刷新" onClick={load}><RefreshCw size={14}/></button></div></div><div className="asset-grid">{assets.map((item) => <button className={selected?.id === item.id ? 'active' : ''} key={item.id} onClick={() => onOpen(item)}>{item.kind === 'image' ? <img src={`/api/assets/${item.id}/raw`} alt={item.title}/> : <span className="asset-kind">{item.kind === 'video' ? <><Images size={20}/>视频</> : <><File size={20}/>音频</>}</span>}<span><b>{item.title}</b><small>{formatBytes(item.size)}</small></span><i onClick={(event) => remove(event, item)} title="删除资源"><Trash2 size={13}/></i></button>)}{!assets.length && <div className="asset-empty"><Library size={24}/><span>资源库为空</span><small>导入素材，或从会话生成结果中收藏</small></div>}</div></div>; }

function AssetWorkspace({ asset, onToggle }) { if (!asset) return <div className="file-empty"><Library size={38}/><b>从左侧资源库选择素材</b><span>图片、视频和音频会在这里预览。</span></div>; const src = `/api/assets/${asset.id}/raw`; return <div className="file-workspace"><header className="file-topbar"><div className="file-title"><button className="mobile-menu" onClick={onToggle}><Menu size={18}/></button><Library size={16}/><span><b>{asset.title}</b><small>{asset.kind} · {asset.mime}</small></span></div><div className="file-actions"><span>{formatBytes(asset.size)}</span></div></header><div className="file-surface"><div className="asset-stage">{asset.kind === 'image' ? <img src={src} alt={asset.title}/> : asset.kind === 'video' ? <video src={src} controls/> : <audio src={src} controls/>}</div></div></div>; }

function FileExplorer({ workspace, selectedFile, revision, onOpen, onOpenTerminal, onMutated }) {
  const [tree, setTree] = useState({}), [expanded, setExpanded] = useState(new Set([''])), [busy, setBusy] = useState(false), [menu, setMenu] = useState(null), [editing, setEditing] = useState(null), [selectedPath, setSelectedPath] = useState(''), [clipboard, setClipboard] = useState(null), [error, setError] = useState(''), treeRef = useRef(null);
  const rootItem = { name: workspace?.name || '工作目录', path: '', type: 'directory', root: true };
  async function fetchDirectory(relativePath = '') { const d = await get(`/api/files?path=${encodeURIComponent(relativePath)}`); return d.entries || []; }
  async function refresh(paths = expanded) { if (!workspace) return; setBusy(true); setError(''); try { const targets = [...new Set(['', ...paths])], results = await Promise.allSettled(targets.map(async (path) => [path, await fetchDirectory(path)])), next = {}; for (const result of results) if (result.status === 'fulfilled') next[result.value[0]] = result.value[1]; setTree(next); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  useEffect(() => { setTree({}); setExpanded(new Set([''])); setEditing(null); setMenu(null); setSelectedPath(''); if (workspace) refresh(new Set([''])); }, [workspace?.id]);
  useEffect(() => { if (workspace) refresh(); }, [revision]);
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close); }, []);
  async function toggle(item) { setSelectedPath(item.path); if (item.type === 'file') return onOpen(item); const next = new Set(expanded); if (next.has(item.path)) next.delete(item.path); else { next.add(item.path); if (!tree[item.path]) { try { const entries = await fetchDirectory(item.path); setTree((value) => ({ ...value, [item.path]: entries })); } catch (e) { setError(e.message); return; } } } setExpanded(next); }
  function remapExpanded(item, nextPath, remove = false) { const next = new Set(['']); for (const path of expanded) { if (!path) continue; if (path === item.path || path.startsWith(`${item.path}/`)) { if (!remove) next.add(`${nextPath}${path.slice(item.path.length)}`); } else next.add(path); } return next; }
  async function mutate(action, item, extra = {}) { setBusy(true); setError(''); try { const result = await post(`/api/file/${action}`, { path: item?.path, ...extra }); setMenu(null); setEditing(null); let nextExpanded = expanded; if (action === 'create') { if (extra.type === 'directory') nextExpanded = new Set([...expanded, extra.parent || '']); else onOpen(result.item); setSelectedPath(result.item.path); } if (action === 'delete') { nextExpanded = remapExpanded(item, '', true); if (selectedFile && (selectedFile.path === item.path || selectedFile.path.startsWith(`${item.path}/`))) onOpen(null); if (selectedPath === item.path || selectedPath.startsWith(`${item.path}/`)) setSelectedPath(''); } if (['rename', 'move'].includes(action)) { nextExpanded = remapExpanded(item, result.item.path); setSelectedPath(result.item.path); if (selectedFile && (selectedFile.path === item.path || selectedFile.path.startsWith(`${item.path}/`))) { const suffix = selectedFile.path.slice(item.path.length); onOpen({ ...selectedFile, path: `${result.item.path}${suffix}`, name: selectedFile.path === item.path ? result.item.name || selectedFile.name : selectedFile.name }); } } if (action === 'copy') setSelectedPath(result.item.path); setExpanded(nextExpanded); await refresh(nextExpanded); onMutated(); return result.item; } catch (e) { setError(e.message); return null; } finally { setBusy(false); } }
  function startCreate(type, source = rootItem) { const parent = source.type === 'directory' ? source.path : parentPath(source.path); setExpanded((value) => new Set([...value, parent])); setEditing({ kind: 'create', type, parent, value: '' }); setMenu(null); }
  function startRename(item) { if (item.root) return; setSelectedPath(item.path); setEditing({ kind: 'rename', item, parent: parentPath(item.path), value: item.name }); setMenu(null); }
  async function commitEdit() { if (!editing) return; const name = editing.value.trim(); if (!name) return setEditing(null); if (editing.kind === 'create') await mutate('create', null, { parent: editing.parent, name, type: editing.type }); else if (name !== editing.item.name) await mutate('rename', editing.item, { name }); else setEditing(null); }
  async function remove(item) { setMenu(null); if (!item.root && window.confirm(`确定删除“${item.name}”${item.type === 'directory' ? '及其中所有内容' : ''}吗？此操作不可撤销。`)) await mutate('delete', item); }
  async function reveal(item) { setMenu(null); try { if (window.desktop?.showItemInFolder) { const fullPath = `${workspace.path}${workspace.path.endsWith('\\') ? '' : '\\'}${item.path.replaceAll('/', '\\')}`; await window.desktop.showItemInFolder(fullPath); } else await post('/api/file/reveal', { path: item.path }); } catch (e) { setError(e.message); } }
  async function openExternal(item) { setMenu(null); try { if (window.desktop?.openWorkspaceFile) await window.desktop.openWorkspaceFile(item.path); else await post('/api/file/open', { path: item.path }); } catch (e) { setError(e.message); } }
  function setClip(action, item) { if (!item.root) setClipboard({ action, item }); setMenu(null); }
  async function paste(target = rootItem) { if (!clipboard) return; const directory = target.type === 'directory' ? target.path : parentPath(target.path); const result = await mutate(clipboard.action === 'cut' ? 'move' : 'copy', clipboard.item, { target: directory }); if (result && clipboard.action === 'cut') setClipboard(null); }
  async function drop(event, target = rootItem) { event.preventDefault(); event.stopPropagation(); const raw = event.dataTransfer.getData('application/x-mli-workspace-item'); if (!raw) return; try { const item = JSON.parse(raw); const directory = target.type === 'directory' ? target.path : parentPath(target.path); if (item.path !== target.path && parentPath(item.path) !== directory) await mutate('move', item, { target: directory }); } catch (e) { setError(e.message); } }
  function openMenu(event, item) { event.preventDefault(); event.stopPropagation(); setSelectedPath(item.path); setMenu({ item, x: Math.min(event.clientX, window.innerWidth - 218), y: Math.min(event.clientY, window.innerHeight - 330) }); }
  function key(event, item) { if (editing) return; if (event.key === 'F2') { event.preventDefault(); startRename(item); } else if (event.key === 'Delete' && !item.root) { event.preventDefault(); remove(item); } else if (event.key === 'Enter') { event.preventDefault(); toggle(item); } else if (event.key === 'ArrowRight' && item.type === 'directory' && !expanded.has(item.path)) { event.preventDefault(); toggle(item); } else if (event.key === 'ArrowLeft' && item.type === 'directory' && expanded.has(item.path)) { event.preventDefault(); toggle(item); } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); setClip('copy', item); } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') { event.preventDefault(); setClip('cut', item); } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); paste(item); } }
  function inlineEditor(parent, depth) { if (!editing || editing.parent !== parent || editing.kind !== 'create') return null; const draft = { name: editing.value || (editing.type === 'directory' ? '新文件夹' : '新文件'), type: editing.type }; return <InlineFileName item={draft} depth={depth} value={editing.value} onChange={(value) => setEditing((state) => ({ ...state, value }))} onCommit={commitEdit} onCancel={() => setEditing(null)}/>; }
  function rows(parent = '', depth = 0) { return <>{inlineEditor(parent, depth)}{(tree[parent] || []).map((item) => <React.Fragment key={item.path}>{editing?.kind === 'rename' && editing.item.path === item.path ? <InlineFileName item={item} depth={depth} value={editing.value} onChange={(value) => setEditing((state) => ({ ...state, value }))} onCommit={commitEdit} onCancel={() => setEditing(null)}/> : <div className={`file-tree-row ${selectedPath === item.path || selectedFile?.path === item.path ? 'active' : ''} ${clipboard?.action === 'cut' && clipboard.item.path === item.path ? 'cut' : ''}`} style={{ paddingLeft: 7 + depth * 14 }} draggable={!busy} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-mli-workspace-item', JSON.stringify(item)); }} onDragOver={(event) => { if (item.type === 'directory') { event.preventDefault(); event.currentTarget.classList.add('drop-target'); } }} onDragLeave={(event) => event.currentTarget.classList.remove('drop-target')} onDrop={(event) => { event.currentTarget.classList.remove('drop-target'); drop(event, item); }} onContextMenu={(event) => openMenu(event, item)} onKeyDown={(event) => key(event, item)}><button className="tree-open" onClick={() => toggle(item)} title={item.path}>{item.type === 'directory' ? <><ChevronRight className={expanded.has(item.path) ? 'open' : ''} size={13}/><Folder size={15}/></> : <><span className="tree-spacer"/><FileIcon name={item.name}/></>}<span>{item.name}</span></button><button className="tree-menu" title="更多操作" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); openMenu({ ...event, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation(), clientX: rect.right, clientY: rect.bottom }, item); }}><MoreHorizontal size={14}/></button></div>}{item.type === 'directory' && expanded.has(item.path) && rows(item.path, depth + 1)}</React.Fragment>)}</>; }
  return <div className="file-explorer"><div className="file-explorer-head"><button className="explorer-root" title={workspace?.path} onClick={() => setSelectedPath('')} onContextMenu={(event) => openMenu(event, rootItem)}>{workspace?.name || '未选择项目'}</button><div><button disabled={busy || !workspace} title="打开终端" onClick={onOpenTerminal}><SquareTerminal size={15}/></button><button disabled={busy || !workspace} title="新建文件" onClick={() => startCreate('file')}><FilePlus2 size={15}/></button><button disabled={busy || !workspace} title="新建文件夹" onClick={() => startCreate('directory')}><FolderPlus size={15}/></button><button disabled={busy || !workspace} title="刷新资源管理器" onClick={() => refresh()}><RefreshCw className={busy ? 'spin' : ''} size={15}/></button><button disabled={busy || expanded.size <= 1} title="折叠文件夹" onClick={() => setExpanded(new Set(['']))}><ChevronsUp size={15}/></button></div></div>{error && <div className="explorer-error"><span>{error}</span><button title="关闭" onClick={() => setError('')}><X size={13}/></button></div>}<div ref={treeRef} className="file-tree" tabIndex={0} onContextMenu={(event) => { if (event.target === event.currentTarget) openMenu(event, rootItem); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, rootItem)}>{workspace ? rows() : <div className="session-empty">先添加工作目录</div>}</div>{clipboard && <div className="explorer-clipboard"><span>{clipboard.action === 'cut' ? '已剪切' : '已复制'}：{clipboard.item.name}</span><button title="取消" onClick={() => setClipboard(null)}><X size={12}/></button></div>}{menu && <FileMenu menu={menu} clipboard={clipboard} onCreate={startCreate} onRename={() => startRename(menu.item)} onOpen={() => openExternal(menu.item)} onCut={() => setClip('cut', menu.item)} onCopy={() => setClip('copy', menu.item)} onPaste={() => paste(menu.item)} onReveal={() => reveal(menu.item)} onDelete={() => remove(menu.item)}/>}</div>;
}

function InlineFileName({ item, depth, value, onChange, onCommit, onCancel }) { const input = useRef(null), finished = useRef(false); useEffect(() => { input.current?.focus(); input.current?.select(); }, []); function finish(commit) { if (finished.current) return; finished.current = true; if (commit) onCommit(); else onCancel(); } return <div className="file-tree-row inline-edit" style={{ paddingLeft: 7 + depth * 14 }}><span className="tree-spacer"/>{item.type === 'directory' ? <Folder size={15}/> : <FileIcon name={value}/>}<input ref={input} value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => finish(true)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finish(true); } if (event.key === 'Escape') { event.preventDefault(); finish(false); } }}/></div>; }

function FileMenu({ menu, clipboard, onCreate, onRename, onOpen, onCut, onCopy, onPaste, onReveal, onDelete }) { const item = menu.item; return <div className="file-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>{item.type === 'directory' && <><button onClick={() => onCreate('file', item)}><FilePlus2 size={14}/>新建文件</button><button onClick={() => onCreate('directory', item)}><FolderPlus size={14}/>新建文件夹</button><div className="menu-separator"/></>}{item.type === 'file' && <button onClick={onOpen}><ExternalLink size={14}/>使用系统应用打开</button>}{!item.root && <><button onClick={onCut}><Scissors size={14}/>剪切<kbd>Ctrl+X</kbd></button><button onClick={onCopy}><Copy size={14}/>复制<kbd>Ctrl+C</kbd></button></>}{item.type === 'directory' && clipboard && <button onClick={onPaste}><ClipboardPaste size={14}/>粘贴<kbd>Ctrl+V</kbd></button>}<div className="menu-separator"/>{!item.root && <button onClick={onRename}><FileText size={14}/>重命名<kbd>F2</kbd></button>}<button onClick={onReveal}><FolderOpen size={14}/>在资源管理器中显示</button>{!item.root && <><div className="menu-separator"/><button className="danger" onClick={onDelete}><Trash2 size={14}/>删除<kbd>Delete</kbd></button></>}</div>; }

function FileIcon({ name }) { const ext = extension(name); if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'].includes(ext)) return <FileImage size={15}/>; if (isCode(name)) return <FileCode2 size={15}/>; return <File size={15}/>; }

function FileWorkspace({ file, workspace, onToggle, onSaved, onError }) {
  const [data, setData] = useState(null), [content, setContent] = useState(''), [saved, setSaved] = useState(''), [loading, setLoading] = useState(false);
  async function load() { if (!file?.path) return; setLoading(true); try { const d = await get(`/api/file?path=${encodeURIComponent(file.path)}`); setData(d); setContent(d.content || ''); setSaved(d.content || ''); } catch (e) { onError(e); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [file?.path]);
  const dirty = data?.kind === 'text' && content !== saved;
  async function save() { if (!dirty) return; try { const d = await post('/api/file/write', { path: file.path, content }); setData(d.file); setSaved(content); onSaved(); } catch (e) { onError(e); } }
  useEffect(() => { const key = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [dirty, content, file?.path]);
  if (!file) return <div className="file-empty"><FolderOpen size={36}/><b>从左侧文件树选择文件</b><span>代码、文本、图片和 PDF 会在这里打开。</span></div>;
  const rawUrl = `/api/file/raw?path=${encodeURIComponent(file.path)}`;
  return <div className="file-workspace"><header className="file-topbar"><div className="file-title"><button className="mobile-menu" onClick={onToggle}><Menu size={18}/></button><FileIcon name={file.name}/><span><b>{file.name}{dirty ? ' •' : ''}</b><small>{file.path}</small></span></div><div className="file-actions"><span>{data ? `${formatBytes(data.size)} · ${languageName(file.name)}` : ''}</span>{data?.kind === 'text' && <button className="file-save" onClick={save} disabled={!dirty}><Save size={14}/>保存</button>}{window.desktop?.openWorkspaceFile && <button title="使用系统默认应用打开" onClick={() => window.desktop.openWorkspaceFile(file.path)}><ExternalLink size={15}/></button>}{window.desktop?.showItemInFolder && <button title="在资源管理器中显示" onClick={() => window.desktop.showItemInFolder(`${workspace.path}\\${file.path.replaceAll('/', '\\')}`)}><FolderOpen size={15}/></button>}</div></header><div className="file-surface">{loading ? <div className="file-empty"><LoaderCircle className="spin" size={24}/>正在打开文件…</div> : <FilePreview data={data} content={content} setContent={setContent} rawUrl={rawUrl}/>}</div></div>;
}

function FilePreview({ data, content, setContent, rawUrl }) {
  if (!data) return null;
  if (data.kind === 'text') return <CodeMirror className="code-editor" value={content} height="100%" extensions={languageExtensions(data.name)} onChange={setContent} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, autocompletion: true }} theme="light"/>;
  if (data.kind === 'image') return <div className="media-preview"><img src={rawUrl} alt={data.name}/></div>;
  if (data.kind === 'pdf') return <iframe className="document-preview" src={rawUrl} title={data.name}/>;
  if (data.kind === 'audio') return <div className="media-preview"><audio src={rawUrl} controls/></div>;
  if (data.kind === 'video') return <div className="media-preview"><video src={rawUrl} controls/></div>;
  if (data.kind === 'office-text') return <OfficePreview data={data}>{data.officeType === 'PowerPoint' ? <PresentationPreview slides={data.slides} text={data.content}/> : <div className="office-document"><Markdown text={data.content || '文档没有可提取的文本内容'}/></div>}</OfficePreview>;
  if (data.kind === 'spreadsheet') return <OfficePreview data={data}><SpreadsheetPreview sheets={data.sheets || []}/></OfficePreview>;
  if (data.kind === 'office-binary') return <OfficeLayoutPreview data={data}/>;
  return <div className="file-empty"><File size={38}/><b>{data.kind === 'large-text' ? '文件过大，无法在编辑器中打开' : '此格式不支持内置预览'}</b><span>{formatBytes(data.size)} · 可通过右上角在系统中打开文件位置</span></div>;
}

function OfficePreview({ data, children }) {
  const [layout, setLayout] = useState(false);
  const previewUrl = `/api/file/office-preview?path=${encodeURIComponent(data.path)}`;
  useEffect(() => setLayout(false), [data.path]);
  return layout ? <OfficeLayoutPreview data={data} onBack={() => setLayout(false)}/> : <div className="office-preview"><div className="office-preview-head"><FileText size={16}/><b>{data.officeType} 预览</b><span>结构化预览</span><button title="查看原版布局" onClick={() => setLayout(true)}><Eye size={14}/>版式预览</button></div>{children}</div>;
}

function OfficeLayoutPreview({ data, onBack }) {
  const previewUrl = `/api/file/office-preview?path=${encodeURIComponent(data.path)}`;
  const [source, setSource] = useState(''), [status, setStatus] = useState('loading'), [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    setSource(''); setStatus('loading'); setMessage('');
    fetch(previewUrl, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || `版式预览转换失败（${response.status}）`); }
      return response.blob();
    }).then((blob) => { objectUrl = URL.createObjectURL(blob); setSource(objectUrl); setStatus('ready'); }).catch((error) => {
      if (error.name !== 'AbortError') { setMessage(error.message); setStatus('error'); }
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [previewUrl]);
  return <div className="office-layout-preview"><header className="office-preview-head"><FileText size={16}/><b>{data.officeType || 'Office'} PDF 版式预览</b><span>临时转换，不修改原文件</span>{onBack && <button title="返回结构化预览" onClick={onBack}><FileText size={14}/>结构化预览</button>}</header>{status === 'ready' ? <iframe className="document-preview" src={source} title={`${data.name} 版式预览`}/> : <div className="office-preview-state">{status === 'loading' ? <><LoaderCircle className="spin" size={23}/><b>正在生成版式预览…</b><span>正在调用 Office/WPS 或 LibreOffice 转换</span></> : <><FileText size={28}/><b>暂时无法生成版式预览</b><span>{message}</span><small>请安装 Microsoft Office、WPS 或 LibreOffice</small>{onBack && <button onClick={onBack}>返回结构化预览</button>}</>}</div>}</div>;
}

function PresentationPreview({ slides = [], text = '' }) {
  if (slides.length) return <div className="presentation-preview">{slides.map((svg, index) => { const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg); const ratio = viewBox ? `${viewBox[1]} / ${viewBox[2]}` : '4 / 3'; return <article className="presentation-slide" style={{ aspectRatio: ratio }} key={index}><header><span>幻灯片 {index + 1}</span><small>原始页面画布</small></header><div className="presentation-slide-canvas"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`幻灯片 ${index + 1}`}/></div></article>; })}</div>;
  const textSlides = [...String(text).matchAll(/##\s*幻灯片\s+(\d+)\s*\n([\s\S]*?)(?=\n##\s*幻灯片\s+\d+\s*\n|$)/g)].map((match) => ({ number: match[1], lines: match[2].trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean) }));
  if (!textSlides.length) return <div className="presentation-empty">演示文稿没有可提取的文本内容</div>;
  return <div className="presentation-preview">{textSlides.map((slide) => <article className="presentation-slide" key={slide.number}><header><span>幻灯片 {slide.number}</span><small>{slide.lines.length} 行内容</small></header><div className="presentation-slide-body">{slide.lines.map((line, index) => <p key={`${slide.number}-${index}`} className={index === 0 ? 'slide-lead' : ''}>{line}</p>)}</div></article>)}</div>;
}

function SpreadsheetPreview({ sheets }) { const [active, setActive] = useState(0), sheet = sheets[active]; return <div className="sheet-preview"><div className="sheet-tabs">{sheets.map((item, index) => <button className={index === active ? 'active' : ''} key={`${item.name}-${index}`} onClick={() => setActive(index)}>{item.name}</button>)}</div><div className="sheet-grid-wrap">{sheet ? <table className="sheet-grid"><tbody>{sheet.rows.map((row, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}</th>{row.map((cell, columnIndex) => <td key={columnIndex}>{String(cell ?? '')}</td>)}</tr>)}</tbody></table> : <div className="file-empty">工作簿没有可读取的工作表</div>}</div></div>; }

function extension(name = '') { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }
function parentPath(value = '') { const parts = value.split('/'); parts.pop(); return parts.join('/'); }
function isCode(name) { return ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'json', 'css', 'scss', 'html', 'xml', 'py', 'sql', 'sh', 'ps1', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'vue', 'svelte'].includes(extension(name)); }
function languageExtensions(name) { const ext = extension(name); if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return [javascript({ jsx: ext === 'jsx' })]; if (['ts', 'tsx'].includes(ext)) return [javascript({ jsx: ext === 'tsx', typescript: true })]; if (ext === 'json' || ext === 'jsonc') return [jsonLanguage()]; if (['css', 'scss', 'less'].includes(ext)) return [css()]; if (['html', 'htm', 'xml', 'svg'].includes(ext)) return [html()]; if (['md', 'mdx'].includes(ext)) return [markdown()]; if (ext === 'py') return [python()]; if (ext === 'sql') return [sql()]; return []; }
function languageName(name) { const ext = extension(name); return ({ js: 'JavaScript', jsx: 'JavaScript JSX', mjs: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript JSX', json: 'JSON', css: 'CSS', html: 'HTML', md: 'Markdown', py: 'Python', sql: 'SQL', pdf: 'PDF', png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', svg: 'SVG', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel', ppt: 'PowerPoint', pptx: 'PowerPoint' })[ext] || (ext ? ext.toUpperCase() : '文本'); }
function formatBytes(value = 0) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
function formatDuration(value = 0) { if (value > 0 && value < 1000) return '<1 秒'; const seconds = Math.max(0, Math.round(value / 1000)); if (seconds < 60) return `${seconds} 秒`; const minutes = Math.floor(seconds / 60), rest = seconds % 60; return `${minutes} 分 ${rest} 秒`; }

function Composer({ draft, setDraft, attachments, setAttachments, onSend, onStop, onAdjustQueued, onEditQueued, onClearExpert, current, pendingMode = 'default', pendingExpert, running, permission, connection, onReconnect, onPermissionResolved, info, workspace, onWorkspace, onMode, onModelsChanged, onError }) {
  const [modeOpen, setModeOpen] = useState(false), [modelOpen, setModelOpen] = useState(false), modeRef = useRef(null), modelRef = useRef(null), fileInput = useRef(null);
  const selectedMode = current ? modeKey(current.mode) : modeKey(pendingMode), mode = MODE[selectedMode], providers = info?.providers || [], models = info?.models || [], activeModel = models.find((item) => item.id === info?.activeModelId), canCompose = Boolean(workspace);
  const appliedExpert = current?.expertId ? info?.experts?.find((item) => item.id === current.expertId) : pendingExpert;
  useOutsideClose(modeRef, modeOpen, () => setModeOpen(false)); useOutsideClose(modelRef, modelOpen, () => setModelOpen(false));
  async function activateModel(id) { try { await post('/api/settings', { action: 'activate_model', modelId: id }); setModelOpen(false); await onModelsChanged(); } catch (e) { onError(e); } }
  async function addFiles(files) { const images = [...files].filter((file) => file.type.startsWith('image/')); if (!images.length) return; if (attachments.length + images.length > 6) return onError('每次最多添加 6 张图片'); try { const loaded = await Promise.all(images.map(async (file) => { if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} 超过 10 MB`); return { id: `${Date.now()}-${Math.random()}`, name: file.name, mime: file.type, size: file.size, dataUrl: await readFileDataUrl(file) }; })); setAttachments([...attachments, ...loaded]); } catch (e) { onError(e); } }
  function paste(event) { const images = [...event.clipboardData.items].filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean); if (images.length) { event.preventDefault(); addFiles(images); } }
  return <div className="composer-wrap"><button className="working-directory" onClick={onWorkspace} disabled={running} title={current ? '点击修改当前会话的工作目录' : '点击选择工作目录'}><FolderOpen size={14}/><span><small>工作目录</small><b>{workspace?.path || '点击添加工作目录'}</b></span><ChevronRight size={14}/></button>{connection?.status !== 'connected' && <ConnectionNotice connection={connection} onReconnect={onReconnect}/>} {permission && current && <PermissionBar request={permission} sessionId={current.id} onResolved={onPermissionResolved}/>}<div className="composer">{current?.queue?.length > 0 && <div className="composer-queue"><b>队列等待中 · {current.queue.length}</b>{current.queue.map((item) => <div key={item.queueId}><span>{item.text || '图片任务'}{item.attachments?.length ? ` · ${item.attachments.length} 张图片` : ''}</span><button title="作为当前任务调整发送" disabled={!running || item.mode === 'adjust'} onClick={() => onAdjustQueued(item)}>{item.mode === 'adjust' ? '待注入' : '立即调整'}</button><button title="取回编辑" onClick={() => onEditQueued(item)}>继续编辑</button></div>)}</div>}{attachments.length > 0 && <div className="composer-attachments">{attachments.map((item) => <div key={item.id}><img src={item.dataUrl} alt={item.name}/><button title="移除图片" onClick={() => setAttachments(attachments.filter((x) => x.id !== item.id))}><X size={13}/></button><span>{item.name}</span></div>)}</div>}<textarea value={draft} onPaste={paste} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} placeholder={workspace ? (running ? '输入下一项任务，发送后进入队列…' : (current ? '描述要完成的任务，可粘贴图片…' : '输入小说创作需求，例如：建立人物设定、规划章节或继续写作…')) : '先添加工作目录'} disabled={!canCompose}/><div className="composer-bottom"><div className="composer-meta"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}/><button className="attach-button" title="添加图片" onClick={() => fileInput.current?.click()} disabled={!canCompose}><Paperclip size={14}/></button>{appliedExpert && <span className="expert-reference" title={`已引用专家：${appliedExpert.name}`}><Sparkles size={13}/><span>{appliedExpert.name}</span><button title="取消引用专家" aria-label="取消引用专家" onClick={onClearExpert}><X size={12}/></button></span>}<div className="model-picker" ref={modelRef}><button className="model-chip" onClick={() => setModelOpen(!modelOpen)} disabled={running}><Bot size={13}/>{activeModel?.name || info?.provider?.model || '未配置模型'}<ChevronDown size={11}/></button>{modelOpen && <div className="model-tree-popover">{providers.map((provider) => <div className="model-tree-group" key={provider.id}><div><Server size={13}/><b>{provider.name}</b></div>{models.filter((item) => item.providerId === provider.id).map((item) => <button className={item.id === info?.activeModelId ? 'active' : ''} key={item.id} onClick={() => activateModel(item.id)}><span className="tree-branch"/><Bot size={13}/><span><b>{item.name}</b><small>{!provider.managed && item.model}{item.capabilities && `${provider.managed ? '' : ' · '}${[item.capabilities.image && '图片', item.capabilities.video && '视频', item.capabilities.thinking && '思考', item.capabilities.webSearch && '联网'].filter(Boolean).join(' · ') || '文本'}`}{provider.managed && ` · 倍率 ${modelMultiplier(item.displayMultiplier)}x 魔力值`}</small></span>{item.id === info?.activeModelId && <Check size={13}/>}</button>)}</div>)}</div>}</div><div className="mode-picker" ref={modeRef}><button className={`permission-chip ${mode.tone}`} onClick={() => setModeOpen(!modeOpen)} disabled={running}><Shield size={13}/>{mode.label}<ChevronDown size={12}/></button>{modeOpen && <div className="mode-popover">{Object.entries(MODE).map(([key, item]) => <button className={key === selectedMode ? 'active' : ''} key={key} onClick={() => { onMode(key); setModeOpen(false); }}><span className={`mode-icon ${item.tone}`}><Shield size={15}/></span><span><b>{item.label}</b><small>{item.desc}</small></span>{key === selectedMode && <Check size={15}/>}</button>)}</div>}</div><span className="tiny-context" title={current?.context?.truncated ? '已按模型上下文窗口压缩并保留最近消息' : '当前发送给模型的上下文占用'}>{current?.context?.percent || 0}% 上下文{current?.context?.truncated ? ' · 已截取' : ''}</span></div><div className="composer-actions">{running && <button className="send-button stop" onClick={onStop} title="停止运行"><CircleStop size={16}/></button>}<button className="send-button" onClick={onSend} title={running ? '加入等待队列' : '发送'} disabled={(!draft.trim() && !attachments.length) || !workspace}><ArrowUp size={17}/></button></div></div></div><div className="composer-footnote">Enter 发送 · Shift Enter 换行 · 支持粘贴图片</div></div>;
}

function ConnectionNotice({ connection, onReconnect }) { const retrying = connection?.status === 'retrying'; return <div className="connection-notice"><RefreshCw className="spin" size={14}/><span><b>{retrying ? '与本地 Agent 断开，正在自动重连' : '正在连接本地 Agent'}</b><small>{retrying ? `第 ${connection.attempt} 次 · ${Math.ceil((connection.delayMs || 0) / 1000)} 秒后重试` : '正在建立事件连接'}</small></span><button onClick={onReconnect}>立即重连</button></div>; }

function ErrorDetails({ details }) { const rows = [['发生阶段', details?.stage], ['HTTP 状态', details?.status], ['错误类型', details?.name], ['错误码', details?.code], ['服务商', details?.provider], ['协议', details?.protocol], ['接口地址', details?.url], ['工具', details?.tool], ['审批结果', details?.decision], ['重试次数', details?.attempt], ['调用参数', details?.args], ['底层原因', details?.cause || details?.message], ['堆栈', details?.stack]].filter(([, value]) => value !== undefined && value !== null && value !== ''); return <div className="error-details">{rows.map(([label, value]) => <div key={label}><span>{label}</span><code>{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</code></div>)}</div>; }

function ErrorToast({ error, onClose }) { const [open, setOpen] = useState(false), value = typeof error === 'string' ? { message: error } : error; return <section className="error-toast"><div><ShieldAlert size={15}/><span><b>操作失败</b><small>{value.message}</small></span><button title="关闭" onClick={onClose}><X size={14}/></button></div>{value.details && <button className="error-toggle" onClick={() => setOpen(!open)}>错误详情<ChevronDown className={open ? 'rotated' : ''} size={13}/></button>}{open && <ErrorDetails details={value.details}/>}</section>; }

function toUiError(error, stage) { if (typeof error === 'string') return { message: error, details: { stage } }; return { message: error?.message || '操作失败', details: { stage, name: error?.name || 'Error', message: error?.message || String(error), code: error?.code || '', cause: error?.cause?.message || '', ...(error?.details || {}) } }; }

function PermissionBar({ request, sessionId, onResolved }) { const [busy, setBusy] = useState(false), [details, setDetails] = useState(false); async function resolve(decision) { setBusy(true); try { await post(`/api/session/${sessionId}/permission/${request.reqId}`, { decision }); onResolved(); } finally { setBusy(false); } } return <section className="permission-bar"><div className="permission-bar-main"><span className="permission-bar-icon"><ShieldAlert size={16}/></span><button className="permission-bar-copy" onClick={() => setDetails(!details)}><span><small>请求批准</small><b>{request.tool}</b></span><ChevronDown className={details ? 'rotated' : ''} size={14}/></button><div className="permission-bar-actions"><button disabled={busy} onClick={() => resolve('deny')}>拒绝</button><button disabled={busy} onClick={() => resolve('allow')}>仅本次</button><button className="primary-action" title={request.sessionScope || '当前任务内相同工具调用不再询问'} disabled={busy} onClick={() => resolve('allow_session')}>本任务允许</button></div></div><div className="permission-scope">本任务允许：{request.sessionScope || '当前任务内相同工具调用'}</div>{details && <pre>{request.summary}</pre>}</section>; }

function modeKey(value) { return value === 'auto-all' ? 'auto-all' : 'default'; }
function useOutsideClose(ref, open, close) { useEffect(() => { if (!open) return; const listener = (event) => { if (!ref.current?.contains(event.target)) close(); }; document.addEventListener('pointerdown', listener); return () => document.removeEventListener('pointerdown', listener); }, [open]); }

function readFileDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(`无法读取 ${file.name}`)); reader.readAsDataURL(file); }); }

function Page({ view, info, current, onSaved, onDesktop, onMode, onError }) { const titles = { models: ['模型', '配置服务商、模型能力、上下文和价格'], analytics: ['调用分析', '查看性能、token 和费用'] }; return <div className="page-shell">{view !== 'settings' && <header className="page-header"><div><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div></header>}{view === 'models' ? <Models info={info} onSaved={onSaved} onError={onError}/> : view === 'analytics' ? <Analytics info={info}/> : <SettingsPage info={info} current={current} onSaved={onSaved} onError={onError} onDesktop={onDesktop} onMode={onMode}/>}</div>; }
const CONTEXT_PRESETS = [32768, 65536, 128000, 200000, 256000, 1000000];
function modelPrice(value) { return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 }); }
function modelMultiplier(value) { return Number(value || 1).toLocaleString('zh-CN', { maximumFractionDigits: 4 }); }
function emptyModel(providerId) { return { id: '', providerId, name: '', model: '', contextWindow: 128000, input: 0, output: 0, cacheCreation: 0, cacheRead: 0, cacheCreationEnabled: false, cacheReadEnabled: false, currency: 'USD' }; }
function editableModel(item) { return { ...item, input: item.pricing?.inputPer1M || 0, output: item.pricing?.outputPer1M || 0, cacheCreation: item.pricing?.cacheCreationPer1M || 0, cacheRead: item.pricing?.cacheReadPer1M || 0, cacheCreationEnabled: Boolean(item.pricing?.cacheCreationEnabled), cacheReadEnabled: Boolean(item.pricing?.cacheReadEnabled), currency: item.pricing?.currency || 'USD' }; }
function modelPayload(draft, providerId) { return { id: draft.id || undefined, providerId, name: draft.name, model: draft.model, contextWindow: Number(draft.contextWindow), pricing: { inputPer1M: Number(draft.input), outputPer1M: Number(draft.output), cacheCreationPer1M: Number(draft.cacheCreation), cacheReadPer1M: Number(draft.cacheRead), cacheCreationEnabled: draft.cacheCreationEnabled, cacheReadEnabled: draft.cacheReadEnabled, currency: draft.currency } }; }

function Models({ info, onSaved, onError }) {
  const providers = info?.providers || [], allModels = info?.models || [], protocols = info?.protocols || [];
  const [balance, setBalance] = useState(null);
  useEffect(() => { let active = true; const refresh = () => post('/api/account/refresh').then((data) => { if (active) setBalance(Number(data.user?.magicValue || 0)); }).catch(() => {}); refresh(); const timer = setInterval(refresh, 15000); return () => { active = false; clearInterval(timer); }; }, []);
  const active = allModels.find((item) => item.id === info?.activeModelId);
  const [providerId, setProviderId] = useState(providers[0]?.id || active?.providerId || '');
  const [providerDialog, setProviderDialog] = useState(false), [modelDialog, setModelDialog] = useState(false), [remoteDialog, setRemoteDialog] = useState(false);
  const [providerDraft, setProviderDraft] = useState(null), [modelDraft, setModelDraft] = useState(null), [customContext, setCustomContext] = useState(false);
  const [remoteModels, setRemoteModels] = useState([]), [selectedRemote, setSelectedRemote] = useState([]);
  const [status, setStatus] = useState(''), [remoteStatus, setRemoteStatus] = useState(''), [remoteBusy, setRemoteBusy] = useState(false);
  const provider = providers.find((item) => item.id === providerId), providerModels = allModels.filter((item) => item.providerId === providerId);
  const knownRemote = new Set(providerModels.map((item) => item.model));
  useEffect(() => { if (!providerId && providers[0]) setProviderId(providers[0].id); }, [providers, providerId]);
  const reportError = (error) => { setStatus(error?.message || String(error)); onError?.(error); };
  function selectProvider(id) { setProviderId(id); setProviderDialog(false); setModelDialog(false); setRemoteDialog(false); setStatus(''); }
  function editProvider(item = null) { setProviderDraft({ id: item?.id || '', name: item?.name || '', protocol: item?.protocol || 'openai-chat', baseUrl: item?.baseUrl || 'https://api.openai.com/v1', apiKey: '', hasKey: Boolean(item?.hasKey), keyHint: item?.keyHint || '' }); setStatus(''); setProviderDialog(true); }
  function editModel(item = null) { if (item?.providerId === 'mli-managed') { post('/api/settings', { action: 'activate_model', modelId: item.id }).then(onSaved).catch(reportError); return; } const draft = item ? editableModel(item) : emptyModel(providerId); setModelDraft(draft); setCustomContext(!CONTEXT_PRESETS.includes(Number(draft.contextWindow))); setStatus(''); setModelDialog(true); }
  async function saveProvider() {
    try { const result = await post('/api/settings', { action: 'save_provider', provider: providerDraft }); setProviderId(result.provider.id); setProviderDialog(false); await onSaved(); }
    catch (error) { reportError(error); }
  }
  async function saveModel(activate) {
    try { await post('/api/settings', { action: 'save_model', model: modelPayload(modelDraft, providerId), activate }); setModelDialog(false); await onSaved(); }
    catch (error) { reportError(error); }
  }
  async function removeModel(item) {
    if (!window.confirm('删除模型“' + item.name + '”吗？')) return;
    try { await post('/api/settings', { action: 'delete_model', modelId: item.id }); await onSaved(); }
    catch (error) { reportError(error); }
  }
  async function removeProvider(item) {
    if (!window.confirm('删除服务商“' + item.name + '”及其全部模型吗？')) return;
    try { await post('/api/settings', { action: 'delete_provider', providerId: item.id }); setProviderId(providers.find((candidate) => candidate.id !== item.id)?.id || ''); await onSaved(); }
    catch (error) { reportError(error); }
  }
  async function fetchModels() {
    const known = providerModels.map((item) => item.model);
    setRemoteModels(known); setSelectedRemote(known); setRemoteStatus('正在获取模型…'); setRemoteBusy(true); setRemoteDialog(true);
    try {
      const result = await post('/api/settings/models', { providerId });
      setRemoteModels([...new Set([...known, ...(result.models || [])])].sort());
      setRemoteStatus(result.models?.length ? '获取到 ' + result.models.length + ' 个模型' : '服务商没有返回模型');
    } catch (error) { setRemoteStatus(error?.message || String(error)); onError?.(error); }
    finally { setRemoteBusy(false); }
  }
  async function syncRemoteModels() {
    setRemoteBusy(true); setRemoteStatus('正在保存…');
    try {
      for (const modelId of selectedRemote.filter((id) => !knownRemote.has(id))) await post('/api/settings', { action: 'save_model', model: modelPayload({ ...emptyModel(providerId), name: modelId, model: modelId }, providerId), activate: false });
      for (const item of providerModels.filter((model) => !selectedRemote.includes(model.model))) await post('/api/settings', { action: 'delete_model', modelId: item.id });
      setRemoteDialog(false);
      await onSaved();
    } catch (error) { setRemoteStatus(error?.message || String(error)); onError?.(error); await onSaved(); }
    finally { setRemoteBusy(false); }
  }
  async function testModel() {
    setStatus('测试中…');
    try { const result = await post('/api/settings/test', { providerId, model: modelDraft.model }); setStatus(result.message); }
    catch (error) { reportError(error); }
  }
  return <>
    <div className="page-content model-manager">
      <section className="provider-pane">
        <div className="pane-head"><div><h2>服务商</h2><p>选择服务商配置连接和模型</p></div><button onClick={() => editProvider()}><Plus size={14}/>添加</button></div>
        <div className="entity-list provider-list">{providers.map((item) => <div className={'entity-row ' + (item.id === providerId ? 'active' : '')} key={item.id}>
          <button className="entity-main" onClick={() => selectProvider(item.id)}><span className="entity-icon"><Server size={15}/></span><span><b>{item.name}</b><small>{protocols.find((protocol) => protocol.id === item.protocol)?.name || item.protocol}</small></span><ChevronRight size={14}/></button>
          {!item.managed && <button title="编辑服务商" onClick={() => editProvider(item)}><Settings2 size={14}/></button>}
          {!item.managed && <button title="删除服务商" onClick={() => removeProvider(item)}><Trash2 size={14}/></button>}
        </div>)}{!providers.length && <div className="empty-list">还没有服务商</div>}</div>
      </section>
      <section className="models-pane provider-workspace">{provider ? <>
        <div className="provider-summary"><div className="provider-summary-title"><span className="entity-icon"><Server size={16}/></span><div><h2>{provider.name}</h2><p>{provider.managed ? 'MLIAPI · 魔力值 / 百万 tokens' : protocols.find((item) => item.id === provider.protocol)?.name || provider.protocol}</p></div></div>{!provider.managed && <button onClick={() => editProvider(provider)}><Settings2 size={14}/>编辑服务商</button>}</div>
        <div className="provider-connection">{provider.managed ? <div><small>可用魔力值</small><b>{Number(balance || 0).toFixed(6)} 魔力值</b></div> : <><div><small>API 地址</small><b>{provider.baseUrl}</b></div><div><small>API Key</small><b>{provider.hasKey ? provider.keyHint || '已配置' : '未配置'}</b></div></>}</div>
        <div className="model-workspace-head"><h3>模型</h3>{!provider.managed && <div className="pane-head-actions"><button onClick={fetchModels}><RefreshCw size={14}/>获取模型</button><button onClick={() => editModel()}><Plus size={14}/>添加模型</button></div>}</div>
        <section className="model-catalog">
          <header><h3>此服务商的模型 <span>{providerModels.length}</span></h3></header>
          <div className="model-catalog-list">{providerModels.map((item) => <div className="model-catalog-row" key={item.id}>
            <button className="model-catalog-select" onClick={() => editModel(item)}><span className="entity-icon"><Bot size={15}/></span><span className="model-catalog-name"><b>{item.name}</b><small>{!provider.managed && <>{item.model} · </>}{Number(item.contextWindow).toLocaleString()} tokens{item.capabilities && <> · {[item.capabilities.image && '图片', item.capabilities.video && '视频', item.capabilities.thinking && '思考', item.capabilities.webSearch && '联网'].filter(Boolean).join(' · ') || '文本'}</>}</small></span>{item.id === info?.activeModelId && <span className="active-badge">当前</span>}<ChevronRight size={15}/></button>
            <div className="model-catalog-prices" title={item.pricing?.priceDetails || undefined} aria-label={item.pricing?.priceDetails || undefined}>{provider.managed ? <span>MLIAPI</span> : <><span>输入 <b>{modelPrice(item.pricing?.inputPer1M)}</b></span><span>输出 <b>{modelPrice(item.pricing?.outputPer1M)}</b></span>{item.pricing?.cacheCreationEnabled && <span>缓存创建 <b>{modelPrice(item.pricing.cacheCreationPer1M)}</b></span>}{item.pricing?.cacheReadEnabled && <span>缓存读取 <b>{modelPrice(item.pricing.cacheReadPer1M)}</b></span>}<small>{item.pricing?.currency || 'USD'} / 1M tokens</small></>}</div>
            {!provider.managed && <button className="model-catalog-delete" title={'删除模型 ' + item.name} onClick={() => removeModel(item)}><Trash2 size={14}/></button>}
          </div>)}{!providerModels.length && <div className="empty-list">{provider.managed ? '后台尚未发布可用模型' : '还没有模型，点击“添加模型”开始配置'}</div>}</div>
        </section>
      </> : <div className="model-empty-workspace"><Server size={30}/><b>先添加服务商</b><span>添加后会在这里显示连接信息和模型列表。</span></div>}</section>
    </div>
    {providerDialog && <Modal title={providerDraft.id ? '编辑服务商' : '添加服务商'} onClose={() => setProviderDialog(false)}><div className="dialog-form"><label>名称<input value={providerDraft.name} onChange={(event) => setProviderDraft({ ...providerDraft, name: event.target.value })} placeholder="例如 OpenAI Production"/></label><label>协议<select value={providerDraft.protocol} onChange={(event) => setProviderDraft({ ...providerDraft, protocol: event.target.value, baseUrl: event.target.value === 'anthropic' ? 'https://api.anthropic.com/v1' : providerDraft.baseUrl })}>{protocols.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>API 地址<input value={providerDraft.baseUrl} onChange={(event) => setProviderDraft({ ...providerDraft, baseUrl: event.target.value })}/></label><label>API Key<input type="password" value={providerDraft.apiKey} onChange={(event) => setProviderDraft({ ...providerDraft, apiKey: event.target.value })} placeholder={providerDraft.hasKey ? '已配置 ' + (providerDraft.keyHint || '') : '输入 API Key'}/></label><div className="dialog-status">{status}</div><div className="dialog-actions"><button onClick={() => setProviderDialog(false)}>取消</button><button className="primary-action" onClick={saveProvider}>保存</button></div></div></Modal>}
    {modelDialog && <Modal title={modelDraft.id ? '编辑模型' : '添加模型'} onClose={() => setModelDialog(false)} wide>
      <div className="dialog-form model-dialog-form">
        <label>显示名称<input value={modelDraft.name} onChange={(event) => setModelDraft({ ...modelDraft, name: event.target.value })} placeholder="例如 GPT-5 Mini"/></label>
        <label>模型 ID<input value={modelDraft.model} onChange={(event) => setModelDraft({ ...modelDraft, model: event.target.value })} placeholder="例如 gpt-5"/></label>
        <label className="context-field">上下文窗口<div className="context-choice"><select value={customContext ? 'custom' : String(modelDraft.contextWindow)} onChange={(event) => { const custom = event.target.value === 'custom'; setCustomContext(custom); if (!custom) setModelDraft({ ...modelDraft, contextWindow: Number(event.target.value) }); }}>{CONTEXT_PRESETS.map((value) => <option key={value} value={value}>{value === 32768 ? '32K' : value === 65536 ? '64K' : value === 1000000 ? '1M' : (value / 1000) + 'K'}</option>)}<option value="custom">自定义</option></select>{customContext && <input type="number" min="1000" value={modelDraft.contextWindow} onChange={(event) => setModelDraft({ ...modelDraft, contextWindow: event.target.value })}/>}</div></label>
        <label>货币<input value={modelDraft.currency} onChange={(event) => setModelDraft({ ...modelDraft, currency: event.target.value })} placeholder="USD"/></label>
        <label>输入价格 / 1M tokens<input type="number" min="0" step="0.000001" value={modelDraft.input} onChange={(event) => setModelDraft({ ...modelDraft, input: event.target.value })}/></label>
        <label>输出价格 / 1M tokens<input type="number" min="0" step="0.000001" value={modelDraft.output} onChange={(event) => setModelDraft({ ...modelDraft, output: event.target.value })}/></label>
        <div className="cache-price-field"><label className="cache-price-toggle"><input type="checkbox" checked={modelDraft.cacheCreationEnabled} onChange={(event) => setModelDraft({ ...modelDraft, cacheCreationEnabled: event.target.checked })}/>缓存创建 / 1M tokens</label><input aria-label="缓存创建价格 / 1M tokens" type="number" min="0" step="0.000001" disabled={!modelDraft.cacheCreationEnabled} value={modelDraft.cacheCreation} onChange={(event) => setModelDraft({ ...modelDraft, cacheCreation: event.target.value })}/></div>
        <div className="cache-price-field"><label className="cache-price-toggle"><input type="checkbox" checked={modelDraft.cacheReadEnabled} onChange={(event) => setModelDraft({ ...modelDraft, cacheReadEnabled: event.target.checked })}/>缓存读取 / 1M tokens</label><input aria-label="缓存读取价格 / 1M tokens" type="number" min="0" step="0.000001" disabled={!modelDraft.cacheReadEnabled} value={modelDraft.cacheRead} onChange={(event) => setModelDraft({ ...modelDraft, cacheRead: event.target.value })}/></div>
        <div className="dialog-status">{status}</div>
        <div className="dialog-actions"><button onClick={testModel} disabled={!modelDraft.model}>测试连接</button><button onClick={() => saveModel(false)} disabled={!modelDraft.name || !modelDraft.model}>保存</button><button className="primary-action" onClick={() => saveModel(true)} disabled={!modelDraft.name || !modelDraft.model}>保存并使用</button></div>
      </div>
    </Modal>}
    {remoteDialog && <Modal title="获取模型" onClose={() => !remoteBusy && setRemoteDialog(false)} wide>
      <div className="remote-models">
        <div className="remote-toolbar"><span>{remoteStatus}</span><div><button disabled={remoteBusy || !remoteModels.length} onClick={() => setSelectedRemote(remoteModels)}>全选</button><button disabled={remoteBusy || !selectedRemote.length} onClick={() => setSelectedRemote([])}>清空</button></div></div>
        <div className="remote-list">{remoteModels.map((id) => <label key={id}><input type="checkbox" disabled={remoteBusy} checked={selectedRemote.includes(id)} onChange={(event) => setSelectedRemote(event.target.checked ? [...selectedRemote, id] : selectedRemote.filter((selected) => selected !== id))}/><span>{id}</span>{knownRemote.has(id) && <small>已添加</small>}</label>)}{!remoteModels.length && <div className="empty-list">没有可用模型</div>}</div>
        <div className="dialog-actions"><button disabled={remoteBusy} onClick={() => setRemoteDialog(false)}>取消</button><button className="primary-action" disabled={remoteBusy} onClick={syncRemoteModels}>保存更改</button></div>
      </div>
    </Modal>}
  </>;
}
function Modal({ title, onClose, wide = false, children }) { return <div className="dialog-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className={`dialog-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h3>{title}</h3><button title="关闭" onClick={onClose}><X size={17}/></button></header>{children}</section></div>; }
function ExpertLibrary({ info, current, pending, running, onApply, onClear, onToggle, onRefresh }) {
  return <ExpertSkillLibrary info={info} current={current} pending={pending} running={running} onApply={onApply} onClear={onClear} onToggle={onToggle} onRefresh={onRefresh}/>;
}
function Analytics({ info }) {
  const pageSize = 100;
  const [logs, setLogs] = useState([]), [total, setTotal] = useState(0), [aggregate, setAggregate] = useState({ totalTokens: 0, totalCost: 0, averageMs: 0 }), [models, setModels] = useState([]), [selected, setSelected] = useState(null), [detail, setDetail] = useState(null), [tab, setTab] = useState('summary'), [error, setError] = useState(''), [offset, setOffset] = useState(0), [nextOffset, setNextOffset] = useState(0), [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(false), [dateFilter, setDateFilter] = useState('today'), [modelFilter, setModelFilter] = useState('all');
  const modelNames = new Map((info?.models || []).map((item) => [String(item.model), item.name || item.model]));
  const displayModel = (model) => modelNames.get(String(model)) || model;
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = dateFilter === 'yesterday' ? new Date(start.getTime() - 86400000) : dateFilter === '7d' ? new Date(start.getTime() - 6 * 86400000) : dateFilter === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : start;
  const until = dateFilter === 'yesterday' ? start : dateFilter === 'month' ? new Date(now.getTime() + 86400000) : new Date(now.getTime() + 86400000);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset), from: String(from.getTime()), to: String(until.getTime()), summary: '1' });
    if (modelFilter !== 'all') params.set('model', modelFilter);
    get(`/api/logs?${params}`).then((data) => {
      if (!active) return;
      const page = data.logs || [];
      setLogs((current) => offset === 0 ? page : [...current, ...page]);
      setTotal(Number(data.total || 0));
      setAggregate(data.summary || { totalTokens: 0, totalCost: 0, averageMs: 0 });
      setModels(data.models || []);
      setNextOffset(Number(data.offset || offset) + page.length);
      setHasMore(Boolean(data.hasMore));
    }).catch((reason) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dateFilter, modelFilter, offset]);
  useEffect(() => { setOffset(0); setSelected(null); setDetail(null); setTab('summary'); }, [dateFilter, modelFilter]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetail(null);
    get(`/api/logs/${selected.id}`).then((data) => { if (active) setDetail(data.log); }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [selected?.id]);
  const select = (item) => { setSelected(selected?.id === item.id ? null : item); setTab('summary'); };
  return <div className="page-content analytics-page">
    <div className="analytics-toolbar"><div className="analytics-filters"><label>时间<select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}><option value="today">今天</option><option value="yesterday">昨天</option><option value="7d">近 7 天</option><option value="month">本月</option></select></label><label>模型<select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}><option value="all">全部模型</option>{models.map((model) => <option key={model} value={model}>{displayModel(model)}</option>)}</select></label></div><div className="stat-strip"><div><small>筛选调用</small><b>{total}</b></div><div><small>Tokens</small><b>{Number(aggregate.totalTokens || 0).toLocaleString()}</b></div><div><small>费用</small><b>{Number(aggregate.totalCost || 0).toFixed(6)}</b></div><div><small>平均耗时</small><b>{Math.round(Number(aggregate.averageMs || 0))} ms</b></div></div></div>
    <section className="analytics-list"><div className="list-head">调用记录 <small>已加载 {logs.length} 条 · 共 {total} 条</small></div><div className="analytics-table-head"><span>模型 / 时间</span><span>Tokens</span><span>费用 / 耗时</span><span></span></div><div className="analytics-table-body">
      {error && <div className="form-error">{error}</div>}
      {logs.map((entry) => <article className={`call-row ${selected?.id === entry.id ? 'selected' : ''}`} key={entry.id}><button className="call-row-main" onClick={() => select(entry)}><span className="call-row-summary"><b>{displayModel(entry.provider?.modelName || entry.provider?.model || '未知模型')}</b><small>{entry.provider?.name || entry.provider?.protocol || 'Provider'} · {new Date(entry.ts).toLocaleString()}</small></span><span className="call-row-tokens">{Number(entry.metrics?.totalTokens || 0).toLocaleString()}</span><span className="call-row-metrics"><b>{Number(entry.metrics?.cost || 0).toFixed(6)}</b><small>{Math.round(entry.metrics?.totalMs || 0)} ms</small></span><ChevronDown className={selected?.id === entry.id ? 'row-chevron open' : 'row-chevron'} size={15}/></button>{selected?.id === entry.id && <div className="call-detail"><div className="call-detail-head"><div><small>{entry.provider?.protocol || 'Provider'}</small><b>{displayModel(entry.provider?.modelName || entry.provider?.model || '未知模型')}</b></div><span>{new Date(entry.ts).toLocaleString()}</span></div><div className="detail-tabs"><button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>摘要</button><button className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}>请求</button><button className={tab === 'response' ? 'active' : ''} onClick={() => setTab('response')}>响应</button></div>{tab === 'summary' ? <CallSummary item={entry}/> : <div className="json-panel"><div className="json-panel-head"><span>{tab === 'request' ? '完整请求内容' : '完整返回内容'}</span><small>敏感字段已脱敏</small></div><pre>{detail ? redact(JSON.stringify(tab === 'request' ? detail.request : detail.response, null, 2)) : '正在读取完整记录…'}</pre></div>}</div>}</article>)}
      {!logs.length && !error && <div className="empty-list">{loading ? '正在加载调用记录…' : '当前筛选暂无调用记录'}</div>}
      {hasMore && <button className="analytics-more" disabled={loading} onClick={() => setOffset(nextOffset)}>{loading ? '正在加载…' : `加载更多（还剩 ${Math.max(0, total - logs.length)} 条）`}</button>}
    </div></section>
  </div>;
}
function CallSummary({ item }) {
  const metrics = item.metrics || {}, billing = item.billing || {}, usage = item.response?.usage;
  const creationReported = usage?.cache_creation_input_tokens != null;
  const readReported = usage?.cache_read_input_tokens != null || usage?.prompt_cache_hit_tokens != null || usage?.prompt_tokens_details?.cached_tokens != null || usage?.input_tokens_details?.cached_tokens != null;
  const billingText = billing.status === 'settled' || billing.status === 'server_settled' ? `已扣 ${billing.magicValue ?? billing.points} 魔力值` : billing.status === 'failed' ? `结算失败：${billing.error || billing.code || '未知原因'}` : billing.status === 'not_configured' ? '已计价，未配置魔力值结算密钥' : billing.status === 'not_authenticated' ? '调用时未登录，未结算' : '本次未扣魔力值';
  const number = (value) => value == null ? '未提供' : Number(value).toLocaleString();
  return <div className="call-summary">
    <div className="metric-grid"><div><small>首个输出 (TTFT)</small><b>{metrics.firstTokenMs == null ? '未提供' : `${Math.round(metrics.firstTokenMs)} ms`}</b></div><div><small>总用时</small><b>{metrics.totalMs == null ? '未提供' : `${Math.round(metrics.totalMs)} ms`}</b></div><div><small>吞吐量</small><b>{metrics.throughputTokensPerSecond == null ? '未提供' : `${Number(metrics.throughputTokensPerSecond).toFixed(2)} tok/s`}</b></div><div><small>本次费用</small><b>{Number(metrics.cost || 0).toFixed(6)}</b></div></div>
    <div className="token-breakdown"><div><span>协议类型</span><b>{item.provider?.protocol || '未提供'}</b></div><div><span>输入 tokens</span><b>{number(metrics.promptTokens)}{metrics.estimatedTokens ? ' · 估算' : ''}</b></div><div><span>输出 tokens</span><b>{number(metrics.completionTokens)}{metrics.estimatedTokens ? ' · 估算' : ''}</b></div><div><span>缓存创建 tokens</span><b>{creationReported ? number(metrics.cacheCreationTokens) : '未提供'}</b></div><div><span>缓存读取 tokens</span><b>{readReported ? number(metrics.cacheReadTokens) : '未提供'}</b></div>{usage?.prompt_cache_miss_tokens != null && <div><span>缓存未命中 tokens</span><b>{number(usage.prompt_cache_miss_tokens)}</b></div>}<div><span>总 tokens</span><b>{number(metrics.totalTokens)}</b></div><div><span>魔力值结算</span><b>{billingText}</b></div></div>
    <details className="call-metadata"><summary>返回元数据与原始用量</summary><pre>{JSON.stringify({ metadata: item.response?.metadata || null, usage: usage || null }, null, 2)}</pre></details>
    <p className="analytics-note">费用按该次调用时保存的模型价格计算，因此修改价格不会改写历史记录。</p>
  </div>;
}
function SettingsPage({ info, current, onSaved, onError, onDesktop, onMode }) {
  const [tab, setTab] = useState('models');
  return <><div className="settings-tabs" role="tablist"><button role="tab" aria-selected={tab === 'models'} className={tab === 'models' ? 'active' : ''} onClick={() => setTab('models')}><Bot size={16}/>模型配置</button><button role="tab" aria-selected={tab === 'permissions'} className={tab === 'permissions' ? 'active' : ''} onClick={() => setTab('permissions')}><Shield size={16}/>权限配置</button></div>{tab === 'models' ? <Models info={info} onSaved={onSaved} onError={onError}/> : <PermissionsPage info={info} current={current} onDesktop={onDesktop} onMode={onMode}/>}</>;
}
function PermissionsPage({ info, current, onDesktop, onMode }) { const [rules, setRules] = useState([]), [saved, setSaved] = useState(false); useEffect(() => { get('/api/permissions').then((d) => setRules(d.allow || [])); }, []); async function save() { await post('/api/permissions', { allow: rules.filter((r) => r.tool.trim()) }); setSaved(true); setTimeout(() => setSaved(false), 1200); } const tools = info?.tools || []; return <div className="page-content"><section className="section-block"><div className="section-head"><div><h2>当前任务权限</h2><p>{current ? `作用于“${current.title}”，也可在任务输入框中随时切换。` : '打开一个任务后即可选择权限策略。'}</p></div></div><div className="policy-list">{Object.entries(MODE).map(([key, value]) => <button className={`policy-row ${modeKey(current?.mode) === key ? 'active' : ''}`} key={key} onClick={() => onMode(key)} disabled={!current}><span className={`mode-icon ${value.tone}`}><Shield size={16}/></span><span><b>{value.label}</b><small>{value.desc}</small></span><span className="policy-note">{modeKey(current?.mode) === key ? <><Check size={14}/>当前策略</> : '选择'}</span></button>)}</div><label className="setting-toggle"><span><b>桌面会话</b><small>允许当前任务请求截图、鼠标和键盘操作。</small></span><input type="checkbox" checked={Boolean(current?.desktopEnabled)} onChange={(e) => onDesktop(e.target.checked)} disabled={!current}/></label></section><section className="section-block"><div className="section-head"><div><h2>永久允许规则</h2><p>匹配的工具调用将不再逐次询问；规则保存在当前项目中。</p></div><button onClick={() => setRules([...rules, { tool: '', pattern: '' }])}><Plus size={14}/>添加规则</button></div><div className="rules-help">可用工具：{tools.length ? tools.map((tool) => `${tool.name}（${tool.permission || 'L0'}）`).join('、') : '打开任务后加载工具列表'}</div>{rules.map((r, i) => <div className="rule-row" key={i}><input list="permission-tool-names" value={r.tool} aria-label="工具名" placeholder="工具名" onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, tool: e.target.value } : x))}/><input value={r.pattern || ''} aria-label="参数模式" placeholder="参数模式，例如 git *" onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, pattern: e.target.value } : x))}/><button className="remove-rule" title="删除规则" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2 size={14}/></button></div>)}<datalist id="permission-tool-names">{tools.map((tool) => <option key={tool.name} value={tool.name}>{tool.description || tool.plugin || ''}</option>)}</datalist>{!rules.length && <div className="empty-list">没有永久允许规则</div>}<div className="form-actions"><span>{saved ? '规则已保存' : ''}</span><button className="primary-action" onClick={save}>保存规则</button></div></section></div>; }
function Markdown({ text }) { return <Streamdown className="markdown-text" mode="streaming" controls={false}>{redact(text)}</Streamdown>; }
function inline(text) { return String(text).split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((x, i) => x.startsWith('`') ? <code key={i}>{x.slice(1, -1)}</code> : x.startsWith('**') ? <strong key={i}>{x.slice(2, -2)}</strong> : x.startsWith('*') ? <em key={i}>{x.slice(1, -1)}</em> : x); }
function redact(value) { return String(value ?? '').replace(/\bsk-[\w-]{12,}\b/g, 'sk-***已脱敏***').replace(/("?(?:apiKey|api_key|authorization)"?\s*[:=]\s*["']?)[^"'\s,}]+/gi, '$1***已脱敏***'); }
function formatContent(value) { return redact(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); }
function preview(value) { const x = JSON.stringify(value || {}); return x.length > 90 ? `${x.slice(0, 90)}…` : x; }
createRoot(document.getElementById('root')).render(<App/>);
