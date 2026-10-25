export class SwarmCapacity {
  constructor() { this.limit = 1; this.successes = 0; this.cooldownUntil = 0; this.maximum = 0; }
  current(options = {}, now = Date.now()) {
    const maximum = Math.max(1, Math.min(8, Math.floor(Number(options.maxConcurrent) || 2)));
    this.adaptive = options.adaptiveConcurrency === true;
    if (!this.adaptive) { this.maximum = 0; this.successes = 0; this.cooldownUntil = 0; return maximum; }
    if (!this.maximum) this.limit = Math.min(maximum, 2);
    this.maximum = maximum; this.limit = Math.min(maximum, this.limit);
    return this.limit;
  }
  observe(status, message = '', now = Date.now()) {
    if (!this.adaptive) return;
    if (status !== 'completed' && /\b429\b|rate.limit|限流|too many requests/i.test(message)) {
      this.limit = Math.max(1, Math.floor(this.limit / 2)); this.successes = 0; this.cooldownUntil = now + 30000;
    } else if (status === 'completed' && now >= this.cooldownUntil && ++this.successes >= this.limit) {
      this.limit = Math.min(this.maximum || 1, this.limit + 1); this.successes = 0;
    }
  }
}
