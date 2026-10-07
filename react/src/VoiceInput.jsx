import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Square, X, Download, LoaderCircle, Video, Monitor, AudioLines, Settings2 } from 'lucide-react';
import { BrowserRecording, captureErrorMessage } from './browser-recording.mjs';
import CaptureSourcePicker from './CaptureSourcePicker.jsx';
import { DictationMicrophone } from './dictation-microphone.mjs';
import VoiceProfilesSettings from './VoiceProfilesSettings.jsx';
import MeetingWorkspace from './MeetingWorkspace.jsx';
import { meetingDuration } from './voice-format.mjs';
import { dictationDraftUpdate } from './dictation-draft.mjs';
import './voice-input.css';

async function request(url, body, method = 'POST') {
  const response = await fetch(url, { method, signal: AbortSignal.timeout(url === '/api/speech/sessions' ? 30000 : 90000), headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
const get = url => request(url, undefined, 'GET');
const endpoint = id => `/api/speech/sessions/${id}`;
const speakerName = id => id === 'unknown' ? '待确认发言者' : id?.replace('speaker-', '说话人 ') || '识别中';
function clock(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }

export default function VoiceInput({ workspace, onText, onSummary, onOpenSettings, meetingRequest, onOpenHistory }) {
  const [slot, setSlot] = useState(null), [open, setOpen] = useState(false), [status, setStatus] = useState(null);
  const [meetingPage, setMeetingPage] = useState(false);
  const [sourcePicker, setSourcePicker] = useState(false);
  const [captureReady, setCaptureReady] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [microphoneState, setMicrophoneState] = useState('off');
  const [phase, setPhase] = useState('idle'), [kind, setKind] = useState('meeting'), [mode, setMode] = useState('audio'), [role, setRole] = useState('minutes');
  const [title, setTitle] = useState(() => `会议 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`), [autoSummary, setAutoSummary] = useState(true), [meeting, setMeeting] = useState(null), [partial, setPartial] = useState(''), [speaking, setSpeaking] = useState(false), [speaker, setSpeaker] = useState(null);
  const [error, setError] = useState(''), [elapsed, setElapsed] = useState(0), [summarizing, setSummarizing] = useState(false), [previewStream, setPreviewStream] = useState(null);
  const [profileRevision, setProfileRevision] = useState(0), [notice, setNotice] = useState('');
  const state = useRef({ phase: 'idle', media: [], pcm: [], mediaSeq: 0, pcmSeq: 0 });
  const hold = useRef({ pressed: false, long: false });
  const warmRequest = useRef(null);
  const historyRequest = useRef(0);
  const [openingMeeting, setOpeningMeeting] = useState(false);
  const alive = useRef(true), callbacks = useRef({ onText, onSummary }); callbacks.current = { onText, onSummary };
  const microphone = useRef(null);
  if (!microphone.current) microphone.current = new DictationMicrophone({ onState: value => { if (alive.current) setMicrophoneState(value); } });

  useEffect(() => {
    alive.current = true;
    const find = () => setSlot(document.getElementById('voice-input-slot'));
    find(); const observer = new MutationObserver(find); observer.observe(document.getElementById('root'), { childList: true, subtree: true });
    get('/api/speech/status').then(setStatus).catch(e => setError(e.message));
    const settingsChanged = () => get('/api/speech/status').then(setStatus).catch(() => {});
    window.addEventListener('speech-settings-changed', settingsChanged);
    return () => {
      alive.current = false; observer.disconnect(); clearTimeout(hold.current.timer);
      hold.current.decide?.(false);
      window.removeEventListener('speech-settings-changed', settingsChanged);
      const current = state.current;
      current.cancelled = true;
      microphone.current.clearIdle();
      current.browser?.stop().then(async () => { microphone.current.clearIdle(); await Promise.allSettled([current.pcmDrain, current.mediaDrain]); if (current.id) await request(endpoint(current.id) + '/finish', {}).catch(() => {}); }).catch(() => { microphone.current.clear(); });
    };
  }, []);
  useEffect(() => {
    if (!open && status?.state !== 'installing' && status?.dictation?.state !== 'loading') return;
    const refresh = () => get('/api/speech/status').then(value => { if (alive.current) setStatus(value); }).catch(() => {});
    refresh(); const timer = setInterval(refresh, status?.dictation?.state === 'loading' ? 750 : 2000); return () => clearInterval(timer);
  }, [open, status?.state, status?.dictation?.state]);
  async function prewarm() {
    if (!workspace || !status?.ready || document.hidden || !['idle', 'finished'].includes(state.current.phase)) return;
    if (warmRequest.current) return warmRequest.current;
    warmRequest.current = request('/api/speech/warmup', {}).then(data => {
      if (alive.current && data.dictation) setStatus(value => ({ ...value, dictation: data.dictation }));
    }).catch(e => {
      if (alive.current) setStatus(value => ({ ...value, dictation: { state: 'error', error: e.message } }));
    }).finally(() => { warmRequest.current = null; });
    return warmRequest.current;
  }
  function prepareMicrophone() {
    prewarm();
    if (!workspace || !status?.ready || document.hidden || !['idle', 'finished'].includes(state.current.phase)) return;
    microphone.current.prepareAudio().catch(() => {});
    microphone.current.prewarm().catch(() => {});
  }
  useEffect(() => {
    microphone.current.clearIdle();
    prewarm();
    if (workspace && status?.ready && !document.hidden) microphone.current.prepareAudio().catch(() => {});
    const focus = event => { if (event.target.matches?.('.composer textarea')) { prewarm(); if (status?.ready) microphone.current.prepareAudio().catch(() => {}); } };
    const visible = () => { if (!document.hidden) prewarm(); else microphone.current.clearIdle(); };
    const blurred = () => microphone.current.clearIdle();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    document.addEventListener('focusin', focus);
    window.addEventListener('blur', blurred);
    return () => { window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); document.removeEventListener('focusin', focus); window.removeEventListener('blur', blurred); };
  }, [workspace?.id, status?.ready, status?.modelId]);
  useEffect(() => { if (meetingRequest?.id) openSavedMeeting(meetingRequest.id); }, [meetingRequest]);
  useEffect(() => {
    if (phase !== 'recording') return;
    const update = () => setElapsed((Date.now() - (state.current.kind === 'dictation' ? state.current.readyAt : state.current.startedAt)) / 1000);
    update();
    const timer = setInterval(update, 500); return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const dialog = document.getElementById('meeting-dialog'); dialog?.querySelector('button')?.focus();
    const key = event => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')];
        if (!items.length) return;
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [open]);

  function phaseTo(value) { state.current.phase = value; if (alive.current) setPhase(value); }
  function publishDictation(current, text) {
    if (current.kind !== 'dictation' || !alive.current || text === current.dictationText || (!text && !current.dictationText)) return;
    callbacks.current.onText(dictationDraftUpdate(current.draftBase, current.dictationText || '', text));
    current.dictationText = text;
  }
  async function upload(url, data, type, sequence) {
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(90000), headers: { 'content-type': type, 'x-speech-sequence': String(sequence) }, body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '录制保存失败');
    return result;
  }
  function drainPcm() {
    const current = state.current;
    if (!current.id || (current.kind === 'dictation' && !current.modelReady)) return;
    if (current.pcmDrain) return current.pcmDrain;
    current.pcmDrain = (async () => {
      while (current.pcm.length) {
        const result = await upload(endpoint(current.id) + '/pcm', current.pcm[0], 'application/octet-stream', current.pcmSeq);
        current.pcm.shift(); current.pcmSeq++;
        current.segments.push(...result.segments);
        publishDictation(current, current.segments.map(item => item.text).join('') + (result.partial || ''));
        if (alive.current) { setMeeting(item => ({ ...item, modelLoading: false, segments: [...current.segments], participants: { ...result.participants, ...item?.participants }, rememberedSpeakers: result.rememberedSpeakers || item?.rememberedSpeakers, rememberableSpeakers: result.rememberableSpeakers || item?.rememberableSpeakers })); setPartial(result.partial || ''); setSpeaking(result.speaking); setSpeaker(result.speaker); }
      }
    })().catch(e => { current.pcmError = e; if (alive.current) setError(`转写中断：${e.message}。结束后可重试保存。`); }).finally(() => { current.pcmDrain = null; });
    return current.pcmDrain;
  }
  function drainMedia() {
    const current = state.current;
    if (!current.id) return;
    if (current.mediaDrain) return current.mediaDrain;
    current.mediaDrain = (async () => {
      while (current.media.length) {
        const blob = current.media[0];
        await upload(endpoint(current.id) + '/media', blob, blob.type || current.mime, current.mediaSeq);
        current.media.shift(); current.mediaSeq++;
      }
    })().catch(e => { current.mediaError = e; if (alive.current) setError(`录制保存中断：${e.message}。分片已保留，可重试保存。`); }).finally(() => { current.mediaDrain = null; });
    return current.mediaDrain;
  }
  async function start(nextKind, decision, capture = {}) {
    const releaseCapture = () => capture.cameraStream?.getTracks().forEach(track => track.stop());
    if (openingMeeting || summarizing) { releaseCapture(); return; }
    if (state.current.phase !== 'idle' && state.current.phase !== 'finished') { releaseCapture(); return; }
    setKind(nextKind);
    if (!workspace) { releaseCapture(); if (nextKind === 'meeting') setOpen(true); setError('请先选择工作目录'); return; }
    if (!status?.ready) { releaseCapture(); openSpeechSettings(); return; }
    const current = { phase: 'starting', kind: nextKind, media: [], pcm: [], segments: [], mediaSeq: 0, pcmSeq: 0, startedAt: Date.now(), autoSummary, cancelled: false };
    state.current = current; phaseTo('starting'); setKind(nextKind); setError(''); setPartial(''); setMeeting(null); setPreviewStream(null); setElapsed(0); setCaptureReady(false); setStopRequested(false);
    current.draftBase = document.querySelector('.composer textarea')?.value || '';
    if (nextKind === 'dictation') { setOpen(false); setMeetingPage(false); }
    const recordingCallbacks = {
      onPcm: data => {
        if (current.pcm.length >= 120) { setError('转写速度落后超过 30 秒，已停止录制以保留数据'); finish(); return; }
        current.pcm.push(data); if (!current.pcmError) drainPcm();
      },
      onMedia: blob => {
        if (nextKind === 'dictation') return;
        current.mime = blob.type;
        for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) current.media.push(blob.slice(offset, offset + 4 * 1024 * 1024, blob.type));
        if (!current.mediaError) drainMedia();
        if (current.phase === 'recording' && current.media.reduce((size, item) => size + item.size, 0) > 128 * 1024 * 1024) { setError('未保存的录制达到 128 MB，已停止录制，请重试保存'); finish(); }
      },
      onEnded: () => finish(), onError: e => { setError(e.message); finish(); },
      onPreview: stream => { if (alive.current) setPreviewStream(stream); },
    };
    if (nextKind === 'meeting') microphone.current.clearIdle();
    const browser = nextKind === 'dictation' ? microphone.current.take(recordingCallbacks) : new BrowserRecording({ ...recordingCallbacks, ...capture, mode, recordMedia: true });
    current.browser = browser;
    try {
      // Capture from pointer-down, including the hold threshold and backend startup.
      current.capture = browser.acquire().then(() => browser.start()).then(() => { current.startedAt = Date.now(); if (!current.cancelled && alive.current) setCaptureReady(true); });
      current.capture.catch(() => {});
      if (decision && !await decision) {
        current.cancelled = true; browser.cleanup();
        await current.capture.catch(() => {}); phaseTo('idle'); return;
      }
      if (current.cancelled || !alive.current) { browser.cleanup(); phaseTo('idle'); return; }
      if (nextKind === 'meeting') {
        await current.capture;
        if (current.cancelled || !alive.current) { browser.cleanup(); phaseTo('idle'); return; }
      }
      const session = request('/api/speech/sessions', { kind: nextKind, mode: nextKind === 'dictation' ? 'audio' : mode, title: title.trim() || `会议 ${new Date().toLocaleString('zh-CN')}`, role }).then(meta => { current.id = meta.id; if (alive.current) setMeeting(meta); return meta; });
      const [, meta] = await Promise.allSettled([current.capture, session]);
      await current.capture;
      if (meta.status === 'rejected') throw meta.reason;
      if (current.cancelled || !alive.current) { browser.cleanup(); await request(endpoint(current.id) + '/finish', {}); phaseTo('idle'); return; }
      if (current.captureStop) await current.captureStop;
      if (nextKind === 'dictation') {
        if (meta.value.modelLoading !== false) await request(endpoint(current.id) + '/ready', undefined, 'GET');
        current.modelReady = true; current.readyAt = Date.now();
        if (alive.current) setMeeting(value => ({ ...value, modelLoading: false }));
      }
      if (current.cancelled || !alive.current) { browser.cleanup(); await request(endpoint(current.id) + '/finish', {}).catch(() => {}); return; }
      phaseTo('recording'); drainPcm(); drainMedia();
      if (nextKind === 'meeting') setMeetingPage(true);
      if (nextKind === 'dictation' && (current.stopRequested || !hold.current.pressed)) await finish();
    } catch (e) {
      browser.cleanup();
      if (current.id) await request(endpoint(current.id) + '/finish', {}).catch(() => {});
      setPreviewStream(null); phaseTo('idle'); if (alive.current && !current.cancelled) {
        setError(captureErrorMessage(e, mode));
        if (nextKind === 'meeting') setOpen(true);
      }
    }
  }
  async function summarize(meta, regenerate = false) {
    setSummarizing(true); setError('');
    try {
      const result = meta.summarySessionId && !regenerate ? { sessionId: meta.summarySessionId } : await request(endpoint(meta.id) + '/summary', { regenerate });
      if (!result.sessionId) throw new Error('没有返回纪要会话');
      setMeeting(item => ({ ...item, summarySessionId: result.sessionId }));
      setMeetingPage(false); setOpen(false);
      await callbacks.current.onSummary(result.sessionId);
    } catch (e) { setMeetingPage(true); setError(`纪要会话打开失败：${e.message}。逐字稿和录制已保存在本机，可重试。`); }
    finally { setSummarizing(false); }
  }
  async function finish() {
    const current = state.current;
    if (current.phase === 'starting') {
      if (current.kind === 'dictation') { current.stopRequested = true; setStopRequested(true); current.captureStop ||= current.capture?.then(() => current.browser.stop()).catch(() => {}); return; }
      current.cancelled = true; await current.browser?.stop(); return;
    }
    if (!['recording', 'save-error'].includes(current.phase)) return;
    phaseTo('stopping');
    try {
      await current.browser?.stop();
      setPreviewStream(null);
      await Promise.all([current.pcmDrain, current.mediaDrain]);
      current.pcmError = null; current.mediaError = null;
      await Promise.all([drainPcm(), drainMedia()]);
      if (current.pcmError || current.mediaError) throw current.pcmError || current.mediaError;
      await current.participantChain;
      const meta = await request(endpoint(current.id) + '/finish', {});
      setPreviewStream(null); setMeeting(meta); setPartial(''); setSpeaking(false); phaseTo('finished');
      if (meta.transcriptionError) setError(`录制已保存，但部分转写未完成：${meta.transcriptionError}`);
      if (current.kind === 'dictation') publishDictation(current, meta.segments.map(item => item.text).join(''));
      else { if (current.autoSummary && meta.segments.length) await summarize(meta); }
    } catch (e) { phaseTo('save-error'); if (current.kind === 'meeting' && !meetingPage) setOpen(true); setError(`保存未完成：${e.message}。请重试保存，当前录制分片仍保留。`); }
  }
  function down(event) {
    if (event.button !== 0 || !['idle', 'finished'].includes(state.current.phase)) return;
    if (!status?.ready) { event.preventDefault(); hold.current.pointerClick = true; openSpeechSettings(); return; }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    hold.current.pressed = true; hold.current.long = false; hold.current.pointerClick = true;
    const decision = new Promise(resolve => { hold.current.decide = resolve; });
    start('dictation', decision);
    hold.current.timer = setTimeout(() => { hold.current.long = true; hold.current.decide?.(true); }, 350);
  }
  function up(cancelled = false) {
    clearTimeout(hold.current.timer); const wasPressed = hold.current.pressed; hold.current.pressed = false;
    if (!wasPressed) return;
    hold.current.decide?.(hold.current.long); hold.current.decide = null;
    if (hold.current.long) finish();
    else {
      state.current.cancelled = true; state.current.browser?.cleanup();
      if (!cancelled) { setKind('meeting'); if (!status?.ready) openSpeechSettings(); else setOpen(true); }
    }
  }
  function openSpeechSettings() {
    clearTimeout(hold.current.timer);
    hold.current.pressed = false; hold.current.long = false;
    hold.current.decide?.(false); hold.current.decide = null;
    setError(''); setOpen(false); setMeetingPage(false);
    onOpenSettings?.();
  }
  function showMeeting() {
    if (state.current.kind === 'dictation' && ['starting', 'recording', 'stopping', 'save-error'].includes(state.current.phase)) return;
    if (state.current.kind === 'meeting' && meeting && ['starting', 'recording', 'stopping', 'save-error'].includes(state.current.phase)) { setOpen(false); setMeetingPage(true); }
    else if (!status?.ready) openSpeechSettings();
    else setOpen(true);
  }
  async function openSavedMeeting(id) {
    const token = ++historyRequest.current;
    const current = state.current;
    if (['starting', 'recording', 'stopping', 'save-error'].includes(current.phase)) {
      if (current.kind === 'meeting') { setOpen(false); setMeetingPage(true); }
      if (id !== current.id) setError('请先结束当前录制，再查看其他会议。');
      return;
    }
    if (summarizing) return;
    setOpeningMeeting(true); setError('');
    try {
      await current.participantChain;
      const meta = await get(endpoint(id));
      if (!alive.current || token !== historyRequest.current) return;
      if (state.current !== current || !['idle', 'finished'].includes(current.phase)) return;
      state.current = { phase: 'finished', kind: 'meeting', id, media: [], pcm: [], segments: meta.segments || [] };
      setMeeting(meta); setKind('meeting'); setMode(meta.mode || 'audio'); setPreviewStream(null); setPhase('finished');
      setElapsed(meetingDuration(meta)); setPartial(''); setSpeaking(false); setSpeaker(null); setNotice('');
      setOpen(false); setMeetingPage(true);
    } catch (reason) { if (alive.current && token === historyRequest.current) { setError(`会议记录读取失败：${reason.message}`); setOpen(true); } }
    finally { if (alive.current && token === historyRequest.current) setOpeningMeeting(false); }
  }
  async function changeParticipant(id, field, value) {
    const next = { ...meeting.participants, [id]: { ...meeting.participants?.[id], [field]: value } };
    setMeeting(item => ({ ...item, participants: next }));
    state.current.participantChain = (state.current.participantChain || Promise.resolve()).catch(() => {}).then(() => request(endpoint(meeting.id), { participants: next }, 'PATCH')).catch(e => setError(e.message));
  }
  async function rememberSpeaker(id) {
    try {
      await state.current.participantChain;
      const person = meeting.participants?.[id] || {};
      const result = await request('/api/speech/profiles', { meetingId: meeting.id, speaker: id, name: person.name, role: person.role });
      setMeeting(item => ({ ...item, participants: result.meeting.participants, rememberedSpeakers: result.meeting.rememberedSpeakers }));
      setProfileRevision(value => value + 1); setNotice(`已记住 ${result.profile.name}，下次会议匹配成功后自动使用`); setError('');
    } catch (e) { setError(e.message); }
  }
  async function downloadTranscript() {
    const data = await get(endpoint(meeting.id));
    const lines = data.segments.map(s => `[${clock(s.start)}] ${data.participants?.[s.speaker]?.name || speakerName(s.speaker)}${data.participants?.[s.speaker]?.role ? `（${data.participants[s.speaker].role}）` : ''}：${s.text}`);
    const url = URL.createObjectURL(new Blob([`${data.title}\n\n${lines.join('\n')}`], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${data.title.replace(/[<>:"/\\|?*]/g, '_')}-逐字稿.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const busy = ['starting', 'recording', 'stopping', 'save-error'].includes(phase);
  const loading = phase === 'starting';
  const microphonePreparing = !busy && microphoneState === 'preparing';
  const microphoneStandby = !busy && microphoneState === 'ready';
  const feedback = loading ? (!captureReady ? '准备麦克风…' : stopRequested ? '加载模型并确认文字…' : '加载语音模型… · 声音已采集') : phase === 'stopping' ? '确认文字中…' : `${kind === 'dictation' ? '语音输入' : '会议录制'} · ${clock(elapsed)}`;
  const speakers = [...new Set([...(meeting?.segments || []).map(s => s.speaker), ...Object.keys(meeting?.participants || {}), ...(speaker ? [speaker] : [])])];
  const button = <button type="button" className={`voice-button ${busy ? 'active' : ''} ${microphoneStandby ? 'prepared' : ''}`} aria-label="语音输入与会议录制" aria-describedby="voice-button-tooltip" aria-busy={loading || microphonePreparing || status?.dictation?.state === 'loading'} onPointerEnter={prepareMicrophone} onFocus={prepareMicrophone} disabled={!workspace || openingMeeting || summarizing} onPointerDown={down} onPointerUp={() => up()} onPointerCancel={() => up(true)} onLostPointerCapture={() => up(true)} onClick={event => { if (hold.current.pointerClick && event.detail !== 0) { hold.current.pointerClick = false; return; } if (event.detail === 0 && !hold.current.pressed) showMeeting(); }} onKeyDown={event => { if (event.key === ' ' && !event.repeat) { event.preventDefault(); hold.current.pressed = true; hold.current.long = true; hold.current.pointerClick = false; start('dictation'); } }} onKeyUp={event => { if (event.key === ' ') { event.preventDefault(); up(); } }}>{loading || microphonePreparing || status?.dictation?.state === 'loading' ? <LoaderCircle size={18} className="spin"/> : <Mic size={18}/>}</button>;
  const voiceControl = <span className="voice-button-wrap" data-busy={busy}>{button}<span id="voice-button-tooltip" className="voice-button-tooltip" role="tooltip"><span>长按：语音输入</span><span>点击：会议录制</span></span></span>;
  const closeMeeting = () => { setMeetingPage(false); setOpen(false); };
  const standby = (microphoneStandby || microphonePreparing) && !open && !meetingPage && !error && <div className="voice-live voice-standby" role="status">{microphonePreparing && <LoaderCircle size={14} className="spin"/>}<span className="voice-status-label">{microphonePreparing ? '准备麦克风…' : '麦克风待命'}</span><button title="关闭麦克风" aria-label="关闭待命麦克风" onClick={() => microphone.current.clearIdle()}><X size={14}/></button></div>;
  const live = busy && !open && !meetingPage && <div className="voice-live" role="status"><button className="voice-status-action" onClick={showMeeting} disabled={kind === 'dictation'}>{loading || phase === 'stopping' ? <LoaderCircle size={14} className="spin"/> : <AudioLines size={14}/>}<span className="voice-status-label" title={feedback}>{feedback}</span></button>{(error || partial) && <span className="voice-status-detail" title={error || partial}>{error || partial}</span>}<button title="结束录制" aria-label="结束录制" disabled={phase === 'stopping'} onClick={finish}><Square size={14}/></button></div>;
  const failure = kind === 'dictation' && error && !busy && <div className="voice-live voice-status-error" role="alert"><span className="voice-status-label" title={error}>{error}</span><button title="关闭语音提示" aria-label="关闭语音提示" onClick={() => setError('')}><X size={14}/></button></div>;
  function beginMeeting() {
    setError('');
    if (mode === 'camera' || (mode === 'screen' && window.desktop?.listDisplaySources)) {
      microphone.current.clearIdle(); setOpen(false); setSourcePicker(true);
    } else start('meeting');
  }
  const StartIcon = mode === 'camera' ? Video : mode === 'screen' ? Monitor : Mic;
  const meetingDialog = <div className="dialog-layer voice-layer">
    <section id="meeting-dialog" className="dialog-card voice-dialog" role="dialog" aria-modal="true" aria-labelledby="meeting-dialog-title">
      <header><h3 id="meeting-dialog-title"><Mic size={17}/>开始会议录制</h3><button title="关闭面板" aria-label="关闭面板" onClick={() => setOpen(false)}><X size={18}/></button></header>
      <div className="voice-body">
        <label className="voice-field">会议标题<input value={title} placeholder="例如：产品需求评审" disabled={busy} onChange={e => setTitle(e.target.value)} maxLength={120}/></label>
        <fieldset className="voice-mode-field"><legend>录制方式</legend><div className="voice-modes" role="group" aria-label="录制方式">
          {[['audio', Mic, '语音会议'], ['screen', Monitor, '屏幕会议'], ['camera', Video, '摄像头会议']].map(([value, Icon, label]) => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}><Icon size={18}/><span>{label}</span></button>)}
        </div></fieldset>
        <div className="voice-minutes-options">
          <label className="voice-field">纪要类型<select value={role} disabled={busy} onChange={e => setRole(e.target.value)}><option value="minutes">完整纪要</option><option value="actions">决策与行动项</option><option value="interview">访谈问答</option></select></label>
          <label className="voice-check"><input type="checkbox" checked={autoSummary} disabled={busy} onChange={e => setAutoSummary(e.target.checked)}/>结束后自动生成纪要</label>
        </div>
        <div className={`voice-model-row ${status?.ready ? '' : 'unavailable'}`}>
          <span className="voice-model-dot" aria-hidden="true"/><div><span>转写模型</span><strong>{status?.ready ? status.model : '尚未安装'}</strong></div>
          <button type="button" title={status?.ready ? '语音与声纹设置' : '下载语音模型'} aria-label={status?.ready ? '语音与声纹设置' : '下载语音模型'} onClick={() => { setOpen(false); onOpenSettings?.(); }}><Settings2 size={16}/></button>
        </div>
        {openingMeeting && <p className="voice-history-loading" role="status">正在读取会议…</p>}
        {error && <p className="voice-error" role="alert">{error}</p>}
      </div>
      <footer className="voice-dialog-footer">
        <button type="button" className="voice-dialog-cancel" onClick={() => setOpen(false)}>取消</button>
        {!busy ? <button type="button" className="primary-action" disabled={!status?.ready || openingMeeting || summarizing} onClick={beginMeeting}><StartIcon size={16}/>开始会议录制</button> : <button type="button" className="voice-stop" disabled={phase === 'stopping'} onClick={finish}><Square size={15}/>{phase === 'starting' ? '取消启动' : phase === 'save-error' ? '重试保存' : phase === 'stopping' ? '保存中…' : `结束录制 · ${clock(elapsed)}`}</button>}
      </footer>
    </section>
  </div>;
  return <>{slot && createPortal(<>{standby}{live}{failure}{voiceControl}</>, slot)}{open && createPortal(meetingDialog, document.body)}{sourcePicker && createPortal(<CaptureSourcePicker mode={mode} onCancel={() => { setSourcePicker(false); setOpen(true); }} onSelect={capture => { setSourcePicker(false); setOpen(true); start('meeting', undefined, capture); }}/>, document.body)}{meetingPage && meeting && createPortal(<MeetingWorkspace meeting={meeting} phase={phase} mode={mode} previewStream={previewStream} status={status} elapsed={elapsed} partial={partial} speaking={speaking} speaker={speaker} error={error} notice={notice} summarizing={summarizing} speakers={speakers} onFinish={finish} onClose={closeMeeting} onChangeParticipant={changeParticipant} onRememberSpeaker={rememberSpeaker} onDownloadTranscript={() => downloadTranscript().catch(e => setError(e.message))} onSummarize={async () => { await state.current.participantChain; await summarize(meeting); }} onRegenerate={async () => { await state.current.participantChain; await summarize(meeting, true); }}/>, document.body)}</>;
}
