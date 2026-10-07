const workletCode = `
class SpeechPcm extends AudioWorkletProcessor {
  constructor() {
    super(); this.phase=0; this.sum=0; this.count=0; this.buffer=[]; this.active=false;
    this.port.onmessage=({data})=>{
      if (data.command==='begin') { this.phase=0; this.sum=0; this.count=0; this.buffer=[]; this.active=true; }
      else { this.flush(); if (data.command==='pause') this.active=false; }
      this.port.postMessage({ack:data.id});
    };
  }
  flush() { if (!this.buffer.length) return; const pcm=new Int16Array(this.buffer); this.buffer=[]; this.port.postMessage(pcm.buffer,[pcm.buffer]); }
  process(inputs) {
    const data=inputs[0]?.[0];
    if (this.active && data) for (const sample of data) {
      this.sum+=sample; this.count++; this.phase+=16000/sampleRate;
      if (this.phase>=1) { this.phase-=1; this.buffer.push(Math.round(Math.max(-1,Math.min(1,this.sum/this.count))*32767)); this.sum=0; this.count=0; }
      if (this.buffer.length>=4000) this.flush();
    }
    return true;
  }
}
registerProcessor('speech-pcm',SpeechPcm);`;

export function captureErrorMessage(error, mode) {
  const camera = mode === 'camera';
  if (error.name === 'AbortError') return '';
  if (error.name === 'NotAllowedError') return camera ? '摄像头或麦克风权限被拒绝，请允许访问后重试' : '录制权限被拒绝，请允许共享画面和麦克风访问后重试';
  if (error.name === 'NotFoundError') return camera ? '未检测到摄像头或麦克风，请连接设备后重试' : '未找到录制来源或麦克风，请检查设备后重试';
  if (error.name === 'NotReadableError') return camera ? '摄像头无法启动，可能被其他程序占用或设备驱动异常' : '共享画面或麦克风无法启动，请检查设备是否被占用';
  if (error.name === 'OverconstrainedError') return '所选摄像头已断开，请刷新设备列表后重新选择';
  if (error.name === 'DisplayCaptureUnsupportedError') return '当前浏览器不支持共享画面录制，请使用桌面端或新版浏览器';
  if (/Invalid capture constraints/i.test(error.message || '')) return '所选录制来源已关闭或不可用，请刷新后重新选择';
  if (error.name === 'MediaTimeoutError' || /Timeout starting video source/i.test(error.message || '')) return camera ? '摄像头启动超时，请检查设备、驱动和其他占用摄像头的程序' : '录制来源启动超时，请重新选择后重试';
  return error.message;
}

export function requestUserMedia(constraints, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(Object.assign(new Error('媒体设备启动超时'), { name: 'MediaTimeoutError' })); }, timeoutMs);
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
      if (settled) { for (const track of stream.getTracks()) track.stop(); return; }
      settled = true; clearTimeout(timer); resolve(stream);
    }).catch(error => {
      if (settled) return;
      settled = true; clearTimeout(timer); reject(error);
    });
  });
}

