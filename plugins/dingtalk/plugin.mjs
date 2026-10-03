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

export default async function setup(ctx) {
  ctx.registerChannelAdapter({
    type: 'dingtalk', name: '钉钉',
    async connect(channel, runtime) {
      const { clientId, clientSecret } = channel.credentials || {};
      if (!clientId || !clientSecret) throw new Error('钉钉需要 Client ID 和 Client Secret');
      const sdk = await import('dingtalk-stream');
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
          mentionedBot: Array.isArray(message.atUsers) ? message.atUsers.some((item) => item.dingtalkId === message.chatbotUserId || item.staffId === senderId) : !!message.isInAtList,
          text, attachments, replyTarget: { sessionWebhook: message.sessionWebhook, messageId: message.msgId },
        }));
        if (downstream.headers?.messageId) client.socketCallBackResponse(downstream.headers.messageId, { status: 'SUCCESS' });
        Promise.resolve(promise).catch((error) => runtime.log('message_error', String(error?.message || error).slice(0, 300)));
      });
      await client.connect();
      return { client };
    },
    async disconnect(state) { state?.client?.disconnect?.(); },
    async send(state, target, text) {
      const endpoint = String(target?.sessionWebhook || '');
      let parsed;
      try { parsed = new URL(endpoint); } catch { return; }
      if (parsed.protocol !== 'https:' || !WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error('钉钉回复地址无效');
      const response = await fetch(parsed, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msgtype: 'text', text: { content: String(text).slice(0, 6000) } }) });
      if (!response.ok) throw new Error(`钉钉回复失败（HTTP ${response.status}）`);
    },
  });
}
