export class RuntimeClient {
  constructor(url) { this.url = url; this.workspace = null; }

  async request(resource, body, { signal, scoped = true } = {}) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const timeout = setTimeout(onAbort, 15000);
    try {
      const response = await fetch(`${this.url}${resource}`, {
        method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(scoped && this.workspace ? { 'x-mli-workspace': this.workspace } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(payload.error || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = payload.code;
        throw error;
      }
      return payload;
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); }
  }

  async useWorkspace(root) {
    const runtime = await this.request('/api/runtime', undefined, { scoped: false });
    if (runtime.workspace !== root) await this.request('/api/workspaces', { path: root }, { scoped: false });
    this.workspace = root;
  }

  async events(onEvent, { signal, onConnected, onDisconnected } = {}) {
    let delay = 250;
    while (!signal?.aborted) {
      try {
        const response = await fetch(`${this.url}/api/event`, { signal, headers: this.workspace ? { 'x-mli-workspace': this.workspace } : {} });
        if (!response.ok) throw new Error(`Event stream HTTP ${response.status}`);
        delay = 250;
        await onConnected?.();
        const decoder = new TextDecoder();
        let buffer = '';
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
            let end;
            while ((end = buffer.indexOf('\n\n')) !== -1) {
              const frame = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              if (data) onEvent(JSON.parse(data));
            }
            if (buffer.length > 8 * 1024 * 1024) throw new Error('Event frame exceeds 8 MiB');
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (!signal?.aborted) throw new Error('Event stream disconnected');
      } catch (error) {
        if (signal?.aborted) break;
        onDisconnected?.(error);
        await new Promise(resolve => {
          const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); };
          const timer = setTimeout(done, delay);
          signal?.addEventListener('abort', done, { once: true });
        });
        delay = Math.min(delay * 2, 5000);
      }
    }
  }
}
