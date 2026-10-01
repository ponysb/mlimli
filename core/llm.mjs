import fs from 'node:fs';
import { parseOpenAIStream, parseResponsesStream, parseAnthropicStream, mockStream } from './stream.mjs';
import { PROTOCOLS, createId, defaultBaseUrl, keyHint, normalizeProtocol } from './providers.mjs';
import { appendApiLog, createApiLogId } from './api-logs.mjs';
import { accountServerUrl, accountToken, listManagedModels, refreshAccount, settleApiUsage } from './account.mjs';

const MANAGED_PROVIDER_ID = 'mli-managed';
let catalogRefreshedAt = 0;

let config = null;
export function setConfig(cfg) { config = cfg; ensureCatalog(); }
export function getConfig() { return config; }

function normalizeBaseUrl(value) { return String(value ?? '').trim().replace(/\/$/, ''); }
function legacyProtocol(p) { return p?.type === 'anthropic' ? 'anthropic' : 'openai-chat'; }
function ensureCatalog() {
  if (!config) return;
  if (!Array.isArray(config.providers) || !Array.isArray(config.models)) {
    const old = config.provider ?? {};
    const providerId = createId('provider');
    const modelId = createId('model');
    config.providers = [{
      id: providerId,
      name: old.name || hostname(old.baseUrl) || '默认服务商',
      protocol: legacyProtocol(old),
      baseUrl: normalizeBaseUrl(old.baseUrl) || defaultBaseUrl(legacyProtocol(old)),
      apiKey: old.apiKey || '',
      apiKeyEnv: old.apiKeyEnv || '',
    }];
    config.models = [{
      id: modelId,
      providerId,
      name: old.model || '默认模型',
      model: old.model || '',
      contextWindow: Number(old.contextWindow || 128000),
      pricing: normalizePricing(old.pricing),
    }];
    config.activeModelId = modelId;
  }
  config.providers = config.providers.map((p) => ({ ...p, protocol: normalizeProtocol(p.protocol), baseUrl: normalizeBaseUrl(p.baseUrl) }));
  const managed = config.providers.find((provider) => provider.id === MANAGED_PROVIDER_ID);
  if (managed) { managed.name = 'MLIAPI'; managed.protocol = 'openai-chat'; managed.baseUrl = `${accountServerUrl()}/v1`; config.providers = [managed, ...config.providers.filter((provider) => provider.id !== MANAGED_PROVIDER_ID)]; }
  else config.providers.unshift({ id: MANAGED_PROVIDER_ID, name: 'MLIAPI', protocol: 'openai-chat', baseUrl: `${accountServerUrl()}/v1`, managed: true });
  if (!config.models.some((m) => m.id === config.activeModelId)) config.activeModelId = config.models[0]?.id || null;
  syncLegacyProvider();
}
function hostname(url) { try { return new URL(url).hostname.replace(/^api\./, '').split('.')[0] || ''; } catch { return ''; } }
function normalizePricing(value = {}) { return { inputPer1M: Math.max(0, Number(value.inputPer1M) || 0), outputPer1M: Math.max(0, Number(value.outputPer1M) || 0), cacheCreationPer1M: Math.max(0, Number(value.cacheCreationPer1M) || 0), cacheReadPer1M: Math.max(0, Number(value.cacheReadPer1M) || 0), cacheCreationEnabled: value.cacheCreationEnabled === true, cacheReadEnabled: value.cacheReadEnabled === true, peakEnabled: value.peakEnabled === true, peakStartTime: String(value.peakStartTime || '').slice(0, 5), peakEndTime: String(value.peakEndTime || '').slice(0, 5), peakInputPer1M: value.peakInputPer1M == null ? null : Math.max(0, Number(value.peakInputPer1M) || 0), peakOutputPer1M: value.peakOutputPer1M == null ? null : Math.max(0, Number(value.peakOutputPer1M) || 0), peakCacheCreationPer1M: value.peakCacheCreationPer1M == null ? null : Math.max(0, Number(value.peakCacheCreationPer1M) || 0), peakCacheReadPer1M: value.peakCacheReadPer1M == null ? null : Math.max(0, Number(value.peakCacheReadPer1M) || 0), peakWeekdaysOnly: value.peakWeekdaysOnly === true, priceDetails: String(value.priceDetails || '').slice(0, 2000), currency: String(value.currency || 'USD').slice(0, 12) }; }
function validPricingTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')); }
function isPricingPeak(now, pricing) { if (!pricing.peakEnabled || !validPricingTime(pricing.peakStartTime) || !validPricingTime(pricing.peakEndTime) || pricing.peakStartTime === pricing.peakEndTime) return false; if (pricing.peakWeekdaysOnly && (now.getDay() === 0 || now.getDay() === 6)) return false; const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; return pricing.peakStartTime < pricing.peakEndTime ? current >= pricing.peakStartTime && current < pricing.peakEndTime : current >= pricing.peakStartTime || current < pricing.peakEndTime; }
function effectivePricing(value, now = new Date()) { const pricing = normalizePricing(value); if (!isPricingPeak(now, pricing)) return pricing; return { ...pricing, inputPer1M: pricing.peakInputPer1M ?? pricing.inputPer1M, outputPer1M: pricing.peakOutputPer1M ?? pricing.outputPer1M, cacheCreationPer1M: pricing.peakCacheCreationPer1M ?? pricing.cacheCreationPer1M, cacheReadPer1M: pricing.peakCacheReadPer1M ?? pricing.cacheReadPer1M }; }
function activePair() {
  ensureCatalog();
  const model = config.models.find((m) => m.id === config.activeModelId) || config.models[0];
  const provider = config.providers.find((p) => p.id === model?.providerId) || config.providers[0];
  return { provider, model };
}
function syncLegacyProvider() {
  const model = config.models?.find((m) => m.id === config.activeModelId) || config.models?.[0];
  const provider = config.providers?.find((p) => p.id === model?.providerId) || config.providers?.[0];
  if (!provider || !model) return;
  config.provider = {
    type: provider.protocol === 'anthropic' ? 'anthropic' : 'openai', protocol: provider.protocol,
    name: provider.name, baseUrl: provider.baseUrl, apiKey: provider.apiKey || '', apiKeyEnv: provider.apiKeyEnv || '',
    model: model.model, contextWindow: model.contextWindow, pricing: model.pricing,
  };
}
function resolvedKey(provider, override) {
  if (provider?.id === MANAGED_PROVIDER_ID) return accountToken();
  if (override) return override;
  if (provider?.apiKey) return provider.apiKey;
  if (provider?.apiKeyEnv && process.env[provider.apiKeyEnv]) return process.env[provider.apiKeyEnv];
  return process.env.MLI_API_KEY || '';
}
function publicProvider(provider) { return { id: provider.id, name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl, apiKeyEnv: provider.apiKeyEnv || '', hasKey: !!resolvedKey(provider), keyHint: provider.id === MANAGED_PROVIDER_ID ? '账户登录' : provider.apiKey ? keyHint(provider.apiKey) : (resolvedKey(provider) ? '已配置' : ''), managed: provider.id === MANAGED_PROVIDER_ID }; }
function publicModel(model) { return { id: model.id, providerId: model.providerId, name: model.name || model.model, model: model.model, contextWindow: Number(model.contextWindow || 128000), pricing: normalizePricing(model.pricing), capabilities: model.capabilities || null }; }

