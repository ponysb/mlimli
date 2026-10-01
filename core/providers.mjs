import crypto from 'node:crypto';

export const PROTOCOLS = [
  { id: 'openai-chat', name: 'OpenAI Chat Completions', endpoint: '/chat/completions' },
  { id: 'openai-responses', name: 'OpenAI Responses', endpoint: '/responses' },
  { id: 'anthropic', name: 'Anthropic Messages', endpoint: '/messages' },
];

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function keyHint(key) {
  const value = String(key ?? '');
  if (value.length < 8) return value ? '已配置' : '';
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}

export function defaultBaseUrl(protocol) {
  return protocol === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
}

export function normalizeProtocol(value) {
  if (value === 'mock' || PROTOCOLS.some((item) => item.id === value)) return value;
  return value === 'anthropic' ? 'anthropic' : 'openai-chat';
}
