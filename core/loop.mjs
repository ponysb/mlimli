// core/loop.mjs —— Agent 循环本体：模型流式消费 → 工具执行 → 结果回灌，直到任务完成
import { emit } from './events.mjs';
import { chat, providerInfo, usageNumbers } from './llm.mjs';
import { assembleToolCalls } from './stream.mjs';
import { Session } from './session.mjs';
import { getTool, getTools, executeTool, getHooks, getSkills, expandSlash, pluginsInfo } from './plugins.mjs';
import { expandComposerReferences } from './composer-references.mjs';
import { buildSystemPrompt } from './prompts.mjs';
import { authorize } from './permissions.mjs';
import { maybeCompact } from './compact.mjs';
import { discoverArtifacts, summarizeChanges, workspaceSnapshot } from './task-summary.mjs';
import { primaryTaskArtifact } from './task-artifacts.mjs';
import crypto from 'node:crypto';
import { getRunContext, withRunContext } from './run-context.mjs';
import { createMemorySnapshot, recordMemoryRecall } from './memory.mjs';
import { agentManager } from './agent-manager.mjs';
import { qualityPolicy, assessTaskQuality, qualityFeedback } from './task-quality.mjs';
import { RunControl, runLimits, runDeadline } from './run-control.mjs';
import { prepareToolOutput } from './tool-output.mjs';
import { QualityProgress, deliveryVersion } from './quality-progress.mjs';
import { saveTaskCheckpoint, taskRecoveryState, recoveryPrompt } from './task-checkpoint.mjs';

let loopConfig = { agent: {}, security: {} };
export function setLoopConfig(c) { loopConfig = c; }

const aborts = new Map();
const activeSteps = new Map();
export function runningStep(sessionId) { return activeSteps.get(sessionId) || null; }

