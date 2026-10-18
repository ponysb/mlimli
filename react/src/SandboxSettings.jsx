import React, { useEffect, useState } from 'react';
import { Download, LoaderCircle, RefreshCw, Shield, ShieldAlert, Wrench } from 'lucide-react';

export default function SandboxSettings({ get, post, onError, children }) {
  const [status, setStatus] = useState(null), [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const [domainText, setDomainText] = useState('');
  const [installing,setInstalling]=useState(false),[setupNotice,setSetupNotice]=useState(''),[setupError,setSetupError]=useState('');
  const canInstall=typeof window.desktop?.installWindowsSandbox==='function';
  const canRepair=typeof window.desktop?.repairWindowsSandbox==='function' && window.desktop?.platform==='win32';
  const [repairing,setRepairing]=useState(false);
  async function install(action = false) {
    const repair = action === true;
    if(busy||installing)return;
    setBusy(true);setInstalling(true);setRepairing(repair);setSetupNotice(repair?'正在修复沙箱组件；如出现 Windows 管理员授权窗口，请确认。':'请在 Windows 管理员授权窗口中确认，安装完成后会自动检测。');setSetupError('');
    try {
      const result=await (repair?window.desktop.repairWindowsSandbox():window.desktop.installWindowsSandbox());
      const value=await get('/api/sandbox');setStatus(value);
      setSetupNotice(result.cancelled?'已取消安装，可以稍后重试。':value.available?'沙箱安装完成，已通过检测。':'安装已结束，但沙箱尚未通过检测。');
      if(!result.cancelled&&!value.available)setSetupError(value.reason);
    } catch(error){setSetupNotice('');setSetupError(repair?`${error.message}。如组件已恢复但仍无法加载，请重启客户端后重新检测。`:error.message);}
    finally {setBusy(false);setInstalling(false);setRepairing(false);}
  }
  async function refresh() {
    setBusy(true);
    try { const value = await get('/api/sandbox'); setStatus(value); setDraft(value.policy); setDomainText((value.policy.allowedDomains || []).join('\n')); }
    catch (error) { onError?.(error); }
    finally { setBusy(false); }
  }
  useEffect(() => { refresh(); }, []);
  const change = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setSaved(false); };
  async function toggleEnabled() {
    const enabled = !draft.enabled;
    const previous = draft;
    const next = { ...draft, enabled };
    setDraft(next); setSaved(false); setBusy(true);
    try {
      const value = await post('/api/sandbox', next);
      setStatus(value); setDraft(value.policy); setDomainText((value.policy.allowedDomains || []).join('\n'));
      setSaved(true);
    } catch (error) {
      setDraft(previous); onError?.(error);
    } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try { const value = await post('/api/sandbox', draft); setStatus(value); setDraft(value.policy); setDomainText((value.policy.allowedDomains || []).join('\n')); setSaved(true); }
    catch (error) { onError?.(error); }
    finally { setBusy(false); }
  }
  const needsWindowsSetup = status?.backend === 'windows-native' && !status.available && Boolean(status.setupCommand);
  return <section className="section-block sandbox-settings">
    {draft?.enabled && <div className="sandbox-toolbar"><button disabled={busy} onClick={refresh}><RefreshCw size={14}/>重新检测</button></div>}
    {!draft ? <p>正在检测沙箱后端…</p> : <>
      <div className="setting-toggle sandbox-enable-toggle"><span><b>启用运行沙箱</b><small>{draft.enabled ? 'Agent 命令将按下方隔离策略执行' : '默认关闭，命令使用宿主权限'}</small></span><button type="button" className="sandbox-switch" role="switch" aria-checked={draft.enabled} aria-label="启用运行沙箱" onClick={toggleEnabled} disabled={busy}><span /></button></div>
      {draft.enabled && <>
      {(status?.backend==='windows-native' && canRepair || status?.diagnosticId) && <div className="form-actions">{status?.backend==='windows-native' && canRepair && <button disabled={busy} onClick={()=>install(true)}>{repairing?<LoaderCircle className="spin" size={14}/>:<Wrench size={14}/>} {repairing?'正在修复…':'修复沙箱'}</button>}<button disabled={busy} onClick={()=>navigator.clipboard?.writeText(JSON.stringify({ ...status, policy: undefined }, null, 2))}>复制诊断</button></div>}
      <div className="rules-help sandbox-status" role="status">{status?.available ? <Shield size={16}/> : <ShieldAlert size={16}/>}<div><b>{status?.available ? '沙箱已就绪' : draft.mode === 'off' ? '沙箱已关闭' : '沙箱未就绪'}</b><p>{needsWindowsSetup ? status.setupSupported===false ? status.reason : '安装程序已随客户端附带，无需额外下载。首次安装需要一次 Windows 管理员授权。' : status?.reason}</p>{needsWindowsSetup && canInstall && status.setupSupported!==false && <button className="primary-action sandbox-install" disabled={busy} onClick={install}>{installing?<LoaderCircle className="spin" size={14}/>:<Download size={14}/>} {installing?'等待授权并安装…':'安装沙箱'}</button>}{needsWindowsSetup&&!canInstall&&<p>请在桌面客户端中安装，或使用下方手动安装命令。</p>}{needsWindowsSetup && <details><summary>查看诊断详情</summary><p>{status.reason}</p></details>}</div></div>
      {setupNotice&&<p className="sandbox-setup-notice" role="status">{setupNotice}</p>}{setupError&&<p className="sandbox-setup-error" role="alert">{setupError}</p>}
      <div className="form-grid sandbox-form">
        <label>隔离模式<select aria-label="沙箱隔离模式" value={draft.mode} onChange={event => change('mode', event.target.value)} disabled={busy}><option value="workspace-write">工作区可写（推荐）</option><option value="read-only">只读</option><option value="off">关闭沙箱，使用宿主权限</option></select></label>
        <label>执行后端<select aria-label="沙箱执行后端" value={draft.backend} onChange={event => change('backend', event.target.value)} disabled={busy}><option value="auto">自动选择原生后端</option><option value="windows-native">Windows 原生 · Anthropic（Alpha）</option><option value="srt">Anthropic Sandbox Runtime（macOS / Linux）</option><option value="bubblewrap">Bubblewrap（Linux）</option><option value="seatbelt">Seatbelt（macOS）</option><option value="docker">Docker（可选）</option></select></label>
        {draft.backend === 'docker' && <label>Docker 沙箱镜像<input aria-label="Docker 沙箱镜像" value={draft.dockerImage} onChange={event => change('dockerImage', event.target.value)} disabled={busy}/></label>}
      </div>
      <label className="setting-toggle"><span><b>允许命令联网</b><small>{draft.networkAccess ? '已开放下方白名单中的域名' : '默认禁止网络访问'}</small></span><input type="checkbox" checked={draft.networkAccess} onChange={event => change('networkAccess', event.target.checked)} disabled={busy || draft.mode === 'off'}/></label>
       {['windows-native', 'srt', 'auto'].includes(draft.backend) &&<label className="sandbox-domains"><span>联网域名白名单</span><textarea aria-label="沙箱联网域名白名单" placeholder={'*\n*.npmjs.org\ngithub.com:443'} value={domainText} onChange={event => { setDomainText(event.target.value); change('allowedDomains', event.target.value.split('\n').map(domain => domain.trim()).filter(Boolean)); }} disabled={busy} rows={4}/><small>每行一个域名；填写 * 表示不限制，空白名单拒绝所有代理请求。</small></label>}
      {draft.mode === 'off' && <p className="rules-help">关闭后，模型生成的命令具有当前系统用户的文件、网络和进程权限。</p>}
      <details className="sandbox-notes"><summary>隔离范围与后端说明</summary><p>沙箱是可选隔离增强。自动选择 Windows 原生、Linux Bubblewrap/Docker 或 macOS Seatbelt；自动后端不可用时，Bash 会按当前授权规则使用宿主 shell，并在结果中标记。明确选择某个后端时，后端不可用会停止执行。</p>
      {status?.setupCommand && <details><summary>手动安装与卸载</summary><p>首次安装：<code>{status.setupCommand}</code>。需要一次管理员授权，创建独立执行账户和网络过滤规则。可用同一脚本的 uninstall 命令卸载；仅检测不会安装。</p></details>}
      <p>当前隔离范围是 Agent 命令和经文件工具访问的路径。已安装插件、MCP、语言服务、桌面控制及手动终端属于受信任的宿主能力。</p></details>
      <div className="form-actions"><span>{saved ? '沙箱配置已保存，后续工具调用生效' : '运行任务时不能更改配置'}</span><button className="primary-action" disabled={busy} onClick={save}>{busy ? '处理中…' : '保存沙箱配置'}</button></div>
      </>}
      {children && <div className="permissions-inline">{children}</div>}
    </>}
  </section>;
}
