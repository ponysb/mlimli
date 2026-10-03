// core/scheduler.mjs - persistent local schedule runner.
// A schedule never reuses an interactive session: every execution gets a new session.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_ROOT } from './paths.mjs';
import { emit } from './events.mjs';

const MAX_RUNS = 200;
const TICK_LIMIT_MS = 60 * 1000;
const RETRY_DELAY_MS = 30 * 1000;

function stateFile(dataRoot) { return path.join(dataRoot, '.agent', 'schedules.json'); }
function now() { return Date.now(); }
function id() { return crypto.randomUUID().replaceAll('-', '').slice(0, 12); }
function asString(value, max = 200) { return String(value ?? '').trim().slice(0, max); }
function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')); }
function localDateAt(date, time) {
  const [hour, minute] = String(time).split(':').map(Number);
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}
function dateFromInput(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeWeekdays(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(Number).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))].sort((a, b) => a - b);
}

export function normalizeSchedule(input = {}) {
  const type = ['once', 'daily', 'weekly', 'interval'].includes(input.type) ? input.type : 'once';
  const schedule = { type };
  if (type === 'once') {
    const at = dateFromInput(input.at);
    if (!at) throw new Error('单次任务需要有效的执行时间');
    schedule.at = at;
  } else if (type === 'interval') {
    const minutes = Number(input.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 525600) throw new Error('间隔必须在 1 分钟到 365 天之间');
    schedule.minutes = Math.floor(minutes);
    const startAt = dateFromInput(input.startAt);
    schedule.startAt = startAt || now();
  } else {
    if (!validTime(input.time)) throw new Error('周期任务需要有效的执行时间');
    schedule.time = String(input.time);
    if (type === 'weekly') {
      schedule.weekdays = normalizeWeekdays(input.weekdays);
      if (!schedule.weekdays.length) throw new Error('每周任务至少选择一天');
    }
  }
  return schedule;
}

export function nextScheduleTime(schedule, from = now()) {
  if (!schedule?.type) return null;
  if (schedule.type === 'once') return Number(schedule.at) > from ? Number(schedule.at) : Number(schedule.at) || null;
  if (schedule.type === 'interval') {
    const interval = Math.max(1, Number(schedule.minutes) || 1) * 60 * 1000;
    const start = Number(schedule.startAt) || from;
    if (start > from) return start;
    const elapsed = Math.max(0, from - start);
    return start + (Math.floor(elapsed / interval) + 1) * interval;
  }
  const base = new Date(from);
  if (schedule.type === 'daily') {
    let candidate = localDateAt(base, schedule.time);
    if (candidate.getTime() <= from) { candidate.setDate(candidate.getDate() + 1); }
    return candidate.getTime();
  }
  const weekdays = normalizeWeekdays(schedule.weekdays);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(base);
    candidate.setDate(base.getDate() + offset);
    candidate.setHours(0, 0, 0, 0);
    if (!weekdays.includes(candidate.getDay())) continue;
    const at = localDateAt(candidate, schedule.time);
    if (at.getTime() > from) return at.getTime();
  }
  return null;
}

function readState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { tasks: Array.isArray(value.tasks) ? value.tasks : [], runs: Array.isArray(value.runs) ? value.runs.slice(0, MAX_RUNS) : [] };
  } catch { return { tasks: [], runs: [] }; }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

function publicTask(task) {
  return {
    ...task,
    schedule: { ...task.schedule, weekdays: task.schedule?.weekdays ? [...task.schedule.weekdays] : undefined },
  };
}

export class Scheduler {
  constructor({ dataRoot = DATA_ROOT, onRun } = {}) {
    if (typeof onRun !== 'function') throw new Error('Scheduler 需要 onRun 回调');
    this.file = stateFile(dataRoot);
    this.onRun = onRun;
    this.state = readState(this.file);
    let recovered = false;
    for (const run of this.state.runs) {
      if (run.status !== 'running') continue;
      run.status = 'error';
      run.error = '运行时在任务完成前退出';
      run.finishedAt = now();
      recovered = true;
    }
    if (recovered) writeState(this.file, this.state);
    this.timer = null;
    this.started = false;
    this.running = new Set();
    this.retryAt = new Map();
  }

  setRunner(onRun) {
    if (typeof onRun !== 'function') throw new Error('Scheduler 需要 onRun 回调');
    this.onRun = onRun;
  }

  persist() { writeState(this.file, this.state); }
  list() { return this.state.tasks.map(publicTask); }
  runs(limit = 100) { return this.state.runs.slice(0, Math.max(1, Math.min(MAX_RUNS, Number(limit) || 100))); }

  create(input = {}) {
    const name = asString(input.name, 80);
    const prompt = asString(input.prompt, 30000);
    const workspaceValue = asString(input.workspacePath, 1000);
    const workspacePath = path.resolve(workspaceValue);
    if (!name) throw new Error('任务名称不能为空');
    if (!prompt) throw new Error('任务提示词不能为空');
    if (!workspaceValue || !fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) throw new Error('工作目录无效');
    const schedule = normalizeSchedule(input.schedule);
    const createdAt = now();
    const task = {
      id: id(), name, prompt, workspacePath,
      mode: input.mode === 'auto-all' ? 'auto-all' : 'default',
      schedule, enabled: input.enabled !== false,
      createdAt, updatedAt: createdAt,
      nextRunAt: schedule.type === 'once' && schedule.at <= createdAt ? createdAt : nextScheduleTime(schedule, createdAt - 1),
      lastRunAt: null, lastStatus: null, lastError: '', lastSessionId: null, runCount: 0,
    };
    this.state.tasks.unshift(task);
    this.persist();
    emit('schedule_updated', { action: 'created', task: publicTask(task) });
    this.#arm();
    return publicTask(task);
  }