export function providerInfo() {
  const { provider, model } = activePair();
  if (!provider || !model) return { type: 'openai', protocol: 'openai-chat', model: '未配置模型', baseUrl: '', hasKey: false, contextWindow: 128000, pricing: normalizePricing() };
  return { type: provider.protocol, protocol: provider.protocol, providerId: provider.id, providerName: provider.name, modelId: model.id, model: model.model, baseUrl: provider.baseUrl, hasKey: !!resolvedKey(provider), apiKeyEnv: provider.apiKeyEnv || '', keyHint: provider.apiKey ? keyHint(provider.apiKey) : '', contextWindow: model.contextWindow, pricing: normalizePricing(model.pricing) };
}
export function providerPresets() { return PROTOCOLS; }
export function publicSettings() { return { protocols: PROTOCOLS, providers: config.providers.map(publicProvider), models: config.models.map(publicModel), activeModelId: config.activeModelId, provider: providerInfo() }; }
export async function refreshManagedCatalog({ force = false } = {}) {
  ensureCatalog();
  if (!force && Date.now() - catalogRefreshedAt < 30000) return;
  const result = await listManagedModels();
  const hadManaged = config.models.some((model) => model.providerId === MANAGED_PROVIDER_ID);
  const previous = config.models.filter((model) => model.providerId !== MANAGED_PROVIDER_ID);
  const managed = result.models.map((model) => ({
    id: `managed-${model.id}`, providerId: MANAGED_PROVIDER_ID, name: model.name, model: model.id,
    contextWindow: model.contextWindow,
    capabilities: { image: model.supportsImage, video: model.supportsVideo, thinking: model.supportsThinking, webSearch: model.supportsWebSearch },
    displayMultiplier: Number(model.billingMultiplier || 1),
    pricing: { inputPer1M: 0, outputPer1M: 0, cacheCreationPer1M: 0, cacheReadPer1M: 0, cacheCreationEnabled: false, cacheReadEnabled: false, priceDetails: model.priceDetails || '', currency: 'CNY' }
  }));
  config.models = [...managed, ...previous];
  if (!config.models.some((model) => model.id === config.activeModelId)) config.activeModelId = config.models[0]?.id || null;
  if (managed.length && !hadManaged) config.activeModelId = managed[0].id;
  catalogRefreshedAt = Date.now();
  syncLegacyProvider();
}