function clip(value, max = 12000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}\n…[已截断，原始长度 ${text.length}]` : text;
}

export function abortRun(sessionId) {
  const ac = aborts.get(sessionId);
  if (ac) { ac.abort(); return true; }
  return false;
}

export function isRunning(sessionId) { return aborts.has(sessionId); }

function runId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function sameExecutionRoot(left, right) {
  const normalize = value => process.platform === 'win32' ? String(value).replaceAll('\\', '/').toLowerCase().replace(/\/$/, '') : String(value).replace(/\/$/, '');
  return normalize(left) === normalize(right);
}

function summaryTitle(reason) {
  if (reason === 'done') return '任务已完成';
  if (reason === 'needs_validation') return '交付尚未通过验收';
  if (reason === 'aborted') return '任务已停止';
  if (reason === 'error') return '任务运行失败';
  if (reason === 'max_steps') return '步骤预算耗尽，任务未完成';
  if (reason === 'budget_exceeded') return '时间预算耗尽，任务未完成';
  if (reason === 'model_output_incomplete') return '模型响应不完整，任务未完成';
  if (reason === 'context_blocked') return '上下文恢复受阻，任务未完成';
  return '任务已结束';
}

function emitAssistantText(session, text) {
  session.append({ type: 'message', role: 'assistant', text, toolCalls: [] });
  session.touchIndex();
  emit('message_start', { sessionId: session.id, step: 0 });
  emit('text_delta', { sessionId: session.id, text });
  emit('turn_end', { sessionId: session.id, reason: 'done' });
}

/** 一轮对话：user 输入 → 循环 → turn_end */
export async function runTurn(session, userText, attachments = [], { clientMessageId, queuedId, savedAttachments: queuedAttachments, resumeCheckpointId } = {}) {
  const parent = getRunContext();
  let memorySnapshot = { body: '', ids: [] };
  try { memorySnapshot = createMemorySnapshot(userText); recordMemoryRecall(memorySnapshot); }
  catch (error) { emit('memory_warning', { sessionId: session.id, message: error.message }); }
  return withRunContext(Object.freeze({ ...parent, memorySnapshot }), () => runBoundTurn(session, userText, attachments, { clientMessageId, queuedId, savedAttachments: queuedAttachments, resumeCheckpointId }));
}

async function runBoundTurn(session, userText, attachments = [], { clientMessageId, queuedId, savedAttachments: queuedAttachments, resumeCheckpointId } = {}) {
  const context = getRunContext();
  const cfg = context?.config || loopConfig;
  const contextWindow = context?.modelSelection?.model?.contextWindow || cfg.provider?.contextWindow || 128000;
  const sessionId = session.id;
  if (isRunning(sessionId)) { emit('error', { sessionId, message: '该会话正在运行中' }); return; }

  const recovery = resumeCheckpointId !== undefined ? taskRecoveryState(session) : null;
  if (recovery && (!recovery.available || recovery.checkpointId !== resumeCheckpointId)) throw new Error('检查点已改变或任务无需恢复，请重新加载会话');
  const slash = expandSlash(recovery?.goal || userText);
  if (slash.kind === 'help' && !attachments.length && !queuedAttachments?.length) {
    const entry = session.append({ type: 'message', role: 'user', content: userText, clientMessageId: String(clientMessageId || '').slice(0, 80) || undefined });
    session.touchIndex();
    emit('user_message', { sessionId, text: userText, entry });
    emitAssistantText(session, slash.text);
    return;
  }
  const rawPrompt = recovery?.goal || (slash.kind === 'expand' ? slash.text : userText);
  const promptText = recovery?.goal || expandComposerReferences(rawPrompt, { skills: getSkills(), plugins: pluginsInfo().plugins });

  const savedAttachments = queuedAttachments || session.saveAttachments(attachments);
  const userContent = savedAttachments.length ? [{ type: 'text', text: rawPrompt }, ...savedAttachments] : rawPrompt;
  const ac = new AbortController();
  aborts.set(sessionId, ac);
  const signal = ac.signal;
  const turnId = recovery?.turnId || runId();
  const turnStartedAt = Date.now() - (recovery?.activeDurationMs || 0);
  let stepCount = recovery?.stepCount || 0;
  let toolCount = recovery?.toolCount || 0;
  let lastAssistantText = '';
  let turnError = '';
  let turnErrorDetails = null;
  let beforeFiles = new Map();
  let activeStep = null;
  let ended = false;
  let expired = false;
  let taskQuality;
  const quality = qualityPolicy(cfg);
  const qualityProgress = new QualityProgress({ ...quality, saved: recovery?.qualityProgress });
  const { maxDurationMs: durationLimit, maxSteps: stepLimit } = runLimits(context, cfg);
  const control = new RunControl({ config: cfg, maxSteps: stepLimit, maxDurationMs: durationLimit, startedAt: turnStartedAt });
  let wrapUpNotified = false, incompleteResponses = 0, responseWarning = '';
  const remainingDuration = durationLimit === null ? null : durationLimit - (recovery?.activeDurationMs || 0);
  if (remainingDuration !== null && remainingDuration <= 0) { expired = true; ac.abort(); }
  const cancelDeadline = runDeadline(() => { expired = true; ac.abort(); }, remainingDuration === null ? null : Math.max(1, remainingDuration));
  if (recovery?.usage) control.usage(recovery.usage);
  let phase = recovery ? 'reconciling' : 'working';
  const checkpoint = extra => saveTaskCheckpoint(session, { turnId, phase, stepCount, toolCount,
    activeDurationMs: Date.now() - turnStartedAt, qualityProgress: qualityProgress.snapshot(), usage: control.counts, executionEnvironment: context?.executionEnvironment, ...extra });
  const finish = (reason) => {
    if (ended) return;
    ended = true;
    if (activeStep) {
      session.append({
        type: 'step_end', turnId, step: activeStep.step,
        text: activeStep.text, thinking: activeStep.thinking,
        startedAt: activeStep.startedAt, finishedAt: Date.now(),
        durationMs: Date.now() - activeStep.startedAt,
        status: reason === 'done' ? 'ok' : reason,
      });
      activeStep = null;
      activeSteps.delete(sessionId);
    }
    const finishedAt = Date.now();
    const afterFiles = context?.readOnly ? new Map() : workspaceSnapshot();
    let files = summarizeChanges(beforeFiles, afterFiles);
    if (context?.taskId) files = files.filter(item => context.changedPaths?.has(item.path));
    if (!context?.taskId && quality.enabled && context?.modelSelection?.provider?.protocol !== 'mock') taskQuality = assessTaskQuality({entries:session.entries(),turnId,files,prompt:promptText});
    const artifacts = discoverArtifacts(afterFiles, lastAssistantText, files);
    const primaryArtifact = reason === 'done' ? primaryTaskArtifact({ files, artifacts, summaryText: lastAssistantText, promptText }) : null;
    const durationMs = finishedAt - turnStartedAt;
    checkpoint({ phase: reason === 'done' ? 'completed' : 'blocked', reason });
    session.append({
      type: 'turn_end', turnId, reason, startedAt: turnStartedAt, finishedAt,
      durationMs, stepCount, toolCount, error: turnError || undefined,
      errorDetails: turnErrorDetails || undefined,
    });
    const summary = session.append({
      type: 'task_summary', turnId, reason, files, artifacts, primaryArtifact, primaryArtifactSource: 'inferred', promptText, title: summaryTitle(reason),
      durationMs, stepCount, toolCount, error: turnError || undefined,
      errorDetails: turnErrorDetails || undefined,
      summaryText: lastAssistantText.trim(), quality: taskQuality,
      runtimeControl: { ...control.counts, limits: { maxSteps: stepLimit, maxDurationMs: durationLimit }, notices: control.notices, executionEnvironment: context?.executionEnvironment },
    });
    session.touchIndex();
    emit('task_summary', { sessionId, summary });
    emit('turn_end', { sessionId, turnId, reason, summary, durationMs, stepCount, toolCount, error: turnError || undefined, errorDetails: turnErrorDetails || undefined });
  };

  if (recovery) {
    session.append({ type: 'turn_resume', turnId, checkpointId: recovery.checkpointId });
    session.append({ type: 'runtime_notice', turnId, kind: 'task_recovery', text: '从检查点恢复，先核对真实状态，未自动重放旧工具调用' });
  } else {
    const userEntry = session.append({ type: 'message', role: 'user', content: userContent, turnId, queuedId, clientMessageId: String(clientMessageId || '').slice(0, 80) || undefined });
    session.append({ type: 'turn_start', turnId, prompt: promptText, startedAt: turnStartedAt });
    session.touchIndex();
    emit('user_message', { sessionId, text: rawPrompt, entry: userEntry, turnId, startedAt: turnStartedAt });
  }

  const injectAdjustments = () => {
    const queued = session.queued().filter((entry) => entry.mode === 'adjust');
    for (const item of queued) {
      const content = item.attachments.length ? [{ type: 'text', text: item.text }, ...item.attachments] : item.text;
      const entry = session.append({ type: 'message', role: 'user', content, turnId, queuedId: item.queueId });
      emit('user_message', { sessionId, text: item.text, entry, turnId });
    }
    if (queued.length) session.touchIndex();
    return queued.length;
  };

  await new Promise((resolve) => setImmediate(resolve));
  try {
    beforeFiles = recovery?.baseline ? new Map(recovery.baseline.map(item => [item.path, item])) : context?.readOnly ? new Map() : workspaceSnapshot();
    if (recovery?.baselineRoot && context?.executionRoot && !sameExecutionRoot(recovery.baselineRoot, context.executionRoot)) throw new Error('检查点工作目录已改变，不能沿用旧文件和验收证据；请在原目录恢复');
    if (!recovery) checkpoint({ baseline: [...beforeFiles.values()].map(({ lines, ...record }) => record) });
    for (let step = stepCount; !signal.aborted; step++) {
      if (signal.aborted) break;
      if (stepLimit !== null && step >= stepLimit) { finish('max_steps'); return; }
      agentManager.consume(session);

      injectAdjustments();
      const compact = await maybeCompact(session, {
        contextWindow: contextWindow,
        compactAtPercent: cfg.agent?.compactAtPercent ?? 75,
      }, { signal });
      if (compact.stale) continue;
      const tools = getTools(session);
      const messages = session.messages({ contextWindow: contextWindow });
      const runState = control.state(step, { force: !!responseWarning });
      if (runState?.wrapUp && !wrapUpNotified) {
        wrapUpNotified = true;
        const notice = { kind: 'wrap_up', text: '进入收尾预算：核对剩余要求与验收，完成后及时交付' };
        control.notices.push(notice); session.append({ type: 'runtime_notice', turnId, ...notice });
        emit('status', { sessionId, text: notice.text });
      }
      if (runState && responseWarning) runState.warning = [runState.warning, responseWarning].filter(Boolean).join('\n');
      let system = buildSystemPrompt({
        tools, skills: getSkills(), mode: session.mode, desktopEnabled: session.desktopEnabled, expertPrompt: session.expertPrompt, taskPrompt: promptText, runState,
      });
      if (recovery) system += '\n\n' + recoveryPrompt(recovery, context?.executionRoot || '.');
      // Notify the UI with the exact message window selected for the next model request.
      emit('context_update', { sessionId, turnId, step, context: { ...session.contextStats(contextWindow), nextTurn: true } });

      const stepStartedAt = Date.now();
      stepCount += 1;
      activeStep = { turnId, step, startedAt: stepStartedAt, text: '', thinking: '' };
      activeSteps.set(sessionId, activeStep);
      session.append({ type: 'step_start', turnId, step, startedAt: stepStartedAt });
      checkpoint({});
      session.touchIndex();
      emit('message_start', { sessionId, turnId, step, startedAt: stepStartedAt });
      let text = '';
      let thinking = '';
      let modelUsage = null;
      const events = [];
      for await (const e of chat({ messages, system, tools, signal, sessionId, step })) {
        events.push(e);
        if (e.type === 'text_delta') { text += e.text; activeStep.text = text; emit('text_delta', { sessionId, turnId, step, text: e.text }); }
        else if (e.type === 'thinking_delta') { thinking += e.text; activeStep.thinking = thinking; emit('thinking_delta', { sessionId, turnId, step, text: e.text }); }
        else if (e.type === 'retry') emit('model_retry', { sessionId, turnId, step, attempt: e.attempt, maxAttempts: e.maxAttempts, delayMs: e.delayMs, message: e.message, details: e.details });
        else if (e.type === 'error') { const error = new Error(e.message); error.details = e.details; throw error; }
        // Providers may emit cumulative usage more than once for this response.
        else if (e.type === 'usage') modelUsage = e.usage;
        if (signal.aborted) break;
      }
      if (modelUsage) control.usage(usageNumbers(modelUsage, {}, ''));
      checkpoint({});
      if (signal.aborted) break;

      const toolCalls = assembleToolCalls(events);
      const outputIncomplete = events.some(e => e.type === 'done' && ['length', 'max_tokens', 'incomplete'].includes(e.reason));
      const invalidArguments = toolCalls.some(call => Object.hasOwn(call.args, '_raw'));
      if (text || toolCalls.length) {
        session.append({ type: 'message', role: 'assistant', text, toolCalls, turnId, step });
        session.touchIndex();
      }
      if (text.trim()) lastAssistantText = text;

      if (outputIncomplete || invalidArguments) {
        incompleteResponses++;
        responseWarning = '上一条模型响应被截断或工具参数 JSON 不完整，本条中的工具均未执行。请缩短单次输出并重新发送完整合法调用，不重复假定已完成的副作用。';
        for (const call of toolCalls) {
          session.append({ type: 'message', role: 'tool', toolCallId: call.id, content: responseWarning, status: 'error', turnId, step });
          session.append({ type: 'tool_end', name: call.name, callId: call.id, content: responseWarning, status: 'error', turnId, step, errorDetails: { stage: 'model_output', name: 'IncompleteModelOutput' } });
        }
        session.append({ type: 'step_end', turnId, step, text, thinking, status: 'model_output_incomplete', startedAt: stepStartedAt, finishedAt: Date.now() });
        activeStep = null; activeSteps.delete(sessionId);
        session.append({ type: 'runtime_notice', turnId, kind: 'model_output_incomplete', text: responseWarning });
        emit('status', { sessionId, text: responseWarning });
        if (incompleteResponses > 2) { finish('model_output_incomplete'); return; }
        continue;
      }
      incompleteResponses = 0; responseWarning = '';

      if (!toolCalls.length) {
        session.append({
          type: 'step_end', turnId, step, text, thinking,
          startedAt: stepStartedAt, finishedAt: Date.now(), durationMs: Date.now() - stepStartedAt, status: 'ok',
        });
        activeStep = null;
        activeSteps.delete(sessionId);
        if (injectAdjustments()) continue;
        if (phase === 'reconciling' && recovery?.unknownActions.length) {
          const progress = qualityProgress.observe({ missing: ['恢复后未核对结果未知的操作'], checks: [] }, 'recovery-unchecked');
          checkpoint({});
          if (progress.blocked) { finish('needs_validation'); return; }
          session.append({ type: 'message', role: 'user', source: 'runtime', turnId, content: '[恢复状态核对尚未完成] 有操作结果未知。请先用读取或状态工具核对实际结果；不能仅凭旧记录宣称已完成。' });
          continue;
        }
        if (agentManager.consume(session, { finishing: true })) continue;
        if (!context?.taskId && agentManager.pending(session).length) {
          emit('status', { sessionId, text: '等待子 Agent 完成并汇总结果' });
          while (!signal.aborted && agentManager.pending(session).length) await agentManager.wait(session, { timeoutMs: 30000, ignoreBlocked: true }, signal);
          if (signal.aborted) break;
          agentManager.consume(session, { finishing: true });
          continue;
        }
        if (!context?.taskId && quality.enabled && context?.modelSelection?.provider?.protocol !== 'mock') {
          const files = summarizeChanges(beforeFiles, workspaceSnapshot());
          taskQuality = assessTaskQuality({ entries:session.entries(),turnId,files,prompt:promptText });
          if (taskQuality.missing.length) {
            phase = 'validating';
            const progress = qualityProgress.observe(taskQuality, [deliveryVersion(taskQuality.artifacts), taskQuality.sourceVersion]);
            checkpoint({ quality: { missing: taskQuality.missing, progress } });
            if (progress.blocked) { finish('needs_validation'); return; }
            const strategy = progress.changeStrategy ? '\n当前产物和验收状态持续没有新进展。请改变修复假设或检查方法；不要重复同一操作。若环境或资料确实阻塞，明确报告。' : '';
            session.append({type:'message',role:'user',source:'runtime',turnId,content:qualityFeedback(taskQuality)+strategy});
            emit('status',{sessionId,text:progress.changeStrategy?'验收暂无进展，调整修复策略':`继续补齐交付验收（第 ${progress.attempts} 次检查）`});
            continue;
          }
        }
        finish('done');
        return;
      }

      for (const call of toolCalls) {
        if (signal.aborted) break;
        toolCount += 1;
        const toolStartedAt = Date.now();
        session.append({
          type: 'tool_start', turnId, step, callId: call.id, name: call.name,
          args: call.args, decision: 'pending', startedAt: toolStartedAt,
        });
        session.touchIndex();
        emit('tool_call', { sessionId, turnId, step, call: { id: call.id, name: call.name, args: call.args }, decision: 'pending', startedAt: toolStartedAt });
        const tool = getTool(call.name);
        if (!tool) {
          const msg = `未知工具 ${call.name}`;
          const errorDetails = { stage: 'tool_lookup', name: 'UnknownToolError', message: msg, tool: call.name, args: call.args };
          const finishedAt = Date.now();
          session.append({ type: 'message', role: 'tool', toolCallId: call.id, content: msg, status: 'error', errorDetails, turnId, step });
          session.append({ type: 'tool_end', turnId, step, callId: call.id, name: call.name, status: 'error', content: msg, errorDetails, startedAt: toolStartedAt, finishedAt, durationMs: finishedAt - toolStartedAt });
          emit('tool_result', { sessionId, turnId, step, callId: call.id, name: call.name, status: 'error', content: msg, errorDetails, finishedAt, durationMs: finishedAt - toolStartedAt });
          continue;
        }

        let vetoed = null;
        if (phase === 'reconciling' && recovery?.unknownActions.length && (tool.permission !== 'L0' || recovery.unknownActions.some(action => action.name === call.name))) vetoed = '恢复检查尚未完成：先使用读取/状态工具核对真实状态，再决定是否继续产生副作用。';
        for (const h of getHooks().authorize_tool_call) {
          try {
            const r = await h({ session, tool, args: call.args, name: call.name });
            if (r === false) vetoed = `被插件钩子 authorize_tool_call 拦截`;
          } catch (err) { vetoed = `插件钩子异常：${err.message}`; }
          if (vetoed) break;
        }

        let perm = { ok: true, decision: 'auto' };
        if (!vetoed) perm = await authorize({ session, tool, args: call.args, timeoutMs: cfg.security?.permissionTimeoutMs });
        if (vetoed || !perm.ok) {
          const reason = vetoed ?? perm.reason ?? '权限拒绝';
          const errorDetails = { stage: 'tool_authorization', name: 'PermissionDenied', message: reason, decision: perm.decision, tool: call.name, args: call.args };
          const finishedAt = Date.now();
          session.append({ type: 'message', role: 'tool', toolCallId: call.id, content: `[权限拒绝] ${reason}`, status: 'denied', errorDetails, turnId, step });
          session.append({ type: 'tool_end', turnId, step, callId: call.id, name: call.name, status: 'denied', content: reason, errorDetails, decision: perm.decision, startedAt: toolStartedAt, finishedAt, durationMs: finishedAt - toolStartedAt });
          emit('tool_result', { sessionId, turnId, step, callId: call.id, name: call.name, status: 'denied', content: reason, errorDetails, decision: perm.decision, finishedAt, durationMs: finishedAt - toolStartedAt });
          continue;
        }

        let result;
        checkpoint({ phase: 'tool_pending', inFlight: { callId: call.id, name: call.name, permission: tool.permission } });
        try {
          result = await executeTool(tool, call.args, {
            session, signal,
            timeoutMs: cfg.agent?.toolTimeoutMs ?? 60000,
          });
          for (const h of getHooks().process_tool_result) {
            try { result = (await h({ session, tool, args: call.args, result, signal })) ?? result; } catch { /* 钩子异常不影响结果 */ }
          }
        } catch (err) {
          result = { content: `[工具异常] ${err.message}`, status: 'error', errorDetails: { stage: 'tool_execution', name: err.name || 'Error', message: err.message, code: err.code || err.cause?.code || '', cause: err.cause?.message || '', tool: call.name, args: call.args } };
        }

        const mediaSources = normalizeMedia(result);
        const downloaded = [];
        for (const source of mediaSources) downloaded.push({ ...source, dataUrl: await mediaDataUrl(source.dataUrl || source.url, signal) });
        const media = downloaded.length ? session.saveAttachments(downloaded, { imagesOnly: false }) : [];
        const prepared = prepareToolOutput(session, result, { turnId, maxChars: cfg.agent?.runControl?.maxToolOutputChars });
        const modelPayload = prepared.content;
        const finishedAt = Date.now();
        const status = result.status ?? 'ok';
        session.append({
          type: 'message', role: 'tool', toolCallId: call.id,
          content: modelPayload, status, output: prepared.output, toolState: prepared.state, errorDetails: result.errorDetails, ui: result.ui, media, turnId, step,
        });
        session.append({
          type: 'tool_end', turnId, step, callId: call.id, name: call.name,
          status, decision: perm.decision, content: modelPayload, output: prepared.output, toolState: prepared.state, errorDetails: result.errorDetails, ui: result.ui, media,
          ...(tool.plugin === 'core' && ['set_task_plan','verify_artifact','verify_browser','verify_document','verify_media','bash'].includes(tool.name) ? {taskContract:result.taskContract,verification:result.verification} : {}),
          ...(tool.plugin === 'ffmpeg' && tool.name === 'ffmpeg_probe' ? {verification:result.verification} : {}),
          ...(tool.plugin === 'core' && tool.name === 'bash' ? {exitCode:result.exitCode,command:result.command,testEvidence:result.testEvidence} : {}),
          startedAt: toolStartedAt, finishedAt, durationMs: finishedAt - toolStartedAt,
        });
        const notice = control.observe(tool, call.args, result);
        if (phase === 'reconciling' && status === 'ok' && tool.permission === 'L0' && !/memor|history/i.test(tool.name)) {
          phase = 'working';
          session.append({ type: 'runtime_notice', turnId, kind: 'recovery_state_read', text: '已读取恢复后的实际状态；未完成操作仍须逐项核对，读取成功不证明外部副作用未发生' });
        }
        const handle = result.jobId ?? result.job_id;
        checkpoint({ phase, inFlight: null, lastTool: { callId: call.id, name: call.name, status },
          ...(typeof handle === 'string' || typeof handle === 'number' ? { externalHandle: { tool: call.name, jobId: String(handle).slice(0, 300) } } : {}) });
        if (notice) {
          session.append({ type: 'runtime_notice', turnId, ...notice });
          emit('status', { sessionId, text: notice.text });
        }
        session.touchIndex();
        emit('tool_result', {
          sessionId, turnId, step, callId: call.id, name: call.name,
          status, decision: perm.decision, content: prepareToolOutput(null, result, { maxChars: 4000 }).content, output: prepared.output, toolState: prepared.state,
          image: result.image, video: result.video, media, ui: result.ui, errorDetails: result.errorDetails,
          finishedAt, durationMs: finishedAt - toolStartedAt,
        });
      }
      session.append({
        type: 'step_end', turnId, step, text, thinking,
        startedAt: stepStartedAt, finishedAt: Date.now(), durationMs: Date.now() - stepStartedAt,
        status: signal.aborted ? 'aborted' : 'ok',
      });
      activeStep = null;
      activeSteps.delete(sessionId);
    }
    finish(expired ? 'budget_exceeded' : 'aborted');
  } catch (err) {
    if (signal.aborted) finish(expired ? 'budget_exceeded' : 'aborted');
    else {
      turnError = err.message;
      turnErrorDetails = err.details || { stage: 'agent_loop', name: err.name || 'Error', message: err.message, stack: err.stack || '' };
      emit('error', { sessionId, message: err.message, details: turnErrorDetails });
      finish(err.code === 'CONTEXT_COMPACTION_FAILED' ? 'context_blocked' : 'error');
    }
  } finally {
    cancelDeadline();
    if (!context?.taskId && session.entries().findLast(entry => entry.type === 'turn_end')?.reason !== 'done') agentManager.stop(sessionId, context?.sessionStorageRoot);
    aborts.delete(sessionId);
    activeSteps.delete(sessionId);
    if (!ended) finish(signal.aborted ? (expired ? 'budget_exceeded' : 'aborted') : 'done');
  }
}

function normalizeMedia(result = {}) {
  const rows = Array.isArray(result.media) ? result.media : [];
  for (const [type, value] of [['image', result.image], ['video', result.video], ['audio', result.audio]]) if (value) rows.push({ type, dataUrl: value, name: result.ui?.title });
  if (result.ui?.dataUrl || result.ui?.url) rows.push({ type: result.ui.kind, dataUrl: result.ui.dataUrl, url: result.ui.url, name: result.ui.title });
  return rows.filter((item, index) => (item.dataUrl || item.url) && rows.findIndex((other) => (other.dataUrl || other.url) === (item.dataUrl || item.url)) === index).slice(0, 6).map((item, index) => ({ ...item, name: item.name || `生成媒体 ${index + 1}` }));
}

async function mediaDataUrl(value, signal) {
  if (String(value).startsWith('data:')) return value;
  if (!/^https?:\/\//i.test(String(value))) throw new Error('生成媒体必须是 data URL 或 http/https URL');
  const response = await fetch(value, { signal, redirect: 'follow' });
  if (!response.ok) throw new Error(`下载生成媒体失败 HTTP ${response.status}`);
  const mime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!/^(image|video|audio)\//.test(mime) || buffer.length > 100 * 1024 * 1024) throw new Error('生成媒体格式不支持或超过 100 MB');
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export async function runDevTool(session, toolName, args) {
  const cfg = getRunContext()?.config || loopConfig;
  const tool = getTool(toolName);
  if (!tool) throw new Error(`未知工具 ${toolName}`);
  const perm = await authorize({ session, tool, args, timeoutMs: cfg.security?.permissionTimeoutMs });
  if (!perm.ok) return { ok: false, reason: perm.reason };
  emit('tool_call', { sessionId: session.id, call: { id: `dev_${Date.now()}`, name: toolName, args }, decision: perm.decision });
  const result = await executeTool(tool, args, { session, timeoutMs: cfg.agent?.toolTimeoutMs ?? 60000 });
  emit('tool_result', { sessionId: session.id, callId: 'dev', name: toolName, status: result.status ?? 'ok', content: clip(result.content, 4000), image: result.image, ui: result.ui });
  return { ok: true, result };
}

export function runtimeInfo() {
  return { provider: providerInfo(), tools: getTools().map((t) => ({ name: t.name, permission: t.permission ?? 'L0', plugin: t.plugin ?? 'core' })) };
}

export { Session };
