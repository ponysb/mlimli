import { BrowserRecording } from './browser-recording.mjs';

export class DictationMicrophone {
  constructor({ onState = () => {}, idleMs = 15000, audioIdleMs = 600000, create = options => new BrowserRecording(options), permission = () => navigator.permissions?.query({ name: 'microphone' }), schedule = (run, delay) => setTimeout(run, delay), cancel = timer => clearTimeout(timer) } = {}) {
    Object.assign(this, { onState, idleMs, audioIdleMs, create, permission, schedule, cancel });
    this.entry = null;
  }
  entryForUse() {
    if (this.entry) return this.entry;
    const entry = { lease: null, ready: null, started: false, timer: null };
    entry.browser = this.create({ mode: 'audio', recordMedia: false,
      onPcm: data => entry.lease?.callbacks.onPcm(data),
      onEnded: () => { entry.ended = true; entry.lease?.callbacks.onEnded(); if (!entry.lease) this.clear(entry); },
      onError: error => { entry.ended = true; entry.lease?.callbacks.onError(error); if (!entry.lease) this.clear(entry); },
    });
    this.entry = entry;
    return entry;
  }
  arm(entry) {
    this.cancel(entry.timer);
    if (this.entry !== entry || entry.lease) return;
    entry.timer = this.schedule(() => {
      if (this.entry !== entry || entry.lease) return;
      if (!entry.started) { this.clear(entry); return; }
      // Release the physical device promptly; keep the suspended processing graph warm.
      entry.browser.releaseMicrophone(); entry.started = false; entry.ready = null;
      this.onState('off'); this.arm(entry);
    }, entry.started ? this.idleMs : this.audioIdleMs);
  }
  prepareAudio() {
    const entry = this.entryForUse();
    this.arm(entry);
    return entry.browser.prepareAudio().catch(error => { this.clear(entry); throw error; });
  }
  ensureReady(entry) {
    if (!entry.ready) {
      this.onState('preparing');
      entry.ready = entry.browser.acquire().then(() => entry.browser.start({ paused: true })).then(() => {
        if (this.entry !== entry) throw new Error('已取消麦克风准备');
        entry.started = true;
        this.onState(entry.lease ? 'active' : 'ready'); this.arm(entry);
      }).catch(error => { this.clear(entry); throw error; });
    }
    return entry.ready;
  }
  async prewarm() {
    // Hover may reuse an existing grant, but must never trigger a permission prompt.
    const entry = this.entryForUse();
    if ((await this.permission())?.state !== 'granted' || this.entry !== entry || entry.lease) return;
    this.cancel(entry.timer);
    await this.ensureReady(entry); this.arm(entry);
  }
  take(callbacks) {
    const entry = this.entryForUse();
    if (entry.lease) throw new Error('麦克风正在使用中');
    this.cancel(entry.timer);
    const lease = { callbacks }; entry.lease = lease;
    // Arm capture before waiting for device or backend readiness.
    const begun = entry.browser.beginPcm(); begun.catch(() => {});
    const acquired = Promise.all([begun, this.ensureReady(entry)]); acquired.catch(() => {});
    const pool = this;
    return {
      acquire: () => acquired,
      start: () => {},
      async stop() {
        if (entry.lease !== lease) return;
        await acquired;
        await entry.browser.pausePcm();
        if (entry.lease !== lease) return;
        entry.lease = null;
        if (entry.ended) pool.clear(entry);
        else if (pool.entry === entry) { pool.onState('ready'); pool.arm(entry); }
      },
      cleanup: () => { if (entry.lease === lease) pool.clear(entry); },
    };
  }
  clear(entry = this.entry) {
    if (!entry) return;
    this.cancel(entry.timer); entry.lease = null; entry.browser.cleanup();
    if (this.entry === entry) { this.entry = null; this.onState('off'); }
  }
  clearIdle() { if (!this.entry?.lease) this.clear(); }
}
