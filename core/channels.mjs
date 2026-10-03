// 渠道接入核心：配置、凭据、去重、白名单、会话映射和适配器生命周期。
// 平台 SDK 只负责连接与收发消息，所有安全策略在这里统一执行。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { APP_ROOT, DATA_ROOT } from './paths.mjs';
import { emit, onEvent } from './events.mjs';
import { resolveRequest } from './permissions.mjs';

const privateRoot = process.env.MLI_AGENT_CHANNEL_DATA
  ? path.resolve(process.env.MLI_AGENT_CHANNEL_DATA)
  : path.join(DATA_ROOT === APP_ROOT ? os.homedir() : DATA_ROOT, '.mli-agent', 'channels');
const configFile = path.join(privateRoot, 'channels.json');
const MAX_DEDUPE = 2000;
const MAX_EVENTS = 100;
const adapters = new Map();
const state = {
  channels: new Map(),
  running: new Map(),
  events: [],
  runner: null,
  permissionUnsub: null,
  loaded: false,
};

function ensureDir() { fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 }); }
function readStore() {
  ensureDir();
  try { const value = JSON.parse(fs.readFileSync(configFile, 'utf8')); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function writeStore(value) {
  ensureDir();
  const temp = `${configFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, configFile);
}
function sanitizeSecret(value) {
  const text = String(value || '');
  return text ? `${text.slice(0, 3)}${'*'.repeat(Math.max(4, Math.min(16, text.length - 3)))}${text.slice(-2)}` : '';
}
function publicChannel(channel) {
  const credentials = channel.credentials || {};
  return {
    id: channel.id, type: channel.type, name: channel.name, enabled: !!channel.enabled,
    workspaceId: channel.workspaceId || '', workspacePath: channel.workspacePath || '',
    requireMention: channel.requireMention !== false,
    allowUsers: channel.allowUsers || [], allowChats: channel.allowChats || [],
    status: channel.status || 'disconnected', lastError: channel.lastError || '',
    connectedAt: channel.connectedAt || null, updatedAt: channel.updatedAt || null,
    credentials: Object.fromEntries(Object.entries(credentials).map(([key, value]) => [key, sanitizeSecret(value)])),
    adapter: adapters.get(channel.type)?.name || channel.type,
    dedupeSize: Array.isArray(channel.dedupe) ? channel.dedupe.length : 0,
  };
}
function persist() {
  const channels = [...state.channels.values()].map((item) => ({ ...item, adapterState: undefined }));
  writeStore({ version: 1, channels });
}
function addEvent(channel, type, details = {}) {
  const event = { id: crypto.randomUUID().slice(0, 12), channelId: channel?.id, type, ts: Date.now(), ...details };
  state.events.unshift(event);
  if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
  emit('channel_updated', { channelId: channel?.id, event: { ...event } });
  return event;
}
function normalizeConfig(input, current = {}) {
  const type = String(input.type || current.type || '').toLowerCase();
  if (!['feishu', 'dingtalk'].includes(type)) throw new Error('渠道类型仅支持 feishu 或 dingtalk');
  const id = String(input.id || current.id || crypto.randomUUID().slice(0, 12)).replace(/[^\w-]/g, '').slice(0, 64);
  if (!id) throw new Error('渠道 ID 无效');
  const credentials = { ...(current.credentials || {}), ...(input.credentials || {}) };
  for (const key of Object.keys(credentials)) if (credentials[key] === '' || credentials[key] == null) delete credentials[key];
  return {
    ...current, ...input, id, type, name: String(input.name ?? current.name ?? type).trim().slice(0, 80) || type,
    enabled: input.enabled ?? current.enabled ?? false,
    requireMention: input.requireMention ?? current.requireMention ?? true,
    allowUsers: Array.isArray(input.allowUsers) ? input.allowUsers.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 500) : (current.allowUsers || []),
    allowChats: Array.isArray(input.allowChats) ? input.allowChats.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 500) : (current.allowChats || []),
    credentials, mappings: { ...(current.mappings || {}) }, dedupe: Array.isArray(current.dedupe) ? current.dedupe.slice(-MAX_DEDUPE) : [],
    status: current.status || 'disconnected', lastError: '', updatedAt: Date.now(), adapterState: undefined,
  };
}

export function registerChannelAdapter(def) {
  if (!def?.type || typeof def.connect !== 'function') throw new Error('渠道适配器需要 type 和 connect');
  adapters.set(String(def.type).toLowerCase(), def);
  return () => { if (adapters.get(def.type) === def) adapters.delete(def.type); };
}
export function channelAdapters() { return [...adapters.values()].map((item) => ({ type: item.type, name: item.name || item.type, ready: true })); }
export function setChannelRunner(fn) { state.runner = typeof fn === 'function' ? { run: fn } : (fn && typeof fn.run === 'function' ? fn : null); }
export function channelDataDirectory() { ensureDir(); return privateRoot; }

export function loadChannels() {
  if (state.loaded) { ensurePermissionListener(); return; }
  const store = readStore();
  for (const raw of Array.isArray(store.channels) ? store.channels : []) {
    try { const item = normalizeConfig(raw, raw); state.channels.set(item.id, item); } catch { /* 忽略损坏的单项配置 */ }
  }
  state.loaded = true;
  ensurePermissionListener();
  return listChannels();
}
function ensurePermissionListener() {
  if (!state.permissionUnsub) state.permissionUnsub = onEvent((event) => {
    if (event.type !== 'permission_request') return;
    const binding = [...state.running.values()].find((item) => item.sessionId === event.sessionId);
    const channel = binding && state.channels.get(binding.channelId);
    if (!channel || !binding) return;
    send(channel.id, binding.replyTarget, `需要确认权限：${event.request?.summary || event.request?.tool || '工具调用'}\n回复 /allow ${event.request?.reqId || ''} 或 /deny ${event.request?.reqId || ''}`).catch(() => {});
    addEvent(channel, 'permission_requested', { sessionId: event.sessionId, reqId: event.request?.reqId });
  });
}
export function listChannels() { loadChannels(); return [...state.channels.values()].map(publicChannel); }
export function getChannel(id) { loadChannels(); return state.channels.get(String(id)); }
export function getChannelMapping(id, key) { const channel = getChannel(id); return channel?.mappings?.[String(key)] || null; }
export function setChannelMapping(id, key, value) { const channel = getChannel(id); if (!channel) return; channel.mappings ||= {}; channel.mappings[String(key)] = value; persist(); }
export function clearChannelMapping(id, key) { const channel = getChannel(id); if (!channel?.mappings) return; delete channel.mappings[String(key)]; persist(); }
export function channelEvents() { return state.events.slice(); }
export function upsertChannel(input = {}) {
  loadChannels();
  const current = input.id ? state.channels.get(String(input.id)) : undefined;
  if (input.id && !current) throw new Error('渠道不存在');
  const item = normalizeConfig(input, current);
  state.channels.set(item.id, item); persist();
  emit('channel_updated', { channelId: item.id, channel: publicChannel(item) });
  return publicChannel(item);
}
export async function removeChannel(id) {
  loadChannels(); const item = state.channels.get(String(id));
  if (!item) return false;
  await disconnectChannel(item.id); state.channels.delete(item.id); persist();
  emit('channel_updated', { channelId: item.id, removed: true }); return true;
}
function allowed(channel, message) {
  const sender = String(message.senderId || ''); const chat = String(message.chatId || '');
  if (channel.allowUsers.length && !channel.allowUsers.includes(sender)) return false;
  if (channel.allowChats.length && !channel.allowChats.includes(chat)) return false;
  if (message.isGroup && channel.requireMention && !message.mentionedBot) return false;
  return true;
}
function command(text) {
  const m = /^\s*\/(new|stop|allow|deny)(?:\s+([\w-]+))?\s*$/i.exec(String(text || ''));
  return m ? { name: m[1].toLowerCase(), id: m[2] || '' } : null;
}
export async function handleIncoming(id, raw = {}) {
  loadChannels(); const channel = state.channels.get(String(id));
  if (!channel || !channel.enabled) return { accepted: false, reason: 'disabled' };
  const message = { ...raw, id: String(raw.id || raw.messageId || crypto.randomUUID()), text: String(raw.text || '').trim(), senderId: String(raw.senderId || ''), chatId: String(raw.chatId || raw.conversationId || ''), isGroup: !!raw.isGroup, mentionedBot: !!raw.mentionedBot, replyTarget: raw.replyTarget || raw };
  if (channel.dedupe.includes(message.id)) return { accepted: false, reason: 'duplicate' };
  channel.dedupe.push(message.id); if (channel.dedupe.length > MAX_DEDUPE) channel.dedupe.splice(0, channel.dedupe.length - MAX_DEDUPE);
  persist();
  if (!allowed(channel, message)) { addEvent(channel, 'message_rejected', { messageId: message.id, senderId: message.senderId, chatId: message.chatId }); return { accepted: false, reason: 'not_allowed' }; }
  const cmd = command(message.text);
  if (cmd) {
    const binding = state.running.get(`${channel.id}:${message.chatId}:${message.senderId}`);
    if (cmd.name === 'allow' || cmd.name === 'deny') {
      const ok = resolveRequest(cmd.id, cmd.name === 'allow' ? 'allow' : 'deny', binding?.sessionId);
      await send(channel.id, message.replyTarget, ok ? `已${cmd.name === 'allow' ? '允许' : '拒绝'}本次操作` : '权限请求不存在或已处理');
      return { accepted: true, command: cmd.name, resolved: ok };
    }
    if (cmd.name === 'stop' && binding?.sessionId && state.runner?.stop) { await state.runner.stop(binding.sessionId); await send(channel.id, message.replyTarget, '已请求停止当前任务'); return { accepted: true, command: 'stop' }; }
    if (cmd.name === 'new') { await send(channel.id, message.replyTarget, '下一条消息将创建新的 Agent 会话'); clearChannelMapping(channel.id, keyFor(channel, message)); return { accepted: true, command: 'new' }; }
  }
  if (!state.runner?.run) { await send(channel.id, message.replyTarget, 'Agent 渠道运行时尚未就绪'); return { accepted: false, reason: 'runner_unavailable' }; }
  const key = keyFor(channel, message);
  let result;
  try {
    result = await state.runner.run({ channel, message, mappingKey: key, onSession: (sessionId) => state.running.set(key, { sessionId, channelId: channel.id, replyTarget: message.replyTarget }) });
    if (result?.sessionId) setChannelMapping(channel.id, key, { sessionId: result.sessionId, workspaceId: result.workspaceId || channel.workspaceId || '', updatedAt: Date.now() });
  } finally { state.running.delete(key); }
  addEvent(channel, 'message_accepted', { messageId: message.id, sessionId: result?.sessionId, chatId: message.chatId });
  return { accepted: true, ...result };
}
function keyFor(channel, message) { return `${channel.id}:${message.chatId}:${message.senderId}`; }
export async function connectChannel(id) {
  loadChannels(); const channel = state.channels.get(String(id)); if (!channel) throw new Error('渠道不存在');
  const adapter = adapters.get(channel.type); if (!adapter) throw new Error(`未安装 ${channel.type} 渠道适配器`);
  await disconnectChannel(id);
  channel.status = 'connecting'; channel.lastError = ''; persist(); emit('channel_updated', { channelId: id, channel: publicChannel(channel) });
  try {
    channel.adapterState = await adapter.connect({ ...channel }, { onMessage: (message) => handleIncoming(id, message), log: (...args) => console.log(`[channel:${id}]`, ...args) });
    channel.status = 'connected'; channel.connectedAt = Date.now(); persist(); emit('channel_updated', { channelId: id, channel: publicChannel(channel) });
    addEvent(channel, 'connected'); return publicChannel(channel);
  } catch (error) {
    channel.status = 'error'; channel.lastError = String(error?.message || error).slice(0, 500); persist(); emit('channel_updated', { channelId: id, channel: publicChannel(channel) }); addEvent(channel, 'error', { message: channel.lastError }); throw new Error('渠道连接失败，请检查配置和平台应用状态');
  }
}
export async function disconnectChannel(id) {
  loadChannels(); const channel = state.channels.get(String(id)); if (!channel) return false;
  const adapter = adapters.get(channel.type);
  try { if (channel.adapterState) await adapter?.disconnect?.(channel.adapterState); } catch (error) { console.error(`[channel:${id}] disconnect failed`, error.message); }
  channel.adapterState = undefined; channel.status = 'disconnected'; channel.connectedAt = null; persist(); emit('channel_updated', { channelId: id, channel: publicChannel(channel) }); return true;
}
export async function send(id, target, text) {
  const channel = getChannel(id); const adapter = channel && adapters.get(channel.type);
  if (!channel || !adapter?.send || !channel.adapterState) return false;
  try { await adapter.send(channel.adapterState, target, String(text || '').slice(0, 6000)); return true; } catch (error) { addEvent(channel, 'send_error', { message: String(error.message || error).slice(0, 300) }); return false; }
}
export async function disconnectAll() { for (const channel of state.channels.values()) await disconnectChannel(channel.id); state.permissionUnsub?.(); state.permissionUnsub = null; }
export async function initializeChannels() { loadChannels(); for (const channel of state.channels.values()) if (channel.enabled && channel.status !== 'connected') connectChannel(channel.id).catch(() => {}); return listChannels(); }
export async function reloadChannelAdapters() { await disconnectAll(); }
