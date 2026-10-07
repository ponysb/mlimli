import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { assertMemoryTool } from './memory-policy.mjs';

const runs = new AsyncLocalStorage();
export function getRunContext() { return runs.getStore(); }
export function withRunContext(context, fn) { return runs.run(context, fn); }

export function executionEnvironment(value) {
  if (!value || typeof value !== 'object') return undefined;
  const clean = { type: ['host', 'container', 'browser', 'desktop', 'remote'].includes(value.type) ? value.type : 'remote' };
  for (const key of ['id', 'platform', 'cwd', 'network', 'description']) if (typeof value[key] === 'string') clean[key] = value[key].replace(/[\r\n]/g, ' ').slice(0, 500);
  if (Array.isArray(value.runtimes)) clean.runtimes = Object.freeze(value.runtimes.filter(item => typeof item === 'string').slice(0, 16).map(item => item.replace(/[\r\n]/g, ' ').slice(0, 80)));
  return Object.freeze(clean);
}

export function createRunContext({ session, executionRoot, modelSelection, config = {}, ...options }) {
  const storageRoot = path.resolve(path.dirname(session.file), '..', '..');
  return Object.freeze({
    agentId: session.id, rootSessionId: session.rootSessionId || session.id,
    sessionStorageRoot: storageRoot, executionRoot: path.resolve(executionRoot || storageRoot),
    modelSelection, config: structuredClone(config), ...options,
    executionEnvironment: executionEnvironment(options.executionEnvironment),
  });
}

export function assertAgentTool(tool, args = {}) {
  assertMemoryTool(tool.name);
  const context = getRunContext();
  if (context?.allowedTools && !context.allowedTools.includes(tool.name)) throw new Error(`当前 Agent 无权调用 ${tool.name}`);
  if (context?.readOnly && tool.permission === 'L1') throw new Error('只读 Agent 禁止修改文件');
  if (context?.readOnly && tool.name === 'app_action') throw new Error('只读 Agent 禁止修改应用页面或外发操作');
  if (context?.readOnly && tool.name.startsWith('mcp_')) throw new Error('只读 Agent 未开放通用 MCP 执行代理');
  context?.assertResource?.(tool, args);
}
