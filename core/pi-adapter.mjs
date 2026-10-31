import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createJiti } from 'jiti';
import Ajv from 'ajv';
import { parse as parseYaml } from 'yaml';
import { globSync } from 'tinyglobby';
import { onEvent } from './events.mjs';
import { getWorkspaceRoot } from './paths.mjs';
import { normalizeMcpResult, registerMcpServers } from './mcp.mjs';

const require = createRequire(import.meta.url);
const ajv = new Ajv({ strict: false, allErrors: true });
// pi.events is shared between extensions loaded by this runtime.
const extensionEvents = new EventEmitter();
extensionEvents.setMaxListeners(100);
const sdkFile = fileURLToPath(new URL('./pi-sdk.mjs', import.meta.url));
export class PiCompatibilityError extends Error {
  constructor(api) { super(`pi 适配器暂不支持 ${api}；此插件需要 pi 专用运行时能力`); this.code = 'PI_UNSUPPORTED_API'; }
}
function strictApi(target, prefix) {
  return new Proxy(target, { get(object, key) {
    if (key === 'then' || typeof key === 'symbol') return object[key];
    if (key in object) return object[key];
    throw new PiCompatibilityError(`${prefix}.${key}`);
  } });
}
function resourcePaths(root, entries, kind) {
  const out = [];
  const visit = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name.startsWith('.')) continue;
      const file = path.join(dir, item.name);
      if (isExcluded(file)) continue;
      if (item.isDirectory()) { if (kind !== 'extensions') visit(file); else if (fs.existsSync(path.join(file, 'index.ts'))) out.push(path.join(file, 'index.ts')); else if (fs.existsSync(path.join(file, 'index.js'))) out.push(path.join(file, 'index.js')); }
      else if (kind === 'extensions' ? /\.(ts|mts|js|mjs|cjs)$/.test(item.name) && !/\.d\.ts$/.test(item.name) : kind === 'skills' ? item.name === 'SKILL.md' : item.name.endsWith('.md')) out.push(file);
    }
  };
  const excludes = entries.filter(entry => typeof entry === 'string' && entry.startsWith('!')).map(entry => entry.slice(1));
  const excluded = new Set(globSync(excludes, { cwd: root, onlyFiles: false, followSymbolicLinks: false }).map(file => path.resolve(root, file)));
  const isExcluded = file => [...excluded].some(parent => file === parent || file.startsWith(parent + path.sep));
  const expanded = entries.filter(entry => typeof entry !== 'string' || !entry.startsWith('!')).flatMap(entry => {
    if (typeof entry !== 'string') throw new Error(`pi.${kind} 资源路径必须是字符串`);
    return /[*?!]/.test(entry) ? globSync(entry, { cwd: root, onlyFiles: false, followSymbolicLinks: false }) : [entry];
  });
  for (const entry of expanded) {
    const file = path.resolve(root, entry);
    if (isExcluded(file)) continue;
    const relative = path.relative(fs.realpathSync(root), fs.realpathSync(file));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`pi 资源路径越界：${entry}`);
    if (fs.statSync(file).isDirectory()) visit(file); else out.push(file);
  }
  return [...new Set(out)].filter(file => !isExcluded(file));
}
export function discoverPiPackage(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!manifest.pi && !manifest.keywords?.includes('pi-package') && !fs.existsSync(path.join(root, 'extensions'))) throw new Error('不是 pi 包：需要 pi manifest、pi-package keyword 或 extensions 目录');
  const resources = {};
  for (const kind of ['extensions', 'skills', 'prompts', 'themes']) {
    const entries = manifest.pi?.[kind] ?? (fs.existsSync(path.join(root, kind)) ? [kind] : []);
    if (!Array.isArray(entries)) throw new Error(`pi.${kind} 必须是数组`);
    resources[kind] = kind === 'themes' ? entries : resourcePaths(root, entries, kind);
  }
  return { manifest, ...resources };
}
export async function loadPiPackage(root, host) {
  const resources = discoverPiPackage(root);
  if (resources.themes.length) host.diagnostics?.push('包中的 pi TUI themes 不应用于 MLI 工作台');
  const cleanups = [], pendingTools = [], pendingCommands = [], pendingSkills = [], listeners = new Map();
  let disposed = false;
  const started = new Map();
  const invocation = new AsyncLocalStorage();
  const eventRemovers = new Set();
  const flags = new Map();
  let currentSession, queue = Promise.resolve();
  function boundSession() {
    const session = invocation.getStore()?.session;
    if (!session?.append) throw new PiCompatibilityError('session-bound API outside tool/command/event');
    return session;
  }
  function history(session, branch) {
    const entries = (branch ? session?.chain?.() : session?.entries?.()) || [];
    const calls = new Map();
    const recordedCalls = new Set(entries.filter(entry => entry.type === 'pi_tool_result').map(entry => entry.callId));
    for (const entry of entries) for (const call of entry.toolCalls || []) calls.set(call.id, call.name);
    return entries.flatMap(entry => {
      const base = { id: String(entry.id), parentId: entry.parent == null ? null : String(entry.parent), timestamp: new Date(entry.ts || 0).toISOString() };
      if (entry.type === 'pi_custom' && entry.plugin === host.name) return [{ ...base, type: 'custom', customType: entry.customType, data: structuredClone(entry.data) }];
      if (entry.type === 'message' && entry.role !== 'tool') return [{ ...base, type: 'message', message: { role: entry.role, content: entry.content || entry.text || '', timestamp: entry.ts } }];
      if (entry.type === 'pi_tool_result' && entry.plugin === host.name) return [{ ...base, type: 'message', message: { role: 'toolResult', toolName: entry.toolName, toolCallId: entry.callId, content: structuredClone(entry.content), details: structuredClone(entry.details), isError: entry.isError, timestamp: entry.ts } }];
      if (entry.type === 'message' && entry.role === 'tool' && !recordedCalls.has(entry.toolCallId)) return [{ ...base, type: 'message', message: { role: 'toolResult', toolName: entry.name || calls.get(entry.toolCallId), toolCallId: entry.toolCallId, content: [{ type: 'text', text: entry.content || '' }], details: structuredClone(entry.details), isError: entry.status === 'error', timestamp: entry.ts } }];
      return [];
    });
  }
  async function serialized(ctx, fn) {
    if (invocation.getStore()) return fn();
    if (disposed) throw new Error('pi 插件已卸载');
    const previous = queue; let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try { if (disposed) throw new Error('pi 插件已卸载'); } catch (error) { release(); throw error; }
    try { return await invocation.run(ctx, fn); } finally { release(); }
  }
  async function ensureSession(ctx) {
    if (!ctx?.session?.id) return;
    if (currentSession && currentSession !== ctx.session.id) {
      await dispatch('session_shutdown', { type: 'session_shutdown', reason: 'resume' }, started.get(currentSession));
      currentSession = undefined;
    }
    if (currentSession === ctx.session.id) { started.set(ctx.session.id, ctx); return; }
    const resumed = started.has(ctx.session.id);
    currentSession = ctx.session.id;
    started.set(ctx.session.id, ctx);
    try { await dispatch('session_start', { type: 'session_start', reason: resumed ? 'resume' : 'startup' }, ctx); }
    catch (error) { currentSession = undefined; started.delete(ctx.session.id); throw error; }
  }
  const fail = name => { throw new PiCompatibilityError(name); };
  const context = (ctx = {}) => {
    const ui = strictApi({
      notify: (text, level) => ctx.ui?.notify(text, level),
      confirm: (title, message) => ctx.ui?.confirm([title, message].filter(Boolean).join('\n')) ?? Promise.resolve(false),
      select: (title, choices) => ctx.ui?.select(title, choices) ?? Promise.resolve(null),
      input: (title, placeholder) => ctx.ui?.input(title, placeholder) ?? Promise.resolve(''),
      setStatus: (key, text) => ctx.ui?.set_status(text || ''),
    }, 'ctx.ui');
    return strictApi({
      cwd: getWorkspaceRoot(), hasUI: Boolean(ctx.session?.id), ui, signal: ctx.signal,
      mode: 'web',
      sessionManager: strictApi({
        getSessionId: () => ctx.session?.id,
        getSessionFile: () => ctx.session?.file,
        getSessionName: () => ctx.session?.title,
        getCwd: () => getWorkspaceRoot(),
        getEntries: () => history(ctx.session, false), getBranch: () => history(ctx.session, true),
        getLeafId: () => ctx.session?.leaf == null ? null : String(ctx.session.leaf),
      }, 'ctx.sessionManager'),
      tools: host.getTools?.() || [],
      executeTool: async (name, args) => {
        const result = await host.callTool(name, args, ctx);
        return { content: result.mcpContent || [{ type: 'text', text: typeof result.content === 'string' ? result.content : JSON.stringify(result.content) }], details: result.details, isError: result.status === 'error' };
      },
    }, 'ctx');
  };
  async function dispatch(type, event, ctx) {
    let result;
    for (const handler of listeners.get(type) || []) {
      const next = await invocation.run(ctx, () => handler(event, context(ctx)));
      if (next !== undefined) result = next;
      if (result?.block) break;
    }
    return result;
  }
  const supportedEvents = new Set(['tool_call', 'tool_result', 'session_start', 'session_shutdown', 'agent_start', 'agent_end', 'turn_start', 'turn_end', 'session_tree']);
  const api = strictApi({
    registerTool(def) {
      if (!def?.name || typeof def.execute !== 'function') throw new Error('pi.registerTool 需要 name/execute');
      const validate = ajv.compile(def.parameters || { type: 'object' });
      const validateOutput = def.outputSchema ? ajv.compile(def.outputSchema) : null;
      if (def.renderCall || def.renderResult) host.diagnostics?.push(`${def.name} 使用 MLI 默认工具渲染，保留 pi 业务执行`);
      pendingTools.push({
        name: def.name, description: [def.description || def.label || def.name, def.promptSnippet, ...(def.promptGuidelines || [])].filter(Boolean).join('\n'),
        parameters: def.parameters, permission: 'L2', pi: true,
        async run(args, ctx) { return serialized(ctx, async () => {
          if (disposed) throw new Error('pi 插件已卸载');
          await ensureSession(ctx);
          if (!validate(args)) throw new Error(`pi 工具参数错误：${ajv.errorsText(validate.errors)}`);
          const id = ctx.callId || crypto.randomUUID();
          const update = result => ctx.emit?.('tool_update', { callId: id, name: def.name, ...normalizeMcpResult(result || {}) });
          const result = await def.execute(id, args, ctx.signal, update, context(ctx));
          if (validateOutput && !validateOutput(result?.structuredContent)) throw new Error(`pi 工具输出不符合 outputSchema：${ajv.errorsText(validateOutput.errors)}`);
          if (ctx.session?.append) ctx.session.append({ type: 'pi_tool_result', plugin: host.name, toolName: def.name, callId: id, content: structuredClone(result?.content || []), details: structuredClone(result?.details), isError: Boolean(result?.isError) });
          return { ...normalizeMcpResult(result || {}), details: result?.details };
        }); },
      });
    },
    registerCommand(name, spec) {
      if (typeof spec?.handler !== 'function') throw new Error('pi 命令缺少 handler');
      pendingCommands.push({ name, description: spec.description, permission: 'L2', handler: async (args, ctx) => serialized(ctx, async () => { await ensureSession(ctx); return invocation.run(ctx, () => spec.handler(args, context(ctx))); }) });
    },
    on(type, handler) {
      if (!supportedEvents.has(type)) fail(`pi.on(${type})`);
      if (typeof handler !== 'function') throw new Error('pi.on 需要 handler');
      const list = listeners.get(type) || []; list.push(handler); listeners.set(type, list);
      return () => { const index = list.indexOf(handler); if (index >= 0) list.splice(index, 1); };
    },
    events: {
      on(name, fn) {
        if (disposed) throw new Error('pi 插件已卸载');
        extensionEvents.on(name, fn);
        const remove = () => { extensionEvents.off(name, fn); eventRemovers.delete(remove); };
        eventRemovers.add(remove); return remove;
      },
      emit: (name, data) => { if (disposed) throw new Error('pi 插件已卸载'); return extensionEvents.emit(name, data); },
    },
    registerFlag(name, spec) { if (!['boolean', 'string'].includes(spec.type)) fail('pi.registerFlag type'); flags.set(name, spec.default); },
    getFlag: name => flags.get(name),
    appendEntry(customType, data) {
      if (typeof customType !== 'string' || !customType) throw new Error('appendEntry 需要 customType');
      boundSession().append({ type: 'pi_custom', plugin: host.name, customType, data: structuredClone(data) });
    },
    getAllTools: () => host.getTools().map(t => ({ name: t.name, description: t.description, parameters: t.parameters })),
    getActiveTools: () => host.getTools().map(t => t.name),
    registerMcpServer(name, config) {
      const unregister = registerMcpServers(`pi:${host.name}:${name}`, [{ ...config, name, cwd: config.cwd ? path.resolve(root, config.cwd) : root }]);
      cleanups.push(unregister); return unregister;
    },
  }, 'pi');
  const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false, alias: {
    '@mariozechner/pi-coding-agent': sdkFile, '@earendil-works/pi-coding-agent': sdkFile,
    '@earendil-works/pi-ai': fileURLToPath(new URL('./pi-ai-sdk.mjs', import.meta.url)), '@mariozechner/pi-ai': fileURLToPath(new URL('./pi-ai-sdk.mjs', import.meta.url)),
    '@earendil-works/pi-tui': require.resolve('@earendil-works/pi-tui'), '@mariozechner/pi-tui': require.resolve('@earendil-works/pi-tui'),
    '@sinclair/typebox': require.resolve('@sinclair/typebox'), typebox: require.resolve('typebox'),
  } });
  try {
    for (const file of resources.extensions) {
      const mod = await jiti.import(file); const setup = mod.default || mod;
      if (typeof setup !== 'function') throw new Error(`pi 扩展没有默认导出函数：${path.basename(file)}`);
      await setup(api);
    }
    for (const file of resources.skills) {
      const text = fs.readFileSync(file, 'utf8'); const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      const meta = match ? parseYaml(match[1]) : {};
      pendingSkills.push({ name: meta?.name || path.basename(path.dirname(file)), description: meta?.description || '', path: file, source: 'plugin', plugin: host.name });
    }
    for (const file of resources.prompts) {
      const text = fs.readFileSync(file, 'utf8');
      pendingCommands.push({ name: path.basename(file, '.md'), template: text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').replaceAll('$ARGUMENTS', '{{args}}') });
    }
    for (const tool of pendingTools) host.registerTool(tool);
    for (const cmd of pendingCommands) host.registerCommand(cmd.name, cmd);
    host.addSkills(pendingSkills);
    if (listeners.has('session_start') || listeners.has('tool_call')) host.on('authorize_tool_call', async ({ tool, args, session }) => {
      const hookCtx = { session, ui: host.makeUi(session) };
      return serialized(hookCtx, async () => {
        await ensureSession(hookCtx);
        const result = await dispatch('tool_call', { type: 'tool_call', toolName: tool.name, input: args }, hookCtx);
        return result?.block ? false : undefined;
      });
    });
    if (listeners.has('tool_result')) host.on('process_tool_result', async ({ tool, args, result, session, signal }) => {
      const resultCtx = { session, signal, ui: host.makeUi(session) };
      return serialized(resultCtx, async () => {
      await ensureSession(resultCtx);
      const changed = await dispatch('tool_result', { type: 'tool_result', toolName: tool.name, input: args, content: [{ type: 'text', text: result.content || '' }], details: result.details, isError: result.status === 'error' }, { session, signal, ui: host.makeUi(session) });
      return changed ? { ...result, ...normalizeMcpResult({ ...changed, isError: result.status === 'error' || changed.isError }), details: changed.details ?? result.details } : result;
      });
    });
    const unsubscribe = onEvent(event => {
      if (disposed || !event.sessionId) return;
      const type = { turn_start: 'agent_start', turn_end: 'agent_end', step_start: 'turn_start', step_end: 'turn_end' }[event.type];
      if (!type || !listeners.has(type)) return;
      const ctx = started.get(event.sessionId);
      if (ctx) void serialized(ctx, async () => { await ensureSession(ctx); return dispatch(type, { ...event, type }, ctx); }).catch(error => console.error(`[pi:${host.name}] ${error.message}`));
    });
    host.registerCleanup(async () => {
      await queue; disposed = true; unsubscribe(); for (const remove of [...eventRemovers]) remove();
      try { const ctx = started.get(currentSession); if (ctx) await dispatch('session_shutdown', { type: 'session_shutdown', reason: 'reload' }, ctx); }
      finally { for (const cleanup of cleanups.reverse()) await cleanup(); started.clear(); }
    });
    return { extensions: resources.extensions.length, tools: pendingTools.length, skills: pendingSkills.length };
  } catch (error) { disposed = true; for (const remove of [...eventRemovers]) remove(); for (const cleanup of cleanups.reverse()) await cleanup(); throw error; }
}
