import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, setConfig, applyCatalogPatch, publicSettings, resolveModelSelection } from '../core/llm.mjs';
import { normalizeReasoningSettings, reasoningChoices } from '../core/reasoning.mjs';

test('client selects catalog values directly, preserving types and encoding internally', () => {
  assert.deepEqual(reasoningChoices({}), []);
  const reasoning = { supportedEfforts: ['minimal', 'high', 'ultra'] };
  assert.equal(request('openai-chat', { value: 'ultra' }, { reasoning }).reasoning_effort, 'ultra');
  assert.deepEqual(request('openai-responses', { value: 'minimal' }, { reasoning }).reasoning, { effort: 'minimal' });
  assert.throws(() => request('openai-chat', { value: 'low' }, { reasoning }), /重新选择/);
  const custom = { values: [{ value: 2048, label: '2048 tokens' }, { value: 8192, label: '8192 tokens' }], field: 'thinking_budget' };
  assert.equal(request('openai-chat', { value: 2048 }, { reasoning: custom }).thinking_budget, 2048);
  const toggle = { controls: [{ kind: 'toggle' }], values: [false, true] };
  assert.equal(request('openai-chat', { value: false }, { reasoning: toggle }).enable_thinking, false);
  assert.equal(request('openai-chat', { value: true }, { reasoning: toggle }).enable_thinking, true);
  assert.deepEqual(normalizeReasoningSettings({ value: false }), { value: false });
});

const request = (protocol, settings, extra = {}, limit) => buildRequest({ protocol, baseUrl: 'https://example.invalid/v1' }, { model: 'Proxy/Model-Fast', reasoningSettings: settings, ...extra }, [{ role: 'user', content: 'Hi' }], '', [], true, limit).body;
test('default sends no thinking fields; effort encodes per protocol without changing model ID', () => {
  const normal = request('openai-chat', { mode: 'default' });
  assert.equal(normal.reasoning_effort, undefined);
  assert.equal(normal.thinking, undefined);
  const setting = { mode: 'effort', effort: 'high', adapter: 'auto' };
  assert.equal(request('openai-chat', setting).reasoning_effort, 'high');
  assert.deepEqual(request('openai-responses', setting).reasoning, { effort: 'high' });
  assert.equal(request('openai-responses', setting).model, 'Proxy/Model-Fast');
  assert.throws(() => request('openai-chat', setting, { reasoning: { supportedEfforts: ['low'] } }), /不支持/);
});
test('Anthropic budget increases default output allowance but honors explicit limits', () => {
  const setting = { mode: 'budget', budget: 4096, adapter: 'auto' };
  const body = request('anthropic', setting);
  assert.deepEqual(body.thinking, { type: 'enabled', budget_tokens: 4096 });
  assert.ok(body.max_tokens > body.thinking.budget_tokens);
  assert.throws(() => request('anthropic', setting, {}, 2048), /本次请求/);
  assert.throws(() => request('anthropic', setting, { maxOutputTokens: 4096 }), /模型输出/);
  assert.throws(() => request('anthropic', { ...setting, budget: 12 }), /范围/);
  assert.deepEqual(request('anthropic', { mode: 'disabled', adapter: 'anthropic-budget' }).thinking, { type: 'disabled' });
});
test('adaptive, toggle and custom settings encode supported modes and reject incompatible ones', () => {
  const adaptive = request('anthropic', { mode: 'effort', effort: 'high', adapter: 'auto' }, { reasoning: { controls: [{ kind: 'effort' }], supportedEfforts: ['high'] } });
  assert.deepEqual(adaptive.thinking, { type: 'adaptive' });
  assert.deepEqual(adaptive.output_config, { effort: 'high' });
  assert.equal(request('openai-chat', { mode: 'disabled', adapter: 'auto' }, { reasoning: { controls: [{ kind: 'toggle' }] } }).enable_thinking, false);
  assert.deepEqual(request('openai-chat', { mode: 'enabled', adapter: 'thinking-type' }).thinking, { type: 'enabled' });
  assert.equal(request('openai-chat', { mode: 'budget', budget: 2000, adapter: 'custom', field: 'thinking_budget' }).thinking_budget, 2000);
  assert.throws(() => request('openai-responses', { mode: 'enabled', adapter: 'enable-thinking' }), /Chat/);
  assert.throws(() => normalizeReasoningSettings({ mode: 'enabled', adapter: 'custom', field: 'model' }), /自定义字段/);
  assert.throws(() => request('openai-chat', { mode: 'enabled', adapter: 'custom', field: 'thinking.__proto__.polluted' }));
  assert.equal({}.polluted, undefined);
});
test('model settings persist independently and invalid changes preserve previous state', () => {
  setConfig({ providers: [{ id: 'p', protocol: 'openai-chat', baseUrl: 'https://example.invalid' }], models: [{ id: 'm', providerId: 'p', model: 'test' }], activeModelId: 'm' });
  const model = { id: 'm', providerId: 'p', model: 'test', reasoningSettings: { mode: 'effort', effort: 'medium', adapter: 'openai' } };
  applyCatalogPatch({ action: 'save_model', model });
  assert.equal(publicSettings().models[0].reasoningSettings.effort, 'medium');
  assert.equal(resolveModelSelection('m').model.reasoningSettings.effort, 'medium');
  applyCatalogPatch({ action: 'save_model', model: { id: 'm', providerId: 'p', model: 'test' } });
  assert.equal(resolveModelSelection('m').model.reasoningSettings.effort, 'medium');
  assert.throws(() => applyCatalogPatch({ action: 'save_model', model: { ...model, reasoningSettings: { mode: 'budget', budget: -1 } } }));
  assert.equal(resolveModelSelection('m').model.reasoningSettings.effort, 'medium');
  applyCatalogPatch({ action: 'save_model', model: { ...model, reasoningSettings: { mode: 'default' } } });
  assert.deepEqual(resolveModelSelection('m').model.reasoningSettings, { mode: 'default' });
});
test('activating a managed model can save reasoning settings across catalog refreshes', async () => {
  setConfig({
    managedReasoningSettings: {},
    providers: [{ id: 'mli-managed', protocol: 'openai-chat', baseUrl: 'https://example.invalid' }],
    models: [{ id: 'managed-demo', providerId: 'mli-managed', model: 'demo', capabilities: { thinking: true } }],
    activeModelId: 'managed-demo',
  });
  applyCatalogPatch({ action: 'activate_model', modelId: 'managed-demo', reasoningSettings: { mode: 'effort', effort: 'high', adapter: 'openai' } });
  assert.equal(publicSettings().models[0].reasoningSettings.effort, 'high');
  assert.equal(resolveModelSelection('managed-demo').model.reasoningSettings.effort, 'high');
});
