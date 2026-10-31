// core/plugins.mjs —— 插件系统：manifest + 动态 import + ctx 注册 + 钩子 + 技能扫描
// 插件目录：plugins/<name>/plugin.json + plugin.mjs（默认导出 setup(ctx) 或 {setup}）+ skills/*.md
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import * as moduleRuntime from 'node:module';
import { emit, onEvent } from './events.mjs';
import { agentTools } from './agent-tools.mjs';
import { appCenterTools } from './app-center-tools.mjs';
import { getRunContext, assertAgentTool } from './run-context.mjs';
import { APP_ROOT, DATA_ROOT, USER_PLUGINS_DIR } from './paths.mjs';
import { coreTools } from './tools.mjs';
import { filmCanvasTools } from './film-canvas-tools.mjs';
import { memoryToolEnabled } from './memory-policy.mjs';
import { authorize } from './permissions.mjs';
import { pluginMcpServers } from './mcp.mjs';
import { mcpTool } from './mcp.mjs';
import { getConfig } from './llm.mjs';
import { getWorkspaceRoot } from './paths.mjs';
import { listLocalSkills } from './local-skills.mjs';
import { registerLanguageServer, resetLanguageServers } from './lsp.mjs';
import { registerChannelAdapter } from './channels.mjs';
import { getSandboxPolicy, withSandboxPolicy, SandboxError } from './sandbox-policy.mjs';

export const PLUGINS_DIR = path.join(APP_ROOT, 'plugins');
if (DATA_ROOT !== APP_ROOT && moduleRuntime.register) moduleRuntime.register('./plugin-resolver.mjs', import.meta.url, { data: { appRoot: APP_ROOT, dataRoot: DATA_ROOT, pluginsRoot: USER_PLUGINS_DIR } });

const state = {
  tools: new Map(),
  commands: new Map(), // '/report' → {description, template, plugin}
  hooks: { authorize_tool_call: [], process_tool_result: [], on_event: [] },
  cleanups: new Set(),
  skills: [],
  loaded: [],
  errors: [],
};

const uiPending = new Map();
let platformSkills = [];
// scopeType 由服务端下发：official 为官方 Skill，enterprise 为企业自建 Skill。
export function setPlatformSkills(items) {
  platformSkills = items.filter((item) => item.kind === 'skill').map((item) => {
    const scopeType = item.scopeType === 'enterprise' ? 'enterprise' : 'official';
    return {
      name: item.name,
      coverUrl: item.coverUrl || null,
      category: item.category || '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      description: item.description || (scopeType === 'enterprise' ? '企业 Skill' : '平台 Skill'),
      content: item.content,
      path: `platform:${item.id}`,
      source: 'platform',
      scopeType,
      scopeId: scopeType === 'enterprise' ? (item.scopeId || null) : null
    };
  });
}

const UI_DEFAULTS = {
  confirm: false,
  select: null,
  input: '',
  present: true,
  choose: null,
};

/** 插件在工具执行中向用户提问（走 ui_request 事件 → UI 弹窗 → POST /ui/:reqId） */
export async function uiRequest(session, kind, payload, timeoutMs = 120000, signal) {
  signal?.throwIfAborted();
  if (!session?.id) return UI_DEFAULTS[kind] ?? null;
  const reqId = crypto.randomUUID().slice(0, 12);
  return new Promise((resolve) => {
    const finish = value => { signal?.removeEventListener('abort', abort); resolve(value); };
    const abort = () => {
      const pending = uiPending.get(reqId);
      if (!pending) return;
      clearTimeout(pending.timer); uiPending.delete(reqId);
      emit('ui_resolved', { sessionId: session.id, reqId });
      finish(UI_DEFAULTS[kind] ?? null);
    };
    const timer = setTimeout(() => {
      uiPending.delete(reqId);
      emit('ui_resolved', { sessionId: session.id, reqId });
      finish(UI_DEFAULTS[kind] ?? null);
    }, timeoutMs);
    const request = { ...payload, reqId, kind, sessionId: session.id, rootSessionId: getRunContext()?.rootSessionId };
    uiPending.set(reqId, { resolve: finish, timer, sessionId: session.id, request });
    signal?.addEventListener('abort', abort, { once: true });
    emit('ui_request', { sessionId: session.id, request });
  });
}

