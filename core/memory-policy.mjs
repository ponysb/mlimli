import { getConfig } from './llm.mjs';

export const MEMORY_DEFAULTS = Object.freeze({ enabled: true, autoLearn: true, reviewBeforeSave: false, historyEnabled: true });
export const MEMORY_TOOLS = new Set(['list_memories', 'read_memory', 'search_memories', 'search_history', 'write_memory', 'delete_memory']);
let generation = 0;
export function memoryPolicyVersion() { return generation; }
export function memorySettings() {
  const configured = getConfig()?.memory || {};
  return Object.fromEntries(Object.entries(MEMORY_DEFAULTS).map(([key, value]) => [key, typeof configured[key] === 'boolean' ? configured[key] : value]));
}
export function updateMemorySettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('记忆设置必须是对象');
  for (const [key, value] of Object.entries(patch)) if (!Object.hasOwn(MEMORY_DEFAULTS, key) || typeof value !== 'boolean') throw new Error('无效记忆设置');
  const config = getConfig();
  if (!config) throw new Error('运行时尚未初始化');
  config.memory = { ...memorySettings(), ...patch }; generation++;
  return memorySettings();
}
export function memoryToolEnabled(name) {
  if (!MEMORY_TOOLS.has(name)) return true;
  const settings = memorySettings();
  return settings.enabled && (name !== 'search_history' || settings.historyEnabled);
}
export function assertMemoryTool(name) {
  if (!memoryToolEnabled(name)) throw new Error(name === 'search_history' ? '历史检索已关闭' : '记忆功能已关闭');
}
