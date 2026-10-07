import { normalizeRunLimit } from './run-control.mjs';

const READ = ['read_file', 'read_attachment', 'read_tool_output', 'find', 'grep', 'read_skill', 'list_memories', 'read_memory', 'search_memories', 'search_history', 'agent_send', 'agent_inspect'];
const BUILTINS = {
  explorer: { name: '代码探索', delegationHint: '跨模块定位、追踪调用链或大量搜索时主动使用；按模块或问题拆分探索范围。', description: '只读探索代码与文件，返回文件位置和证据。', tools: [...READ, 'bash'], readOnly: true },
  researcher: { name: '资料研究', delegationHint: '需要多个独立来源、方案或接口文档时使用；每个任务给出来源边界。', description: '检索资料和网页，返回来源及可验证结论。', tools: [...READ, 'web_fetch'], readOnly: true },
  reviewer: { name: '审查', delegationHint: '重要实现完成且文件稳定后，主动做独立审查，重点检查异常路径和遗漏的验收项。', description: '只读检查正确性、风险和验证缺口，附证据。', tools: [...READ, 'bash'], readOnly: true },
  worker: { name: '实现', delegationHint: '目标和文件范围已确定、适合独立交付文件修改时使用；本角色不执行 shell、MCP 或桌面操作。', description: '负责指定文件的修改；共享目录同时只有一个写入者。', tools: [...READ, 'write_file', 'edit_file'], readOnly: false },
};

export function agentProfiles(config = {}) {
  return Object.entries(BUILTINS).map(([id, profile]) => {
    const override = config.agent?.subagents?.profiles?.[id] || {};
    // Configuration can select models and tighten budgets, but cannot expand capabilities.
    return { ...profile, id, modelId: override.modelId, maxSteps: normalizeRunLimit(override.maxSteps), maxDurationMs: normalizeRunLimit(override.maxDurationMs), prompt: String(override.prompt || '').slice(0, 8000) };
  });
}
