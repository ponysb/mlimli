import './environment.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig, getConfig, resolveModelSelection } from './llm.mjs';
import { agentManager } from './agent-manager.mjs';
import { memoryLearner } from './memory-learning.mjs';
import { shutdownAppCenter } from './app-center.mjs';
import { createRunContext, getRunContext, withRunContext } from './run-context.mjs';
import { getSandboxPolicy } from './sandbox-policy.mjs';
import { agentProfiles } from './agent-profiles.mjs';
import { setLoopConfig, runTurn, abortRun, Session } from './loop.mjs';
import { requireAccount, setAccountConfig } from './account.mjs';
import { DATA_ROOT, getWorkspaceRoot, setWorkspaceRoot, resolveInWorkspace } from './paths.mjs';
import { ensureWorkspace, listWorkspaces, setActiveWorkspace, workspaceRegistryExists } from './workspaces.mjs';
import { loadAll, cancelUiRequests, disposePlugins } from './plugins.mjs';
import { cancelRequests } from './permissions.mjs';
import { closeMcp } from './mcp.mjs';
import { scheduler } from './scheduler.mjs';
import { emit, onEvent } from './events.mjs';
import { initializeSandbox, hasActiveSandboxCommands, stopAllSandboxCommands } from './sandbox.mjs';
import { initializeChannels, setChannelRunner, disconnectAll as disconnectChannels, send as sendChannel, getChannelMapping } from './channels.mjs';
import { taskRecoveryState } from './task-checkpoint.mjs';
import { isRunning } from './loop.mjs';

export const CONFIG_FILE = path.join(DATA_ROOT, 'config.json');
export const activeSequences = new Set();
export const runningSessions = new Map();
const runningContexts = new Map();
let runtimeConfig;
let channelSerial = Promise.resolve();
let agentEventCleanup;

export async function initializeRuntime() {
  const cfg = loadConfig(CONFIG_FILE);
  runtimeConfig = cfg;
  setLoopConfig(cfg);
  setAccountConfig(cfg);
  const root = path.resolve(DATA_ROOT, process.env.MLI_AGENT_WORKSPACE || cfg.security?.workspaceRoot || '.');
  const workspace = workspaceRegistryExists() && !listWorkspaces().length ? null : ensureWorkspace(root);
  setWorkspaceRoot(workspace?.path || root);
  initializeSandbox(cfg);
  initializeAgentRuntime();
  memoryLearner.disposed = false;
  await loadAll();
  setChannelRunner({ run: runChannelMessage, stop: stopSession });
  await initializeChannels();
  scheduler.setRunner(runScheduledTask);
  scheduler.start();
  return cfg;
}

export function initializeAgentRuntime() {
  agentManager.configure({ run: runSequence, stop: stopSingleSession, config: () => getConfig() || runtimeConfig || {}, requireAccount });
  agentEventCleanup?.();
  agentEventCleanup = onEvent(event => {
    if (!event.isSubagent) return;
    if (event.type === 'permission_request') agentManager.status(event.sessionId, 'waiting_permission');
    else if (['ui_request', 'app_login_required'].includes(event.type)) agentManager.status(event.sessionId, 'waiting_input');
    else if (['permission_resolved', 'ui_resolved', 'app_login_resolved'].includes(event.type)) agentManager.status(event.sessionId, 'running');
  });
}

