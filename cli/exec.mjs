export async function executePrompt(client, options, { stdout = process.stdout, stderr = process.stderr, signal } = {}) {
  const prompt = options.positional.join(' ').trim();
  if (!prompt) throw new Error('mli exec requires a prompt');
  const session = typeof options.resume === 'string'
    ? await client.request(`/api/session/${options.resume}`)
    : await client.request('/api/session', { title: prompt.slice(0, 40) });
  if (session.running) throw new Error('Session is already running');
  // Never inherit a persistent auto-all mode without an explicit --auto flag.
  await client.request(`/api/session/${session.id}/mode`, { mode: options.auto ? 'auto-all' : 'default' });
  const streamAbort = new AbortController();
  let sent = false;
  let done;
  let failure;
  let blocked = false;
  const finished = new Promise(resolve => { done = resolve; });
  const onAbort = () => { client.request(`/api/session/${session.id}/abort`, {}).finally(() => done(130)); };
  signal?.addEventListener('abort', onAbort, { once: true });
  let connected, connectionFailed;
  const ready = new Promise((resolve, reject) => { connected = resolve; connectionFailed = reject; });
  const stream = client.events(event => {
    if (event.sessionId !== session.id) return;
    if (options.json) stdout.write(`${JSON.stringify(event)}\n`);
    else if (event.type === 'text_delta') stdout.write(event.text);
    else if (event.type === 'tool_call') stderr.write(`\n[${event.call.name}] ${JSON.stringify(event.call.args)}\n`);
    else if (event.type === 'tool_output') stderr.write(event.text);
    else if (event.type === 'error') stderr.write(`\n${event.message}\n`);
    if (event.type === 'permission_request' || event.type === 'ui_request') {
      blocked = true;
      stderr.write('\nNon-interactive task requires user input. Resume in mli TUI; use --auto only to authorize L1/L2 operations.\n');
      client.request(`/api/session/${session.id}/abort`, {}).then(() => done(2), () => done(2));
    }
    if (event.type === 'turn_end') done(blocked ? 2 : event.reason === 'done' ? 0 : event.reason === 'aborted' ? 130 : 1);
  }, {
    signal: streamAbort.signal,
    onConnected: connected,
    onDisconnected: error => { failure = error; connectionFailed(error); done(1); },
  });
  try {
    await ready;
    if (signal?.aborted) return 130;
    await client.request(`/api/session/${session.id}/message`, { text: prompt });
    sent = true;
    const code = await finished;
    if (failure) stderr.write(`\n${failure.message}\n`);
    if (!options.json) stdout.write('\n');
    return code;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (failure && sent) await client.request(`/api/session/${session.id}/abort`, {}).catch(() => {});
    streamAbort.abort();
    await stream;
  }
}
