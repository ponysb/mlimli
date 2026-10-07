export class DictationWorkerCache {
  constructor({ idleMs = 600000, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
    Object.assign(this, { idleMs, now, schedule, cancel });
    this.entry = null;
    this.error = '';
  }
  clear() {
    const entry = this.entry;
    this.entry = null; this.error = '';
    if (entry) { this.cancel(entry.timer); entry.worker.close(); }
  }
  arm(entry) {
    this.cancel(entry.timer);
    entry.expiresAt = this.now() + this.idleMs;
    entry.timer = this.schedule(() => { if (this.entry === entry) this.clear(); }, this.idleMs);
    entry.timer?.unref?.();
  }
  put(worker) {
    this.clear();
    const entry = { worker, state: 'loading', expiresAt: null };
    this.entry = entry;
    worker.initialized.then(() => {
      if (this.entry !== entry) return;
      entry.state = 'ready'; this.arm(entry);
    }).catch(error => {
      if (this.entry !== entry) return;
      this.clear(); this.error = error.message;
    });
    return worker;
  }
  ensure(create) {
    if (this.entry?.worker.closed) this.clear();
    if (!this.entry) return this.put(create());
    if (this.entry.state === 'ready') this.arm(this.entry);
    return this.entry.worker;
  }
  take() {
    const entry = this.entry;
    if (!entry) return null;
    this.cancel(entry.timer); this.entry = null;
    return entry.worker.closed ? null : entry.worker;
  }
  status() {
    const entry = this.entry;
    const state = entry?.worker.closed ? 'error' : entry?.state || (this.error ? 'error' : 'unloaded');
    return { state, resident: Boolean(entry && !entry.worker.closed), idleTimeoutSeconds: this.idleMs / 1000, expiresAt: entry?.expiresAt || null, error: this.error || (entry?.worker.closed ? '语音进程已退出' : '') };
  }
}