export function contextForSession(session) {
  const inherited = getRunContext();
  if (inherited?.agentId === session.id) return inherited;
  if (runningContexts.has(session.id)) return runningContexts.get(session.id);
  const existing = agentManager.executionFor(session);
  if (existing) return existing.context;
  const config = getConfig() || runtimeConfig || {};
  const childTask = session.parentSessionId ? agentManager.view(session).tasks.find(task => task.sessionId === session.id) : null;
  if (session.parentSessionId && !childTask) throw new Error('子会话缺少角色记录');
  const profile = childTask ? agentProfiles(config).find(item => item.id === childTask.profile) : null;
  let context;
  context = createRunContext({ session, config, modelSelection: resolveModelSelection(childTask?.modelId), sandboxPolicy: { ...getSandboxPolicy(), ...(profile?.readOnly ? { mode: 'read-only' } : {}) }, ...(profile ? { taskId: childTask.taskId, readOnly: profile.readOnly, allowedTools: profile.tools, maxSteps: profile.maxSteps, maxDurationMs: profile.maxDurationMs, taskInstruction: childTask.instruction } : {}), changedPaths: new Set(), acquireResource: tool => agentManager.acquireResource(agentManager.group(session, context), session.id, tool), assertResource: (tool, args) => agentManager.assertResource(agentManager.group(session, context), session.id, tool, args), recordUsage: metrics => agentManager.recordUsage(context, metrics) });
  return context;
}

export function assertWorkspaceIdle() {
  if (activeSequences.size || agentManager.hasPending() || hasActiveSandboxCommands()) {
    const error = new Error('任务运行中，不能切换工作目录');
    error.status = 409;
    throw error;
  }
}

export async function runSequence(session, text, attachments, options = {}) {
  let context = options.context || contextForSession(session);
  if (context.taskId) context = Object.freeze({ ...context, recordUsage: metrics => agentManager.recordUsage(context, metrics) });
  return withRunContext(context, () => runBoundSequence(session, text, attachments, options));
}

export function prepareTaskResume(session, checkpointId) {
  const reject = message => { const error = new Error(message); error.status = 409; throw error; };
  if (session.parentSessionId) reject('请从主任务恢复；中断的子 Agent 需先核对角色、权限和结果');
  if (activeSequences.has(session.id) || isRunning(session.id)) reject('会话正在运行中');
  const recovery = taskRecoveryState(session);
  if (!recovery.available || recovery.checkpointId !== checkpointId) reject('检查点已改变或任务无需恢复，请重新加载会话');
  const context = contextForSession(session);
  if (recovery.baselineRoot && !samePath(recovery.baselineRoot, context.executionRoot)) reject('检查点工作目录已改变，请在原目录恢复');
  if (recovery.executionEnvironment?.type && recovery.executionEnvironment.type !== 'host') reject('此检查点依赖外部执行环境，需先重新连接原适配器，不能在宿主目录恢复');
  return { context, resumeCheckpointId: recovery.checkpointId, goal: recovery.goal };
}

async function runBoundSequence(session, text, attachments, options) {
  agentManager.begin(session, getRunContext());
  if (activeSequences.has(session.id)) return;
  activeSequences.add(session.id);
  runningSessions.set(session.id, session);
  runningContexts.set(session.id, getRunContext());
  const initialEntryCount = session.entries().length;
  emit('session_run_started', { sessionId: session.id });
  try {
    await runTurn(session, text, attachments, options);
    while (session.queued().length) {
      if (session.chain().findLast(entry => entry.type === 'turn_end')?.reason !== 'done') break;
      const next = session.queued()[0];
      await runTurn(session, next.text, [], { queuedId: next.queueId, savedAttachments: next.attachments });
    }
  } catch (error) {
    if (!getRunContext()?.taskId) agentManager.stop(session.id, getRunContext()?.sessionStorageRoot);
    throw error;
  } finally {
    if (!getRunContext()?.taskId) {
      while (agentManager.pending(session).length) await agentManager.wait(session, { timeoutMs: 30000, ignoreBlocked: true });
    }
    activeSequences.delete(session.id);
    runningSessions.delete(session.id);
    runningContexts.delete(session.id);
    const summary = session.entries().slice(initialEntryCount).findLast((entry) => entry.type === 'task_summary');
    emit('session_run_finished', { sessionId: session.id, reason: summary?.reason || 'error', summary });
    if (!getRunContext()?.taskId) {
      for (const completed of session.entries().slice(initialEntryCount).filter(entry => entry.type === 'task_summary')) {
        try { memoryLearner.enqueue(session, completed); } catch (error) { emit('memory_warning', { sessionId: session.id, message: error.message }); }
      }
    }
  }
}