export function pendingUiRequests(sessionId) {
  return [...uiPending.values()].filter(item => item.sessionId === sessionId).map(item => item.request);
}

export function cancelUiRequests(sessionId) {
  for (const [id, item] of uiPending) {
    if (sessionId && item.sessionId !== sessionId) continue;
    clearTimeout(item.timer);
    uiPending.delete(id);
    emit('ui_resolved', { sessionId: item.sessionId, reqId: id });
    item.resolve(UI_DEFAULTS[item.request.kind] ?? null);
  }
}

export function requestPluginUi(session, kind, payload, timeoutMs = 120000) {
  return uiRequest(session, kind, payload, timeoutMs);
}

export function resolveUiRequest(reqId, value, sessionId) {
  const p = uiPending.get(reqId);
  if (!p || (sessionId && p.sessionId !== sessionId)) return false;
  clearTimeout(p.timer);
  uiPending.delete(reqId);
  emit('ui_resolved', { sessionId: p.sessionId, reqId });
  p.resolve(value);
  return true;
}

function makeUi(session) {
  return {
    confirm: (text) => uiRequest(session, 'confirm', { text }),
    select: (text, options) => uiRequest(session, 'select', { text, options }),
    choose: (text, options) => uiRequest(session, 'choose', { text, options }),
    input: (text, placeholder) => uiRequest(session, 'input', { text, placeholder }),
    present: (title, body) => uiRequest(session, 'present', { title, text: body ?? title }),
    set_status: (text) => { emit('status', { sessionId: session?.id, text: String(text ?? '') }); return true; },
    notify: (text, level = 'info') => { emit('notify', { sessionId: session?.id, text: String(text ?? ''), level }); return true; },
  };
}

function parseFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) { const pair = /^(\w[\w-]*):\s*(.+)$/.exec(line.trim()); if (pair) meta[pair[1]] = pair[2].trim(); }
  return { meta, body: m ? md.slice(m[0].length) : md };
}

function scanSkills(pluginDir, pluginName) {
  const dir = path.join(pluginDir, 'skills');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const visit = (current) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const p = path.join(current, item.name);
      if (item.isDirectory()) visit(p);
      else if (item.isFile() && (item.name === 'SKILL.md' || (current === dir && item.name.endsWith('.md')))) {
        const { meta } = parseFrontmatter(fs.readFileSync(p, 'utf8'));
        out.push({ name: meta.name ?? path.basename(path.dirname(p)), description: meta.description ?? `${pluginName} 插件技能`, path: p, source: 'plugin', plugin: pluginName });
      }
    }
  };
  visit(dir);
  return out;
}

function pluginManifestFile(pluginDir) {
  const codexManifest = path.join(pluginDir, '.codex-plugin', 'plugin.json');
  const legacyManifest = path.join(pluginDir, 'plugin.json');
  if (fs.existsSync(codexManifest)) return codexManifest;
  if (fs.existsSync(legacyManifest)) return legacyManifest;
  return null;
}

function scanWorkspaceSkills() {
  const roots = ['.agent/skills', '.agents/skills', 'skills'].map((entry) => path.join(getWorkspaceRoot(), entry));
  const out = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const visit = (dir, depth = 0) => {
      if (depth > 4) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) visit(file, depth + 1);
        else if (item.isFile() && (item.name === 'SKILL.md' || (depth === 0 && item.name.endsWith('.md')))) {
          const { meta } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
          out.push({ name: meta.name ?? path.basename(path.dirname(file)), description: meta.description ?? '项目技能', path: file, source: 'workspace' });
        }
      }
    };
    visit(root);
  }
  return out;
}