export function applyCatalogPatch(patch = {}) {
  ensureCatalog();
  if (patch.action === 'save_provider') {
    if (patch.provider?.id === MANAGED_PROVIDER_ID) throw new Error('官方服务商不可修改');
    let item = config.providers.find((p) => p.id === patch.provider?.id);
    if (!item) { item = { id: createId('provider') }; config.providers.push(item); }
    item.name = String(patch.provider?.name || '').trim() || '未命名服务商';
    item.protocol = normalizeProtocol(patch.provider?.protocol);
    item.baseUrl = normalizeBaseUrl(patch.provider?.baseUrl) || defaultBaseUrl(item.protocol);
    if (typeof patch.provider?.apiKeyEnv === 'string') item.apiKeyEnv = patch.provider.apiKeyEnv.trim();
    if (typeof patch.provider?.apiKey === 'string' && patch.provider.apiKey.trim()) item.apiKey = patch.provider.apiKey.trim();
    if (patch.provider?.clearKey) item.apiKey = '';
    syncLegacyProvider();
    return { provider: publicProvider(item), settings: publicSettings() };
  }
  if (patch.action === 'save_model') {
    const providerId = patch.model?.providerId;
    if (providerId === MANAGED_PROVIDER_ID || String(patch.model?.id || '').startsWith('managed-')) throw new Error('官方模型不可修改');
    if (!config.providers.some((p) => p.id === providerId)) throw new Error('服务商不存在');
    let item = config.models.find((m) => m.id === patch.model?.id);
    if (!item) { item = { id: createId('model') }; config.models.push(item); }
    item.providerId = providerId;
    item.model = String(patch.model?.model || '').trim();
    if (!item.model) throw new Error('模型 ID 不能为空');
    item.name = String(patch.model?.name || item.model).trim() || item.model;
    item.contextWindow = Math.max(1000, Math.floor(Number(patch.model?.contextWindow) || 128000));
    item.pricing = normalizePricing(patch.model?.pricing);
    if (patch.activate !== false || !config.activeModelId) config.activeModelId = item.id;
    syncLegacyProvider();
    return { model: publicModel(item), settings: publicSettings() };
  }
  if (patch.action === 'activate_model') {
    if (!config.models.some((m) => m.id === patch.modelId)) throw new Error('模型不存在');
    config.activeModelId = patch.modelId;
    syncLegacyProvider();
    return { settings: publicSettings() };
  }
  if (patch.action === 'delete_model') {
    if (String(patch.modelId || '').startsWith('managed-')) throw new Error('官方模型不可删除');
    const item = config.models.find((m) => m.id === patch.modelId);
    if (!item) throw new Error('模型不存在');
    config.models = config.models.filter((m) => m.id !== item.id);
    if (config.activeModelId === item.id) config.activeModelId = config.models[0]?.id || null;
    syncLegacyProvider();
    return { deletedModelId: item.id, settings: publicSettings() };
  }
  if (patch.action === 'delete_provider') {
    if (patch.providerId === MANAGED_PROVIDER_ID) throw new Error('官方服务商不可删除');
    const item = config.providers.find((p) => p.id === patch.providerId);
    if (!item) throw new Error('服务商不存在');
    config.providers = config.providers.filter((p) => p.id !== item.id);
    const removedModels = new Set(config.models.filter((m) => m.providerId === item.id).map((m) => m.id));
    config.models = config.models.filter((m) => m.providerId !== item.id);
    if (removedModels.has(config.activeModelId)) config.activeModelId = config.models[0]?.id || null;
    syncLegacyProvider();
    return { deletedProviderId: item.id, settings: publicSettings() };
  }
  throw new Error('不支持的模型配置操作');
}
export function applyProviderPatch(patch = {}) { return applyCatalogPatch(patch); }
export function saveConfigFile(file) { ensureCatalog(); const stored = { ...config, providers: config.providers.filter((provider) => provider.id !== MANAGED_PROVIDER_ID), models: config.models.filter((model) => model.providerId !== MANAGED_PROVIDER_ID) }; fs.writeFileSync(file, JSON.stringify(stored, null, 2) + '\n', 'utf8'); }

