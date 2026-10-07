import crypto from 'node:crypto';
import { toolResultState, toolResultText } from './tool-output.mjs';

// null/0/omitted means no task-wide limit; positive values are explicit budgets.
export function normalizeRunLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number)) : null;
}

export function runLimits(context, config = {}) {
  const resolve = key => normalizeRunLimit(context && Object.hasOwn(context, key) ? context[key] : config.agent?.[key]);
  return { maxSteps: resolve('maxSteps'), maxDurationMs: resolve('maxDurationMs') };
}

export function runDeadline(callback, duration, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const limit = normalizeRunLimit(duration);
  if (limit === null) return () => {};
  const started = now();
  let timer, cancelled = false;
  const schedule = () => {
    if (cancelled) return;
    const remaining = limit - (now() - started);
    if (remaining <= 0) { callback(); return; }
    // Node timers overflow beyond ~24.8 days; re-arm rather than abort immediately.
    timer = setTimer(schedule, Math.min(remaining, 2147483647));
  };
  schedule();
  return () => { cancelled = true; clearTimer(timer); };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function runControlPolicy(config = {}) {
  const value = config.agent?.runControl || {};
  return { enabled: value.enabled !== false, wrapUpRatio: Math.max(0.5, Math.min(0.95, Number(value.wrapUpRatio) || 0.85)), repeatThreshold: Math.max(2, Math.min(8, Number(value.repeatThreshold) || 3)) };
}

export class RunControl {
  constructor({ config, maxSteps, maxDurationMs, startedAt = Date.now(), now = Date.now }) {
    this.policy = runControlPolicy(config); this.maxSteps = normalizeRunLimit(maxSteps); this.maxDurationMs = normalizeRunLimit(maxDurationMs); this.startedAt = startedAt; this.now = now;
    this.history = []; this.warning = null; this.counts = { promptTokens: 0, completionTokens: 0 }; this.notices = [];
  }
  usage(usage = {}) {
    this.counts.promptTokens += Math.max(0, Number(usage.promptTokens) || 0);
    this.counts.completionTokens += Math.max(0, Number(usage.completionTokens) || 0);
  }
  observe(tool, args, result) {
    if (!this.policy.enabled || ['agent_wait', 'read_tool_output'].includes(tool.name)) return null;
    if (tool.permission === 'L1' && result.status !== 'error') { this.history = []; this.warning = null; return null; }
    const key = crypto.createHash('sha256').update(JSON.stringify([tool.name, canonical(args)])).digest('hex');
    const hash = crypto.createHash('sha256').update(JSON.stringify(toolResultState(result)) + toolResultText(result)).digest('hex');
    const previous = this.history.filter(row => row.key === key);
    const changed = previous.at(-1)?.hash !== hash;
    if (changed) {
      this.history = this.history.filter(row => row.key !== key);
      if (this.warning?.key === key) this.warning = null;
    }
    this.history.push({ key, hash }); this.history = this.history.slice(-12);
    const repeats = this.history.filter(row => row.key === key && row.hash === hash).length;
    if (repeats < this.policy.repeatThreshold || this.warning?.key === key) return null;
    const notice = { kind: 'repeated_result', tool: tool.name, repeats, text: `${tool.name} 的相同参数和结果已出现 ${repeats} 次。先判断是否必要轮询；否则改变查询/修复策略。若当前要求已有验证证据，核对后交付，不继续无关扫描。` };
    this.warning = { ...notice, key }; this.notices.push(notice); return notice;
  }
  state(step, { force = false } = {}) {
    if (!this.policy.enabled && !force) return null;
    const elapsedMs = Math.max(0, this.now() - this.startedAt);
    return { remainingSteps: this.maxSteps === null ? null : Math.max(0, this.maxSteps - step), remainingSeconds: this.maxDurationMs === null ? null : Math.max(0, Math.ceil((this.maxDurationMs - elapsedMs) / 1000)),
      elapsedSteps: step, elapsedSeconds: Math.floor(elapsedMs / 1000),
      wrapUp: this.policy.enabled && ((this.maxSteps !== null && step >= Math.floor(this.maxSteps * this.policy.wrapUpRatio)) || (this.maxDurationMs !== null && elapsedMs >= this.maxDurationMs * this.policy.wrapUpRatio)),
      warning: this.warning?.text || '', ...this.counts };
  }
}

export function runStatePrompt(state) {
  if (!state) return '';
  const budgets = [state.remainingSteps == null ? '' : `剩余模型轮数 ${state.remainingSteps}`, state.remainingSeconds == null ? '' : `剩余时间约 ${state.remainingSeconds} 秒`].filter(Boolean);
  return ['# 本轮运行控制（不是用户新增要求）',
    `已运行 ${state.elapsedSteps ?? 0} 轮，约 ${state.elapsedSeconds ?? 0} 秒。`,
    budgets.length ? `${budgets.join('，')}。这是显式配置的预算，工具循环和内部修复都计入。` : '本任务未设置固定轮数和总时长上限。持续推进用户目标，完成必要验证后交付；遇到无法解决的阻塞如实说明，用户可以随时停止。',
    state.wrapUp ? '已进入收尾预算：只处理尚未满足的用户要求、必要修复和最终验收。检查已通过且交付未再修改时及时给出结果；不要追加无关探索或重复同一检查。未验证或未完成必须如实说明，不得降低验收标准。' : '', state.warning].filter(Boolean).join('\n');
}