export function stopSession(id) {
  const children = agentManager.stop(id);
  return stopSingleSession(id) || children;
}

function stopSingleSession(id) {
  const stopped = abortRun(id);
  cancelRequests(id);
  cancelUiRequests(id);
  return stopped;
}

export function shutdownRuntime() {
  shutdownAppCenter();
  memoryLearner.dispose();
  for (const id of activeSequences) stopSession(id);
  agentEventCleanup?.();
  scheduler.dispose();
  closeMcp();
  disposePlugins();
  disconnectChannels().catch((error) => console.error('[channels] shutdown failed', error.message));
  return stopAllSandboxCommands();
}

function samePath(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

async function runScheduledTask(task, { run } = {}) {
  if (activeSequences.size) return { deferred: true };
  if (!fs.existsSync(task.workspacePath) || !fs.statSync(task.workspacePath).isDirectory()) throw new Error(`工作目录不存在：${task.workspacePath}`);
  if (runtimeConfig?.provider?.providerId === 'mli-managed') await requireAccount();

  const previousRoot = getWorkspaceRoot();
  const workspaces = listWorkspaces();
  const target = workspaces.find((item) => samePath(item.path, task.workspacePath));
  if (!target) throw new Error('定时任务关联的工作目录已从工作区列表移除');
  const previous = workspaces.find((item) => item.active) || workspaces.find((item) => samePath(item.path, previousRoot));
  const switched = !samePath(previousRoot, target.path);
  if (switched) {
    if (activeSequences.size) return { deferred: true };
    setActiveWorkspace(target.id);
    setWorkspaceRoot(target.path);
    emit('workspace_changed', { workspace: target, source: 'scheduler' });
  }

  try {
    const session = Session.create(`定时任务 · ${task.name}`);
    session.setMode(task.mode);
    session.append({ type: 'state', scheduleId: task.id, scheduleRunId: run?.id || '' });
    emit('session_created', { sessionId: session.id, title: session.title, scheduleId: task.id, scheduleRunId: run?.id || '' });
    await runSequence(session, task.prompt, [], { scheduledTaskId: task.id, scheduleRunId: run?.id });
    const summary = session.entries().findLast((entry) => entry.type === 'task_summary');
    if (summary?.reason !== 'done') throw new Error(summary?.error || `定时任务尚未完成验收：${summary?.reason || '没有结果'}`);
    return { sessionId: session.id };
  } finally {
    if (switched && previous && !activeSequences.size) {
      setActiveWorkspace(previous.id);
      setWorkspaceRoot(previous.path);
      emit('workspace_changed', { workspace: previous, source: 'scheduler_restore' });
    }
  }
}

function waitForAgentIdle() {
  if (!activeSequences.size) return Promise.resolve();
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (!activeSequences.size || Date.now() - started > 30 * 60 * 1000) return resolve();
      setTimeout(poll, 250).unref?.();
    };
    poll();
  });
}

async function runChannelMessage({ channel, message, mappingKey, onSession }) {
  const job = channelSerial.then(() => runChannelMessageNow({ channel, message, mappingKey, onSession }));
  channelSerial = job.catch(() => {});
  return job;
}

