import path from 'node:path';
import { getRunContext } from './run-context.mjs';

export function saveTaskCheckpoint(session, state) {
  const entry = session.append({ type: 'task_checkpoint', version: 1, executionRoot: getRunContext()?.executionRoot,
    ...state });
  session.touchIndex();
  return entry;
}

export function taskRecoveryState(session) {
  const chain = session.chain(), start = chain.findLast(entry => entry.type === 'turn_start');
  if (!start) return { available: false };
  const turn = chain.filter(entry => entry.turnId === start.turnId);
  const checkpoint = turn.findLast(entry => entry.type === 'task_checkpoint');
  if (!checkpoint) return { available: false };
  const ending = turn.findLast(entry => entry.type === 'turn_end');
  if (ending?.reason === 'done') return { available: false, reason: 'done' };
  const baseline = turn.find(entry => entry.type === 'task_checkpoint' && Array.isArray(entry.baseline));
  const results = new Set(turn.filter(entry => entry.type === 'tool_end').map(entry => entry.callId));
  const unknown = turn.filter(entry => entry.type === 'tool_start' && !results.has(entry.callId)).map(entry => ({ callId: entry.callId, name: entry.name, state: 'unknown' }));
  return { available: true, checkpointId: checkpoint.id, turnId: start.turnId, goal: start.prompt,
    phase: checkpoint.phase, reason: ending && ending.id > checkpoint.id ? ending.reason : 'interrupted', stepCount: turn.filter(entry => entry.type === 'step_start').reduce((count, entry) => Math.max(count, entry.step + 1), checkpoint.stepCount || 0),
    toolCount: Math.max(checkpoint.toolCount || 0, turn.filter(entry => entry.type === 'tool_start').length), activeDurationMs: checkpoint.activeDurationMs || 0,
    executionRoot: checkpoint.executionRoot, executionEnvironment: checkpoint.executionEnvironment, baseline: baseline?.baseline, baselineRoot: baseline?.executionRoot, qualityProgress: checkpoint.qualityProgress, usage: checkpoint.usage,
    unknownActions: unknown, externalHandles: turn.filter(entry => entry.type === 'task_checkpoint' && entry.externalHandle).map(entry => entry.externalHandle).slice(-20) };
}

export function recoveryPrompt(recovery, executionRoot) {
  const moved = recovery.executionRoot && path.resolve(recovery.executionRoot) !== path.resolve(executionRoot);
  return ['# 从任务检查点恢复（运行时资料，不是用户新增要求）',
    `原始任务：${recovery.goal}`, `阶段：${recovery.phase}；已运行 ${recovery.stepCount} 轮。`,
    moved ? '当前工作目录已改变，旧文件版本和验证不能直接沿用。先核对当前文件。' : '先重读当前文件及验证状态，从未完成项继续，已有完整结果不重新执行。',
    recovery.unknownActions.length ? `以下调用没有完整结果，可能已产生副作用：${JSON.stringify(recovery.unknownActions)}。先检查真实状态，禁止仅凭缺少回复就重放。` : '',
    recovery.externalHandles.length ? `已记录外部句柄：${JSON.stringify(recovery.externalHandles)}。先查询状态再决定下一步。` : '',
    '旧子任务不会自动重放；通过 agent_inspect 核对已交付结果和中断状态，只继续未完成部分。'].filter(Boolean).join('\n');
}