function registerToolDef(def, pluginName, manifest) {
  const run = def.run ?? def.execute;
  if (!def?.name || typeof run !== 'function') throw new Error('registerTool 需要 {name, run|execute}');
  const permission = def.permission ?? 'L0';
  const caps = manifest?.capabilities ?? manifest?.interface?.capabilities ?? [];
  if (permission === 'L3' && def.capability === 'desktop' && !caps.includes('desktop')) {
    throw new Error(`L3 桌面工具 ${def.name} 需要 manifest 声明 capabilities:["desktop"]`);
  }
  if (permission === 'L3' && ['desktop', 'computer-use'].includes(pluginName) && !caps.includes('desktop')) {
    throw new Error(`L3 工具 ${def.name} 需要 manifest 声明 capabilities:["desktop"]`);
  }
  const previous = state.tools.get(def.name);
  if (previous) throw new Error(`工具名称冲突 ${def.name}（已有 ${previous.plugin}，新插件 ${pluginName}）`);
  state.tools.set(def.name, {
    ...def,
    run,
    permission,
    plugin: pluginName,
    capability: def.capability ?? (['desktop', 'computer-use'].includes(pluginName) ? 'desktop' : undefined),
  });
  if (def.name === 'bash' && pluginName === 'core') Object.defineProperty(state.tools.get(def.name), 'description', { enumerable: true, configurable: true, get: () => def.description });
}

function makeSetupCtx(manifest) {
  return {
    pluginName: manifest.name,
    log: (...a) => console.log(`[plugin:${manifest.name}]`, ...a),
    ui: makeUi(null),
    requestUi: (session, kind, payload, timeoutMs) => uiRequest(session, kind, payload, timeoutMs),
    registerTool(def) { registerToolDef(def, manifest.name, manifest); },
    registerLanguageServer(def) { registerLanguageServer(def); },
    registerChannelAdapter(def) { return registerChannelAdapter(def); },
    registerCleanup(fn) {
      if (typeof fn !== 'function') throw new Error('registerCleanup 需要函数');
      state.cleanups.add(fn);
    },
    registerCommand(name, spec) {
      const key = name.startsWith('/') ? name : `/${name}`;
      if (state.commands.has(key)) throw new Error(`命令名称冲突 ${key}`);
      state.commands.set(key, { ...spec, plugin: manifest.name, name: key });
    },
    on(hook, fn) {
      if (!state.hooks[hook]) throw new Error(`未知钩子：${hook}`);
      state.hooks[hook].push(fn);
      if (hook === 'on_event') state.cleanups.add(onEvent(event => { Promise.resolve().then(() => fn(event)).catch(error => console.error(`[plugins] event hook: ${error.message}`)); }));
    },
    APP_ROOT,
  };
}

export async function disposePlugins() {
  const cleanups = [...state.cleanups].reverse();
  state.cleanups.clear();
  for (const cleanup of cleanups) {
    try { await cleanup(); } catch (error) { console.error(`[plugins] 清理失败：${error.message}`); }
  }
  resetLanguageServers();
}

async function importPlugin(entryFile, bust) {
  const url = pathToFileURL(entryFile);
  const href = bust ? `${url.href}?t=${bust}` : url.href;
  const mod = await import(href);
  return mod.default ?? mod;
}

function registerCore() {
  for (const t of [...coreTools, ...appCenterTools]) {
    registerToolDef({ ...t, plugin: 'core' }, 'core', { name: 'core', capabilities: [] });
  }
  registerToolDef(mcpTool(getConfig), 'core', { name: 'core', capabilities: [] });
  registerToolDef({
    name: 'read_skill',
    description: '按技能名称读取完整 Skill 指南。遇到与技能目录匹配的任务时，应先调用此工具再执行。',
    parameters: { type: 'object', properties: { name: { type: 'string', description: '技能名称' } }, required: ['name'] },
    permission: 'L0',
    async run({ name }) {
      const skill = getSkills().find((item) => item.name.toLowerCase() === String(name).trim().toLowerCase());
      if (!skill) throw new Error(`未找到 Skill：${name}`);
      const text = skill.content ?? fs.readFileSync(skill.path, 'utf8');
      return { content: `[Skill: ${skill.name}]\n${text.slice(0, 30000)}`, ui: { kind: 'skill', name: skill.name, description: skill.description } };
    },
  }, 'core', { name: 'core', capabilities: [] });
  state.commands.set('/help', {
    name: '/help',
    description: '列出斜杠命令',
    builtin: true,
    template: '__help__',
  });
}

