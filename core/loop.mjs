// core/loop.mjs —— Agent 循环本体：模型流式消费 → 工具执行 → 结果回灌，直到任务完成
import { emit } from './events.mjs';
import { chat, providerInfo } from './llm.mjs';
import { assembleToolCalls } from './stream.mjs';
import { Session } from './session.mjs';
import { getTool, getTools, executeTool, getHooks, getSkills, expandSlash } from './plugins.mjs';
import { buildSystemPrompt } from './prompts.mjs';
import { authorize } from './permissions.mjs';
import { maybeCompact } from './compact.mjs';
import { discoverArtifacts, summarizeChanges, workspaceSnapshot } from './task-summary.mjs';
import { primaryTaskArtifact } from './task-artifacts.mjs';
import crypto from 'node:crypto';

let cfg = { agent: {}, security: {} };
export function setLoopConfig(c) { cfg = c; }

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

function summaryTitle(reason) {
  if (reason === 'done') return '任务已完成';
  if (reason === 'aborted') return '任务已停止';
  if (reason === 'error') return '任务运行失败';
  if (reason === 'max_steps') return '任务已结束';
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
export async function runTurn(session, userText, attachments = [], { clientMessageId, queuedId, savedAttachments: queuedAttachments } = {}) {
  const sessionId = session.id;
  if (isRunning(sessionId)) { emit('error', { sessionId, message: '该会话正在运行中' }); return; }

  const slash = expandSlash(userText);
  if (slash.kind === 'help' && !attachments.length && !queuedAttachments?.length) {
    const entry = session.append({ type: 'message', role: 'user', content: userText, clientMessageId: String(clientMessageId || '').slice(0, 80) || undefined });
    session.touchIndex();
    emit('user_message', { sessionId, text: userText, entry });
    emitAssistantText(session, slash.text);
    return;
  }
  const promptText = slash.kind === 'expand' ? slash.text : userText;

  const savedAttachments = queuedAttachments || session.saveAttachments(attachments);
  const userContent = savedAttachments.length ? [{ type: 'text', text: promptText }, ...savedAttachments] : promptText;
  const ac = new AbortController();
  aborts.set(sessionId, ac);
  const signal = ac.signal;
  const turnId = runId();
  const turnStartedAt = Date.now();
  let stepCount = 0;
  let toolCount = 0;
  let lastAssistantText = '';
  let turnError = '';
  let turnErrorDetails = null;
  let beforeFiles = new Map();
  let activeStep = null;
  let ended = false;
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
    const afterFiles = workspaceSnapshot();
    const files = summarizeChanges(beforeFiles, afterFiles);
    const artifacts = discoverArtifacts(afterFiles, lastAssistantText, files);
    const primaryArtifact = reason === 'done' ? primaryTaskArtifact({ files, artifacts, summaryText: lastAssistantText, promptText }) : null;
    const durationMs = finishedAt - turnStartedAt;
    session.append({
      type: 'turn_end', turnId, reason, startedAt: turnStartedAt, finishedAt,
      durationMs, stepCount, toolCount, error: turnError || undefined,
      errorDetails: turnErrorDetails || undefined,
    });
    const summary = session.append({
      type: 'task_summary', turnId, reason, files, artifacts, primaryArtifact, title: summaryTitle(reason),
      durationMs, stepCount, toolCount, error: turnError || undefined,
      errorDetails: turnErrorDetails || undefined,
      summaryText: lastAssistantText.trim(),
    });
    session.touchIndex();
    emit('task_summary', { sessionId, summary });
    emit('turn_end', { sessionId, turnId, reason, summary, durationMs, stepCount, toolCount, error: turnError || undefined, errorDetails: turnErrorDetails || undefined });
  };

  const userEntry = session.append({ type: 'message', role: 'user', content: userContent, turnId, queuedId, clientMessageId: String(clientMessageId || '').slice(0, 80) || undefined });
  session.append({ type: 'turn_start', turnId, prompt: promptText, startedAt: turnStartedAt });
  session.touchIndex();
  emit('user_message', { sessionId, text: promptText, entry: userEntry, turnId, startedAt: turnStartedAt });

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
    beforeFiles = workspaceSnapshot();
    for (let step = 0; !signal.aborted; step++) {
      if (signal.aborted) break;

      await maybeCompact(session, {
        contextWindow: cfg.provider?.contextWindow ?? 128000,
        compactAtPercent: cfg.agent?.compactAtPercent ?? 75,
      }).catch(() => ({ done: false }));

      injectAdjustments();
      const tools = getTools(session);
      const messages = session.messages({ contextWindow: cfg.provider?.contextWindow ?? 128000 });
      const system = buildSystemPrompt({
        tools, skills: getSkills(), mode: session.mode, desktopEnabled: session.desktopEnabled, expertPrompt: session.expertPrompt,
      });
      // Notify the UI with the exact message window selected for the next model request.
      emit('context_update', { sessionId, turnId, step, context: { ...session.contextStats(cfg.provider?.contextWindow ?? 128000), nextTurn: true } });

      const stepStartedAt = Date.now();
      stepCount += 1;
      activeStep = { turnId, step, startedAt: stepStartedAt, text: '', thinking: '' };
      activeSteps.set(sessionId, activeStep);
      session.append({ type: 'step_start', turnId, step, startedAt: stepStartedAt });
      session.touchIndex();
      emit('message_start', { sessionId, turnId, step, startedAt: stepStartedAt });
      let text = '';
      let thinking = '';
      const events = [];
      for await (const e of chat({ messages, system, tools, signal, sessionId, step })) {
        events.push(e);
        if (e.type === 'text_delta') { text += e.text; activeStep.text = text; emit('text_delta', { sessionId, turnId, step, text: e.text }); }
        else if (e.type === 'thinking_delta') { thinking += e.text; activeStep.thinking = thinking; emit('thinking_delta', { sessionId, turnId, step, text: e.text }); }
        else if (e.type === 'retry') emit('model_retry', { sessionId, turnId, step, attempt: e.attempt, maxAttempts: e.maxAttempts, delayMs: e.delayMs, message: e.message, details: e.details });
        else if (e.type === 'error') { const error = new Error(e.message); error.details = e.details; throw error; }
        if (signal.aborted) break;
      }
      if (signal.aborted) break;

      const toolCalls = assembleToolCalls(events);
      if (text || toolCalls.length) {
        session.append({ type: 'message', role: 'assistant', text, toolCalls, turnId, step });
        session.touchIndex();
      }
      if (text.trim()) lastAssistantText = text;

      if (!toolCalls.length) {
        session.append({
          type: 'step_end', turnId, step, text, thinking,
          startedAt: stepStartedAt, finishedAt: Date.now(), durationMs: Date.now() - stepStartedAt, status: 'ok',
        });
        activeStep = null;
        activeSteps.delete(sessionId);
        if (injectAdjustments()) continue;
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
        const modelPayload = clip(result.content);
        const finishedAt = Date.now();
        const status = result.status ?? 'ok';
        session.append({
          type: 'message', role: 'tool', toolCallId: call.id,
          content: modelPayload, status, errorDetails: result.errorDetails, ui: result.ui, media, turnId, step,
        });
        session.append({
          type: 'tool_end', turnId, step, callId: call.id, name: call.name,
          status, decision: perm.decision, content: modelPayload, errorDetails: result.errorDetails, ui: result.ui, media,
          startedAt: toolStartedAt, finishedAt, durationMs: finishedAt - toolStartedAt,
        });
        session.touchIndex();
        emit('tool_result', {
          sessionId, turnId, step, callId: call.id, name: call.name,
          status, decision: perm.decision, content: clip(result.content, 4000),
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
    finish('aborted');
  } catch (err) {
    if (signal.aborted) finish('aborted');
    else {
      turnError = err.message;
      turnErrorDetails = err.details || { stage: 'agent_loop', name: err.name || 'Error', message: err.message, stack: err.stack || '' };
      emit('error', { sessionId, message: err.message, details: turnErrorDetails });
      finish('error');
    }
  } finally {
    aborts.delete(sessionId);
    activeSteps.delete(sessionId);
    if (!ended) finish(signal.aborted ? 'aborted' : 'done');
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
