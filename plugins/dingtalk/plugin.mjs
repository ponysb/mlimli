const WEBHOOK_HOSTS = new Set(['oapi.dingtalk.com', 'api.dingtalk.com']);
function officialUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && (url.hostname === 'dingtalk.com' || url.hostname.endsWith('.dingtalk.com')) ? url : null;
  } catch { return null; }
}
async function readAttachments(message) {
  const content = message.content && typeof message.content === 'object' ? message.content : {};
  const url = officialUrl(content.downloadUrl || content.photoURL || content.url);
  if (!url) return [];
  try {
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok) return [];
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 10 * 1024 * 1024) return [];
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return [];
    return [{ name: String(content.fileName || content.name || '钉钉附件').slice(0, 120), mime: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream', data: buffer.toString('base64') }];
  } catch { return []; }
}

export default async function setup(ctx, { loadSdk = () => import('dingtalk-stream') } = {}) {
  ctx.registerChannelAdapter({
    type: 'dingtalk', name: '钉钉',
    async connect(channel, runtime) {
      const { clientId, clientSecret } = channel.credentials || {};
      if (!clientId || !clientSecret) throw new Error('钉钉需要 Client ID 和 Client Secret');
      const sdk = await loadSdk();
      const client = new sdk.DWClient({ clientId, clientSecret, keepAlive: true, autoReconnect: true });
      client.registerCallbackListener(sdk.TOPIC_ROBOT, (downstream) => {
        let message;
        try { message = JSON.parse(downstream.data || '{}'); } catch { return; }
        const senderId = message.senderStaffId || message.senderId || '';
        const text = message.text?.content || (typeof message.content === 'string' ? message.content : message.content?.text) || '';
        const isGroup = String(message.conversationType || '') !== '1';
        const promise = readAttachments(message).then((attachments) => runtime.onMessage({
          id: message.msgId || downstream.headers?.messageId,
          senderId, chatId: message.conversationId || senderId, isGroup,
          mentionedBot: message.isInAtList === true || (Array.isArray(message.atUsers) && !!message.chatbotUserId && message.atUsers.some((item) => item.dingtalkId === message.chatbotUserId)),
          text, attachments, replyTarget: { sessionWebhook: message.sessionWebhook, messageId: message.msgId },
        }));
        if (downstream.headers?.messageId) client.socketCallBackResponse(downstream.headers.messageId, { status: 'SUCCESS' });
        Promise.resolve(promise).catch((error) => runtime.log('message_error', String(error?.message || error).slice(0, 300)));
      });
      await client.connect();
      if (!client.connected) { client.config.autoReconnect = false; client.disconnect(); throw new Error('钉钉连接未建立，请检查应用凭据及 Stream 模式'); }
      let connected = true;
      const monitor = setInterval(() => {
        if (connected === client.connected) return;
        connected = client.connected;
        runtime.onStatus?.(connected ? 'connected' : 'disconnected');
      }, 1000);
      monitor.unref?.();
      return { client, monitor };
    },
    async disconnect(state) { clearInterval(state?.monitor); if (state?.client) state.client.config.autoReconnect = false; state?.client?.disconnect?.(); },
    async send(state, target, text) {
      const endpoint = String(target?.sessionWebhook || '');
      let parsed;
      try { parsed = new URL(endpoint); } catch { throw new Error('钉钉回复缺少有效的会话 Webhook'); }
      if (parsed.protocol !== 'https:' || !WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error('钉钉回复地址无效');
      const response = await fetch(parsed, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msgtype: 'text', text: { content: String(text).slice(0, 6000) } }) });
      if (!response.ok) throw new Error(`钉钉回复失败（HTTP ${response.status}）`);
      const result = await response.json();
      if (result.errcode !== 0) throw new Error(`钉钉回复失败（${result.errcode ?? '无效响应'}）：${String(result.errmsg || '').slice(0, 200)}`);
    },
  });
}