/** 加载（或热重载）全部插件 */
export async function loadAll({ reload = false } = {}) {
  await disposePlugins();
  const bust = reload ? Date.now() : null;
  state.tools.clear();
  state.commands.clear();
  state.hooks = { authorize_tool_call: [], process_tool_result: [], on_event: [] };
  state.cleanups = new Set();
  state.skills = [];
  state.loaded = [];
  state.errors = [];
  registerCore();
  for (const tool of agentTools) state.tools.set(tool.name, { ...tool, plugin: 'core' });
  for (const tool of filmCanvasTools) state.tools.set(tool.name, { ...tool, plugin: 'core' });

  const directories = new Map();
  for (const root of new Set([PLUGINS_DIR, USER_PLUGINS_DIR])) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      if (fs.statSync(dir).isDirectory() && pluginManifestFile(dir)) directories.set(name, dir);
    }
  }
  for (const [name, dir] of directories) {
    const manifestFile = pluginManifestFile(dir);
    const entryFile = path.join(dir, 'plugin.mjs');
    if (!manifestFile) continue;
    const before = { tools: new Map(state.tools), commands: new Map(state.commands), hooks: Object.fromEntries(Object.entries(state.hooks).map(([key, list]) => [key, [...list]])), cleanups: new Set(state.cleanups), skills: [...state.skills] };
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (process.platform !== 'win32' && manifest.permissions?.includes('desktop')) continue;
      if (fs.existsSync(entryFile)) {
        const exported = await importPlugin(entryFile, bust);
        const setup = typeof exported === 'function' ? exported : exported?.setup;
        if (typeof setup !== 'function') throw new Error('插件需默认导出 setup(ctx) 或 { setup }');
        await setup(makeSetupCtx(manifest));
      }
      state.cleanups.add(pluginMcpServers(dir, manifest.name));
      state.skills.push(...scanSkills(dir, manifest.name));
      state.loaded.push({
        name: manifest.name,
        displayName: manifest.displayName || manifest.name,
        version: manifest.version ?? '0.0.0',
        description: manifest.description ?? '',
        tools: [...state.tools.values()].filter((t) => t.plugin === manifest.name).map((t) => t.name),
      });
      console.log(`[plugins] 已加载 ${manifest.name}${reload ? '（热重载）' : ''}：${state.loaded.at(-1).tools.join(', ') || '无工具'}`);
    } catch (err) {
      for (const cleanup of [...state.cleanups].filter(fn => !before.cleanups.has(fn)).reverse()) { try { await cleanup(); } catch {} }
      Object.assign(state, before);
      state.errors.push({ name, status: 'failed', error: err.message });
      console.error(`[plugins] 加载 ${name} 失败：${err.message}`);
    }
  }
  const piRoot = path.join(DATA_ROOT, 'pi-packages');
  if (fs.existsSync(piRoot)) for (const entry of fs.readdirSync(piRoot)) {
    const dir = path.join(piRoot, entry);
    if (entry.startsWith('.') || !fs.existsSync(path.join(dir, 'mli-pi.json'))) continue;
    const before = { tools: new Map(state.tools), commands: new Map(state.commands), hooks: Object.fromEntries(Object.entries(state.hooks).map(([key, list]) => [key, [...list]])), cleanups: new Set(state.cleanups), skills: [...state.skills] };
    try {
      const record = JSON.parse(fs.readFileSync(path.join(dir, 'mli-pi.json'), 'utf8'));
      const packageRoot = path.resolve(dir, record.packageRoot);
      if (!packageRoot.startsWith(dir + path.sep)) throw new Error('pi 包入口越界');
      const manifest = { name: `pi:${record.name}`, capabilities: [] };
      const ctx = makeSetupCtx(manifest), diagnostics = [];
      const { loadPiPackage } = await import('./pi-adapter.mjs');
      const details = await loadPiPackage(packageRoot, { ...ctx, name: manifest.name, diagnostics, getTools,
        makeUi, addSkills: skills => state.skills.push(...skills),
        callTool: (name, args, context) => invokeTool(name, args, context),
      });
      state.loaded.push({ name: manifest.name, version: record.version, source: record.source, adapter: 'pi', status: 'active', extensions: details.extensions, toolsCount: details.tools, skillsCount: details.skills, diagnostics, tools: [...state.tools.values()].filter(t => t.plugin === manifest.name).map(t => t.name) });
    } catch (error) {
      for (const cleanup of [...state.cleanups].filter(fn => !before.cleanups.has(fn)).reverse()) { try { await cleanup(); } catch {} }
      Object.assign(state, before);
      state.errors.push({ name: entry, adapter: 'pi', status: 'failed', error: error.message });
    }
  }
  return summary();
}

