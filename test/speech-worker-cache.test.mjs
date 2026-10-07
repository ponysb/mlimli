import assert from 'node:assert/strict';
import test from 'node:test';
import { DictationWorkerCache } from '../plugins/local-speech/worker-cache.mjs';

function fixture() {
  let now = 0, loads = 0;
  const timers = new Set();
  const cache = new DictationWorkerCache({
    idleMs: 600000, now: () => now,
    schedule: (run, delay) => { const timer = { run, at: now + delay }; timers.add(timer); return timer; },
    cancel: timer => timers.delete(timer),
  });
  const advance = milliseconds => { now += milliseconds; for (const timer of [...timers]) if (timer.at <= now) { timers.delete(timer); timer.run(); } };
  const create = () => {
    let resolve, reject;
    const initialized = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { initialized, resolve, reject, number: ++loads, closed: false, close() { this.closed = true; } };
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { cache, advance, create, settle };
}

test('preload shares one loading process and starts the idle deadline only after loading completes', async () => {
  const { cache, create, advance, settle } = fixture();
  const worker = cache.ensure(create);
  assert.equal(cache.ensure(create), worker);
  assert.equal(cache.status().state, 'loading');
  advance(600001);
  assert.equal(worker.closed, false, 'a slow initial load is not evicted by the idle timer');
  worker.resolve(); await settle();
  assert.equal(cache.status().state, 'ready');
  advance(599999); assert.equal(worker.closed, false);
  advance(1); assert.equal(worker.closed, true);
  assert.equal(cache.status().state, 'unloaded');
});

test('nearby dictations reuse the same worker, active sessions are not evicted, and release renews the deadline', async () => {
  const { cache, create, advance, settle } = fixture();
  const worker = cache.ensure(create); worker.resolve(); await settle();
  advance(590000);
  assert.equal(cache.take(), worker);
  advance(1200000); assert.equal(worker.closed, false);
  cache.put(worker); await settle();
  advance(590000);
  assert.equal(cache.ensure(create), worker, 'focus/hover renews the idle deadline');
  advance(20000); assert.equal(worker.closed, false);
  assert.equal(cache.take(), worker);
  cache.put(worker); await settle();
  advance(600000); assert.equal(worker.closed, true);
  const next = cache.ensure(create); assert.notEqual(next, worker);
  assert.equal(next.number, 2); cache.clear();
});

test('failed preloading is reported and can be retried; stale completion cannot affect a replacement', async () => {
  const { cache, create, settle } = fixture();
  const first = cache.ensure(create);
  first.reject(new Error('model load failed')); await settle();
  assert.equal(cache.status().state, 'error');
  assert.equal(cache.status().error, 'model load failed');
  assert.equal(first.closed, true);
  const second = cache.ensure(create);
  cache.clear();
  const third = cache.ensure(create);
  second.resolve(); await settle();
  assert.equal(cache.status().state, 'loading');
  third.resolve(); await settle();
  assert.equal(cache.status().state, 'ready');
  cache.clear(); assert.equal(third.closed, true);
});
