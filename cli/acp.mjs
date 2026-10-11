import fs from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { agent, ndJsonStream, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk';
import { APP_VERSION } from '../core/version.mjs';

export class AcpAgent {
  constructor(runtime) {
    this.runtime = runtime;
    this.sessions = new Map();
    this.workspace = null;
    this.initialized = false;
    this.creating = false;
    this.closed = false;
  }

  initialize() {
    this.initialized = true;
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentInfo: { name: 'mli-agent', version: APP_VERSION },
      agentCapabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false } },
      authMethods: [],
    };
  }

  async newSession({ cwd, mcpServers = [] }) {
    if (!this.initialized || this.closed) throw RequestError.invalidRequest('ACP connection is not initialized or is closed');
    if (this.creating) throw RequestError.invalidRequest('Session creation already in progress');
    if (!path.isAbsolute(cwd) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw RequestError.invalidParams('cwd must be an existing absolute directory');
    if (mcpServers.length) throw RequestError.invalidParams('Client-provided MCP servers are not supported; configure MCP in the MLI runtime');
    const root = fs.realpathSync(cwd);
    if (this.workspace && root !== this.workspace) throw RequestError.invalidParams('One ACP connection supports one workspace; start another process for another project');
    this.creating = true;
    try {
      await this.runtime.useWorkspace(root);
      this.workspace = root;
      const session = await this.runtime.request('/api/session', { title: 'ACP 会话', mode: 'default' });
      this.sessions.set(session.id, { running: null });
      return { sessionId: session.id };
    } finally { this.creating = false; }
  }

  session(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || this.closed) throw RequestError.invalidParams('Unknown session for this ACP connection');
    return session;
  }

  async prompt({ sessionId, prompt }, client) {
    const session = this.session(sessionId);
    if (session.running) throw RequestError.invalidRequest('Session is already running');
    if (!prompt.length || prompt.some(content => content.type !== 'text')) throw RequestError.invalidParams('Only text prompts are supported');
    const text = prompt.map(content => content.text).join('\n\n').trim();
    if (!text) throw RequestError.invalidParams('Prompt must not be empty');
    const state = { abort: new AbortController(), cancelled: false, submitted: false, calls: new Map(), pendingPermissions: new Set() };
    session.running = state;
    let finish, fail, connected, connectionFailed;
    const result = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    result.catch(() => {});
    const ready = new Promise((resolve, reject) => { connected = resolve; connectionFailed = reject; });
    state.fail = error => { connectionFailed(error); fail(error); };
    let updates = Promise.resolve();
    const notify = update => {
      updates = updates.then(() => client.notify('session/update', { sessionId, update }));
      updates.catch(fail);
      return updates;
    };
    const stream = this.runtime.events(event => {
      if (event.sessionId !== sessionId && event.rootSessionId !== sessionId) return;
      if (!state.submitted) return;
      if (event.type === 'app_login_required') {
        this.cancel({ sessionId }).catch(fail);
        fail(new Error('This task requires app login in the MLI workbench'));
        return;
      }
      if (event.type === 'permission_request') {
        this.permission(sessionId, state, event, client).catch(fail);
        return;
      }
      if (event.type === 'ui_request') {
        this.runtime.request(`/api/session/${event.sessionId}/ui/${event.request.reqId}`, { value: null }).catch(fail);
        this.cancel({ sessionId }).catch(fail);
        fail(new Error('This task requires an interactive MLI UI; resume it in the workbench'));
        return;
      }
      if (event.type === 'tool_call') state.calls.set(event.sessionId, event.call);
      if (event.isSubagent) return;
      if (event.type === 'text_delta') notify({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: event.text } });
      else if (event.type === 'thinking_delta') notify({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: event.text } });
      else if (event.type === 'tool_call') {
        state.calls.set(event.sessionId, event.call);
        notify({ sessionUpdate: 'tool_call', ...toolCall(event.call, this.workspace) });
      } else if (event.type === 'tool_result') {
        notify({ sessionUpdate: 'tool_call_update', toolCallId: event.callId, status: event.status === 'ok' || event.status === 'success' ? 'completed' : 'failed', content: [{ type: 'content', content: { type: 'text', text: String(event.content ?? '') } }], rawOutput: event.content });
      } else if (event.type === 'turn_end') {
        if (event.reason === 'done') finish({ stopReason: state.cancelled ? 'cancelled' : 'end_turn' });
        else if (event.reason === 'aborted' || state.cancelled) finish({ stopReason: 'cancelled' });
        else fail(new Error(event.error || `MLI task stopped: ${event.reason}`));
      } else if (event.type === 'error') fail(new Error(event.message));
    }, {
      signal: state.abort.signal,
      onConnected: connected,
      onDisconnected: state.fail,
    });
    try {
      await ready;
      if (state.cancelled) return { stopReason: 'cancelled' };
      state.submitted = true;
      await this.runtime.request(`/api/session/${sessionId}/message`, { text });
      if (state.cancelled) await this.runtime.request(`/api/session/${sessionId}/abort`, {}, { scoped: false });
      const response = await result;
      await updates;
      return response;
    } finally {
      state.abort.abort();
      if (state.submitted) await this.runtime.request(`/api/session/${sessionId}/abort`, {}, { scoped: false }).catch(() => {});
      await stream;
      session.running = null;
    }
  }

  async permission(sessionId, state, event, client) {
    const request = event.request;
    if (state.pendingPermissions.has(request.reqId)) return;
    state.pendingPermissions.add(request.reqId);
    let decision = 'deny';
    try {
      const call = state.calls.get(event.sessionId) || { id: request.reqId, name: request.tool, args: {} };
      const response = await client.request('session/request_permission', {
        sessionId,
        toolCall: { ...toolCall(call, this.workspace), title: `${request.tool}: ${request.summary}`, status: 'pending' },
        options: [{ optionId: 'allow', name: '允许一次', kind: 'allow_once' }, { optionId: 'deny', name: '拒绝', kind: 'reject_once' }],
      }, { cancellationSignal: state.abort.signal });
      if (!state.cancelled && response.outcome?.outcome === 'selected' && response.outcome.optionId === 'allow') decision = 'allow';
    } catch { decision = 'deny'; }
    await this.runtime.request(`/api/session/${event.sessionId}/permission/${request.reqId}`, { decision }).catch(error => { if (error.status !== 404) throw error; });
  }

  async cancel({ sessionId }) {
    const state = this.session(sessionId).running;
    if (!state) return;
    state.cancelled = true;
    if (state.submitted) await this.runtime.request(`/api/session/${sessionId}/abort`, {}, { scoped: false });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.sessions].map(async ([sessionId, session]) => {
      if (!session.running) return;
      session.running.cancelled = true;
      session.running.fail(new Error('ACP client disconnected'));
      session.running.abort.abort();
      if (session.running.submitted) await this.runtime.request(`/api/session/${sessionId}/abort`, {}, { scoped: false }).catch(() => {});
    }));
  }
}

function toolCall(call, cwd) {
  const kind = call.name === 'bash' ? 'execute' : /write|edit/.test(call.name) ? 'edit' : /read/.test(call.name) ? 'read' : /search|grep|glob/.test(call.name) ? 'search' : 'other';
  return { toolCallId: call.id, title: call.name, kind, status: 'pending', rawInput: call.args, ...(typeof call.args?.path === 'string' ? { locations: [{ path: path.resolve(cwd, call.args.path) }] } : {}) };
}

export async function runAcp(runtime, { signal, stdin = process.stdin, stdout = process.stdout } = {}) {
  const adapter = new AcpAgent(runtime);
  const connection = agent({ name: 'mli-agent' })
    .onRequest('initialize', context => adapter.initialize(context.params))
    .onRequest('session/new', context => adapter.newSession(context.params))
    .onRequest('session/prompt', context => adapter.prompt(context.params, context.client))
    .onNotification('session/cancel', context => adapter.cancel(context.params))
    .connect(ndJsonStream(Writable.toWeb(stdout), Readable.toWeb(stdin)));
  const stop = () => connection.close();
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  try { await connection.closed; }
  finally {
    signal?.removeEventListener('abort', stop);
    await adapter.close();
  }
}
