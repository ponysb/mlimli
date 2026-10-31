import React, { useEffect, useId, useRef, useState } from 'react';
import { Plus, Save, Plug, Trash2, X, Upload, Server, CheckCircle2, AlertCircle, Settings2, ChevronDown } from 'lucide-react';
import './acp-settings.css';
import './mcp-settings.css';
import McpAuthorization from './McpAuthorization.jsx';

const fresh = () => ({ name: '', type: 'stdio', enabled: true, command: '', argsText: '[]', cwd: '', url: '', timeout: 30000, bearer_token_env_var: '', envText: '', headersText: '', oauthText: '', tokenText: '', authType: 'auto', clearEnv: false, clearHeaders: false });
function McpDialog({ title, description, busy, onClose, children }) {
  const dialog = useRef(null), titleId = useId();
  useEffect(() => { const element = dialog.current; element.showModal(); element.querySelector('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')?.focus(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="mcp-dialog" aria-labelledby={titleId} onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }}>
    <header><div><h3 id={titleId}>{title}</h3><p>{description}</p></div><button type="button" disabled={busy} aria-label="关闭弹窗" onClick={onClose}><X size={18}/></button></header>
    {children}
  </dialog>;
}

function ToolResult({ result }) {
  return <div className="mcp-test-result"><h3>{result.name} 的工具</h3>{result.tools.length ? <ul>{result.tools.map(t => <li key={t.name}><b>{t.name}</b>{t.description && <p>{t.description}</p>}</li>)}</ul> : <p>连接成功，服务未提供工具。</p>}</div>;
}

export default function McpSettings({ get, post }) {
  const [data, setData] = useState({ servers: [], contributed: [] }), [draft, setDraft] = useState(null), [editing, setEditing] = useState(false);
  const [expandedTools, setExpandedTools] = useState({});
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [result, setResult] = useState(null), [confirmDelete, setConfirmDelete] = useState(false), [importText, setImportText] = useState(''), [checks, setChecks] = useState({}), [importOpen, setImportOpen] = useState(false), [auth, setAuth] = useState(null);
  useEffect(() => { let active = true; get('/api/mcp/settings').then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [get]);
  function edit(server) { setImportOpen(false); setDraft({ ...fresh(), ...server, type: server.url ? server.type === 'sse' ? 'sse' : 'http' : 'stdio', authType: server.auth?.type || 'auto', oauthText: server.oauth === undefined ? '' : JSON.stringify(server.oauth, null, 2), argsText: JSON.stringify(server.args || [], null, 2) }); setEditing(true); setError(''); setNotice(''); setResult(null); setConfirmDelete(false); }
  function change(key, value) { setDraft(d => ({ ...d, [key]: value })); setNotice(''); setResult(null); setConfirmDelete(false); }
  async function perform(task) { setBusy(true); setError(''); setNotice(''); try { await task(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function save(event) {
    event.preventDefault();
    await perform(async () => {
      if (draft.owner) {
        const body = { action: 'plugin-auth', owner: draft.owner, name: draft.name, auth: { type: draft.authType }, oauth: draft.oauthText.trim() ? JSON.parse(draft.oauthText) : true, bearer_token_env_var: draft.bearer_token_env_var.trim() };
        if (draft.tokenText.trim()) { body.headers = { Authorization: 'Bearer ' + draft.tokenText.trim() }; body.bearer_token_env_var = ''; }
        else if (draft.headersText.trim()) body.headers = JSON.parse(draft.headersText);
        if (draft.clearHeaders) body.headers = {};
        const value = await post('/api/mcp/settings', body); setData(value); setDraft(null); setResult(null); setChecks(c => { const next = { ...c }; delete next[draft.name]; return next; }); setNotice('插件认证配置已保存。'); return;
      }
      const server = { name: draft.name.trim(), type: draft.type, enabled: draft.enabled, auth: { type: draft.authType }, timeout: Number(draft.timeout) };
      if (draft.type === 'stdio') Object.assign(server, { command: draft.command.trim(), args: JSON.parse(draft.argsText), cwd: draft.cwd });
      else Object.assign(server, { url: draft.url.trim(), bearer_token_env_var: draft.bearer_token_env_var.trim() });
      if (draft.url || draft.type !== 'stdio') server.oauth = draft.oauthText.trim() ? JSON.parse(draft.oauthText) : true;
      for (const [key, clear] of [['env', 'clearEnv'], ['headers', 'clearHeaders']]) {
        if (draft[clear]) server[key] = {};
        else if (draft[`${key}Text`].trim()) server[key] = JSON.parse(draft[`${key}Text`]);
      }
      if (draft.tokenText.trim()) { server.headers = { ...server.headers, Authorization: 'Bearer ' + draft.tokenText.trim() }; server.bearer_token_env_var = ''; }
      const value = await post('/api/mcp/settings', { action: 'save', server }); setData(value); setDraft(null); setResult(null); setChecks(c => { const next = { ...c }; delete next[server.name]; return next; }); setNotice('已保存并生效。点击测试连接可检查工具列表。');
    });
  }
  async function test(name) { setResult(null); setExpandedTools(c => ({ ...c, [name]: false })); setChecks(c => ({ ...c, [name]: { state: 'testing' } })); await perform(async () => { try { const value = await post('/api/mcp/test', { name }); setResult({ name, tools: value.tools }); get('/api/mcp/settings').then(setData).catch(() => {}); setChecks(c => ({ ...c, [name]: { state: 'connected', count: value.tools.length, tools: value.tools } })); } catch(e) { get('/api/mcp/settings').then(setData).catch(() => {}); setChecks(c => ({ ...c, [name]: { state: 'error', message: e.message } })); throw e; } }); }
  useEffect(() => {
    if (!auth || !['starting', 'waiting'].includes(auth.status)) return;
    const timer = setInterval(() => post('/api/mcp/auth/status', { name: auth.name }).then(value => { setAuth({ ...value, name: auth.name }); if (value.status === 'authorized') { setNotice('授权成功，可以测试连接。'); setChecks(c => ({ ...c, [auth.name]: undefined })); } }).catch(e => { setError(e.message); setAuth(null); }), 1000);
    return () => clearInterval(timer);
  }, [auth?.name, auth?.status, post]);
  async function authorize(name) { await perform(async () => { const value = await post('/api/mcp/auth', { name }); setAuth({ ...value, name }); }); }
  function add() { setImportOpen(false); setDraft(fresh()); setEditing(false); setError(''); setNotice(''); setResult(null); setConfirmDelete(false); }
  function row(s, contributed = false) {
    const check = checks[s.name], status = s.enabled === false ? '已停用' : check?.state === 'connected' ? `已连接 · ${check.count} 个工具` : check?.state === 'testing' ? '连接中…' : check?.state === 'error' ? '连接失败' : '未检测';
    const canExpand = s.enabled !== false && check?.state === 'connected', toolsOpen = canExpand && Boolean(expandedTools[s.name]), toolsId = `mcp-tools-${s.name}`;
    return <li className="mcp-service-row" key={s.name}>
      <div className="mcp-service-identity"><span className="mcp-service-icon"><Server size={18}/></span><div><h3>{s.name}</h3><p>{contributed ? `来自 ${s.owner} 插件` : '自定义服务'}</p></div></div>
      <div className="mcp-service-connection"><span>{s.url ? s.type === 'sse' ? 'SSE' : 'HTTP' : 'stdio'}</span><div className="mcp-service-endpoint" title={s.url || s.command}>{s.url ? new URL(s.url).host : s.command?.split(/[\\/]/).pop() || '本地服务'}</div></div>
      <div className="mcp-service-auth">{s.authentication?.label || '—'}</div>
      {canExpand ? <button type="button" className="mcp-state connected mcp-tools-toggle" aria-expanded={toolsOpen} aria-controls={toolsId} aria-label={`${toolsOpen ? '收起' : '展开'} ${s.name} 的 ${check.count} 个工具`} onClick={() => setExpandedTools(c => ({ ...c, [s.name]: !c[s.name] }))}><i/>{status}<ChevronDown size={13} aria-hidden="true"/></button> : <span className={`mcp-state ${check?.state || ''} ${s.enabled === false ? 'disabled' : ''}`}><i/>{status}</span>}
      <div className="mcp-row-actions">{s.url && s.type !== 'sse' && s.authentication?.action === 'authorize' && <button disabled={busy} onClick={() => authorize(s.name)}>浏览器授权</button>}<button disabled={busy || s.enabled === false} onClick={() => test(s.name)} aria-label={`测试连接 ${s.name}`}><Plug size={14}/>测试连接</button><button disabled={busy} onClick={() => edit(s)} aria-label={`配置 ${s.name}`}><Settings2 size={14}/>配置</button></div>
      {check?.message && <p className="mcp-row-message" role="alert">{check.message}</p>}
      {auth?.name === s.name && <div className="mcp-row-message" role="status">{auth.status === 'error' ? auth.error : auth.status === 'authorized' ? '已授权' : auth.status === 'cancelled' ? '已取消' : auth.status === 'starting' ? '正在获取认证信息…' : '请在应用内完成授权…'}{auth.url && <div><McpAuthorization id={auth.id}/></div>}{['starting','waiting'].includes(auth.status) && <button onClick={() => post('/api/mcp/auth/cancel', { name: s.name }).then(value => setAuth({ ...value, name: s.name }))}>取消授权</button>}</div>}
      {canExpand && <div id={toolsId} className="mcp-row-tools" role="region" aria-label={`${s.name} 的工具`} hidden={!toolsOpen}>{toolsOpen && <ToolResult result={{ name: s.name, tools: check.tools }}/>}</div>}
    </li>;
  }
  function serviceList(servers, contributed = false) {
    return <div className="mcp-service-list"><div className="mcp-list-columns" aria-hidden="true"><span>服务</span><span>连接方式 / 地址</span><span>认证</span><span>状态</span><span>操作</span></div><ul aria-label={contributed ? '插件服务' : '我的服务'}>{servers.map(s => row(s, contributed))}</ul></div>;
  }
  return <div className="page-content" role="tabpanel" aria-label="MCP 服务"><section className="section-block acp-settings mcp-settings">
    <header className="mcp-page-head"><div><span className="mcp-eyebrow">INTEGRATIONS</span><h2>MCP 服务<span>{data.servers.length + data.contributed.length}</span></h2><p>把你常用的工具，连接到工作流。</p></div><div className="mcp-head-actions"><button disabled={busy || loading} onClick={() => { setDraft(null); setError(''); setNotice(''); setImportOpen(true); }}><Upload size={15}/>导入配置</button><button className="mcp-primary" disabled={busy || loading} onClick={add}><Plus size={16}/>添加服务</button></div></header>
    {error && !draft && !importOpen && <div className="mcp-feedback error" role="alert"><AlertCircle size={16}/>{error}</div>}{notice && <div className="mcp-feedback" role="status"><CheckCircle2 size={16}/>{notice}</div>}
    {loading ? <p role="status">正在加载配置…</p> : <>
      {data.servers.length > 0 && <><div className="mcp-group-heading"><h3>我的服务</h3><span>{data.servers.length} 个服务</span></div>{serviceList(data.servers)}</>}
      {draft && <McpDialog title={editing ? `配置 ${draft.name}` : '添加 MCP 服务'} description="保存后立即生效，测试连接可查看可用工具。" busy={busy} onClose={() => setDraft(null)}>{error && <div className="mcp-feedback error" role="alert">{error}</div>}
      <form className="acp-form" onSubmit={save}><fieldset disabled={busy}>
        <label>服务名称<input autoFocus={!editing} required pattern={"[A-Za-z0-9_.\\-]{1,80}"} maxLength={80} disabled={editing} value={draft.name} onChange={e => change('name', e.target.value)} placeholder="filesystem"/></label>
        <label>连接方式<select disabled={Boolean(draft.owner)} value={draft.type} onChange={e => change('type', e.target.value)}><option value="stdio">本地命令（stdio）</option><option value="http">远程 HTTP（Streamable HTTP）</option><option value="sse">旧版 SSE</option></select></label>
        <label className="acp-checkbox"><input type="checkbox" checked={draft.enabled !== false} onChange={e => change('enabled', e.target.checked)}/>启用服务</label>
        {draft.type === 'stdio' ? <>
          <label>可执行文件<input required value={draft.command} onChange={e => change('command', e.target.value)} placeholder="npx" spellCheck={false}/><small>填写程序路径或命令名，参数在下方单独填写。</small></label>
          <label>启动参数（JSON 数组）<textarea required rows={3} value={draft.argsText} onChange={e => change('argsText', e.target.value)} placeholder={'["-y", "@modelcontextprotocol/server-filesystem", "/允许访问的目录"]'} spellCheck={false}/></label>
          <label>工作目录（可选）<input value={draft.cwd} onChange={e => change('cwd', e.target.value)} placeholder="使用 MLI 进程工作目录"/></label>
        </> : <>
          <label>服务地址<input disabled={Boolean(draft.owner)} required type="url" value={draft.url} onChange={e => change('url', e.target.value)} placeholder="https://example.com/mcp" spellCheck={false}/></label>
          <label>认证方式<select value={draft.authType} onChange={e => change('authType', e.target.value)}><option value="auto">自动检测（按服务响应）</option><option value="none">无需认证</option><option value="bearer">Bearer Token / PAT</option><option value="header">API Key / 自定义请求头</option><option value="oauth">OAuth 浏览器授权</option><option value="device_code">设备码（尚未支持）</option><option value="client_credentials">机器身份（尚未支持）</option><option value="jwt_bearer">JWT 身份（尚未支持）</option></select></label>
          <label>访问令牌（可选）<input type="password" autoComplete="new-password" value={draft.tokenText} onChange={e => change('tokenText', e.target.value)} placeholder="粘贴服务方 Token，保存后不回显"/><small>用于支持 Bearer Token 的服务，凭据只保存在本机。</small></label>
          <label>OAuth 配置（可选）<textarea rows={3} value={draft.oauthText} onChange={e => change('oauthText', e.target.value)} placeholder={'{"client_id":"服务方分配的 ID","client_secret_env":"OAUTH_CLIENT_SECRET","scope":"所需权限"}'}/><small>默认自动注册并在线授权。仅在服务方提供预注册客户端时填写；密钥使用环境变量，false 可关闭 OAuth。</small></label>
          <label>Token 环境变量名（可选）<input value={draft.bearer_token_env_var} onChange={e => change('bearer_token_env_var', e.target.value)} placeholder="MY_MCP_TOKEN"/><small>读取 MLI 启动环境中的变量；也可以在下方请求头中填写 Authorization。</small></label>
        </>}
        <label>连接与请求超时（毫秒）<input type="number" required min={100} max={300000} step={1} value={draft.timeout} onChange={e => change('timeout', e.target.value)}/></label>
        <details><summary>环境变量与认证</summary>{[['env', '环境变量', 'clearEnv', 'envKeys'], ['headers', '请求头', 'clearHeaders', 'headerKeys']].map(([key, title, clear, keys]) => <div key={key}><label>{title}（JSON 对象）<textarea rows={3} autoComplete="off" spellCheck={false} disabled={draft[clear]} value={draft[`${key}Text`]} onChange={e => change(`${key}Text`, e.target.value)} placeholder={key === 'env' ? '{"API_KEY":"…"}' : '{"Authorization":"Bearer …"}'}/><small>已有键：{draft[keys]?.join('、') || '无'}。值不回显；留空保留，填写则替换全部。</small></label><label className="acp-checkbox"><input type="checkbox" checked={draft[clear]} onChange={e => change(clear, e.target.checked)}/>清空已有{title}</label></div>)}</details>
        <div className="form-actions"><button type="submit" className="primary-action"><Save size={16}/>{busy ? '正在处理…' : '保存配置'}</button><button type="button" onClick={() => setDraft(null)}>取消</button>{editing && <><button type="button" onClick={() => test(draft.name)}><Plug size={16}/>测试已保存配置</button>{!draft.owner && <button type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>删除</button>}</>}</div>
        {confirmDelete && <div className="acp-delete" role="alert"><p>确认删除“{draft.name}”？</p><button type="button" onClick={() => perform(async () => { setData(await post('/api/mcp/settings', { action: 'delete', name: draft.name })); setDraft(null); setResult(null); setChecks(c => { const next = { ...c }; delete next[draft.name]; return next; }); setConfirmDelete(false); setNotice('服务已删除'); })}>确认删除</button><button type="button" onClick={() => setConfirmDelete(false)}>取消</button></div>}
      </fieldset></form>{result?.name === draft.name && <ToolResult result={result}/>}</McpDialog>}
      {data.contributed.length > 0 && <><div className="mcp-group-heading"><h3>插件服务</h3><span>随插件管理 · {data.contributed.length} 个服务</span></div>{serviceList(data.contributed, true)}</>}
      {!data.servers.length && !data.contributed.length && <p className="mcp-empty">暂无 MCP 服务，可通过右上方添加服务或导入配置。</p>}
      {busy && <p role="status">正在处理，请稍候…</p>}
      {importOpen && <McpDialog title="导入 MCP 配置" description="粘贴包含 mcpServers 对象的 JSON。同名服务请通过配置编辑。" busy={busy} onClose={() => setImportOpen(false)}>
        {error && <div className="mcp-feedback error" role="alert">{error}</div>}
        <form className="acp-form mcp-import-form" onSubmit={event => { event.preventDefault(); perform(async () => { setData(await post('/api/mcp/settings', { action: 'import', config: JSON.parse(importText) })); setImportText(''); setResult(null); setImportOpen(false); setNotice('导入成功，配置已生效。'); }); }}><fieldset disabled={busy}><label>MCP JSON 配置<textarea autoFocus required rows={10} value={importText} onChange={e => setImportText(e.target.value)} placeholder={'{"mcpServers":{"example":{"command":"npx","args":["-y","包名"]}}}'} spellCheck={false}/></label><div className="form-actions"><button type="submit" className="primary-action" disabled={!importText.trim()}><Upload size={15}/>{busy ? '正在导入…' : '确认导入'}</button><button type="button" onClick={() => setImportOpen(false)}>取消</button></div></fieldset></form>
      </McpDialog>}
    </>}
  </section></div>;
}
