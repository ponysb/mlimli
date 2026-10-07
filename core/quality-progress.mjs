import crypto from 'node:crypto';
import fs from 'node:fs';
import { resolveReadable } from './paths.mjs';

export function deliveryVersion(paths = []) {
  const hash = crypto.createHash('sha256');
  for (const name of [...new Set(paths)].sort()) {
    hash.update(name); hash.update('\0');
    try {
      const file = resolveReadable(name), stat = fs.statSync(file);
      if (!stat.isFile()) { hash.update('not-file'); continue; }
      if (stat.size > 64 * 1024 * 1024) hash.update(JSON.stringify([stat.size, stat.mtimeMs]));
      else hash.update(fs.readFileSync(file));
    } catch { hash.update('unavailable'); }
    hash.update('\0');
  }
  return hash.digest('hex');
}

export class QualityProgress {
  constructor({ noProgressThreshold = 3, saved } = {}) {
    this.threshold = noProgressThreshold;
    this.seen = new Set(saved?.seen || []); this.stalled = saved?.stalled || 0; this.attempts = saved?.attempts || 0; this.strategyRequested = !!saved?.strategyRequested;
  }
  observe(quality, version) {
    this.attempts++;
    const signature = crypto.createHash('sha256').update(JSON.stringify([version, [...quality.missing].sort(), quality.checks.filter(check => check.passed).map(check => [check.kind, check.criterion, check.name]).sort()])).digest('hex');
    const progress = !this.seen.has(signature);
    if (progress) { this.stalled = 0; this.strategyRequested = false; }
    else this.stalled++;
    this.seen.add(signature);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value);
    const blocked = this.strategyRequested && this.stalled > this.threshold;
    const changeStrategy = !blocked && this.stalled >= this.threshold;
    if (changeStrategy) this.strategyRequested = true;
    return { attempts: this.attempts, progress, stalled: this.stalled, changeStrategy, blocked };
  }
  snapshot() { return { seen: [...this.seen], stalled: this.stalled, attempts: this.attempts, strategyRequested: this.strategyRequested }; }
}
