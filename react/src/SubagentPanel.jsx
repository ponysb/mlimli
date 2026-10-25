import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ArrowLeft, Check, ChevronDown, ChevronRight, CircleStop, Clock3, GitBranch, List, LoaderCircle, MessageSquare, Search, Send, SquareTerminal, X } from 'lucide-react';
import './subagents.css';

const STATUS = { queued: '排队中', running: '工作中', waiting_children: '等待下属汇总', waiting_permission: '等待审批', waiting_input: '等待输入', completed: '已完成', failed: '失败', cancelled: '已停止', budget_exceeded: '达到预算', interrupted: '运行中断' };
const MISSION_STATUS = { planning: '规划中', executing: '推进中', recovering: '恢复中', blocked: '需核对', completed: '已验收', cancelled: '已停止' };
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'budget_exceeded', 'interrupted']);
const taskRole = task => task.role || task.title || '任务 Agent';
const deliveryLabel = task => task.delivery?.status === 'integrated' ? '已接收' : task.delivery?.status === 'conflict' ? '存在冲突' : task.status === 'completed' ? '待接收' : TERMINAL.has(task.status) ? '未交付' : '准备中';
const QUEUE_REASON = { dependencies: '等待依赖成果', delivery: '等待负责人接收交付', dependency_failed: '依赖未成功', workspace_writer: '等待工作区写入权限', capacity: '等待执行容量' };
const FILTERS = [{ id: 'all', label: '全部' }, { id: 'active', label: '执行中' }, { id: 'queued', label: '排队' }, { id: 'attention', label: '需关注' }, { id: 'completed', label: '已结束' }];
function bucket(task) {
  if (task.status === 'completed' && task.delivery && task.delivery.status !== 'integrated') return 'attention';
  if (['failed', 'budget_exceeded', 'interrupted', 'waiting_permission', 'waiting_input'].includes(task.status)) return 'attention';
  if (task.status === 'queued' || task.status === 'waiting_children') return 'queued';
  if (task.status === 'completed' || task.status === 'cancelled') return 'completed';
  return 'active';
}

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
      const row = { id: call.id, name: call.name || '工具', args: call.args || {}, status: 'pending' };
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
  if (task.recoveryBlocked) return task.recoveryBlocked;
  if (task.status === 'waiting_children') return '等待下属成果，执行容量已释放';
  return task.result?.summary?.trim().split('\n')[0] || STATUS[task.status] || task.status;
}

export function AgentStatusButton({ current, onClick }) {
  const tasks = current?.group?.tasks || [];
  if (current?.parentSessionId || !tasks.length) return null;
  const active = tasks.filter(task => !TERMINAL.has(task.status)).length;
  const attention = tasks.some(task => ['failed', 'budget_exceeded', 'interrupted', 'waiting_permission', 'waiting_input'].includes(task.status));
  return <button type="button" className={`agent-status-chip ${active ? 'is-active' : ''} ${attention ? 'needs-attention' : ''}`} onClick={onClick} title="查看蜂群状态" aria-haspopup="dialog">
    <span className="agent-status-dot" />
    <span>蜂群 · {active ? `${active} 项进行中` : `${tasks.length} 项已结束`}{attention ? ' · 需关注' : ''}</span>
  </button>;
}

function AgentNode({ task, onClick, now, dependencies = [] }) {
  return <button type="button" className="swarm-task-row" onClick={onClick}>
    <span className={`agent-node-dot ${task.status}`} />
    <span className="agent-node-copy"><b>{task.depth > 1 ? `↳ ${task.title}` : task.title}{task.canDelegate ? ' · 范围负责人' : ''}</b><small>{task.scope || taskRole(task)}{task.writablePaths?.length ? ` · 隔离交付 ${deliveryLabel(task)}` : ''}{dependencies.length ? ` · 依赖：${dependencies.map(item => item.title).join('、')}` : ''}</small><small>{QUEUE_REASON[task.queueReason] || STATUS[task.status] || task.status} · {duration(task, now)} · {tokens(task.usage?.totalTokens)} tokens{task.attempt > 1 ? ` · 第 ${task.attempt} 轮` : ''}</small></span>
    <ChevronRight size={16}/>
  </button>;
}