function authHeaders(provider, key) {
  if (provider.protocol === 'anthropic') return { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  return { 'content-type': 'application/json', authorization: key ? `Bearer ${key}` : '' };
}
export async function listRemoteModels({ providerId, baseUrl, apiKey: override, protocol } = {}) {
  const existing = config.providers.find((p) => p.id === providerId);
  const provider = { ...(existing || {}), protocol: normalizeProtocol(protocol || existing?.protocol), baseUrl: normalizeBaseUrl(baseUrl || existing?.baseUrl) };
  const key = resolvedKey(provider, override);
  if (!provider.baseUrl) throw new Error('请先填写 API 地址');
  const res = await fetch(`${provider.baseUrl}/models`, { headers: authHeaders(provider, key) });
  const text = await res.text();
  if (!res.ok) throw new Error(`拉取模型失败 HTTP ${res.status}：${text.slice(0, 240)}`);
  let json; try { json = JSON.parse(text); } catch { throw new Error('模型列表不是 JSON'); }
  const rows = Array.isArray(json.data) ? json.data : (Array.isArray(json.models) ? json.models : []);
  return { models: rows.map((m) => typeof m === 'string' ? m : (m.id ?? m.name ?? '')).filter(Boolean).sort() };
}

export async function testProvider({ providerId, baseUrl, model, apiKey: override, protocol } = {}) {
  const existing = config.providers.find((p) => p.id === providerId);
  const provider = { ...(existing || {}), protocol: normalizeProtocol(protocol || existing?.protocol), baseUrl: normalizeBaseUrl(baseUrl || existing?.baseUrl) };
  const key = resolvedKey(provider, override), modelId = String(model || '').trim();
  if (!provider.baseUrl || !modelId) throw new Error('请先填写 API 地址和模型 ID');
  if (!key && !provider.baseUrl.includes('127.0.0.1') && !provider.baseUrl.includes('localhost')) throw new Error('请先填写 API Key');
  const request = buildRequest(provider, { model: modelId }, [{ role: 'user', content: 'ping' }], '', [], false);
  const res = await fetch(request.url, { method: 'POST', headers: authHeaders(provider, key), body: JSON.stringify(request.body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`连通失败 HTTP ${res.status}：${text.slice(0, 300)}`);
  return { ok: true, message: `连通成功（${modelId}）` };
}

function openAITools(tools) { return tools.map((t) => t?.type === 'function' && t.function ? t : ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters ?? { type: 'object', properties: {} } } })); }
function responseTools(tools) { return openAITools(tools).map((t) => ({ type: 'function', name: t.function.name, description: t.function.description, parameters: t.function.parameters, strict: false })); }
function anthropicTools(tools) { return openAITools(tools).map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })); }
function openAIParts(content) { return Array.isArray(content) ? content.map((p) => p.type === 'image' ? ({ type: 'image_url', image_url: { url: p.dataUrl } }) : ({ type: 'text', text: p.text || '' })) : String(content ?? ''); }
function anthropicParts(content) { return Array.isArray(content) ? content.map((p) => p.type === 'image' ? ({ type: 'image', source: dataSource(p.dataUrl) }) : ({ type: 'text', text: p.text || '' })) : String(content ?? ''); }
function dataSource(url = '') { const m = String(url).match(/^data:([^;]+);base64,(.+)$/); return m ? { type: 'base64', media_type: m[1], data: m[2] } : { type: 'url', url }; }
function toOpenAI(messages) { return messages.map((m) => m.role === 'assistant' ? ({ role: 'assistant', content: m.text || null, ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) } : {}) }) : m.role === 'tool' ? ({ role: 'tool', tool_call_id: m.toolCallId, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }) : ({ role: m.role, content: openAIParts(m.content) })); }
function responseParts(content) { return Array.isArray(content) ? content.map((p) => p.type === 'image' ? ({ type: 'input_image', image_url: p.dataUrl }) : ({ type: 'input_text', text: p.text || '' })) : String(content ?? ''); }
function toResponses(messages) { const out = []; for (const m of messages) { if (m.role === 'assistant') { if (m.text) out.push({ role: 'assistant', content: m.text }); for (const c of m.toolCalls || []) out.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args || {}) }); } else if (m.role === 'tool') out.push({ type: 'function_call_output', call_id: m.toolCallId, output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }); else out.push({ role: m.role, content: responseParts(m.content) }); } return out; }
function toAnthropic(messages) { const out = []; for (const m of messages) { if (m.role === 'assistant') { const content = []; if (m.text) content.push({ type: 'text', text: m.text }); for (const c of m.toolCalls || []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} }); out.push({ role: 'assistant', content }); } else if (m.role === 'tool') out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] }); else out.push({ role: m.role === 'system' ? 'user' : m.role, content: anthropicParts(m.content) }); } return out; }
function buildRequest(provider, model, messages, system, tools, stream) {
  if (provider.protocol === 'openai-responses') { const body = { model: model.model, input: toResponses(messages), instructions: system || undefined, stream, store: false }; if (tools.length) body.tools = responseTools(tools); return { url: `${provider.baseUrl}/responses`, body }; }
  if (provider.protocol === 'anthropic') { const body = { model: model.model, messages: toAnthropic(messages), system: system || undefined, max_tokens: 4096, stream }; if (tools.length) body.tools = anthropicTools(tools); return { url: `${provider.baseUrl}/messages`, body }; }
  const body = { model: model.model, messages: toOpenAI(system ? [{ role: 'system', content: system }, ...messages] : messages), stream }; if (tools.length) body.tools = openAITools(tools); if (stream) body.stream_options = { include_usage: true }; return { url: `${provider.baseUrl}/chat/completions`, body };
}
function extractNonStream(protocol, json) { if (protocol === 'openai-responses') return { text: json.output_text || (json.output || []).flatMap((i) => i.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join(''), usage: json.usage }; if (protocol === 'anthropic') return { text: (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''), usage: json.usage }; return { text: json.choices?.[0]?.message?.content || '', usage: json.usage }; }
function estimateTokens(value) { return Math.max(0, Math.ceil(String(value ?? '').length / 4)); }
export function usageNumbers(usage, request, output) {
  const cacheCreationTokens = Math.max(0, Number(usage?.cache_creation_input_tokens ?? 0) || 0);
  const cacheReadTokens = Math.max(0, Number(usage?.cache_read_input_tokens ?? usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens ?? 0) || 0);
  const cacheMissTokens = Math.max(0, Number(usage?.prompt_cache_miss_tokens ?? 0) || 0);
  const separateCacheTokens = usage?.cache_creation_input_tokens != null || usage?.cache_read_input_tokens != null;
  const promptTokens = Math.max(0, Number(usage?.prompt_tokens ?? usage?.input_tokens ?? estimateTokens(JSON.stringify(request))) || 0) + (usage?.prompt_tokens == null && separateCacheTokens ? cacheCreationTokens + cacheReadTokens : 0);
  const completionTokens = Math.max(0, Number(usage?.completion_tokens ?? usage?.output_tokens ?? estimateTokens(output)) || 0);
  return { promptTokens, completionTokens, cacheCreationTokens, cacheReadTokens, cacheMissTokens };
}
export function usageCost(counts, pricingValue) {
  const pricing = effectivePricing(pricingValue);
  const creation = pricing.cacheCreationEnabled ? Math.min(counts.promptTokens, counts.cacheCreationTokens) : 0;
  const read = pricing.cacheReadEnabled ? Math.min(counts.promptTokens - creation, counts.cacheReadTokens) : 0;
  return ((counts.promptTokens - creation - read) * pricing.inputPer1M + counts.completionTokens * pricing.outputPer1M + creation * pricing.cacheCreationPer1M + read * pricing.cacheReadPer1M) / 1e6;
}

function connectionDetails(error, provider, requestUrl, attempt) {
  const cause = error?.cause;
  return {
    stage: 'model_connection', attempt,
    name: error?.name || 'Error', message: error?.message || String(error),
    code: error?.code || cause?.code || '', cause: cause?.message || '',
    provider: provider?.name || '', protocol: provider?.protocol || '', url: requestUrl,
  };
}

function retryDelay(attempt) { return Math.min(12000, 700 * (2 ** (attempt - 1))); }
function retryAfter(response, fallback) {
  const value = response?.headers?.get('retry-after');
  if (!value) return fallback;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(60000, Math.max(0, Math.round(seconds * 1000)));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(60000, Math.max(0, date - Date.now())) : fallback;
}
function retryableStatus(status, protocol) {
  // These indicate a transient network, capacity, timeout, or rate-limit condition.
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  return protocol === 'anthropic' && status === 529;
}
function waitForRetry(ms, signal) { return new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason || new Error('aborted')); }, { once: true }); }); }

