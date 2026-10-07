import React, { useEffect, useRef, useState } from 'react';
import { Monitor, AppWindow, Video, X, RefreshCw, Check, LoaderCircle } from 'lucide-react';
import { captureErrorMessage, requestUserMedia } from './browser-recording.mjs';
import './capture-source-picker.css';

export default function CaptureSourcePicker({ mode, onCancel, onSelect }) {
  const camera = mode === 'camera';
  const [tab, setTab] = useState(camera ? 'camera' : 'window');
  const [sources, setSources] = useState([]), [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [audio, setAudio] = useState(false);
  const [revision, setRevision] = useState(0), [stream, setStream] = useState(null), [connecting, setConnecting] = useState(false);
  const panel = useRef(null), video = useRef(null), transferred = useRef(false), cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector('button')?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); cancel.current(); }
      if (event.key === 'Tab') {
        const items = [...panel.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')];
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const load = async () => {
      if (!camera) return window.desktop.listDisplaySources();
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error('当前环境不支持摄像头，请使用桌面端或 HTTPS / localhost');
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput').map((device, index) => ({ id: device.deviceId || 'default', name: device.label || `摄像头 ${index + 1}`, kind: 'camera' }));
    };
    load().then(items => {
      if (!active) return;
      setSources(items); setSelected(current => items.some(item => item.id === current) ? current : camera ? items[0]?.id || '' : '');
    }).catch(reason => { if (active) { setSources([]); setSelected(''); setError(captureErrorMessage(reason, mode)); } }).finally(() => { if (active) setLoading(false); });
    const changed = () => setRevision(value => value + 1);
    if (camera) navigator.mediaDevices?.addEventListener('devicechange', changed);
    return () => { active = false; if (camera) navigator.mediaDevices?.removeEventListener('devicechange', changed); };
  }, [camera, mode, revision]);
  useEffect(() => {
    if (!camera || !selected || loading) return;
    let active = true, captured;
    transferred.current = false; setStream(null); setConnecting(true); setError('');
    requestUserMedia({ video: selected === 'default' ? true : { deviceId: { exact: selected } }, audio: false }).then(value => {
      captured = value;
      if (!active) { value.getTracks().forEach(track => track.stop()); return; }
      value.getVideoTracks()[0].onended = () => { if (active && !transferred.current) { setStream(null); setError('摄像头已断开，请重新连接设备'); } };
      setStream(value);
      navigator.mediaDevices.enumerateDevices().then(devices => {
        if (active) setSources(current => current.map(item => ({ ...item, name: devices.find(device => device.deviceId === item.id)?.label || item.name })));
      }).catch(() => {});
    }).catch(reason => { if (active) setError(captureErrorMessage(reason, 'camera')); }).finally(() => { if (active) setConnecting(false); });
    return () => { active = false; if (!transferred.current) captured?.getTracks().forEach(track => track.stop()); };
  }, [camera, selected, loading]);
  useEffect(() => {
    if (video.current) { video.current.srcObject = stream; if (stream) video.current.play().catch(() => {}); }
  }, [stream]);
  const items = sources.filter(source => source.kind === tab);
  const confirm = () => {
    if (camera) {
      if (!stream?.getVideoTracks().some(track => track.readyState === 'live')) return;
      transferred.current = true; onSelect({ cameraStream: stream });
    } else {
      if (!window.desktop.setDisplaySource(selected, audio)) { setError('录制来源已失效，请刷新后重试'); return; }
      onSelect({});
    }
  };
  return <div className="capture-picker-layer"><section ref={panel} className="capture-picker" role="dialog" aria-modal="true" aria-labelledby="capture-picker-title">
    <header><h2 id="capture-picker-title">{camera ? '选择摄像头' : '选择会议录制画面'}</h2><button type="button" title="关闭" aria-label="关闭录制来源选择" onClick={onCancel}><X size={18}/></button></header>
    <div className="capture-picker-tabs" role="tablist" aria-label="录制来源">
      {(camera ? [['camera', Video, '摄像头']] : [['window', AppWindow, '窗口'], ['screen', Monitor, '整个屏幕']]).map(([value, Icon, label]) => <button type="button" key={value} role="tab" aria-selected={tab === value} onClick={() => { if (tab !== value) { setTab(value); setSelected(''); } }}><Icon size={16}/>{label}</button>)}
      <button type="button" className="capture-refresh" title="刷新来源" aria-label="刷新录制来源" disabled={loading || connecting} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16}/></button>
    </div>
    <div className="capture-picker-content">
      {camera && sources.length > 0 && <label className="capture-camera-select">摄像头<select aria-label="选择摄像头设备" value={selected} onChange={event => setSelected(event.target.value)}>{sources.map(source => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>}
      {camera ? <div className="capture-camera-preview"><video ref={video} muted autoPlay playsInline/>{!stream && <span>{loading || connecting ? <><LoaderCircle size={22} className="spin"/>正在连接摄像头…</> : sources.length ? '摄像头暂无画面' : '未检测到摄像头，请连接设备后刷新'}</span>}</div> : loading ? <p className="capture-empty"><LoaderCircle size={20} className="spin"/>正在获取录制来源…</p> : items.length ? <div className="capture-source-grid">{items.map(source => <button type="button" key={source.id} className={`capture-source ${selected === source.id ? 'selected' : ''}`} aria-pressed={selected === source.id} onClick={() => setSelected(source.id)}><img src={source.thumbnail} alt=""/><span title={source.name}>{source.name}</span>{selected === source.id && <Check className="capture-source-check" size={18}/>}</button>)}</div> : <p className="capture-empty">{tab === 'screen' ? '没有可共享的屏幕' : '没有可共享的窗口'}</p>}
      {!camera && <label className="capture-audio"><input type="checkbox" checked={audio} onChange={event => setAudio(event.target.checked)}/>同时录制系统音频</label>}
      {error && <p className="voice-error" role="alert">{error}</p>}
    </div>
    <footer><button type="button" className="capture-cancel" onClick={onCancel}>取消</button><button type="button" className="primary-action" disabled={loading || (camera ? !stream || connecting : !selected)} onClick={confirm}>{camera ? <Video size={16}/> : <Monitor size={16}/>}{camera ? '开始录制' : '共享并录制'}</button></footer>
  </section></div>;
}