function AgentDetail({ task, tasks, onBack, onClose, onStop, onMessage }) {
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
    if (task.writablePaths && TERMINAL.has(task.status)) return;
    setSending(true);
    const ok = await onMessage(task.agentId, message.trim(), TERMINAL.has(task.status) ? 'follow_up' : 'steer');
    if (ok) setMessage('');
    setSending(false);
  }
  return <div className="agent-detail">
    <header className="agent-detail-header">
      <button type="button" className="agent-icon-button" onClick={onBack} title="返回 Agent 图"><ArrowLeft size={19}/></button>
      <span className={`agent-node-dot ${task.status}`} />
      <div><h3>{task.title}</h3><p>{STATUS[task.status] || task.status} · {taskRole(task)} · {task.model || '继承模型'}</p></div>
      <button type="button" className="agent-icon-button agent-detail-close" onClick={onClose} title="关闭"><X size={19}/></button>
    </header>
    <div className="agent-detail-facts"><span>{task.ownerTaskId ? `负责人：${tasks.find(item => item.taskId === task.ownerTaskId)?.title || '上级任务'}` : '由主 Agent 派发'}</span><span><Clock3 size={13}/>{duration(task)}</span><span>{tokens(task.usage?.totalTokens)} tokens</span></div>
    <div className="agent-current-action"><span className={TERMINAL.has(task.status) ? '' : 'pulse-dot'} />{currentAction(session, task)}</div>
    {loading && <div className="agent-detail-loading"><LoaderCircle className="spin" size={16}/>读取执行记录…</div>}
    {error && <div className="agent-detail-error" role="alert">{error}</div>}
    {!loading && <div className="agent-detail-scroll">
      <section className="agent-detail-section swarm-contract">
        {task.scope && <div><b>负责范围</b><p>{task.scope}</p></div>}
        {task.acceptance && <div><b>验收条件</b><p>{task.acceptance}</p></div>}
        {!!task.dependsOn?.length && <div><b>前置任务</b>{task.dependsOn.map(id => { const dependency = tasks.find(item => item.taskId === id); return <p key={id}>{dependency?.title || id} · {STATUS[dependency?.status] || '未知'}</p>; })}</div>}
        {task.queueReason && <div><b>当前等待</b><p>{QUEUE_REASON[task.queueReason]}</p></div>}
        {task.writablePaths?.length && <div><b>隔离交付</b><p>{task.writablePaths.join('、')} · {deliveryLabel(task)}{task.delivery?.status === 'conflict' ? `：${task.delivery.conflicts?.join('、')}` : ''}</p></div>}
        {!!task.history?.length && <details><summary>历史交接 · {task.history.length} 轮</summary>{task.history.map((item, index) => <div key={index}><b>第 {item.attempt} 轮 · {STATUS[item.result?.outcome] || item.result?.outcome}</b><p>{item.result?.summary}</p></div>)}</details>}
      </section>
      <section className="agent-detail-section">
        <button type="button" onClick={() => toggle('prompt')}>{expanded.prompt ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>任务 Prompt</span></button>
        {expanded.prompt && <pre>{plainContent(prompt) || '任务指令尚未写入会话。'}</pre>}
      </section>
      <section className="agent-detail-section">
        <button type="button" onClick={() => toggle('tools')}>{expanded.tools ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>工具调用 ({tools.length})</span></button>
        {expanded.tools && <div className="agent-tool-list">{tools.length ? tools.map((tool, index) => <details key={tool.id || index}>
          <summary><SquareTerminal size={15}/><b>{tool.name}</b><span>{tool.status === 'pending' ? '等待结果' : tool.status === 'error' ? '失败' : tool.status === 'denied' ? '已拒绝' : tool.status === 'ok' || tool.status === 'completed' ? '完成' : tool.status}</span></summary>
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
      <textarea disabled={Boolean(task.writablePaths && TERMINAL.has(task.status))} value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={task.writablePaths && TERMINAL.has(task.status) ? '需要调整成果时，请在主任务中要求创建新任务' : TERMINAL.has(task.status) ? '追加要求并续跑这个 Agent…' : '向这个 Agent 追加指令…'} />
      {!TERMINAL.has(task.status) && <button type="button" className="agent-stop-button" onClick={() => onStop(task.agentId)} title="停止 Agent"><CircleStop size={16}/></button>}
      <button type="button" className="agent-send-button" disabled={!message.trim() || sending} onClick={submit} title="发送指令">{sending ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}</button>
    </div>
  </div>;
}

export default function SubagentPanel({ current, open, onClose, onStop, onMessage }) {
  const [position, setPosition] = useState({ left: 16, bottom: 100, maxHeight: 500 });
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = document.querySelector('.agent-status-chip');
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(560, window.innerWidth - 24);
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), bottom: Math.max(12, window.innerHeight - rect.top + 8), maxHeight: Math.max(180, rect.top - 20) });
    };
    const dismiss = event => {
      if (!event.target.closest('.agent-workspace, .agent-status-chip')) onClose();
    };
    update();
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [open, onClose]);
  const [selectedId, setSelectedId] = useState(null), [now, setNow] = useState(Date.now());
  const [view, setView] = useState('tasks'), [filter, setFilter] = useState('all'), [query, setQuery] = useState(''), [visibleLimit, setVisibleLimit] = useState(60);
  const tasks = current?.group?.tasks || [];
  const counts = { all: tasks.length, active: 0, queued: 0, attention: 0, completed: 0 };
  tasks.forEach(task => counts[bucket(task)]++);
  const matching = tasks.filter(task => (filter === 'all' || bucket(task) === filter) && `${task.title} ${task.scope || ''} ${taskRole(task)}`.toLowerCase().includes(query.toLowerCase()));
  const shown = matching.slice(0, visibleLimit);
  const byId = new Map(tasks.map(task => [task.taskId, task]));
  const activity = [...(current?.group?.activity || [])].reverse();
  const selected = tasks.find(task => task.agentId === selectedId);
  useEffect(() => { if (!open) setSelectedId(null); }, [open]);
  useEffect(() => { setVisibleLimit(60); }, [query, filter, current?.id]);
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
  return createPortal(<div className="agent-layer">
    <section className="agent-workspace" style={position} role="dialog" aria-label="蜂群状态">
      {selected ? <AgentDetail task={selected} tasks={tasks} onBack={() => setSelectedId(null)} onClose={onClose} onStop={onStop} onMessage={onMessage}/> : <>
        <header className="agent-workspace-header"><div><h2>蜂群状态{current.group?.mission?.status ? ` · ${MISSION_STATUS[current.group.mission.status] || current.group.mission.status}` : ''}</h2><p className="swarm-goal">{current.title || '主任务'} · 并发容量 {current.group?.capacity || 2}</p></div><button type="button" className="agent-icon-button" onClick={onClose} title="关闭"><X size={19}/></button></header>
        <div className="swarm-metrics" aria-label="蜂群状态">
          <div><span>执行中</span><strong>{counts.active}</strong></div><div><span>排队</span><strong>{counts.queued}</strong></div><div className={counts.attention ? 'has-attention' : ''}><span>需关注</span><strong>{counts.attention}</strong></div><div><span>已结束</span><strong>{counts.completed}</strong></div><div><span>累计 tokens</span><strong>{tokens(tasks.reduce((total, task) => total + (task.usage?.totalTokens || 0), 0))}</strong></div>
        </div>
        <div className="swarm-toolbar">
          <div className="swarm-tabs" role="tablist" aria-label="蜂群视图">{[{ id: 'tasks', label: '任务', Icon: List }, { id: 'dependencies', label: '依赖', Icon: GitBranch }, { id: 'activity', label: '活动', Icon: Activity }].map(({ id, label, Icon }) => <button type="button" key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}><Icon size={15}/>{label}</button>)}</div>
          {view !== 'activity' && <label className="swarm-search"><Search size={14}/><input aria-label="搜索任务" placeholder="搜索任务或范围" value={query} onChange={event => setQuery(event.target.value)}/></label>}
        </div>
        {view !== 'activity' && <div className="swarm-filters" aria-label="任务状态筛选">{FILTERS.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{counts[item.id]}</span></button>)}</div>}
        <div className="swarm-scroll">
          {!!current.group?.mission?.requirements?.length && <details className="swarm-requirements"><summary>目标要求 · {current.group.mission.requirements.filter(item => item.status === 'accepted').length}/{current.group.mission.requirements.length} 项已验收</summary>{current.group.mission.requirements.map(item => <div key={item.id}><b>{item.text}</b><span>{({ pending: '待验收', accepted: '已验收', blocked: '受阻' })[item.status]}</span>{item.evidence && <p>{item.evidence}</p>}</div>)}{current.group.mission.blockedReason && <p>{current.group.mission.blockedReason}</p>}</details>}
          {view === 'activity' ? <div className="swarm-activity">{activity.length ? activity.map(item => <button type="button" key={item.id} onClick={() => { const task = byId.get(item.taskId); if (task) setSelectedId(task.agentId); }}><span className={`agent-node-dot ${item.kind}`}/><div><b>{item.title}</b><p>{item.text}</p></div><time>{new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></button>) : <p className="swarm-empty">暂无活动记录</p>}</div> : <>
            {shown.length ? shown.map(task => <div key={task.taskId} className="swarm-task-entry">
              {view === 'dependencies' && <div className="swarm-dependencies"><GitBranch size={14}/>{task.dependsOn?.length ? task.dependsOn.map(id => { const dependency = byId.get(id); return <button type="button" key={id} onClick={() => dependency && setSelectedId(dependency.agentId)}><span className={`agent-node-dot ${dependency?.status}`}/>{dependency?.title || id}<ChevronRight size={12}/></button>; }) : <span>独立任务</span>}</div>}
              <AgentNode task={task} now={now} dependencies={view === 'tasks' ? (task.dependsOn || []).map(id => byId.get(id)).filter(Boolean) : []} onClick={() => setSelectedId(task.agentId)}/>
            </div>) : <p className="swarm-empty">没有匹配的任务</p>}
            {matching.length > shown.length && <button type="button" className="swarm-load-more" onClick={() => setVisibleLimit(value => value + 60)}>加载更多 · 剩余 {matching.length - shown.length} 项</button>}
          </>}
        </div>
        <footer className="swarm-footer"><span>{current.group?.stopped ? '任务组已停止' : tasks.some(task => !TERMINAL.has(task.status)) ? '正在推进' : '子任务已结束'} · 共 {tasks.length} 项</span><span>{tasks.filter(task => task.status === 'completed' && task.delivery && task.delivery.status !== 'integrated').length} 项待接收 · {tasks.filter(task => task.status === 'completed').length} 项已返回</span></footer>
      </>}
    </section>
  </div>, document.body);
}
