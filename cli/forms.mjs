export async function configureModel(client, form) {
  const protocol = await form.choose('模型协议', [
    { label: 'OpenAI Chat Completions', value: 'openai-chat' },
    { label: 'OpenAI Responses', value: 'openai-responses' },
    { label: 'Anthropic Messages', value: 'anthropic' },
  ]);
  if (!protocol) return false;
  const baseUrl = await form.ask('API 地址', { initial: protocol === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1' });
  if (!baseUrl) return false;
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('API 地址必须是 HTTP/HTTPS 地址');
  const model = await form.ask('模型 ID');
  if (!model?.trim()) return false;
  const keyMode = await form.choose('凭据来源', [
    { label: '环境变量 MLI_API_KEY', value: 'env' },
    { label: '输入 API Key', value: 'key' },
    { label: '无需 API Key', value: 'none' },
  ]);
  if (!keyMode) return false;
  const apiKey = keyMode === 'key' ? await form.ask('API Key', { secret: true }) : '';
  if (apiKey === null) return false;
  const result = await client.request('/api/settings', { action: 'save_provider', provider: { name: url.hostname, protocol, baseUrl, apiKey, apiKeyEnv: keyMode === 'env' ? 'MLI_API_KEY' : '' } });
  await client.request('/api/settings', { action: 'save_model', model: { providerId: result.provider.id, name: model, model, contextWindow: 128000 } });
  return true;
}

export async function login(client, form) {
  const email = await form.ask('账户邮箱');
  if (!email) return false;
  const password = await form.ask('密码', { secret: true });
  if (!password) return false;
  await client.request('/api/account/login', { email, password });
  return true;
}

export async function terminalForm(signal) {
  const { default: kit } = await import('terminal-kit');
  const term = kit.terminal;
  let active;
  const onAbort = () => { active?.stop?.(); };
  const onKey = key => { if (key === 'CTRL_C') { onAbort(); process.emit('SIGINT'); } };
  term.on('key', onKey);
  signal?.addEventListener('abort', onAbort, { once: true });
  return {
    ask(label, { initial = '', secret = false } = {}) {
      if (signal?.aborted) return Promise.resolve(null);
      term('%s: ', label);
      return new Promise((resolve, reject) => { active = term.inputField({ default: initial, echoChar: secret ? '*' : undefined, cancelable: true }, (error, value) => { active = null; term('\n'); error ? reject(error) : resolve(value ?? null); }); });
    },
    choose(label, choices) {
      if (signal?.aborted || !choices.length) return Promise.resolve(null);
      term('%s\n', label);
      return new Promise((resolve, reject) => { active = term.singleColumnMenu(choices.map(choice => choice.label), { cancelable: true, oneLineItem: true }, (error, result) => {
        active = null;
        term('\n');
        error ? reject(error) : resolve(!result || result.canceled ? null : choices[result.selectedIndex]?.value);
      }); });
    },
    close() { signal?.removeEventListener('abort', onAbort); term.off('key', onKey); term.grabInput(false); },
  };
}
