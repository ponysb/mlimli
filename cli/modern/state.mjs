export function safeText(value) {
  return String(value ?? '').replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

export function contentText(value) {
  if (typeof value === 'string') return safeText(value);
  return Array.isArray(value) ? value.filter(part => part.type === 'text').map(part => safeText(part.text)).join('\n') : '';
}

export function modelLabel(info) {
  const model = info?.models?.find(item => item.id === (info.activeModelId || info.provider?.modelId));
  return safeText(model?.name || model?.model || info?.provider?.model || '未配置模型');
}

const stepKey = value => `step:${value.turnId || 'legacy'}:${value.step || 0}`;
export function emptySession(id = null) {
  return { id, title: '新会话', mode: 'default', expertId: '', parts: [], running: false, queue: [], permission: null, uiRequests: [], eventSeq: 0 };
}

export function hydrate(snapshot) {
  const state = { ...emptySession(snapshot.id), ...snapshot, parts: [] };
  const upsert = part => {
    const index = state.parts.findIndex(item => item.id === part.id);
    if (index < 0) state.parts.push(part);
    else state.parts[index] = { ...state.parts[index], ...part };
  };
  for (const entry of snapshot.entries || []) {
    if (entry.type === 'message' && entry.role === 'user') upsert({ id: `user:${entry.id}`, kind: 'user', text: contentText(entry.content), turnId: entry.turnId });
    if (entry.type === 'step_start') upsert({ id: stepKey(entry), kind: 'assistant', text: '', thinking: '', turnId: entry.turnId, step: entry.step, status: 'running' });
    if (entry.type === 'message' && entry.role === 'assistant') upsert({ id: entry.turnId ? stepKey(entry) : `assistant:${entry.id}`, kind: 'assistant', text: safeText(entry.text), turnId: entry.turnId, step: entry.step, status: 'ok' });
    if (entry.type === 'step_end') upsert({ id: stepKey(entry), kind: 'assistant', text: safeText(entry.text), thinking: safeText(entry.thinking), turnId: entry.turnId, step: entry.step, status: entry.status });
    if (entry.type === 'tool_start' || entry.type === 'tool_end') upsert({ ...entry, id: `tool:${entry.callId}`, kind: 'tool', text: safeText(entry.content), status: entry.type === 'tool_start' ? 'running' : entry.status });
    if (entry.type === 'turn_end') {
      for (const part of state.parts) if (part.turnId === entry.turnId && part.status === 'running') part.status = entry.reason;
      upsert({ id: `end:${entry.turnId}`, kind: 'end', text: entry.error || entry.reason, reason: entry.reason, durationMs: entry.durationMs });
    }
  }
  if (snapshot.activeStep) upsert({ ...snapshot.activeStep, text: safeText(snapshot.activeStep.text), thinking: safeText(snapshot.activeStep.thinking), id: stepKey(snapshot.activeStep), kind: 'assistant', status: 'running' });
  delete state.entries;
  return state;
}

export function reduceEvent(current, event) {
  if (!current.id || event.sessionId !== current.id || (event.seq && event.seq <= current.eventSeq)) return current;
  const next = { ...current, parts: current.parts.map(part => ({ ...part })), eventSeq: event.seq || current.eventSeq };
  const upsert = part => {
    const index = next.parts.findIndex(item => item.id === part.id);
    if (index < 0) next.parts.push(part);
    else next.parts[index] = { ...next.parts[index], ...part };
    return next.parts.find(item => item.id === part.id);
  };
  const assistant = () => next.parts.find(part => part.id === stepKey(event)) || upsert({ id: stepKey(event), kind: 'assistant', turnId: event.turnId, step: event.step, text: '', thinking: '', status: 'running' });
  if (event.type === 'user_message') {
    upsert({ id: `user:${event.entry?.id || event.turnId || event.ts}`, kind: 'user', text: safeText(event.text), turnId: event.turnId });
    next.running = true;
  }
  if (event.type === 'message_start') { assistant(); next.running = true; }
  if (event.type === 'text_delta') assistant().text += safeText(event.text);
  if (event.type === 'thinking_delta') assistant().thinking += safeText(event.text);
  if (event.type === 'tool_call') upsert({ id: `tool:${event.call.id}`, kind: 'tool', callId: event.call.id, name: event.call.name, args: event.call.args, turnId: event.turnId, status: 'running', text: '' });
  if (event.type === 'tool_result') upsert({ id: `tool:${event.callId}`, kind: 'tool', ...event, text: safeText(event.content) });
  if (event.type === 'tool_output') {
    const part = next.parts.findLast(item => item.kind === 'tool' && item.status === 'running' && item.name === event.name);
    if (part) part.text = (part.text + safeText(event.text)).slice(-12000);
  }
  if (event.type === 'turn_end') {
    next.running = false;
    for (const part of next.parts) if ((!event.turnId || part.turnId === event.turnId) && part.status === 'running') part.status = event.reason;
    upsert({ id: `end:${event.turnId || event.ts}`, kind: 'end', reason: event.reason, text: safeText(event.error || event.reason), durationMs: event.durationMs });
  }
  if (event.type === 'queue_updated') next.queue = event.queue || [];
  if (event.type === 'session_updated') Object.assign(next, Object.fromEntries(['title', 'mode', 'expertId'].filter(key => event[key] !== undefined).map(key => [key, event[key]])));
  if (event.type === 'permission_request') next.permission = event.request;
  if (event.type === 'permission_resolved' && next.permission?.reqId === event.reqId) next.permission = null;
  if (event.type === 'ui_request' && !next.uiRequests.some(item => item.reqId === event.request.reqId)) next.uiRequests = [...next.uiRequests, event.request];
  if (event.type === 'ui_resolved') next.uiRequests = next.uiRequests.filter(item => item.reqId !== event.reqId);
  if (event.type === 'context_update') next.context = event.context;
  return next;
}

export const COMMANDS = [
  { label: '新会话', value: '/new' }, { label: '历史会话', value: '/resume' },
  { label: '选择模型', value: '/model' }, { label: '配置模型', value: '/config' },
  { label: '权限模式', value: '/mode' }, { label: '选择专家', value: '/expert' },
  { label: 'Skills', value: '/skills' }, { label: '账户登录', value: '/login' },
  { label: '退出账户', value: '/logout' }, { label: '压缩上下文', value: '/compact' },
  { label: '停止任务', value: '/stop' }, { label: '退出', value: '/exit' },
];
