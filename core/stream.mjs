// core/stream.mjs —— 统一 StreamEvent 模型 + OpenAI 兼容 SSE 解析器 + mock provider
// StreamEvent 联合类型（整个系统的第一块基石，模型适配/循环/SSE/前端全挂在它上面）：
//   { type: 'text_delta',     text }
//   { type: 'thinking_delta', text }
//   { type: 'tool_start',     index, id, name }
//   { type: 'tool_delta',     index, argsChunk }
//   { type: 'tool_end',       index }
//   { type: 'done' }
//   { type: 'error',          message }

/** 把 fetch Response（OpenAI 兼容 /chat/completions stream）解析为 StreamEvent 流 */
export async function* parseOpenAIStream(res) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    yield { type: 'error', message: `LLM API ${res.status}: ${body.slice(0, 500)}` };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let metadataSent = false;
  let responseFinished = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line.startsWith(': mli-billing ')) {
        try { yield { type: 'billing', ...JSON.parse(line.slice(14)) }; } catch { /* 无效的计费注释 */ }
        continue;
      }
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') { yield { type: 'done' }; return; }
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      if (json.error) { yield { type: 'error', message: json.error.message || String(json.error) }; return; }
      if (!metadataSent && (json.id || json.model || json.system_fingerprint)) {
        yield { type: 'metadata', metadata: { id: json.id, model: json.model, systemFingerprint: json.system_fingerprint } };
        metadataSent = true;
      }
      if (json.usage) yield { type: 'usage', usage: json.usage };
      const choice = json.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (delta.reasoning_content) yield { type: 'thinking_delta', text: delta.reasoning_content };
      if (delta.reasoning) yield { type: 'thinking_delta', text: delta.reasoning };
      if (delta.content) yield { type: 'text_delta', text: delta.content };
      for (const tc of delta.tool_calls ?? []) {
        const index = tc.index ?? 0;
        if (tc.id || tc.function?.name) {
          yield { type: 'tool_start', index, id: tc.id ?? '', name: tc.function?.name ?? '' };
        }
        if (tc.function?.arguments) yield { type: 'tool_delta', index, argsChunk: tc.function.arguments };
        if (tc.id && tc.function?.arguments !== undefined) yield { type: 'tool_end', index };
      }
      if (choice.finish_reason) { responseFinished = true; yield { type: 'done', reason: choice.finish_reason }; }
    }
  }
  yield { type: 'done', reason: responseFinished ? undefined : 'incomplete' };
}

async function* parseSse(res, mapEvent) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    yield { type: 'error', message: `LLM API ${res.status}: ${body.slice(0, 500)}` };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let split;
    while ((split = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, split);
      buf = buf.slice(split + 2);
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (!data || data === '[DONE]') continue;
      let json;
      try { json = JSON.parse(data); } catch { continue; }
      for (const event of mapEvent(json)) yield event;
    }
  }
}

/** OpenAI Responses typed SSE -> unified StreamEvent. */
export async function* parseResponsesStream(res) {
  const started = new Set();
  const argsSeen = new Set();
  let responseFinished = false;
  yield* parseSse(res, (event) => {
    const out = [];
    const index = event.output_index ?? 0;
    if (event.type === 'response.output_text.delta' && event.delta) out.push({ type: 'text_delta', text: event.delta });
    if (event.type === 'response.reasoning_summary_text.delta' && event.delta) out.push({ type: 'thinking_delta', text: event.delta });
    if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
      started.add(index);
      out.push({ type: 'tool_start', index, id: event.item.call_id || event.item.id || '', name: event.item.name || '' });
    }
    if (event.type === 'response.function_call_arguments.delta') {
      if (!started.has(index)) {
        started.add(index);
        out.push({ type: 'tool_start', index, id: event.item_id || '', name: event.name || '' });
      }
      if (event.delta) { argsSeen.add(index); out.push({ type: 'tool_delta', index, argsChunk: event.delta }); }
    }
    if (event.type === 'response.function_call_arguments.done') {
      if (!argsSeen.has(index) && event.arguments) out.push({ type: 'tool_delta', index, argsChunk: event.arguments });
      out.push({ type: 'tool_end', index });
    }
    if (event.type === 'response.completed' || event.type === 'response.incomplete') {
      responseFinished = true;
      out.push({ type: 'metadata', metadata: { id: event.response?.id, model: event.response?.model, status: event.response?.status } });
      if (event.response?.usage) out.push({ type: 'usage', usage: event.response.usage });
      out.push({ type: 'done', reason: event.type === 'response.incomplete' || event.response?.status === 'incomplete' ? 'incomplete' : 'stop' });
    }
    if (event.type === 'error') out.push({ type: 'error', message: event.message || event.error?.message || 'Responses API 返回错误' });
    return out;
  });
  if (!responseFinished) yield { type: 'done', reason: 'incomplete' };
}

