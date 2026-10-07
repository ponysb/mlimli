import React, { useState } from 'react';
import { Bot, ChevronDown, ChevronRight, CircleStop } from 'lucide-react';
import './subagents.css';

const STATUS = { queued: '排队', running: '运行中', waiting_permission: '待审批', waiting_input: '待输入', completed: '完成', failed: '失败', cancelled: '已停止', budget_exceeded: '达到预算', interrupted: '运行中断' };
const TERMINAL = ['completed', 'failed', 'cancelled', 'budget_exceeded', 'interrupted'];
const PROFILES = { explorer: '代码探索', researcher: '资料研究', reviewer: '审查', worker: '实现' };

export default function SubagentPanel({ current, onOpen, onStop }) {
  const [expanded, setExpanded] = useState(true);
  const tasks = current.group?.tasks || [], child = Boolean(current.parentSessionId);
  if (child) return <div className="subagent-parent"><Bot size={16}/><span>子 Agent · 独立上下文</span><button type="button" onClick={() => onOpen(current.rootSessionId)}>返回主任务</button></div>;
  if (!tasks.length) return null;
  return <section className="subagent-panel" aria-label="子 Agent 任务">
    <div className="subagent-heading">
      <button type="button" className="subagent-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<Bot size={16}/><span>子 Agent</span><small>{tasks.filter(t => !TERMINAL.includes(t.status)).length} 进行中 / {tasks.length} 总计</small></button>
    </div>
    {expanded && <div className="subagent-body">
      {tasks.map(task => <article className="subagent-task" key={task.taskId}>
        <div className="subagent-task-heading"><button type="button" onClick={() => onOpen(task.sessionId)}>{task.title}</button><span className={`subagent-state ${task.status}`}>{STATUS[task.status] || task.status}</span></div>
        <div className="subagent-meta"><span>{PROFILES[task.profile] || task.profile} · {task.model || '继承模型'}</span><span>{task.usage?.totalTokens || 0} tokens{task.startedAt && task.finishedAt ? ` · ${Math.ceil((task.finishedAt - task.startedAt) / 1000)} 秒` : ''}</span></div>
        {task.result?.summary && <p className="subagent-result">{task.result.summary}</p>}
        {!TERMINAL.includes(task.status) && <div className="subagent-actions"><button type="button" title={`停止 ${task.title}`} aria-label={`停止 ${task.title}`} onClick={() => onStop(task.agentId)}><CircleStop size={15}/></button></div>}
      </article>)}
    </div>}
  </section>;
}