async function runChannelMessageNow({ channel, message, mappingKey, onSession }) {
  await waitForAgentIdle();
  if (runtimeConfig?.provider?.providerId === 'mli-managed') await requireAccount();
  const workspaces = listWorkspaces();
  const target = (channel.workspaceId && workspaces.find((item) => item.id === channel.workspaceId)) ||
    (channel.workspacePath && workspaces.find((item) => samePath(item.path, channel.workspacePath))) ||
    workspaces.find((item) => item.active);
  if (!target) throw new Error('渠道没有可用的工作目录');
  const previousRoot = getWorkspaceRoot();
  const previous = workspaces.find((item) => samePath(item.path, previousRoot));
  const switched = !samePath(previousRoot, target.path);
  if (switched) {
    setActiveWorkspace(target.id); setWorkspaceRoot(target.path);
    emit('workspace_changed', { workspace: target, source: 'channel' });
  }
  try {
    const mapped = getChannelMapping(channel.id, mappingKey);
    let session = mapped?.sessionId ? Session.load(mapped.sessionId) : null;
    if (!session) {
      session = Session.create(`${channel.name || channel.type} · ${String(message.text || '').slice(0, 32) || '新会话'}`);
      session.append({ type: 'state', channelId: channel.id, channelType: channel.type, externalChatId: message.chatId, externalSenderId: message.senderId, source: 'channel' });
      emit('session_created', { sessionId: session.id, title: session.title, channelId: channel.id, source: 'channel' });
    }
    onSession?.(session.id);
    await sendChannel(channel.id, message.replyTarget, '已收到，Agent 开始处理。');
    emit('channel_session_started', { channelId: channel.id, sessionId: session.id, messageId: message.id });
    const prepared = prepareChannelInput(message);
    await runSequence(session, prepared.text, prepared.images, { channelId: channel.id, externalMessageId: message.id });
    const entries = session.entries();
    const summary = entries.findLast((entry) => entry.type === 'task_summary');
    if (summary?.reason !== 'done') throw new Error(summary?.error || 'Agent 任务尚未完成验收');
    const answer = entries.findLast((entry) => entry.type === 'message' && entry.role === 'assistant');
    const text = Array.isArray(answer?.content) ? answer.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n') : answer?.text || answer?.content || summary?.summaryText || 'Agent 已完成任务。';
    await sendChannel(channel.id, message.replyTarget, String(text || 'Agent 已完成任务。').slice(0, 12000));
    emit('channel_session_completed', { channelId: channel.id, sessionId: session.id, messageId: message.id });
    return { sessionId: session.id, workspaceId: target.id };
  } catch (error) {
    await sendChannel(channel.id, message.replyTarget, `Agent 处理失败：${String(error.message || error).slice(0, 1000)}`);
    emit('channel_session_error', { channelId: channel.id, messageId: message.id, error: String(error.message || error).slice(0, 500) });
    throw error;
  } finally {
    if (switched && previous && !activeSequences.size) {
      setActiveWorkspace(previous.id); setWorkspaceRoot(previous.path);
      emit('workspace_changed', { workspace: previous, source: 'channel_restore' });
    }
  }
}

function prepareChannelInput(message) {
  const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 6) : [];
  const images = [];
  const notes = [];
  for (const item of attachments) {
    const data = String(item?.data || '');
    const mime = String(item?.mime || 'application/octet-stream').toLowerCase();
    if (!data || data.length > 14 * 1024 * 1024) continue;
    if (mime.startsWith('image/')) {
      images.push({ name: String(item.name || '渠道图片').slice(0, 120), mime, dataUrl: `data:${mime};base64,${data}` });
      continue;
    }
    const safeName = String(item.name || 'attachment').replace(/[^\w.\-\u4e00-\u9fff]/g, '_').slice(0, 100) || 'attachment';
    const relative = path.join('channel-inputs', `${crypto.randomUUID().slice(0, 12)}-${safeName}`);
    try {
      const target = resolveInWorkspace(relative, { write: true });
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(data, 'base64'), { flag: 'wx', mode: 0o600 });
      notes.push(`附件 ${safeName} 已保存到工作区：${relative.replaceAll(path.sep, '/')}`);
    } catch { notes.push(`附件 ${safeName} 已收到，但保存失败`); }
  }
  const text = [String(message.text || '').trim(), ...notes].filter(Boolean).join('\n\n');
  return { text: text || (images.length ? '请查看用户附带的图片。' : '请处理收到的渠道消息。'), images };
}

export { Session, getWorkspaceRoot };
export { scheduler };
