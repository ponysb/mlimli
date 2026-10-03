export default async function setup(ctx) {
  ctx.registerChannelAdapter({
    type: 'feishu', name: '飞书',
    async connect(channel, runtime) {
      const { appId, appSecret } = channel.credentials || {};
      if (!appId || !appSecret) throw new Error('飞书需要 App ID 和 App Secret');
      const lark = await import('@larksuiteoapi/node-sdk');
      const bot = lark.createLarkChannel({
        appId, appSecret, transport: 'websocket', includeRawEvent: true,
        policy: { dmMode: 'open', requireMention: false },
        safety: { dedup: { maxEntries: 100, ttl: 10 * 60 * 1000 } },
      });
      const unsubscribe = bot.on('message', (message) => {
        const target = { chatId: message.chatId, messageId: message.messageId };
        const work = Promise.all((message.resources || []).slice(0, 6).map(async (resource) => {
          try {
            const buffer = await bot.downloadResource(resource.fileKey, resource.type === 'image' ? 'image' : 'file');
            return { name: resource.fileName || `${resource.type}-${resource.fileKey}`, mime: resource.type === 'image' ? 'image/png' : 'application/octet-stream', data: buffer.toString('base64') };
          } catch (error) { runtime.log('attachment_error', String(error?.message || error).slice(0, 200)); return null; }
        })).then((attachments) => runtime.onMessage({
          id: message.messageId, senderId: message.senderId, chatId: message.chatId,
          isGroup: message.chatType === 'group', mentionedBot: message.mentionedBot,
          text: message.content, replyTarget: target, attachments: attachments.filter(Boolean),
        }));
        work.catch((error) => runtime.log('message_error', String(error?.message || error).slice(0, 300)));
      });
      bot.on('error', (error) => runtime.log('error', String(error?.message || error).slice(0, 300)));
      await bot.connect();
      return { bot, unsubscribe };
    },
    async disconnect(state) { state?.unsubscribe?.(); await state?.bot?.disconnect?.(); },
    async send(state, target, text) {
      if (!state?.bot || !target?.chatId) return;
      await state.bot.send(target.chatId, { text }, target.messageId ? { replyTo: target.messageId } : undefined);
    },
  });
}
