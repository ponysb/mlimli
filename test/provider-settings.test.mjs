import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setConfig, getConfig, applyCatalogPatch, providerInfo, publicSettings } from '../core/llm.mjs';

const example = fs.readFileSync(new URL('../config.example.json', import.meta.url), 'utf8');

test('provider forms and connection details do not offer environment-variable configuration', () => {
  const source = fs.readFileSync(new URL('../react/src/main.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /apiKeyEnv|环境变量|OPENAI_API_KEY/);
  assert.match(source, /<label>API Key<input type="password"/);
  assert.match(source, /<small>API 地址<\/small>/);
  assert.match(source, /<small>API Key<\/small>/);
  assert.ok(JSON.parse(example).providers.every(provider => !Object.hasOwn(provider, 'apiKeyEnv')));
});

test('saving providers without the removed field keeps existing direct keys and legacy credentials', () => {
  const config = JSON.parse(example);
  const provider = config.providers[0];
  provider.apiKey = 'fixture-secret';
  provider.apiKeyEnv = 'MLI_SETTINGS_FIXTURE_KEY';
  setConfig(config);
  applyCatalogPatch({ action: 'save_provider', provider: { id: provider.id, name: 'Updated', protocol: 'mock', baseUrl: provider.baseUrl, apiKey: '' } });
  const saved = getConfig().providers.find(item => item.id === provider.id);
  assert.equal(saved.apiKey, 'fixture-secret');
  assert.equal(saved.apiKeyEnv, 'MLI_SETTINGS_FIXTURE_KEY');
  assert.equal(saved.name, 'Updated');
  assert.equal(providerInfo().hasKey, true);
});

test('new providers use direct API keys without creating an environment-variable field', () => {
  setConfig(JSON.parse(example));
  const result = applyCatalogPatch({ action: 'save_provider', provider: { name: 'Direct', protocol: 'openai-chat', baseUrl: 'https://example.invalid/v1', apiKey: 'fixture-secret' } });
  const saved = getConfig().providers.find(item => item.id === result.provider.id);
  assert.ok(!Object.hasOwn(saved, 'apiKeyEnv'));
  assert.equal(saved.apiKey, 'fixture-secret');
  assert.equal(result.provider.hasKey, true);
  assert.ok(!JSON.stringify(publicSettings()).includes('fixture-secret'));
});

test('model input capabilities survive saving and partial edits', () => {
  const config = JSON.parse(example), model = config.models[0];
  model.capabilities = { image: true, thinking: true };
  setConfig(config);
  const saved = applyCatalogPatch({ action: 'save_model', model: { ...model, capabilities: { file: true, pdf: true, audio: false } } }).model;
  assert.deepEqual(saved.capabilities, { image: true, thinking: true, file: true, pdf: true, audio: false });
  const edited = applyCatalogPatch({ action: 'save_model', model: { ...saved, capabilities: { file: false } } }).model;
  assert.equal(edited.capabilities.file, false);
  assert.equal(edited.capabilities.pdf, true);
  assert.equal(edited.capabilities.image, true);
});