/** Anthropic Messages SSE -> unified StreamEvent. */
export async function* parseAnthropicStream(res) {
  let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0;
  let stopReason;
  let responseFinished = false;
  yield* parseSse(res, (event) => {
    const out = [];
    const index = event.index ?? 0;
    if (event.type === 'message_start') {
      out.push({ type: 'metadata', metadata: { id: event.message?.id, model: event.message?.model } });
      inputTokens = Number(event.message?.usage?.input_tokens || 0);
      cacheCreationTokens = Number(event.message?.usage?.cache_creation_input_tokens || 0);
      cacheReadTokens = Number(event.message?.usage?.cache_read_input_tokens || 0);
    }
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      out.push({ type: 'tool_start', index, id: event.content_block.id || '', name: event.content_block.name || '' });
    }
    if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta') out.push({ type: 'text_delta', text: event.delta.text || '' });
      if (event.delta?.type === 'thinking_delta') out.push({ type: 'thinking_delta', text: event.delta.thinking || '' });
      if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) out.push({ type: 'tool_delta', index, argsChunk: event.delta.partial_json });
    }
    if (event.type === 'content_block_stop') out.push({ type: 'tool_end', index });
    if (event.type === 'message_delta') { outputTokens = Number(event.usage?.output_tokens || outputTokens); stopReason = event.delta?.stop_reason || stopReason; }
    if (event.type === 'message_stop') {
      responseFinished = true;
      out.push({ type: 'usage', usage: { input_tokens: inputTokens, output_tokens: outputTokens, cache_creation_input_tokens: cacheCreationTokens, cache_read_input_tokens: cacheReadTokens } });
      out.push({ type: 'done', reason: stopReason });
    }
    if (event.type === 'error') out.push({ type: 'error', message: event.error?.message || 'Anthropic API 返回错误' });
    return out;
  });
  if (!responseFinished) yield { type: 'done', reason: 'incomplete' };
}

/** 增量拼装 tool_calls：StreamEvent[] → [{ id, name, args(对象) }] */
export function assembleToolCalls(events) {
  const map = new Map();
  for (const e of events) {
    if (e.type === 'tool_start') {
      map.set(e.index, { id: e.id || `call_${e.index}`, name: e.name, argsBuf: '' });
    } else if (e.type === 'tool_delta') {
      const cur = map.get(e.index) ?? map.get(Math.min(...map.keys())) ?? { id: `call_${e.index}`, name: '', argsBuf: '' };
      cur.argsBuf += e.argsChunk;
      map.set(e.index, cur);
    }
  }
  return [...map.values()].map((t) => {
    let args = {};
    try { args = t.argsBuf ? JSON.parse(t.argsBuf) : {}; if (!args || typeof args !== 'object' || Array.isArray(args)) args = { _raw: t.argsBuf }; } catch { args = { _raw: t.argsBuf }; }
    return { id: t.id, name: t.name, args };
  });
}

