import { normalizeRunLimit } from './run-control.mjs';

const READ = ['read_file', 'read_attachment', 'read_tool_output', 'find', 'grep', 'read_skill', 'list_memories', 'read_memory', 'search_memories', 'search_history', 'agent_send', 'agent_inspect'];
export const swarmCapabilities = Object.freeze({ read: READ, web: ['web_fetch'], command: ['bash'], write: ['write_file', 'edit_file'] });
// Compatibility for saved tasks; new tasks declare their own responsibilities and capabilities.
const LEGACY = { explorer: ['read', 'command'], researcher: ['read', 'web'], reviewer: ['read', 'command'], worker: ['read', 'write'] };

export function resolveTaskAgent(input = {}, config = {}) {
  const capabilities = input.capabilities ?? LEGACY[input.profile] ?? ['read'];
  if (!Array.isArray(capabilities) || capabilities.some(name => !Object.hasOwn(swarmCapabilities, name))) throw new Error('未知 Agent 能力');
  if (input.profile && input.capabilities == null && !Object.hasOwn(LEGACY, input.profile)) throw new Error('旧版 Agent 角色无效；请使用 capabilities');
  if (input.role != null && (typeof input.role !== 'string' || input.role.length > 160)) throw new Error('Agent 职责不超过 160 字符');
  const options = config.agent?.subagents || {};
  const legacy = input.profile ? options.profiles?.[input.profile] || {} : {};
  return {
    id: 'dynamic', name: input.role?.trim() || input.title || '任务 Agent',
    description: input.role?.trim() || '根据目标、负责范围和验收条件完成工作。',
    capabilities: [...new Set(['read', ...capabilities])], readOnly: !capabilities.includes('write'),
    tools: [...new Set(['read', ...capabilities].flatMap(name => swarmCapabilities[name]))],
    modelId: options.modelId || legacy.modelId,
    maxSteps: normalizeRunLimit(options.maxSteps ?? legacy.maxSteps),
    maxDurationMs: normalizeRunLimit(options.maxDurationMs ?? legacy.maxDurationMs),
    prompt: String(options.prompt || legacy.prompt || '').slice(0, 8000),
  };
}