function summary() {
  return {
    tools: [...state.tools.keys()],
    skills: getSkills().map((s) => ({ name: s.name, description: s.description, path: s.path, content: s.source === 'platform' ? s.content : undefined, source: s.source || 'plugin', plugin: s.plugin })),
    commands: [...state.commands.values()].map((c) => ({ name: c.name, description: c.description ?? '', plugin: c.plugin })),
    plugins: state.loaded,
    errors: state.errors,
  };
}

export function getTools(session) {
  const all = [...state.tools.values()].filter(t => memoryToolEnabled(t.name));
  if (!session) return all;
  return all.filter((t) => {
    if (!memoryToolEnabled(t.name)) return false;
    const context = getRunContext();
    if (context?.config?.agent?.subagents?.enabled === false && t.name.startsWith('agent_')) return false;
    if (context?.allowedTools && !context.allowedTools.includes(t.name)) return false;
    if (t.capability === 'desktop' && context?.desktopTaskExplicit === false) return false;
    if (t.capability === 'desktop' && !session.desktopEnabled) return false;
    return true;
  });
}
export function getTool(name) { return state.tools.get(name); }
export function getSkills() {
  const merged = [...listLocalSkills(), ...platformSkills, ...state.skills, ...scanWorkspaceSkills()];
  return merged.filter((item, index) => merged.findIndex((other) => other.name.toLowerCase() === item.name.toLowerCase()) === index);
}
export function getHooks() { return state.hooks; }
export function getCommands() { return [...state.commands.values()]; }
export function getCommand(name) {
  const key = name.startsWith('/') ? name : `/${name}`;
  return state.commands.get(key);
}
export function pluginsInfo() { return summary(); }

export function expandSlash(text) {
  if (!text.startsWith('/')) return { kind: 'plain', text };
  const m = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!m) return { kind: 'plain', text };
  const cmd = getCommand(m[1]);
  if (!cmd) return { kind: 'plain', text };
  const args = (m[2] ?? '').trim();
  if (cmd.template === '__help__') {
    const lines = getCommands().map((c) => `${c.name}  ${c.description || ''}`).join('\n');
    return { kind: 'help', text: `可用斜杠命令：\n${lines}` };
  }
  if (typeof cmd.handler === 'function') return { kind: 'handler', command: cmd.name, args };
  const tpl = typeof cmd.template === 'function' ? cmd.template(args) : String(cmd.template ?? cmd.prompt ?? '');
  return { kind: 'expand', text: tpl.replace(/\{\{args\}\}/g, args), command: cmd.name };
}

