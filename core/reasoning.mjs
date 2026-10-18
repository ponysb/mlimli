export const REASONING_ADAPTERS = [
  ['auto', '自动'], ['openai', 'OpenAI 强度'], ['anthropic-budget', 'Anthropic 预算'],
  ['anthropic-adaptive', 'Anthropic 自适应'], ['enable-thinking', 'enable_thinking 开关'],
  ['thinking-type', 'thinking.type 开关'], ['thinking-budget', 'thinking_budget 预算'], ['custom', '自定义字段'],
];
const safeField = /^(reasoning|thinking|reasoning_effort|enable_thinking|thinking_budget|generationConfig)(\.[a-zA-Z][a-zA-Z0-9_]{0,63}){0,3}$/;
export function normalizeReasoningSettings(value) {
  if (value && Object.hasOwn(value, 'value')) {
    if (!['string', 'number', 'boolean'].includes(typeof value.value) || (typeof value.value === 'string' && (!value.value.length || value.value.length > 100)) || (typeof value.value === 'number' && (!Number.isSafeInteger(value.value) || value.value < 0 || value.value > 1000000))) throw new Error('无效思考值');
    return { value: value.value };
  }
  if (!value || value.mode === 'default') return { mode: 'default' };
  if (!['effort', 'budget', 'enabled', 'disabled'].includes(value.mode)) throw new Error('无效思考模式');
  const adapter = value.adapter || 'auto';
  if (!REASONING_ADAPTERS.some(([id]) => id === adapter)) throw new Error('无效思考参数映射');
  const result = { mode: value.mode, adapter };
  if (value.mode === 'effort') {
    if (typeof value.effort !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(value.effort)) throw new Error('无效思考强度值');
    result.effort = value.effort;
  }
  if (value.mode === 'budget') {
    const budget = Number(value.budget);
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > 1000000) throw new Error('思考预算须为 1–1000000 的整数');
    result.budget = budget;
  }
  if (adapter === 'custom') {
    if (!safeField.test(value.field || '')) throw new Error('自定义字段须位于 reasoning、thinking 或支持的思考参数中');
    result.field = value.field;
  }
  return result;
}
export function reasoningChoices(model = {}) {
  const declared = model.reasoning?.values ?? model.reasoning?.supportedEfforts ?? [];
  if (!Array.isArray(declared)) return [];
  const choices = declared.map(item => typeof item === 'object' && item !== null ? item : { value: item, label: String(item) })
    .filter(item => ['string', 'number', 'boolean'].includes(typeof item.value));
  return choices.filter((item, index) => choices.findIndex(other => other.value === item.value) === index);
}
function resolveValue(setting, model, protocol) {
  if (!Object.hasOwn(setting, 'value')) return setting;
  if (!reasoningChoices(model).some(item => item.value === setting.value)) throw new Error('模型档案已不支持此思考值，请重新选择');
  const field = model.reasoning?.fields?.[protocol] || model.reasoning?.field;
  if (field) return { mode: 'value', adapter: 'custom', field, value: setting.value };
  const adapter = model.reasoning?.adapter || reasoningOptions(model, protocol).suggested;
  if (['enable-thinking', 'thinking-type'].includes(adapter)) {
    if (![true, false, 'none', 'auto', 'enabled', 'disabled'].includes(setting.value)) throw new Error('此思考值需要后台配置参数字段');
    return { adapter, mode: [false, 'none', 'disabled'].includes(setting.value) ? 'disabled' : 'enabled' };
  }
  if (['anthropic-budget', 'thinking-budget'].includes(adapter)) {
    if (setting.value === 'none' && adapter === 'anthropic-budget') return { adapter, mode: 'disabled' };
    if (typeof setting.value !== 'number') throw new Error('此思考值需要后台配置参数字段或预算值');
    return { adapter, mode: 'budget', budget: setting.value };
  }
  return { adapter, mode: 'effort', effort: setting.value };
}
export function reasoningOptions(model = {}, protocol) {
  const controls = model.reasoning?.controls || [];
  const kinds = controls.map(x => x.kind);
  const efforts = model.reasoning?.supportedEfforts?.filter(x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(x)) || [];
  return { kinds, efforts: efforts.length ? efforts : ['low', 'medium', 'high'],
    budget: controls.find(x => x.kind === 'budget') || model.reasoning?.thinkingTokenLimits,
    suggested: protocol === 'anthropic' ? (kinds.includes('effort') ? 'anthropic-adaptive' : 'anthropic-budget')
      : protocol === 'openai-responses' ? 'openai'
      : kinds.includes('budget') && !kinds.includes('effort') && !kinds.includes('toggle') ? 'thinking-budget'
        : kinds.includes('toggle') && !kinds.includes('effort') ? 'enable-thinking' : 'openai' };
}
function setField(body, field, value) {
  const parts = field.split('.');
  let target = body;
  for (const part of parts.slice(0, -1)) {
    if (['__proto__', 'prototype', 'constructor'].includes(part)) throw new Error('无效参数字段');
    target = target[part] ||= {};
  }
  if (['__proto__', 'prototype', 'constructor'].includes(parts.at(-1))) throw new Error('无效参数字段');
  target[parts.at(-1)] = value;
}
export function applyReasoning(body, model, protocol, outputLimit) {
  const setting = resolveValue(normalizeReasoningSettings(model.reasoningSettings), model, protocol);
  if (setting.mode === 'default' || protocol === 'mock') return;
  const options = reasoningOptions(model, protocol);
  const adapter = setting.adapter === 'auto' ? (model.reasoning?.adapter || options.suggested) : setting.adapter;
  const enabled = setting.mode !== 'disabled';
  if (adapter === 'custom') {
    if (!safeField.test(setting.field || '')) throw new Error('无效思考参数字段');
    setField(body, setting.field, setting.mode === 'value' ? setting.value : setting.mode === 'effort' ? setting.effort : setting.mode === 'budget' ? setting.budget : enabled);
    return;
  }
  if (adapter === 'openai') {
    if (!['openai-chat', 'openai-responses'].includes(protocol) || setting.mode !== 'effort') throw new Error('OpenAI 映射需要强度模式及 OpenAI 协议');
    if (model.reasoning?.supportedEfforts?.length && !options.efforts.includes(setting.effort)) throw new Error('模型档案不支持此思考强度');
    setField(body, protocol === 'openai-responses' ? 'reasoning.effort' : 'reasoning_effort', setting.effort);
  } else if (adapter === 'anthropic-budget') {
    if (protocol !== 'anthropic' || !['budget', 'disabled'].includes(setting.mode)) throw new Error('Anthropic 预算映射需要预算或关闭模式');
    if (!enabled) { body.thinking = { type: 'disabled' }; return; }
    const bounds = options.budget;
    if (setting.budget < Math.max(1024, bounds?.min || 0) || setting.budget > (bounds?.max || 1000000)) throw new Error('思考预算超出模型支持范围');
    const limit = model.maxOutputTokens;
    if (limit && setting.budget >= limit) throw new Error('思考预算必须小于模型输出上限');
    if (Number(outputLimit) > 0 && setting.budget >= body.max_tokens) throw new Error('思考预算必须小于本次请求输出上限');
    if (body.max_tokens <= setting.budget) body.max_tokens = setting.budget + 1024;
    if (limit) body.max_tokens = Math.min(body.max_tokens, limit);
    body.thinking = { type: 'enabled', budget_tokens: setting.budget };
  } else if (adapter === 'anthropic-adaptive') {
    if (protocol !== 'anthropic' || !['effort', 'disabled', 'enabled'].includes(setting.mode)) throw new Error('自适应思考需要 Anthropic 协议及强度或开关模式');
    body.thinking = { type: enabled ? 'adaptive' : 'disabled' };
    if (setting.mode === 'effort') {
      if (model.reasoning?.supportedEfforts?.length && !options.efforts.includes(setting.effort)) throw new Error('模型档案不支持此思考强度');
      body.output_config = { effort: setting.effort };
    }
  } else if (adapter === 'thinking-budget') {
    if (protocol !== 'openai-chat' || setting.mode !== 'budget') throw new Error('thinking_budget 映射需要 Chat 协议和预算模式');
    if (setting.budget < (options.budget?.min || 1) || setting.budget > (options.budget?.max || 1000000)) throw new Error('思考预算超出模型支持范围');
    body.thinking_budget = setting.budget;
  } else if (['enable-thinking', 'thinking-type'].includes(adapter)) {
    if (protocol !== 'openai-chat' || !['enabled', 'disabled'].includes(setting.mode)) throw new Error('开关映射需要 Chat 协议及开启或关闭模式');
    if (adapter === 'enable-thinking') body.enable_thinking = enabled;
    else body.thinking = { type: enabled ? 'enabled' : 'disabled' };
  } else throw new Error('不支持此思考参数映射');
}