function responseMetadata(response) {
  if (!response) return {};
  const headers = {};
  for (const name of ['x-request-id', 'request-id', 'openai-processing-ms', 'server-timing', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'retry-after']) {
    const value = response.headers?.get(name);
    if (value) headers[name] = value;
  }
  return { httpStatus: response.status, headers };
}

export async function* chat({ messages, system, tools = [], signal, sessionId, step } = {}) {
  const { provider, model } = activePair();
  if (!provider || !model) { yield { type: 'error', message: '请先添加服务商和模型' }; return; }
  const request = buildRequest(provider, model, messages, system, tools, true);
  const startedAt = performance.now(), firstOutputAt = { value: null }, responseEvents = [];
  let res;
  let outputText = '', thinkingText = '', usage = null, streamMetadata = {}, billedFromStream = null, parsedError = null;
  const collect = (e) => { responseEvents.push(e); if ((e.type === 'text_delta' || e.type === 'thinking_delta') && firstOutputAt.value == null) firstOutputAt.value = performance.now(); if (e.type === 'text_delta') outputText += e.text || ''; if (e.type === 'thinking_delta') thinkingText += e.text || ''; if (e.type === 'usage') usage = e.usage; if (e.type === 'metadata') streamMetadata = { ...streamMetadata, ...e.metadata }; if (e.type === 'billing') billedFromStream = Number(e.magicValue ?? e.points); if (e.type === 'error') parsedError = e.message; };
  const finish = async (extra = {}) => {
    const totalMs = performance.now() - startedAt, counts = usageNumbers(usage, request.body, outputText + thinkingText), pricing = normalizePricing(model.pricing);
    const row = { id: createApiLogId(), sessionId, step, kind: 'stream', provider: { id: provider.id, name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl, model: model.model, modelName: model.name || model.model }, request: request.body, response: { text: outputText, thinking: thinkingText, events: responseEvents, usage, metadata: { ...responseMetadata(res), ...streamMetadata } }, metrics: { ...counts, totalTokens: counts.promptTokens + counts.completionTokens, estimatedTokens: !usage, firstTokenMs: firstOutputAt.value == null ? null : firstOutputAt.value - startedAt, totalMs, throughputTokensPerSecond: totalMs > 0 ? counts.completionTokens / (totalMs / 1000) : 0, cost: usageCost(counts, pricing), currency: pricing.currency, ...extra } };
    const headerMagicValue = res?.headers?.get('x-billed-magic-value') ?? res?.headers?.get('x-billed-points');
    const billed = headerMagicValue == null ? billedFromStream : Number(headerMagicValue);
    if (provider.id === MANAGED_PROVIDER_ID && Number.isFinite(billed)) row.metrics.cost = billed;
    row.billing = provider.id === MANAGED_PROVIDER_ID ? { status: row.metrics.error ? 'failed' : 'server_settled', magicValue: Number.isFinite(billed) ? billed : 0 } : row.metrics.error || row.metrics.estimatedTokens ? { status: 'not_billable', magicValue: 0, reason: row.metrics.error ? 'request_failed' : 'estimated_usage' } : await settleApiUsage(row);
    if (provider.id === MANAGED_PROVIDER_ID && !row.metrics.error) await refreshAccount().catch(() => {});
    appendApiLog(row);
  };
  if (provider.protocol === 'mock') { try { for await (const e of mockStream(toOpenAI(messages), openAITools(tools))) { collect(e); yield e; } } finally { await finish(); } return; }
  const key = resolvedKey(provider);
  if (!key && !provider.baseUrl.includes('127.0.0.1') && !provider.baseUrl.includes('localhost')) { const e = { type: 'error', message: `服务商“${provider.name}”未配置 API Key` }; collect(e); yield e; await finish({ error: e.message }); return; }
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetch(request.url, { method: 'POST', headers: authHeaders(provider, key), body: JSON.stringify(request.body), signal });
      if (!retryableStatus(res.status, provider.protocol) || attempt === maxAttempts) break;
      const delayMs = retryAfter(res, retryDelay(attempt));
      try { await res.body?.cancel(); } catch { /* 丢弃本次可重试响应 */ }
      const retry = { type: 'retry', attempt, maxAttempts, delayMs, message: `模型服务返回 HTTP ${res.status}` };
      responseEvents.push(retry); yield retry;
      await waitForRetry(delayMs, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      const details = connectionDetails(err, provider, request.url, attempt);
      if (attempt < maxAttempts) {
        const retry = { type: 'retry', attempt, maxAttempts, delayMs: retryDelay(attempt), message: details.message, details };
        responseEvents.push(retry); yield retry;
        await waitForRetry(retry.delayMs, signal);
        continue;
      }
      const e = { type: 'error', message: `连接模型失败：${details.message}`, details };
      collect(e); yield e; await finish({ error: e.message, errorDetails: details, attempts: attempt }); return;
    }
  }
  const parser = provider.protocol === 'openai-responses' ? parseResponsesStream : provider.protocol === 'anthropic' ? parseAnthropicStream : parseOpenAIStream;
  let streamError = null;
  try { for await (const rawEvent of parser(res)) { const e = rawEvent.type === 'error' && !rawEvent.details ? { ...rawEvent, details: { stage: 'model_response', name: 'ModelApiError', message: rawEvent.message, provider: provider.name, protocol: provider.protocol, url: request.url, status: res.status } } : rawEvent; collect(e); yield e; } }
  catch (err) {
    if (signal?.aborted) throw err;
    const details = { ...connectionDetails(err, provider, request.url, 1), stage: 'model_stream' };
    streamError = `模型响应流中断：${details.message}`;
    const event = { type: 'error', message: streamError, details };
    collect(event); yield event;
  } finally { await finish({ httpStatus: res.status, ...(streamError || parsedError || !res.ok ? { error: streamError || parsedError || `HTTP ${res.status}` } : {}) }); }
}

