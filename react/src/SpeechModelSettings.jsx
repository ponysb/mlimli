import { confirmAction } from './ActionPopover.jsx';
import React, { useEffect, useState } from 'react';
import { Download, Check, LoaderCircle, Trash2 } from 'lucide-react';
import './voice-input.css';

async function speechAPI(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000), ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '语音模型配置失败');
  return data;
}
function bytes(value) { const size = Number(value || 0); if (!size) return '0 B'; const units = ['B', 'KB', 'MB', 'GB']; const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1); return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function duration(seconds) { const value = Number(seconds); if (!Number.isFinite(value) || value <= 0) return '计算中'; if (value < 60) return `${Math.ceil(value)} 秒`; return `${Math.floor(value / 60)} 分 ${Math.ceil(value % 60)} 秒`; }
export default function SpeechModelSettings({ onStatus, disabled = false }) {
  const [status, setStatus] = useState(null), [error, setError] = useState(''), [pending, setPending] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => speechAPI('/api/speech/status').then(data => { if (alive) { setStatus(data); onStatus?.(data); } }).catch(e => { if (alive) setError(e.message); });
    refresh(); const timer = setInterval(refresh, 2000);
    window.addEventListener('speech-settings-changed', refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('speech-settings-changed', refresh); };
  }, [onStatus]);
  async function choose(model) {
    setPending(true); setError('');
    try {
      const data = await speechAPI(model.installed ? '/api/speech/settings' : '/api/speech/install', model.installed ? 'PATCH' : 'POST', { modelId: model.id });
      setStatus(data); onStatus?.(data); window.dispatchEvent(new Event('speech-settings-changed'));
    } catch (e) { setError(e.message); } finally { setPending(false); }
  }
  async function remove(model) {
    if (!await confirmAction(`删除 ${model.name} 的本地模型文件？需要时可重新下载，会议记录会保留。`)) return;
    setPending(true); setError('');
    try {
      const data = await speechAPI(`/api/speech/models/${model.id}`, 'DELETE');
      setStatus(data); onStatus?.(data); window.dispatchEvent(new Event('speech-settings-changed'));
    } catch (e) { setError(e.message); } finally { setPending(false); }
  }
  const locked = disabled || pending || status?.state === 'installing' || status?.activeSessions > 0;
  return <section className="speech-model-settings" aria-label="本地语音模型">
    <h4>本地语音模型</h4>
    {status?.hardware && <p className="voice-hint">本机：{status.hardware.arch} · {status.hardware.memoryGB} GB 内存 · {status.hardware.cores} 逻辑核心{status.hardware.gpu ? ` · ${status.hardware.gpu.name} ${status.hardware.gpu.memoryGB} GB 显存` : status.hardware.detecting ? ' · 正在检测显卡…' : ''}</p>}
    <p className="voice-hint">{status?.recommendation?.reason || '正在检测配置…'}。推荐项排在第一位，您可以自行选择；当前启用：{status?.ready ? status.model : '尚未启用'}。</p>
    <div className="speech-model-list">{status?.models?.map(model => <article key={model.id} className={`speech-model-card ${status.modelId === model.id && status.ready ? 'selected' : ''}`}>
      <div className="speech-model-heading"><strong>{model.name}</strong>{model.recommended && <span className="speech-model-badge">本机推荐</span>}{model.installed && <span className="speech-model-badge">已安装</span>}</div>
      <p>{model.purpose}</p><p className="voice-hint">语言：{model.languages}</p>
      <p className="voice-hint">{model.configuration}</p><p className="voice-hint">{model.platformNote}</p>
      <p className="voice-hint">首次模型下载约 {model.totalDownloadMB} MB（含发言检测、声纹及预览，共享文件会复用）{model.engine === 'transformers' ? '；另需约 2–5 GB 推理依赖' : '；另需运行环境'}。</p>
      <details><summary>效果参考与测试来源</summary><p className="voice-hint">{model.reference}</p><p className="voice-hint">这是论文 / 官方评测的原版模型数据；INT8 版本、本应用录音与本机速度需要实际验证。不同测试条件的错误率不能直接排名。CER 是字符错误率，越低越好。</p><a href={model.source} target="_blank" rel="noreferrer">查看来源</a></details>
      {!model.supported && <p className="voice-error">{model.unavailableReason}</p>}
      <div className="speech-model-actions"><button type="button" className="secondary-action" disabled={locked || !model.supported || (status.ready && status.modelId === model.id)} onClick={() => choose(model)}>
        {status.state === 'installing' && status.installingModelId === model.id ? <LoaderCircle size={15} className="spin"/> : model.installed ? <Check size={15}/> : <Download size={15}/>}
        {status.state === 'installing' && status.installingModelId === model.id ? '正在安装…' : status.ready && status.modelId === model.id ? '当前使用' : model.installed ? '切换使用' : '下载安装并使用'}
      </button>{(model.installed || model.removable) && <button type="button" className="speech-model-delete" disabled={locked} title={`删除 ${model.name}`} aria-label={`删除 ${model.name}`} onClick={() => remove(model)}><Trash2 size={16}/></button>}</div>
      {status.installingModelId === model.id && status.state === 'installing' && <div className="speech-download-progress" role="status">
        <div className="speech-download-head"><b>{status.stage}</b><span>{status.currentFile && status.fileTotalBytes > 0 ? `${Math.min(100, Math.round(status.fileDownloadedBytes / status.fileTotalBytes * 100))}%` : '准备中'}</span></div>
        <progress max="100" {...(status.currentFile && status.fileTotalBytes > 0 ? { value: Math.min(100, status.fileDownloadedBytes / status.fileTotalBytes * 100) } : {})}/>
        {status.currentFile ? <><div className="speech-download-meta"><span>本文件 {bytes(status.fileDownloadedBytes)} / {status.fileTotalBytes ? bytes(status.fileTotalBytes) : '总大小获取中'}</span><span>{status.speedBps ? `${bytes(status.speedBps)}/秒` : '连接中'}</span><span>本文件剩余 {status.fileTotalBytes ? bytes(Math.max(0, status.fileTotalBytes - status.fileDownloadedBytes)) : '待获取'} · {duration(status.etaSeconds)}</span></div><small>当前文件：{status.currentFile}{status.currentSource ? ` · ${status.currentSource}` : ''}</small></> : <small>正在准备运行环境或验证下载源</small>}
        <small>本次累计下载 {bytes(status.downloadedBytes)}</small>
        {status.sourceChecks?.length > 0 && <div className="speech-source-checks"><small>下载源检查</small>{status.sourceChecks.map(source => <div key={source.url} className={`speech-source-check ${source.state}`}><span>{source.name}</span><span>{source.state === 'available' ? `可用${source.latencyMs ? ` · ${source.latencyMs} ms` : ''}` : source.state === 'unavailable' ? `不可用：${source.error || '连接失败'}${source.suggestion ? ` · ${source.suggestion}` : ''}` : '检查中…'}</span></div>)}</div>}
        {status.fileStates?.length > 0 && <details className="speech-file-states"><summary>文件安装状态（{status.fileStates.filter(file => file.state === 'installed').length} / {status.fileStates.length}）</summary>{status.fileStates.map(file => <div key={file.name}><span>{file.state === 'installed' ? '已安装' : file.state === 'verified' ? '已校验' : file.state === 'installing' ? '安装中' : file.state === 'error' ? '失败' : '下载中'}</span><span title={file.detail || file.name}>{file.name}</span></div>)}</details>}
      </div>}
      {status.installingModelId === model.id && status.error && <p className="voice-error" role="alert">{status.error}</p>}
    </article>)}</div>
    {error && <p className="voice-error" role="alert">{error}</p>}
    <p className="voice-hint">下载方式：客户端直连国内优先源，模型和运行依赖只保存在本机，不经过官方后台。开始下载前会检查源是否可用，并支持自动切换。</p>
    {(disabled || status?.activeSessions > 0) && <p className="voice-hint">录制结束后可以下载和切换模型。</p>}
    <p className="voice-hint">所有模型共用 Silero 发言检测和 CAM++ 说话人区分。64 位环境提供中文实时预览，断句后由所选模型校正；其他语言请以断句后的文字为准。32 位环境在断句后显示转写，以节省内存。</p>
  </section>;
}
