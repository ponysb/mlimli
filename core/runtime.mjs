import './environment.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from './llm.mjs';
import { setLoopConfig, runTurn, abortRun, Session } from './loop.mjs';
import { requireAccount, setAccountConfig } from './account.mjs';
import { DATA_ROOT, getWorkspaceRoot, setWorkspaceRoot, resolveInWorkspace } from './paths.mjs';
import { ensureWorkspace, listWorkspaces, setActiveWorkspace } from './workspaces.mjs';
import { loadAll, cancelUiRequests, disposePlugins } from './plugins.mjs';
import { cancelRequests } from './permissions.mjs';
import { closeMcp } from './mcp.mjs';
import { scheduler } from './scheduler.mjs';
import { emit } from './events.mjs';
import { initializeChannels, setChannelRunner, disconnectAll as disconnectChannels, send as sendChannel, getChannelMapping } from './channels.mjs';

export const CONFIG_FILE = path.join(DATA_ROOT, 'config.json');
export const activeSequences = new Set();
export const runningSessions = new Map();
let runtimeConfig;
let channelSerial = Promise.resolve();

export async function initializeRuntime() {
  const cfg = loadConfig(CONFIG_FILE);
  runtimeConfig = cfg;
  setLoopConfig(cfg);
  setAccountConfig(cfg);
  const workspace = ensureWorkspace(path.resolve(DATA_ROOT, process.env.MLI_AGENT_WORKSPACE || cfg.security?.workspaceRoot || '.'));
  setWorkspaceRoot(workspace.path);
  await loadAll();
  setChannelRunner({ run: runChannelMessage, stop: stopSession });
  await initializeChannels();
  scheduler.setRunner(runScheduledTask);
  scheduler.start();
  return cfg;
}

export function assertWorkspaceIdle() {
  if (activeSequences.size) {
    const error = new Error('任务运行中，不能切换工作目录');
    error.status = 409;
    throw error;
  }
}

export async function runSequence(session, text, attachments, options = {}) {
  if (activeSequences.has(session.id)) return;
  activeSequences.add(session.id);
  runningSessions.set(session.id, session);
  const initialEntryCount = session.entries().length;
  emit('session_run_started', { sessionId: session.id });
  try {
    await runTurn(session, text, attachments, options);
    while (session.queued().length) {
      if (session.chain().findLast(entry => entry.type === 'turn_end')?.reason !== 'done') break;
      const next = session.queued()[0];
      await runTurn(session, next.text, [], { queuedId: next.queueId, savedAttachments: next.attachments });
    }
  } finally {
    activeSequences.delete(session.id);
    runningSessions.delete(session.id);
    const summary = session.entries().slice(initialEntryCount).findLast((entry) => entry.type === 'task_summary');
    emit('session_run_finished', { sessionId: session.id, reason: summary?.reason || 'error', summary });
  }
}

export function stopSession(id) {
  const stopped = abortRun(id);
  cancelRequests(id);
  cancelUiRequests(id);
  return stopped;
}

export function shutdownRuntime() {
  for (const id of activeSequences) stopSession(id);
  scheduler.dispose();
  closeMcp();
  disposePlugins();
  disconnectChannels().catch((error) => console.error('[channels] shutdown failed', error.message));
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
    if (summary?.reason === 'error' || summary?.reason === 'aborted') throw new Error(summary.error || `定时任务运行${summary.reason === 'aborted' ? '已停止' : '失败'}`);
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
    if (summary?.reason === 'error' || summary?.reason === 'aborted') throw new Error(summary.error || 'Agent 任务未完成');
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
