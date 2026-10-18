import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, ChevronRight, CircleStop, Clock3, GitBranch, LoaderCircle, MessageSquare, Send, SquareTerminal, X } from 'lucide-react';
import './subagents.css';

const STATUS = { queued: '排队中', running: '工作中', waiting_permission: '等待审批', waiting_input: '等待输入', completed: '已完成', failed: '失败', cancelled: '已停止', budget_exceeded: '达到预算', interrupted: '运行中断' };
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'budget_exceeded', 'interrupted']);
const PROFILES = { explorer: '代码探索', researcher: '资料研究', reviewer: '审查', worker: '实现' };

function duration(task, now = Date.now()) {
  const start = task.startedAt || task.createdAt;
  if (!start) return '';
  const seconds = Math.max(0, Math.round(((task.finishedAt || now) - start) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60), rest = seconds % 60;
  return `${minutes} 分 ${rest} 秒`;
}

function tokens(value = 0) {
  if (value < 1000) return `${value}`;
  return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k`;
}

function plainContent(entry) {
  if (typeof entry?.content === 'string') return entry.content;
  if (typeof entry?.text === 'string') return entry.text;
  if (Array.isArray(entry?.content)) return entry.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
  return '';
}

function toolTimeline(entries = []) {
  const rows = [], byId = new Map();
  for (const entry of entries) {
    for (const call of entry.toolCalls || []) {
      const row = { id: call.id, name: call.name || '工具', args: call.args || {}, status: 'completed' };
      rows.push(row); byId.set(call.id, row);
    }
    if (entry.role === 'tool') {
      const row = byId.get(entry.toolCallId);
      if (row) row.status = entry.status || 'completed';
    }
  }
  return rows;
}

function currentAction(session, task) {
  const active = session?.activeStep;
  if (active?.thinking?.trim()) return active.thinking.trim().split('\n')[0];
  if (active?.text?.trim()) return active.text.trim().split('\n')[0];
  if (task.status === 'queued') return task.dependsOn?.length ? '等待依赖任务完成' : '等待可用执行槽';
  if (task.status === 'waiting_permission') return '需要审批后继续';
  if (task.status === 'waiting_input') return '需要补充信息后继续';
  return task.result?.summary?.trim().split('\n')[0] || STATUS[task.status] || task.status;
}

export function AgentStatusButton({ current, onClick }) {
  const tasks = current?.group?.tasks || [];
  if (current?.parentSessionId || !tasks.length) return null;
  const active = tasks.filter(task => !TERMINAL.has(task.status)).length;
  const attention = tasks.some(task => ['failed', 'budget_exceeded', 'interrupted', 'waiting_permission', 'waiting_input'].includes(task.status));
  return <button type="button" className={`agent-status-chip ${active ? 'is-active' : ''} ${attention ? 'needs-attention' : ''}`} onClick={onClick} title="打开 Agent 任务图">
    <span className="agent-status-dot" />
    <span>{active || tasks.length} Agent{tasks.length > 1 ? 's' : ''}</span>
  </button>;
}

function AgentNode({ task, onClick, now }) {
  return <button type="button" className="agent-map-node" onClick={onClick}>
    <span className={`agent-node-dot ${task.status}`} />
    <span className="agent-node-copy"><b>{task.title}</b><small>{STATUS[task.status] || task.status} · {duration(task, now)} · {tokens(task.usage?.totalTokens)} tokens</small></span>
    <ChevronRight size={16}/>
  </button>;
}

function AgentDetail({ task, onBack, onStop, onMessage }) {
  const [session, setSession] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [expanded, setExpanded] = useState({ prompt: true, tools: true, handoff: true });
  const [message, setMessage] = useState(''), [sending, setSending] = useState(false);
  useEffect(() => {
    let live = true;
    const load = (initial = false) => {
      if (initial) { setLoading(true); setError(''); }
      fetch(`/api/session/${task.sessionId}?all=1`).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '无法读取 Agent 详情');
        if (live) { setSession(data); setError(''); }
      }).catch(reason => live && setError(reason.message)).finally(() => { if (live && initial) setLoading(false); });
    };
    load(true);
    const timer = TERMINAL.has(task.status) ? null : setInterval(() => load(false), 1500);
    return () => { live = false; if (timer) clearInterval(timer); };
  }, [task.sessionId, task.status]);
  const entries = session?.entries || [];
  const tools = useMemo(() => toolTimeline(entries), [entries]);
  const prompt = entries.find(entry => entry.role === 'user' && entry.source !== 'agent');
  const handoffs = entries.filter(entry => entry.source === 'agent' || entry.type === 'task_summary');
  const toggle = key => setExpanded(value => ({ ...value, [key]: !value[key] }));
  async function submit() {
    if (!message.trim() || sending) return;
    setSending(true);
    const ok = await onMessage(task.agentId, message.trim(), TERMINAL.has(task.status) ? 'follow_up' : 'steer');
    if (ok) setMessage('');
    setSending(false);
  }
  return <div className="agent-detail">
    <header className="agent-detail-header">
      <button type="button" className="agent-icon-button" onClick={onBack} title="返回 Agent 图"><ArrowLeft size={19}/></button>
      <span className={`agent-node-dot ${task.status}`} />
      <div><h3>{task.title}</h3><p>{STATUS[task.status] || task.status} · {PROFILES[task.profile] || task.profile} · {task.model || '继承模型'}</p></div>
    </header>
    <div className="agent-detail-facts"><span>由主 Agent 派发</span><span><Clock3 size={13}/>{duration(task)}</span><span>{tokens(task.usage?.totalTokens)} tokens</span></div>
    <div className="agent-current-action"><span className={TERMINAL.has(task.status) ? '' : 'pulse-dot'} />{currentAction(session, task)}</div>
    {loading && <div className="agent-detail-loading"><LoaderCircle className="spin" size={16}/>读取执行记录…</div>}
    {error && <div className="agent-detail-error" role="alert">{error}</div>}
    {!loading && <div className="agent-detail-scroll">
      <section className="agent-detail-section">
        <button type="button" onClick={() => toggle('prompt')}>{expanded.prompt ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>任务 Prompt</span></button>
        {expanded.prompt && <pre>{plainContent(prompt) || '任务指令尚未写入会话。'}</pre>}
      </section>
      <section className="agent-detail-section">
        <button type="button" onClick={() => toggle('tools')}>{expanded.tools ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>工具调用 ({tools.length})</span></button>
        {expanded.tools && <div className="agent-tool-list">{tools.length ? tools.map((tool, index) => <details key={tool.id || index}>
          <summary><SquareTerminal size={15}/><b>{tool.name}</b><span>{tool.status === 'error' ? '失败' : '完成'}</span></summary>
          <pre>{JSON.stringify(tool.args, null, 2)}</pre>
        </details>) : <p>尚无工具调用</p>}</div>}
      </section>
      <section className="agent-detail-section">
        <button type="button" onClick={() => toggle('handoff')}>{expanded.handoff ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>交接记录 ({handoffs.length + (task.result ? 1 : 0)})</span></button>
        {expanded.handoff && <div className="agent-handoff-list">
          {handoffs.map((item, index) => <article key={item.id || index}><MessageSquare size={15}/><div><b>{item.type === 'task_summary' ? '完成总结' : '协作消息'}</b><p>{plainContent(item) || item.summaryText}</p></div></article>)}
          {task.result && <article className="final"><Check size={15}/><div><b>已交接给主 Agent</b><p>{task.result.summary}</p></div></article>}
          {!handoffs.length && !task.result && <p>任务结束后，结果将在这里交接给主 Agent。</p>}
        </div>}
      </section>
    </div>}
    <div className="agent-detail-compose">
      <textarea value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={TERMINAL.has(task.status) ? '追加要求并续跑这个 Agent…' : '向这个 Agent 追加指令…'} />
      {!TERMINAL.has(task.status) && <button type="button" className="agent-stop-button" onClick={() => onStop(task.agentId)} title="停止 Agent"><CircleStop size={16}/></button>}
      <button type="button" className="agent-send-button" disabled={!message.trim() || sending} onClick={submit} title="发送指令">{sending ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}</button>
    </div>
  </div>;
}

export default function SubagentPanel({ current, open, onClose, onStop, onMessage }) {
  const [selectedId, setSelectedId] = useState(null), [now, setNow] = useState(Date.now());
  const tasks = current?.group?.tasks || [];
  const selected = tasks.find(task => task.agentId === selectedId);
  useEffect(() => { if (!open) setSelectedId(null); }, [open]);
  useEffect(() => {
    if (!open || !tasks.some(task => !TERMINAL.has(task.status))) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, tasks.some(task => !TERMINAL.has(task.status))]);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (event.key === 'Escape') selectedId ? setSelectedId(null) : onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, selectedId, onClose]);
  if (!open || !current || current.parentSessionId || !tasks.length) return null;
  return createPortal(<div className="agent-layer" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="agent-workspace" role="dialog" aria-modal="true" aria-label="Agent 任务图">
      {selected ? <AgentDetail task={selected} onBack={() => setSelectedId(null)} onStop={onStop} onMessage={onMessage}/> : <>
        <header className="agent-workspace-header"><div><h2>Agent 任务图</h2><p>{tasks.length} 个 Agent · 点击节点查看执行详情</p></div><button type="button" className="agent-icon-button" onClick={onClose} title="关闭"><X size={19}/></button></header>
        <div className="agent-map-scroll"><div className="agent-map" style={{ '--agent-count': Math.max(1, tasks.length) }}>
          <div className="agent-root-node"><span className="agent-node-dot root"/><span className="agent-node-copy"><b>{current.title || '主 Agent'}</b><small>主 Agent · 负责统筹与验收</small></span></div>
          <div className="agent-map-branches" aria-hidden="true" />
          <div className="agent-map-children">{tasks.map(task => <AgentNode key={task.taskId} task={task} now={now} onClick={() => setSelectedId(task.agentId)}/>)}</div>
        </div></div>
        <footer className="agent-map-legend"><span><i className="running"/>工作中</span><span><i className="completed"/>已完成</span><span><i className="failed"/>需要关注</span><span><GitBranch size={14}/>共享同一任务目标，使用独立上下文</span></footer>
      </>}
    </section>
  </div>, document.body);
}