  update(taskId, input = {}) {
    const task = this.state.tasks.find((item) => item.id === taskId);
    if (!task) return null;
    const next = JSON.parse(JSON.stringify(task));
    const previousSchedule = JSON.stringify(next.schedule);
    if (input.name !== undefined) next.name = asString(input.name, 80);
    if (input.prompt !== undefined) next.prompt = asString(input.prompt, 30000);
    if (input.workspacePath !== undefined) {
      const workspaceValue = asString(input.workspacePath, 1000);
      const workspacePath = path.resolve(workspaceValue);
      if (!workspaceValue || !fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) throw new Error('工作目录无效');
      next.workspacePath = workspacePath;
    }
    if (input.mode !== undefined) next.mode = input.mode === 'auto-all' ? 'auto-all' : 'default';
    if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
    if (input.schedule !== undefined) next.schedule = normalizeSchedule(input.schedule);
    if (!next.name) throw new Error('任务名称不能为空');
    if (!next.prompt) throw new Error('任务提示词不能为空');
    if (JSON.stringify(next.schedule) !== previousSchedule || input.enabled === true) next.nextRunAt = nextScheduleTime(next.schedule, now() - 1);
    next.updatedAt = now();
    Object.assign(task, next);
    this.persist();
    emit('schedule_updated', { action: 'updated', task: publicTask(task) });
    this.#arm();
    return publicTask(task);
  }

  remove(taskId) {
    const index = this.state.tasks.findIndex((item) => item.id === taskId);
    if (index < 0) return false;
    const [task] = this.state.tasks.splice(index, 1);
    this.retryAt.delete(taskId);
    this.persist();
    emit('schedule_updated', { action: 'deleted', taskId, task: publicTask(task) });
    this.#arm();
    return true;
  }

  async runNow(taskId) {
    const task = this.state.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('定时任务不存在');
    return this.#execute(task, { manual: true });
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.#arm();
  }

  dispose() {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  #arm() {
    if (!this.started) return;
    if (this.timer) clearTimeout(this.timer);
    const current = now();
    const due = this.state.tasks.filter((task) => task.enabled && task.nextRunAt != null && !this.running.has(task.id)).map((task) => Math.max(current, Number(this.retryAt.get(task.id) || task.nextRunAt)));
    const delay = due.length ? Math.min(TICK_LIMIT_MS, Math.max(0, Math.min(...due) - current)) : TICK_LIMIT_MS;
    this.timer = setTimeout(() => { this.timer = null; this.#tick().catch((error) => console.error(`[scheduler] ${error.message}`)); }, delay);
    this.timer.unref?.();
  }

  async #tick() {
    if (!this.started) return;
    const current = now();
    const due = this.state.tasks.filter((task) => task.enabled && task.nextRunAt != null && Number(task.nextRunAt) <= current && !this.running.has(task.id) && Number(this.retryAt.get(task.id) || 0) <= current);
    for (const task of due) {
      this.#execute(task, { manual: false }).catch((error) => console.error(`[scheduler] ${error.message}`)).finally(() => { this.running.delete(task.id); this.#arm(); });
    }
    this.#arm();
  }

  async #execute(task, { manual }) {
    if (this.running.has(task.id)) return { deferred: true };
    this.running.add(task.id);
    const run = { id: id(), taskId: task.id, taskName: task.name, startedAt: now(), finishedAt: null, status: 'running', error: '', sessionId: null, workspacePath: task.workspacePath };
    this.state.runs.unshift(run);
    this.state.runs = this.state.runs.slice(0, MAX_RUNS);
    this.persist();
    emit('schedule_run_started', { run: { ...run } });
    let result;
    let deferred = false;
    try {
      result = await this.onRun(publicTask(task), { run, manual });
      if (result?.deferred) {
        deferred = true;
        this.retryAt.set(task.id, now() + RETRY_DELAY_MS);
        this.state.runs = this.state.runs.filter((item) => item.id !== run.id);
        this.persist();
        return { deferred: true };
      }
      run.status = 'success';
      run.sessionId = result?.sessionId || null;
      if (!manual) {
        if (task.schedule.type === 'once') { task.enabled = false; task.nextRunAt = null; }
        else task.nextRunAt = nextScheduleTime(task.schedule, now());
      }
      task.lastStatus = 'success';
      task.lastError = '';
      task.lastRunAt = run.startedAt;
      task.lastSessionId = run.sessionId;
      task.runCount = Number(task.runCount || 0) + 1;
    } catch (error) {
      run.status = 'error';
      run.error = error.message;
      task.lastStatus = 'error';
      task.lastError = error.message;
      task.lastRunAt = run.startedAt;
      task.runCount = Number(task.runCount || 0) + 1;
      if (!manual && task.schedule.type === 'once') { task.enabled = false; task.nextRunAt = null; }
    } finally {
      if (deferred) {
        this.running.delete(task.id);
        this.#arm();
        emit('schedule_deferred', { task: publicTask(task), retryAt: this.retryAt.get(task.id) });
      } else {
        run.finishedAt = now();
        if (!manual) this.retryAt.delete(task.id);
        task.updatedAt = now();
        this.persist();
        emit('schedule_run_finished', { run: { ...run }, task: publicTask(task) });
        this.running.delete(task.id);
        this.#arm();
      }
    }
    return { run: { ...run }, task: publicTask(task) };
  }
}

export const scheduler = new Scheduler({ onRun: async () => { throw new Error('scheduler 尚未初始化'); } });