function chunk(str, n) {
  const out = [];
  for (let i = 0; i < str.length; i += n) out.push(str.slice(i, i + n));
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock provider：零 API Key 跑通全链路（演示/测试用）。
 * 行为脚本：
 *   - 文本包含 截图/screenshot → 调 screenshot 工具（若已加载）
 *   - 文本包含 写/创建/hello.txt → 调 write_file 写 hello.txt（触发 L1 权限弹窗）
 *   - 上一轮有工具结果 → 总结工具结果并结束
 *   - 其余 → 流式输出自我介绍
 */
export async function* mockStream(messages, tools) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = typeof lastUser?.content === 'string'
    ? lastUser.content
    : (lastUser?.content ?? []).filter((p) => p.type === 'text').map((p) => p.text).join(' ');
  const hasTool = (name) => tools.some((t) => t.function?.name === name || t.name === name);
  const hasToolResult = messages.some((m) => m.role === 'tool');
  const lastIsToolResult = messages[messages.length - 1]?.role === 'tool';

  async function* emitText(s) {
    for (const c of chunk(s, 6)) { yield { type: 'text_delta', text: c }; await sleep(8); }
  }

  if (text.startsWith('[协作消息：')) { yield* emitText('已收到子任务结果。请以子任务记录中的证据和验证为准；mock 演示不代表真实代码分析。'); yield { type: 'done' }; return; }
  if (text.startsWith('[主任务协作汇总]')) { yield* emitText('正在等待子任务并汇总结果；mock 模式仅演示协作流程。'); yield { type: 'done' }; return; }
  if (/子\s*agent|subagent|并行.*探索/i.test(text) && hasTool('agent_spawn') && !hasToolResult) {
    yield { type: 'tool_start', index: 0, id: 'mock_spawn', name: 'agent_spawn' };
    yield { type: 'tool_delta', index: 0, argsChunk: JSON.stringify({ tasks: [{ profile: 'explorer', title: '代码结构', instruction: '只读分析代码结构，返回文件证据。' }, { profile: 'reviewer', title: '验证检查', instruction: '只读检查验证入口，返回证据。' }], idempotencyKey: 'mock-demo' }) };
    yield { type: 'done' }; return;
  }
  if (/截图|screenshot|屏幕/.test(text) && hasTool('screenshot')) {
    yield { type: 'text_delta', text: '好的，我先截取当前屏幕。\n\n' };
    yield { type: 'tool_start', index: 0, id: 'mock_call_1', name: 'screenshot' };
    yield { type: 'tool_delta', index: 0, argsChunk: '{}' };
    yield { type: 'tool_end', index: 0 };
    yield { type: 'done' };
    return;
  }
  if (lastIsToolResult && hasToolResult) {
    const tr = messages[messages.length - 1];
    const summary = typeof tr.content === 'string'
      ? tr.content
      : (tr.content ?? []).filter((p) => p.type === 'text').map((p) => p.text).join(' ');
    yield* emitText(`工具已执行完成。结果：${String(summary).slice(0, 300)}`);
    yield { type: 'done' };
    return;
  }
  if (/写|创建|hello\.txt/.test(text) && hasTool('write_file')) {
    yield { type: 'text_delta', text: '好的，我来创建文件。\n\n' };
    const args = JSON.stringify({ path: 'hello.txt', content: `这是由 agent 创建的文件。\n请求内容：${text}\n时间：${new Date().toISOString()}\n` });
    yield { type: 'tool_start', index: 0, id: 'mock_call_1', name: 'write_file' };
    for (const c of chunk(args, 24)) { yield { type: 'tool_delta', index: 0, argsChunk: c }; await sleep(6); }
    yield { type: 'tool_end', index: 0 };
    yield { type: 'done' };
    return;
  }
  yield* emitText(
    '你好！当前处于 **mock 模式**（未接入真实模型），用于零 Key 跑通全链路。\n\n' +
    '试试：\n- 说「写一个 hello.txt」→ 触发 write_file 与 L1 权限弹窗\n' +
    '- 说「截图」→ 触发 desktop 插件的 screenshot（L3，需在侧边栏开启桌面会话）\n\n' +
    '接入真实模型：编辑 config.json 的 provider 段即可。'
  );
  yield { type: 'done' };
}