/** 执行工具的统一入口（含超时与信号） */
export async function executeTool(tool, args, { session, signal, timeoutMs, depth = 0, callId }) {
  if (signal?.aborted) throw new Error('任务已停止');
  const executionLease = getRunContext()?.assertExecutionLease;
  if (executionLease) {
    await executionLease();
    if (signal?.aborted) throw new Error('任务已停止');
  }
  assertAgentTool(tool, args);
  const sandboxPolicy = getSandboxPolicy();
  if (sandboxPolicy.mode === 'read-only' && (tool.pi || tool.name === 'mcp')) throw new SandboxError('只读沙箱禁止通用插件或 MCP 执行');
  if (sandboxPolicy.mode === 'read-only' && tool.permission === 'L1') throw new SandboxError('只读沙箱禁止工作区写入；审批允许不会扩大沙箱权限');
  const ctx = {
    depth, callId,
    signal,
    session,
    timeoutMs,
    bashTimeoutMs: timeoutMs,
    emit: (type, data) => emit(type, { sessionId: session?.id, ...data }),
    ui: makeUi(session),
  };
  const releaseResource = getRunContext()?.acquireResource?.(tool) || (() => {});
  const ac = new AbortController();
  const isCoreBash = (tool.name === 'bash' || tool.managesTimeout === true) && tool.plugin === 'core';
  let rejectAbort;
  const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => { ac.abort(); if (!isCoreBash) rejectAbort(new Error('任务已停止')); };
  signal?.addEventListener('abort', onAbort);
  let timer, resourceDeferred = false;
  try {
    const run = tool.run ?? tool.execute;
    // bash owns its timeout and awaits process/container teardown. A Promise
    // race here would report cancellation while its process was still alive.
    const runPromise = Promise.resolve(withSandboxPolicy(sandboxPolicy, () => run(args ?? {}, { ...ctx, signal: ac.signal })));
    // A plugin may ignore cancellation. Keep its lease until the actual work ends.
    runPromise.then(releaseResource, releaseResource);
    resourceDeferred = true;
    const result = isCoreBash ? await runPromise : await Promise.race([
      cancelled,
      runPromise,
      new Promise((_, rej) => {
        timer = setTimeout(() => {
          ac.abort();
          rej(new Error(`工具 ${tool.name} 超时（${timeoutMs}ms）`));
        }, (tool.name === 'mcp' ? Math.max(timeoutMs ?? 60000, 240000) : (timeoutMs ?? 60000)) + 5000);
      }),
    ]);
    if (tool.permission === 'L1' && args?.path && result?.status !== 'error') getRunContext()?.changedPaths?.add(String(args.path).replaceAll('\\', '/'));
    if (typeof result === 'string') return { content: result };
    return result ?? { content: '(无结果)' };
  } finally {
    clearTimeout(timer);
    if (!resourceDeferred) releaseResource();
    signal?.removeEventListener('abort', onAbort);
  }
}

/** A nested/management caller must never dispatch a plugin tool directly. */
export async function invokeTool(name, args, options = {}) {
  const tool = getTool(name);
  if (!tool) throw new Error(`未知工具 ${name}`);
  const depth = options.depth || 0;
  if (depth > 8) throw new Error('插件工具嵌套超过上限');
  for (const hook of getHooks().authorize_tool_call) if (await hook({ session: options.session, tool, args, name }) === false) throw new Error('被插件授权钩子拒绝');
  const decision = await authorize({ session: options.session, tool, args, timeoutMs: options.timeoutMs });
  if (!decision.ok) { const error = new Error(decision.reason || '工具权限拒绝'); error.code = 'PLUGIN_PERMISSION_DENIED'; throw error; }
  let result = await executeTool(tool, args, { ...options, depth: depth + 1 });
  for (const hook of getHooks().process_tool_result) result = (await hook({ session: options.session, tool, args, result, signal: options.signal })) ?? result;
  return result;
}
export async function executeSlashCommand(slash, session) {
  const cmd = getCommand(slash.command);
  if (!cmd?.handler) throw new Error('命令不存在');
  const tool = { name: `command:${cmd.name}`, plugin: cmd.plugin, permission: cmd.permission || 'L2', run: async (_args, ctx) => ({ content: (await cmd.handler(slash.args, ctx)) || '命令已执行' }) };
  const decision = await authorize({ session, tool, args: { arguments: slash.args } });
  if (!decision.ok) throw new Error(decision.reason || '命令权限拒绝');
  return executeTool(tool, {}, { session, timeoutMs: 60000 });
}
