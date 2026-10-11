import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import './acp-settings.css';

const fresh = () => ({ id: '', name: '', command: '', argsText: '[]', timeoutMs: 600000, envText: '', clearEnv: false });

export default function AcpSettings({ get, post }) {
  const [agents, setAgents] = useState([]), [draft, setDraft] = useState(null), [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [discovering, setDiscovering] = useState(false), [discovered, setDiscovered] = useState([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    let active = true;
    get('/api/acp/settings').then(data => { if (active) setAgents(data.agents); }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [get]);
  function change(key, value) { setDraft(current => ({ ...current, [key]: value })); setNotice(''); setConfirmDelete(false); }
  function edit(agent) {
    setDraft({ ...fresh(), ...agent, argsText: JSON.stringify(agent.args, null, 2) }); setEditing(true); setError(''); setNotice(''); setConfirmDelete(false);
  }
  async function discover() {
    setDiscovering(true); setError(''); setNotice('');
    try {
      const data = await post('/api/acp/discover', {});
      setDiscovered(data.agents || []);
      setNotice('检测完成。只有握手成功的 ACP 客户端可连接；检测不会保存配置或启动任务。');
    } catch (cause) { setError(cause.message); }
    finally { setDiscovering(false); }
  }
  async function save(event) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      const args = JSON.parse(draft.argsText);
      if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new Error('启动参数须为 JSON 字符串数组，例如 ["acp"]');
      const agent = { id: draft.id.trim(), name: draft.name.trim(), command: draft.command.trim(), args, timeoutMs: Number(draft.timeoutMs) };
      if (draft.clearEnv) agent.env = {};
      else if (draft.envText.trim()) {
        agent.env = JSON.parse(draft.envText);
        if (!agent.env || Array.isArray(agent.env) || typeof agent.env !== 'object' || Object.values(agent.env).some(value => typeof value !== 'string')) throw new Error('环境变量须为 JSON 字符串对象');
      }
      setBusy(true);
      const data = await post('/api/acp/settings', { action: 'save', agent });
      setAgents(data.agents); edit(data.agents.find(item => item.id === agent.id)); setNotice('已保存，后续新任务立即生效。未启动外部程序。');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try {
      const data = await post('/api/acp/settings', { action: 'delete', id: draft.id });
      setAgents(data.agents); setDraft(null); setConfirmDelete(false); setNotice('Agent 已删除');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <div className="page-content" role="tabpanel" aria-label="外部 Agent">
    <section className="section-block acp-settings">
      <div className="section-head"><div><h2>外部 Agent · ACP</h2><p>让 MLI 调度你信任的外部 Agent，复用任务队列、审批与结果汇总。</p></div><div className="form-actions"><button type="button" disabled={loading || busy || discovering} onClick={discover}><RefreshCw size={16}/>{discovering ? '检测中…' : '检测本机 ACP'}</button><button type="button" disabled={loading || busy} onClick={() => { setDraft(fresh()); setEditing(false); setError(''); setNotice(''); setConfirmDelete(false); }}><Plus size={16}/>添加 Agent</button></div></div>
      <div className="acp-warning"><strong>外部程序不受 MLI 沙箱保护</strong><p>仅添加可信程序。每次启动仍需审批；保存不会安装、启动或登录 Agent。运行任务期间不能修改配置。</p></div>
      {error && <p className="acp-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {discovered.length > 0 && <div className="acp-discovery" aria-label="本机 ACP 检测结果"><strong>本机 ACP 检测</strong>{discovered.map(agent => <p key={agent.id}><b>{agent.name}</b>：{agent.status === 'available' ? `可连接（${agent.kind === 'adapter' ? '适配器' : '原生 ACP'}，${agent.command} ${agent.args.join(' ')}）` : agent.status === 'unsupported' ? `暂不支持：${agent.reason}` : agent.status === 'not_found' ? '未找到已知 ACP 入口' : `不是可用的 ACP 客户端${agent.error ? `：${agent.error}` : ''}`}</p>)}</div>}
      {loading ? <p role="status">正在加载配置…</p> : <div className="acp-layout">
        <div className="acp-list" aria-label="已配置 Agent">{agents.length ? agents.map(agent => <button type="button" key={agent.id} disabled={busy} className={draft?.id === agent.id ? 'active' : ''} aria-pressed={draft?.id === agent.id} onClick={() => edit(agent)}><strong>{agent.name}</strong><small>{agent.id}</small></button>) : <p>还没有外部 Agent。添加后，可在聊天中指定使用它完成任务。</p>}</div>
        {draft ? <form onSubmit={save} className="acp-form"><fieldset disabled={busy}>
          <label>配置 ID<input required pattern="[A-Za-z0-9_-]{1,80}" maxLength={80} value={draft.id} disabled={editing} onChange={event => change('id', event.target.value)} placeholder="opencode"/><small>派发任务时使用此 ID；保存后不可修改。</small></label>
          <label>显示名称<input value={draft.name} maxLength={120} onChange={event => change('name', event.target.value)} placeholder="OpenCode"/></label>
          <label>可执行文件<input required value={draft.command} onChange={event => change('command', event.target.value)} placeholder="/absolute/path/to/opencode" spellCheck={false}/><small>建议绝对路径，不是 shell 命令；Codex 需使用 codex-acp 适配器。</small></label>
          <label>启动参数（JSON 数组）<textarea required rows={3} value={draft.argsText} onChange={event => change('argsText', event.target.value)} spellCheck={false}/><small>OpenCode：["acp"]；codex-acp：[]。不要在参数中放密钥。</small></label>
          <label>任务超时（毫秒）<input required type="number" min={100} max={86400000} step={1} value={draft.timeoutMs} onChange={event => change('timeoutMs', event.target.value)}/></label>
          <details><summary>环境变量（高级）</summary><p>已有变量：{draft.envKeys?.join('、') || '无'}。值不回显；留空保留已有值，填写对象会替换全部变量。</p><label>环境变量（JSON 对象）<textarea rows={3} value={draft.envText} disabled={draft.clearEnv} onChange={event => change('envText', event.target.value)} spellCheck={false} autoComplete="off" placeholder={'{"EXAMPLE_KEY": "value"}'}/></label><label className="acp-checkbox"><input type="checkbox" checked={draft.clearEnv} onChange={event => change('clearEnv', event.target.checked)}/>清空已有环境变量</label></details>
          <div className="form-actions"><button type="submit" className="primary-action"><Save size={16}/>{busy ? '保存中…' : '保存配置'}</button>{editing && <button type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>删除</button>}</div>
          {confirmDelete && <div className="acp-delete" role="alert"><p>确认删除“{draft.name || draft.id}”？后续任务将无法选择此 Agent。</p><button type="button" onClick={remove}>确认删除</button><button type="button" onClick={() => setConfirmDelete(false)}>取消</button></div>}
        </fieldset></form> : <div className="acp-empty">选择 Agent 编辑配置，或点击“添加 Agent”。<p>添加后可对 MLI 说：“用已配置的 OpenCode 完成这个任务”。</p></div>}
      </div>}
    </section>
  </div>;
}
