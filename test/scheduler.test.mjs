import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Scheduler, nextScheduleTime } from '../core/scheduler.mjs';

function tempRoot(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

test('scheduler persists tasks and records manual runs', async () => {
  const root = tempRoot('mli-scheduler-');
  const dataRoot = tempRoot('mli-scheduler-data-');
  try {
    const first = new Scheduler({ dataRoot, onRun: async () => ({ sessionId: 'session-1' }) });
    const task = first.create({ name: '日报', prompt: '整理今天的工作', workspacePath: root, schedule: { type: 'daily', time: '23:59' } });
    assert.throws(() => first.update(task.id, { name: '' }), /任务名称不能为空/);
    assert.equal(first.list()[0].name, '日报');
    const result = await first.runNow(task.id);
    assert.equal(result.run.status, 'success');
    assert.equal(result.run.sessionId, 'session-1');
    assert.equal(first.list()[0].lastSessionId, 'session-1');

    const second = new Scheduler({ dataRoot, onRun: async () => ({ sessionId: 'session-2' }) });
    assert.equal(second.list()[0].id, task.id);
    assert.equal(second.runs(1)[0].status, 'success');
    second.dispose();
    first.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test('scheduler runs an overdue one-time task once and disables it', async () => {
  const root = tempRoot('mli-scheduler-once-');
  const dataRoot = tempRoot('mli-scheduler-once-data-');
  let calls = 0;
  const scheduler = new Scheduler({ dataRoot, onRun: async () => { calls += 1; return { sessionId: `session-${calls}` }; } });
  try {
    const task = scheduler.create({ name: '一次任务', prompt: '执行一次', workspacePath: root, schedule: { type: 'once', at: new Date(Date.now() - 1000).toISOString() } });
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(calls, 1);
    assert.equal(scheduler.list()[0].enabled, false);
    assert.equal(scheduler.list()[0].nextRunAt, null);
    assert.equal(scheduler.runs(1)[0].status, 'success');
  } finally {
    scheduler.dispose();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test('scheduler calculates repeat times and recovers interrupted runs', () => {
  const base = new Date(2026, 9, 2, 10, 30, 0, 0).getTime();
  assert.equal(new Date(nextScheduleTime({ type: 'daily', time: '11:00' }, base)).getHours(), 11);
  assert.equal(new Date(nextScheduleTime({ type: 'weekly', time: '09:00', weekdays: [1] }, base)).getDay(), 1);
  assert.equal(nextScheduleTime({ type: 'interval', minutes: 30, startAt: base }, base + 31 * 60 * 1000), base + 60 * 60 * 1000);

  const dataRoot = tempRoot('mli-scheduler-recover-data-');
  try {
    const file = path.join(dataRoot, '.agent', 'schedules.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ tasks: [], runs: [{ id: 'stale', status: 'running', startedAt: base }] }), 'utf8');
    const scheduler = new Scheduler({ dataRoot, onRun: async () => ({}) });
    assert.equal(scheduler.runs(1)[0].status, 'error');
    assert.match(scheduler.runs(1)[0].error, /运行时/);
    scheduler.dispose();
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
