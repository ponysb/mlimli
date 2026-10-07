import React, { useEffect, useState } from 'react';
import { Download, LoaderCircle, RefreshCw, Shield, ShieldAlert } from 'lucide-react';

export default function SandboxSettings({ get, post, onError }) {
  const [status, setStatus] = useState(null), [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const [domainText, setDomainText] = useState('');
  const [installing,setInstalling]=useState(false),[setupNotice,setSetupNotice]=useState(''),[setupError,setSetupError]=useState('');
  const canInstall=typeof window.desktop?.installWindowsSandbox==='function';
  async function install() {
    if(busy||installing)return;
    setBusy(true);setInstalling(true);setSetupNotice('请在 Windows 管理员授权窗口中确认，安装完成后会自动检测。');setSetupError('');
    try {
      const result=await window.desktop.installWindowsSandbox();
      const value=await get('/api/sandbox');setStatus(value);
      setSetupNotice(result.cancelled?'已取消安装，可以稍后重试。':value.available?'沙箱安装完成，已通过检测。':'安装已结束，但沙箱尚未通过检测。');
      if(!result.cancelled&&!value.available)setSetupError(value.reason);
    } catch(error){setSetupNotice('');setSetupError(error.message);}
    finally {setBusy(false);setInstalling(false);}
  }
  async function refresh() {
    setBusy(true);
    try { const value = await get('/api/sandbox'); setStatus(value); setDraft(value.policy); setDomainText((value.policy.allowedDomains || []).join('\n')); }
    catch (error) { onError?.(error); }
    finally { setBusy(false); }
  }
  useEffect(() => { refresh(); }, []);
  const change = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setSaved(false); };
  async function save() {
    setBusy(true);
    try { const value = await post('/api/sandbox', draft); setStatus(value); setDraft(value.policy); setDomainText((value.policy.allowedDomains || []).join('\n')); setSaved(true); }
    catch (error) { onError?.(error); }
    finally { setBusy(false); }
  }
  const needsWindowsSetup = status?.backend === 'windows-native' && !status.available && Boolean(status.setupCommand);
  return <section className="section-block sandbox-settings">
    <div className="section-head"><div><h2><Shield size={18}/>运行沙箱</h2><p>审批决定能否执行，沙箱限制执行范围。人工审批、完全访问和永久允许规则都受沙箱约束。</p></div><button disabled={busy} onClick={refresh}><RefreshCw size={14}/>重新检测</button></div>
    {!draft ? <p>正在检测沙箱后端…</p> : <>
      <div className="rules-help sandbox-status" role="status">{status?.available ? <Shield size={16}/> : <ShieldAlert size={16}/>}<div><b>{status?.available ? '沙箱已就绪' : draft.mode === 'off' ? '沙箱已关闭' : '沙箱未就绪'}</b><p>{needsWindowsSetup ? status.setupSupported===false ? status.reason : '安装程序已随客户端附带，无需额外下载。首次安装需要一次 Windows 管理员授权。' : status?.reason}</p>{needsWindowsSetup && canInstall && status.setupSupported!==false && <button className="primary-action sandbox-install" disabled={busy} onClick={install}>{installing?<LoaderCircle className="spin" size={14}/>:<Download size={14}/>} {installing?'等待授权并安装…':'安装沙箱'}</button>}{needsWindowsSetup&&!canInstall&&<p>请在桌面客户端中安装，或使用下方手动安装命令。</p>}{needsWindowsSetup && <details><summary>查看诊断详情</summary><p>{status.reason}</p></details>}</div></div>
      {setupNotice&&<p className="sandbox-setup-notice" role="status">{setupNotice}</p>}{setupError&&<p className="sandbox-setup-error" role="alert">{setupError}</p>}
      <div className="form-grid sandbox-form">
        <label>隔离模式<select aria-label="沙箱隔离模式" value={draft.mode} onChange={event => change('mode', event.target.value)} disabled={busy}><option value="workspace-write">工作区可写（推荐）</option><option value="read-only">只读</option><option value="off">关闭沙箱，使用宿主权限</option></select></label>
        <label>执行后端<select aria-label="沙箱执行后端" value={draft.backend} onChange={event => change('backend', event.target.value)} disabled={busy}><option value="auto">自动选择原生后端</option><option value="windows-native">Windows 原生 · Anthropic（Alpha）</option><option value="bubblewrap">Bubblewrap（Linux）</option><option value="seatbelt">Seatbelt（macOS）</option><option value="docker">Docker（可选）</option></select></label>
        {draft.backend === 'docker' && <label>Docker 沙箱镜像<input aria-label="Docker 沙箱镜像" value={draft.dockerImage} onChange={event => change('dockerImage', event.target.value)} disabled={busy}/></label>}
      </div>
      <label className="setting-toggle"><span><b>允许命令联网</b><small>默认禁止。Windows 原生后端仅开放白名单域名；其他后端开放其可达网络。</small></span><input type="checkbox" checked={draft.networkAccess} onChange={event => change('networkAccess', event.target.checked)} disabled={busy || draft.mode === 'off'}/></label>
      {(draft.backend === 'windows-native' || draft.backend === 'auto' && status?.backend === 'windows-native') && <label className="sandbox-domains"><span>联网域名白名单</span><textarea aria-label="沙箱联网域名白名单" placeholder={'*.npmjs.org\ngithub.com:443'} value={domainText} onChange={event => { setDomainText(event.target.value); change('allowedDomains', event.target.value.split('\n').map(domain => domain.trim()).filter(Boolean)); }} disabled={busy} rows={4}/><small>每行一个域名。打开联网后仍需填写，空白名单拒绝所有代理请求；系统 DNS 解析不在此隔离范围内。</small></label>}
      {draft.mode === 'off' && <p className="rules-help">关闭后，模型生成的命令具有当前系统用户的文件、网络和进程权限。</p>}
      <div className="sandbox-notes"><p>沙箱后端不可用时会阻止命令执行。自动选择 Windows 原生、Linux Bubblewrap 或 macOS Seatbelt；Windows 原生命令沿用 cmd 语法，Docker 与 Bubblewrap 使用 Linux /bin/sh。</p>
      {status?.setupCommand && <details><summary>手动安装与卸载</summary><p>首次安装：<code>{status.setupCommand}</code>。需要一次管理员授权，创建独立执行账户和网络过滤规则。可用同一脚本的 uninstall 命令卸载；仅检测不会安装。</p></details>}
      <p>当前隔离范围是 Agent 命令和经文件工具访问的路径。已安装插件、MCP、语言服务、桌面控制及手动终端属于受信任的宿主能力。</p></div>
      <div className="form-actions"><span>{saved ? '沙箱配置已保存，后续工具调用生效' : '运行任务时不能更改配置'}</span><button className="primary-action" disabled={busy} onClick={save}>{busy ? '处理中…' : '保存沙箱配置'}</button></div>
    </>}
  </section>;
}
