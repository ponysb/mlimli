import React from 'react';
import { ArrowLeft, Check, Download, FileText, LoaderCircle, Mic, Minimize2, Square, Video, X } from 'lucide-react';
import { clock } from './voice-format.mjs';

const speakerName = id => id === 'unknown' ? '待确认发言者' : id?.replace('speaker-', '说话人 ') || '识别中';
const modeLabel = { audio: '语音会议', screen: '屏幕会议', camera: '摄像头会议' };

export default function MeetingWorkspace({ meeting, phase, mode, previewStream, status, elapsed, partial, speaking, speaker, error, notice, summarizing, speakers, onFinish, onClose, onMinimize, onChangeParticipant, onRememberSpeaker, onDownloadTranscript, onSummarize, onRegenerate }) {
  const busy = ['starting', 'recording', 'stopping', 'save-error'].includes(phase);
  const ended = phase === 'finished';
  const loadingModel = !ended && Boolean(meeting?.modelLoading);
  const modelName = status?.models?.find(item => item.id === meeting?.speechModelId)?.name || meeting?.speechModelId || status?.model || '本地语音';
  const loadingStage = elapsed < 5 ? '正在准备模型运行环境' : elapsed < 20 ? `正在加载 ${modelName}` : '大模型仍在加载，录音会继续保存';
  const liveVideo = React.useRef(null);
  React.useEffect(() => {
    if (!liveVideo.current) return;
    liveVideo.current.srcObject = previewStream || null;
    if (previewStream) liveVideo.current.play().catch(() => {});
  }, [previewStream]);
  const videoUrl = meeting?.mediaBytes > 0 && (mode === 'camera' || mode === 'screen') ? `/api/speech/sessions/${meeting.id}/recording` : '';
  return <div className="meeting-workspace" role="dialog" aria-modal="true" aria-label="会议录制工作区">
    <header className="meeting-workspace-header">
      <button className="icon-button" title="返回工作台" aria-label="返回工作台" onClick={onClose}><ArrowLeft size={19}/></button>
      <div><h2>{meeting?.title || '会议录制'}</h2><p>{modelName} · {modeLabel[mode] || modeLabel.audio}</p></div>
      <span className={`meeting-state ${ended ? 'done' : busy ? 'live' : ''}`}><i/>{ended ? meeting?.state === 'interrupted' ? '已中断' : '已结束' : phase === 'stopping' ? '保存中' : phase === 'starting' ? '准备中' : loadingModel ? '录音中 · 转写准备' : speaking ? `${speakerName(speaker)}发言中` : '等待发言'}</span>
      <div className="meeting-workspace-actions">
        {!ended && <button className="icon-button" type="button" title="最小化并继续录制" aria-label="最小化并继续录制" onClick={onMinimize}><Minimize2 size={18}/></button>}
        {busy && <button className="icon-button meeting-header-finish" type="button" title="结束会议" aria-label="结束会议" disabled={phase === 'stopping'} onClick={onFinish}><Square size={17}/></button>}
        {ended && <button className="icon-button" type="button" title="关闭会议详情" aria-label="关闭会议详情" onClick={onClose}><X size={19}/></button>}
      </div>
    </header>
    <main className="meeting-workspace-main">
      <aside className="meeting-control-panel">
        <section className="meeting-control-card meeting-timer-card"><span>{ended ? '会议时长' : '录制时长'}</span><strong>{clock(elapsed)}</strong><small>转写模型：{modelName}</small></section>
        <section className="meeting-control-card"><h3>录制状态</h3><p className="meeting-state-copy"><i className={busy ? 'active' : ''}/>{ended ? '录制已保存' : phase === 'stopping' ? '正在保存录音和逐字稿' : loadingModel ? '录音正常，正在准备转写' : speaking ? `${speakerName(speaker)}正在说话` : '等待麦克风声音'}</p>{loadingModel && <div className="meeting-loading-progress" role="status" aria-live="polite"><div className="done"><Check size={14}/><span>录音已启动 · {clock(elapsed)}</span></div><div className="current"><LoaderCircle size={14}/><span>{loadingStage}</span></div><div><FileText size={14}/><span>就绪后自动补写已录内容</span></div><small>首次加载大模型通常需要 20–40 秒，期间可以正常开会。</small></div>}{phase === 'recording' && <div className="meeting-level"><i/><i/><i/><i/><i/></div>}</section>
        <section className="meeting-control-card"><h3>会议选项</h3><div className="meeting-option-row"><span>录制方式</span><b>{modeLabel[mode] || modeLabel.audio}</b></div><div className="meeting-option-row"><span>识别说话人</span><b>自动识别</b></div></section>
        <div className="meeting-control-actions">{busy && <button className="voice-stop meeting-finish" disabled={phase === 'stopping'} onClick={onFinish}><Square size={16}/>{phase === 'stopping' ? '保存中…' : phase === 'starting' ? '取消启动' : '结束会议'}</button>}{ended && <><button className="primary-action" disabled={summarizing || !meeting?.segments?.length} onClick={onSummarize}><FileText size={15}/>{summarizing ? '生成中…' : meeting?.summarySessionId ? '查看会议纪要' : '生成会议纪要'}</button>{meeting?.summarySessionId && <button className="secondary-action" disabled={summarizing} onClick={onRegenerate}>重新生成纪要</button>}</>}</div>
        {ended && <div className="meeting-export-actions">{meeting?.mediaBytes > 0 && <a className="secondary-action" href={`/api/speech/sessions/${meeting.id}/recording`} download><Download size={15}/>下载录音</a>}<button className="secondary-action" onClick={onDownloadTranscript}><Download size={15}/>导出逐字稿</button></div>}
        {speakers.length > 0 && <section className="meeting-participants-section"><h3>参会人</h3><div className="meeting-participants">{speakers.map(id => <div className="meeting-participant" key={id}><b>{speakerName(id)}</b><input aria-label={`${speakerName(id)}姓名`} placeholder="姓名" maxLength={80} value={meeting?.participants?.[id]?.name || ''} onChange={event => onChangeParticipant(id, 'name', event.target.value)}/><input aria-label={`${speakerName(id)}角色`} placeholder="角色 / 职务" maxLength={80} value={meeting?.participants?.[id]?.role || ''} onChange={event => onChangeParticipant(id, 'role', event.target.value)}/><button className="voice-remember" disabled={!meeting?.participants?.[id]?.name?.trim() || !meeting?.rememberableSpeakers?.includes(id)} onClick={() => onRememberSpeaker(id)}>{meeting?.rememberedSpeakers?.[id] ? <><Check size={13}/>已记住</> : '记住全局'}</button></div>)}</div></section>}
        {notice && <p className="voice-notice" role="status">{notice}</p>}{error && <p className="voice-error" role="alert">{error}</p>}
      </aside>
      <section className="meeting-transcript-panel">
        {(previewStream || videoUrl) && <div className="meeting-media-preview"><video ref={liveVideo} src={previewStream ? undefined : videoUrl} controls={ended} autoPlay={Boolean(previewStream)} muted={Boolean(previewStream)} playsInline preload="metadata"/><span>{previewStream ? mode === 'camera' ? '摄像头预览' : '共享画面预览' : '视频录制回放'}</span></div>}
        <div className="meeting-transcript-header"><div><span className="eyebrow">{ended ? '会议逐字稿' : '实时转写'}</span><h3>{loadingModel ? '转写准备中' : `${meeting?.segments?.length || 0} 段发言`}</h3></div><span className="meeting-transcript-note">{loadingModel ? `已录音 ${clock(elapsed)}` : speakers.length ? `${speakers.length} 位说话人` : ended ? '暂无说话人' : '正在识别说话人'}</span></div>
        <div className="meeting-transcript" role="log" aria-label="会议逐字稿" aria-busy={loadingModel}>{meeting?.segments?.map(segment => <article key={segment.id}><small>{clock(segment.start)} · {meeting?.participants?.[segment.speaker]?.name || speakerName(segment.speaker)}</small><p>{segment.text}</p></article>)}{partial && <article className="meeting-partial"><small>{speakerName(speaker)} · 正在转写</small><p>{partial}</p></article>}{loadingModel && !meeting?.segments?.length && !partial && <div className="meeting-transcript-loading" role="status"><LoaderCircle size={24}/><strong>正在准备实时转写</strong><p>声音正在持续录制，模型就绪后会从开头自动补写。</p><small>{loadingStage} · {clock(elapsed)}</small></div>}{!loadingModel && !meeting?.segments?.length && !partial && <p className="meeting-empty">{ended ? '本次会议暂无转写内容。' : '开始说话后，转写内容会显示在这里。'}</p>}</div>
      </section>
    </main>
  </div>;
}