export async function completeOnce({ messages, signal, sessionId } = {}) {
  const { provider, model } = activePair();
  if (!provider || !model) throw new Error('请先添加服务商和模型');
  const request = buildRequest(provider, model, messages, '', [], false), startedAt = performance.now(), pricing = normalizePricing(model.pricing);
  const save = async (text, usage, extra = {}) => {
    const counts = usageNumbers(usage, request.body, text), totalMs = performance.now() - startedAt;
    const row = { id: createApiLogId(), sessionId, kind: 'complete', provider: { id: provider.id, name: provider.name, protocol: provider.protocol, baseUrl: provider.baseUrl, model: model.model, modelName: model.name || model.model }, request: request.body, response: { text, usage, ...extra }, metrics: { ...counts, totalTokens: counts.promptTokens + counts.completionTokens, estimatedTokens: !usage, firstTokenMs: totalMs, totalMs, throughputTokensPerSecond: totalMs > 0 ? counts.completionTokens / (totalMs / 1000) : 0, cost: usageCost(counts, pricing), currency: pricing.currency, ...(extra.error ? { error: extra.error } : {}) } };
    const billed = Number(res?.headers?.get('x-billed-magic-value') ?? res?.headers?.get('x-billed-points'));
    if (provider.id === MANAGED_PROVIDER_ID && Number.isFinite(billed)) row.metrics.cost = billed;
    row.billing = provider.id === MANAGED_PROVIDER_ID ? { status: row.metrics.error ? 'failed' : 'server_settled', magicValue: Number.isFinite(billed) ? billed : 0 } : row.metrics.error || row.metrics.estimatedTokens ? { status: 'not_billable', magicValue: 0, reason: row.metrics.error ? 'request_failed' : 'estimated_usage' } : await settleApiUsage(row);
    if (provider.id === MANAGED_PROVIDER_ID && !row.metrics.error) await refreshAccount().catch(() => {});
    appendApiLog(row);
  };
  const key = resolvedKey(provider);
  let res, raw;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetch(request.url, { method: 'POST', headers: authHeaders(provider, key), body: JSON.stringify(request.body), signal });
      raw = await res.text();
      if (!retryableStatus(res.status, provider.protocol) || attempt === maxAttempts) break;
      await waitForRetry(retryAfter(res, retryDelay(attempt)), signal);
    } catch (error) {
      if (signal?.aborted || attempt === maxAttempts) throw error;
      await waitForRetry(retryDelay(attempt), signal);
    }
  }
  if (!res.ok) { await save('', null, { error: `LLM API ${res.status}: ${raw.slice(0, 300)}`, metadata: responseMetadata(res) }); throw new Error(`LLM API ${res.status}: ${raw.slice(0, 300)}`); }
  let json; try { json = JSON.parse(raw); } catch { throw new Error('模型响应不是 JSON'); }
  const result = extractNonStream(provider.protocol, json); await save(result.text, result.usage, { raw: json, metadata: { ...responseMetadata(res), id: json.id, model: json.model, status: json.status } }); return result.text;
}

export function loadConfig(file) { const cfg = JSON.parse(fs.readFileSync(file, 'utf8')); setConfig(cfg); return cfg; }
