import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-channel-'));
process.env.MLI_AGENT_CHANNEL_DATA = temp;
const channels = await import('../core/channels.mjs');
const { emit } = await import('../core/events.mjs');

test('渠道配置、去重和白名单在 Agent 运行前生效', async () => {
  let runs = 0;
  channels.setChannelRunner({ run: async ({ onSession }) => { runs++; onSession(`s-${runs}`); return { sessionId: `s-${runs}`, workspaceId: 'w1' }; } });
  const item = channels.upsertChannel({ type: 'feishu', name: '测试飞书', enabled: true, credentials: { appId: 'app', appSecret: 'secret' }, allowUsers: ['u1'] });
  assert.equal(item.credentials.appSecret.length > 0, true);
  const denied = await channels.handleIncoming(item.id, { id: 'm-denied', senderId: 'u2', chatId: 'c1', text: 'hi' });
  assert.equal(denied.reason, 'not_allowed'); assert.equal(runs, 0);
  const accepted = await channels.handleIncoming(item.id, { id: 'm1', senderId: 'u1', chatId: 'c1', text: 'hi' });
  assert.equal(accepted.accepted, true); assert.equal(runs, 1);
  const duplicate = await channels.handleIncoming(item.id, { id: 'm1', senderId: 'u1', chatId: 'c1', text: 'hi' });
  assert.equal(duplicate.reason, 'duplicate'); assert.equal(runs, 1);
});

test('渠道适配器连接和断开不暴露凭据', async () => {
  let connected = 0; let disconnected = 0; const sent = [];
  channels.registerChannelAdapter({ type: 'feishu', name: '测试适配器', async connect() { connected++; return {}; }, async disconnect() { disconnected++; }, async send(_state, _target, text) { sent.push(text); } });
  const item = channels.listChannels().find((value) => value.type === 'feishu');
  await channels.connectChannel(item.id); assert.equal(connected, 1);
  assert.equal(channels.listChannels().find((value) => value.id === item.id).credentials.appSecret, 'sec****et');
  await channels.disconnectChannel(item.id); assert.equal(disconnected, 1);
});

test('权限请求按会话绑定回传到原消息渠道', async () => {
  const item = channels.listChannels().find((value) => value.type === 'feishu');
  await channels.connectChannel(item.id);
  channels.setChannelRunner({ run: async ({ onSession }) => { onSession('permission-session'); emit('permission_request', { sessionId: 'permission-session', request: { reqId: 'req-1', summary: '写入文件' } }); return { sessionId: 'permission-session' }; } });
  await channels.handleIncoming(item.id, { id: 'permission-message', senderId: 'u1', chatId: 'c1', text: 'run', replyTarget: { chatId: 'c1' } });
  assert.ok(channels.channelEvents().some((event) => event.type === 'permission_requested'));
  await channels.disconnectChannel(item.id);
});