export class BrowserRecording {
  constructor({ mode, cameraStream, recordMedia = true, onPcm, onMedia, onEnded, onError, onPreview }) {
    Object.assign(this, { mode, cameraStream, recordMedia, onPcm, onMedia, onEnded, onError, onPreview });
    this.streams = []; this.nodes = []; this.stopped = false; this.portTasks = new Map(); this.portSequence = 0;
    if (cameraStream) this.streams.push(cameraStream);
  }
  prepareAudio() {
    if (this.audioReady) return this.audioReady;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    const url = URL.createObjectURL(new Blob([workletCode], { type: 'text/javascript' }));
    this.audioReady = this.context.audioWorklet.addModule(url).then(() => {
      if (this.stopped) return;
      // Connect sources directly to the worklet; a MediaStreamDestination round-trip adds startup latency.
      this.bus = this.context.createGain();
      this.worklet = new AudioWorkletNode(this.context, 'speech-pcm');
      this.worklet.port.onmessage = event => {
        if (event.data instanceof ArrayBuffer) { if (!this.stopped) this.onPcm(event.data); }
        else this.portTasks.get(event.data.ack)?.();
      };
      this.bus.connect(this.worklet);
      this.mute = this.context.createGain(); this.mute.gain.value = 0;
      this.worklet.connect(this.mute); this.mute.connect(this.context.destination);
    }).finally(() => URL.revokeObjectURL(url));
    this.audioReady.catch(() => {});
    return this.audioReady;
  }
  command(command) {
    if (this.stopped || !this.worklet) return Promise.resolve();
    const id = ++this.portSequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.portTasks.delete(id); reject(new Error('音频采集器未响应，请重试')); }, 3000);
      this.portTasks.set(id, () => { clearTimeout(timer); this.portTasks.delete(id); resolve(); });
      this.worklet.port.postMessage({ command, id });
    });
  }
  async beginPcm() {
    await this.prepareAudio();
    if (!this.stopped) await this.command('begin');
  }
  async pausePcm() {
    await this.command('pause');
  }
  requestMedia(constraints, timeoutMs = 15000) {
    return requestUserMedia(constraints, timeoutMs);
  }
  requestDisplay(constraints = { video: true, audio: true }, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        reject(Object.assign(new Error('此浏览器不支持屏幕或窗口录制'), { name: 'DisplayCaptureUnsupportedError' }));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(Object.assign(new Error('共享画面启动超时'), { name: 'MediaTimeoutError' })); }, timeoutMs);
      // Call getDisplayMedia directly while the start button's user activation is active.
      navigator.mediaDevices.getDisplayMedia(constraints).then(stream => {
        if (settled) { for (const track of stream.getTracks()) track.stop(); return; }
        settled = true; clearTimeout(timer); resolve(stream);
      }).catch(error => {
        if (settled) return;
        settled = true; clearTimeout(timer); reject(error);
      });
    });
  }
  async acquire() {
    if (!navigator.mediaDevices?.getUserMedia || (this.recordMedia && !globalThis.MediaRecorder)) throw new Error('此浏览器不支持录制，请使用桌面端或 HTTPS / localhost');
    this.prepareAudio();
    this.resuming = this.context.resume(); this.resuming.catch(() => {});
    if (this.stopped) { this.cleanup(); throw new Error('已取消录制'); }
    if (this.mode === 'screen') {
      // Screen meetings capture a shared browser window or desktop surface.
      // Invoke this before any await so Chromium still sees the button gesture.
      const video = await this.requestDisplay({ video: true, audio: true });
      this.streams.push(video);
      if (this.stopped) { this.cleanup(); throw new DOMException('已取消录制', 'AbortError'); }
      try {
        const audio = await this.requestMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        this.mic = new MediaStream([...video.getVideoTracks(), ...audio.getAudioTracks()]);
        this.streams.push(audio);
        video.getVideoTracks()[0]?.applyConstraints({ frameRate: { ideal: 30, max: 30 } }).catch(() => {});
      } catch (error) {
        for (const track of video.getTracks()) track.stop();
        throw error;
      }
    } else if (this.mode === 'camera') {
      if (this.cameraStream) {
        if (!this.cameraStream.getVideoTracks().some(track => track.readyState === 'live')) throw Object.assign(new Error('摄像头已断开'), { name: 'NotReadableError' });
        const audio = await this.requestMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        this.streams.push(audio);
        this.mic = new MediaStream([...this.cameraStream.getVideoTracks(), ...audio.getAudioTracks()]);
      } else {
        this.mic = await this.requestMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true } });
        this.streams.push(this.mic);
      }
    } else {
      this.mic = await this.requestMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      this.streams.push(this.mic);
    }
    if (this.stopped) { this.cleanup(); throw new Error('已取消录制'); }
    if (this.mode !== 'audio') this.onPreview?.(this.mic);
    return this;
  }
  async start({ paused = false } = {}) {
    try {
      await this.audioReady; await this.resuming;
      if (this.stopped) return;
      if (!paused) await this.beginPcm();
      if (this.recordMedia) { this.mix = this.context.createMediaStreamDestination(); this.bus.connect(this.mix); }
      for (const stream of this.streams) {
        if (!stream.getAudioTracks().length) continue;
        const input = this.context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        const gain = this.context.createGain(); gain.gain.value = 1;
        input.connect(gain); gain.connect(this.bus); this.nodes.push(input, gain);
      }
      if (this.stopped) { this.cleanup(); return; }
      const video = this.mic.getVideoTracks();
      for (const track of [...this.mic.getAudioTracks(), ...video]) track.onended = () => { if (!this.stopped) this.onEnded(); };
      if (!this.recordMedia) return;
      this.output = new MediaStream([...this.mix.stream.getAudioTracks(), ...video]);
      const types = video.length ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('此浏览器没有可用的录制编码器');
      this.recorder = new MediaRecorder(this.output, { mimeType, videoBitsPerSecond: 2500000, audioBitsPerSecond: 96000 });
      this.recorder.ondataavailable = event => { if (event.data.size) this.onMedia(event.data); };
      this.recorder.onerror = event => this.onError(event.error || new Error('浏览器录制失败'));
      this.recorder.start(1000);
    } catch (error) { this.cleanup(); throw error; }
  }
  async stop() {
    if (this.stopped) return;
    // The acknowledgement follows the final PCM message, including short utterances.
    if (this.worklet) await this.pausePcm();
    this.stopped = true;
    if (this.recorder && this.recorder.state !== 'inactive') {
      await new Promise(resolve => { this.recorder.addEventListener('stop', resolve, { once: true }); this.recorder.stop(); });
    }
    this.cleanup();
  }
  releaseMicrophone() {
    for (const node of this.nodes) node.disconnect();
    this.nodes = [];
    for (const stream of this.streams) for (const track of stream.getTracks()) track.stop();
    this.streams = []; this.mic = null;
    this.context?.suspend().catch(() => {});
  }
  cleanup() {
    this.stopped = true;
    this.bus?.disconnect(); this.worklet?.disconnect(); this.mute?.disconnect();
    for (const finish of this.portTasks.values()) finish();
    for (const node of this.nodes) node.disconnect();
    for (const stream of this.streams) for (const track of stream.getTracks()) track.stop();
    for (const track of this.mix?.stream.getTracks() || []) track.stop();
    this.context?.close().catch(() => {});
  }
}
