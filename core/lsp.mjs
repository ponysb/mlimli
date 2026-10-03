// core/lsp.mjs - shared LSP client/runtime used by language-pack plugins.
// Language packs only describe how to find and install a server; this module
// owns JSON-RPC, document synchronization, diagnostics, and process cleanup.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DATA_ROOT, getWorkspaceRoot } from './paths.mjs';
import { stopProcessTree } from './process-tree.mjs';

const INITIALIZE_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 5000;
const DIAGNOSTICS_TIMEOUT_MS = 3000;
const MAX_DIAGNOSTICS = 20;
const activeInstallers = new Set();

function normalize(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isInside(file, root) {
  const target = normalize(file);
  const base = normalize(root);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function fileUri(file) {
  return pathToFileURL(path.resolve(file)).href;
}

function endPosition(text) {
  const lines = String(text).split(/\r\n|\r|\n/);
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}

function executableCandidates(name, roots = [], cacheDir) {
  const value = String(name || '').trim();
  if (!value) return [];
  const out = [];
  const direct = path.isAbsolute(value) || value.includes('/') || value.includes('\\');
  if (direct) out.push(value);
  for (const root of [cacheDir, ...roots].filter(Boolean)) {
    const binDir = path.join(root, 'node_modules', '.bin');
    out.push(path.join(binDir, value));
    if (process.platform === 'win32') out.push(path.join(binDir, `${value}.cmd`));
    out.push(path.join(root, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', value));
  }
  return [...new Set(out)];
}

/** Find a project-local, cached, or PATH executable without throwing. */
export function findExecutable(name, { roots = [], cacheDir } = {}) {
  for (const candidate of executableCandidates(name, roots, cacheDir)) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch { /* try the next location */ }
  }
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const result = spawnSync(lookup, [name], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    if (result.status === 0) {
      const first = String(result.stdout || '').split(/\r?\n/).map((item) => item.trim()).find(Boolean);
      if (first) return first;
    }
  } catch { /* executable lookup is best effort */ }
  return undefined;
}

export function nodePackageCommand(packageName, binName, options = {}) {
  const executable = findExecutable(binName, options);
  const roots = [options.cacheDir, ...(options.roots || []), executable && path.dirname(executable)].filter(Boolean);
  for (const root of roots) {
    for (const directory of [path.join(root, 'node_modules', packageName), path.join(root, '..', packageName)]) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName];
        const file = entry && path.resolve(directory, entry);
        if (file && isInside(file, directory) && fs.statSync(file).isFile()) {
          const node = Number(process.versions.node.split('.')[0]) < 18 ? findExecutable('node') || process.execPath : process.execPath;
          return { command: node, args: [file], env: { ELECTRON_RUN_AS_NODE: '1' } };
        }
      } catch { /* try another installation */ }
    }
  }
  if (executable && !/\.(?:cmd|bat)$/i.test(executable)) return { command: executable, args: [] };
  return undefined;
}

/** Install packages into the Agent-managed cache, never into the project. */
export function installNpmPackages({ cacheDir, packages, signal, timeoutMs = 180000 }) {
  const list = [...new Set((packages || []).map((item) => String(item).trim()).filter(Boolean))];
  if (!list.length) throw new Error('没有可安装的语言服务器包');
  fs.mkdirSync(cacheDir, { recursive: true });
  const npm = nodePackageCommand('npm', 'npm', { roots: [path.dirname(process.execPath)] });
  if (!npm) throw new Error('未找到可运行的 npm，请安装 Node.js 后重试');
  return new Promise((resolve, reject) => {
    const child = spawn(npm.command, [...npm.args, 'install', '--no-package-lock', '--no-audit', '--no-fund', '--prefix', cacheDir, ...list], {
      cwd: cacheDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...npm.env },
    });
    activeInstallers.add(child);
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      activeInstallers.delete(child);
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => {
      stopProcessTree(child, 'SIGTERM');
      finish(new Error('语言服务器安装已取消'));
    };
    const timer = setTimeout(() => {
      stopProcessTree(child, 'SIGKILL');
      finish(new Error(`语言服务器安装超时（${timeoutMs}ms）`));
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => stdout.push(chunk));
    child.stderr?.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => finish(new Error(`无法启动 npm：${error.message}`)));
    child.once('close', (code) => {
      if (code === 0) return finish(null, Buffer.concat(stdout).toString('utf8').trim());
      const detail = Buffer.concat(stderr).toString('utf8').trim() || Buffer.concat(stdout).toString('utf8').trim();
      finish(new Error(`语言服务器安装失败（退出码 ${code}）${detail ? `：${detail.slice(-1200)}` : ''}`));
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** Find the nearest project marker, stopping at the configured workspace. */
export function nearestRoot(file, markers = [], workspaceRoot = getWorkspaceRoot()) {
  let current = path.dirname(path.resolve(file));
  const stop = path.resolve(workspaceRoot);
  while (isInside(current, stop)) {
    if (markers.some((marker) => {
      const target = path.join(current, marker);
      if (marker.includes('*')) {
        const suffix = marker.replaceAll('*', '');
        try { return fs.readdirSync(current).some((name) => name.endsWith(suffix)); } catch { return false; }
      }
      return fs.existsSync(target);
    })) return current;
    if (normalize(current) === normalize(stop)) break;
    current = path.dirname(current);
  }
  return stop;
}

function jsonError(message, code = -32601) {
  return { code, message };
}

class JsonRpcClient {
  constructor({ child, root, initialization }) {
    this.child = child;
    this.root = root;
    this.initialization = initialization || {};
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = new Map();
    this.documents = new Map();
    this.diagnostics = new Map();
    this.waiters = new Map();
    this.capabilities = {};
    this.closed = false;
    child.stderr?.on('data', () => {});
    child.stdout?.on('data', (chunk) => this.#read(chunk));
    child.on('error', (error) => this.#fail(error));
    child.on('close', (code, signal) => this.#fail(new Error(`LSP 服务器已退出（${code ?? signal ?? 'unknown'}）`)));
  }

  #fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
    for (const items of this.waiters.values()) for (const item of items) {
      clearTimeout(item.timer);
      item.resolve([]);
    }
    this.waiters.clear();
  }

  #write(message) {
    if (this.closed || !this.child.stdin?.writable) throw new Error('LSP 服务器连接不可用');
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
    this.child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
  }

  #read(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    while (true) {
      const separator = this.buffer.indexOf(Buffer.from('\r\n\r\n'));
      if (separator < 0) return;
      const headers = this.buffer.subarray(0, separator).toString('ascii');
      const match = headers.match(/(?:^|\r\n)content-length\s*:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.subarray(separator + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = separator + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.subarray(start, start + length).toString('utf8');
      this.buffer = this.buffer.subarray(start + length);
      let message;
      try { message = JSON.parse(body); } catch { continue; }
      this.#dispatch(message);
    }
  }

  #dispatch(message) {
    if (message.method && message.id !== undefined) {
      const respond = (result, error) => {
        try { this.#write(error ? { id: message.id, error } : { id: message.id, result }); } catch { /* process is closing */ }
      };
      Promise.resolve(this.#serverRequest(message.method, message.params)).then((result) => respond(result)).catch((error) => respond(undefined, jsonError(error.message, -32603)));
      return;
    }
    if (message.id !== undefined) {
      const item = this.pending.get(message.id);
      if (!item) return;
      this.pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message || 'LSP 请求失败'));
      else item.resolve(message.result);
      return;
    }
    if (message.method === 'textDocument/publishDiagnostics') {
      const file = uriToPath(message.params?.uri);
      if (!file) return;
      const issues = Array.isArray(message.params?.diagnostics) ? message.params.diagnostics : [];
      this.diagnostics.set(normalize(file), issues);
      const waiters = this.waiters.get(normalize(file));
      if (!waiters) return;
      this.waiters.delete(normalize(file));
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.resolve(issues);
      }
      return;
    }
    const listeners = this.notifications.get(message.method) || [];
    for (const listener of listeners) Promise.resolve(listener(message.params)).catch(() => {});
  }

  async #serverRequest(method, params) {
    if (method === 'window/workDoneProgress/create' || method === 'workspace/diagnostic/refresh') return null;
    if (method === 'workspace/workspaceFolders') return [{ name: 'workspace', uri: fileUri(this.root) }];
    if (method === 'workspace/configuration') {
      return (params?.items || []).map((item) => this.initializationValue(item.section));
    }
    if (method === 'client/registerCapability' || method === 'client/unregisterCapability') return null;
    return null;
  }

  initializationValue(section) {
    if (!section) return this.initialization;
    return String(section).split('.').reduce((value, key) => value?.[key], this.initialization);
  }

  onNotification(method, listener) {
    const listeners = this.notifications.get(method) || [];
    listeners.push(listener);
    this.notifications.set(method, listeners);
    return () => this.notifications.set(method, listeners.filter((item) => item !== listener));
  }

  request(method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP 请求超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.#write({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  notify(method, params) {
    try { this.#write({ method, params }); } catch { /* a stopped server is handled by the next request */ }
  }

  async initialize() {
    const response = await this.request('initialize', {
      processId: this.child.pid,
      rootUri: fileUri(this.root),
      workspaceFolders: [{ name: 'workspace', uri: fileUri(this.root) }],
      initializationOptions: this.initialization,
      capabilities: {
        workspace: { configuration: true, workspaceFolders: true },
        textDocument: { synchronization: { didOpen: true, didChange: true }, publishDiagnostics: { versionSupport: false } },
      },
    }, INITIALIZE_TIMEOUT_MS);
    this.capabilities = response?.capabilities || {};
    this.notify('initialized', {});
    if (Object.keys(this.initialization).length) this.notify('workspace/didChangeConfiguration', { settings: this.initialization });
    return response;
  }

  waitForDiagnostics(file, timeoutMs = DIAGNOSTICS_TIMEOUT_MS) {
    const key = normalize(file);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const items = this.waiters.get(key) || [];
        this.waiters.set(key, items.filter((item) => item.resolve !== resolve));
        resolve(this.diagnostics.get(key) || []);
      }, timeoutMs);
      const items = this.waiters.get(key) || [];
      items.push({ resolve, timer });
      this.waiters.set(key, items);
    });
  }

  async touch(file, { wait = true } = {}) {
    const target = path.resolve(file);
    const text = fs.readFileSync(target, 'utf8');
    const key = normalize(target);
    const document = this.documents.get(key);
    const pending = wait ? this.waitForDiagnostics(target) : null;
    if (document) {
      const next = document.version + 1;
      const syncKind = typeof this.capabilities.textDocumentSync === 'number' ? this.capabilities.textDocumentSync : this.capabilities.textDocumentSync?.change;
      const contentChanges = syncKind === 2
        ? [{ range: { start: { line: 0, character: 0 }, end: endPosition(document.text) }, text }]
        : [{ text }];
      this.notify('textDocument/didChange', { textDocument: { uri: fileUri(target), version: next }, contentChanges });
      this.documents.set(key, { version: next, text });
    } else {
      this.notify('textDocument/didOpen', { textDocument: { uri: fileUri(target), languageId: languageId(target), version: 0, text } });
      this.documents.set(key, { version: 0, text });
    }
    return pending ? await pending : [];
  }

  async query(operation, file, line, character, query) {
    const uri = fileUri(file);
    const position = { line: Math.max(0, Number(line || 1) - 1), character: Math.max(0, Number(character || 1) - 1) };
    const params = { textDocument: { uri }, position };
    switch (operation) {
      case 'hover': return (await this.request('textDocument/hover', params).catch(() => null)) || null;
      case 'goToDefinition': return (await this.request('textDocument/definition', params).catch(() => [])) || [];
      case 'findReferences': return (await this.request('textDocument/references', { ...params, context: { includeDeclaration: true } }).catch(() => [])) || [];
      case 'goToImplementation': return (await this.request('textDocument/implementation', params).catch(() => [])) || [];
      case 'documentSymbol': return (await this.request('textDocument/documentSymbol', { textDocument: { uri } }).catch(() => [])) || [];
      case 'workspaceSymbol': return (await this.request('workspace/symbol', { query: query || '' }).catch(() => [])) || [];
      case 'prepareCallHierarchy': return (await this.request('textDocument/prepareCallHierarchy', params).catch(() => [])) || [];
      case 'incomingCalls': {
        const items = await this.request('textDocument/prepareCallHierarchy', params).catch(() => []);
        return items?.[0] ? (await this.request('callHierarchy/incomingCalls', { item: items[0] }).catch(() => [])) || [] : [];
      }
      case 'outgoingCalls': {
        const items = await this.request('textDocument/prepareCallHierarchy', params).catch(() => []);
        return items?.[0] ? (await this.request('callHierarchy/outgoingCalls', { item: items[0] }).catch(() => [])) || [] : [];
      }
      default: throw new Error(`不支持的 LSP 操作：${operation}`);
    }
  }

  terminate() {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('LSP 连接已关闭')); }
    this.pending.clear();
    stopProcessTree(this.child, 'SIGTERM');
    try { this.child.kill(); } catch { /* process may already be gone */ }
  }
}

function uriToPath(uri) {
  try { return uri?.startsWith('file://') ? decodeURIComponent(new URL(uri).pathname).replace(/^\/(?:([A-Za-z]):)/, '$1:') : undefined; }
  catch { return undefined; }
}

function languageId(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact', '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.pyi': 'python' })[ext] || 'plaintext';
}

function diagnosticLine(item) {
  const severity = { 1: 'ERROR', 2: 'WARN', 3: 'INFO', 4: 'HINT' }[item.severity] || 'ERROR';
  const line = Number(item.range?.start?.line ?? 0) + 1;
  const character = Number(item.range?.start?.character ?? 0) + 1;
  return `${severity} [${line}:${character}] ${String(item.message || '').replace(/\s+/g, ' ').trim()}`;
}

export function formatDiagnostics(file, diagnostics, max = MAX_DIAGNOSTICS) {
  const items = Array.isArray(diagnostics) ? diagnostics : [];
  if (!items.length) return '';
  const shown = items.slice(0, max).map(diagnosticLine);
  const more = items.length - shown.length;
  return `<diagnostics file="${file}">\n${shown.join('\n')}${more > 0 ? `\n... 还有 ${more} 条` : ''}\n</diagnostics>`;
}

export class LspManager {
  constructor({ workspaceRoot = getWorkspaceRoot, dataRoot = DATA_ROOT } = {}) {
    this.workspaceRoot = workspaceRoot;
    this.dataRoot = dataRoot;
    this.definitions = new Map();
    this.clients = new Map();
    this.installing = new Map();
    this.installControllers = new Map();
    this.starting = new Map();
    this.declined = new Set();
    this.failedInstalls = new Set();
    this.errors = new Map();
    try { this.declined = new Set(JSON.parse(fs.readFileSync(path.join(dataRoot, 'lsp', 'preferences.json'), 'utf8')).disabled || []); } catch {}
  }

  register(definition) {
    if (!definition?.id || !Array.isArray(definition.extensions) || typeof definition.resolve !== 'function') throw new Error('LSP 语言包必须提供 id、extensions 和 resolve');
    this.definitions.set(definition.id, { ...definition, extensions: definition.extensions.map((item) => String(item).toLowerCase()) });
  }

  clearDefinitions() {
    this.definitions.clear();
  }

  cacheDir(definition) { return path.join(this.dataRoot, 'lsp', 'servers', definition.id); }

  savePreferences() {
    const directory = path.join(this.dataRoot, 'lsp');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'preferences.json'), temporary = file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ disabled: [...this.declined] }));
    fs.renameSync(temporary, file);
  }

  async ensureInstalled(candidate, { askInstall, signal, retryInstall } = {}) {
    const { definition, cacheDir, root } = candidate, id = definition.id;
    if (this.installing.has(id)) return this.installing.get(id);
    if (!retryInstall && (this.declined.has(id) || this.failedInstalls.has(id))) return false;
    const automatic = ['1', 'true', 'yes', 'on'].includes(String(process.env.MLI_LSP_AUTO_INSTALL || '').toLowerCase());
    if (!automatic && !askInstall) return false;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    this.installControllers.set(id, controller);
    const pending = Promise.resolve().then(async () => {
      if (controller.signal.aborted) return false;
      const accepted = automatic || await askInstall({ definition, cacheDir });
      if (controller.signal.aborted) return false;
      if (!accepted) { this.declined.add(id); this.savePreferences(); return false; }
      this.declined.delete(id); this.failedInstalls.delete(id); this.savePreferences();
      await definition.install({ cacheDir, root, workspaceRoot: this.workspaceRoot(), signal: controller.signal });
      if (controller.signal.aborted) throw new Error('语言服务器安装已取消');
      return true;
    }).catch(error => { this.failedInstalls.add(id); throw error; }).finally(() => {
      signal?.removeEventListener('abort', abort);
      if (this.installing.get(id) === pending) this.installing.delete(id);
      if (this.installControllers.get(id) === controller) this.installControllers.delete(id);
    });
    this.installing.set(id, pending);
    return pending;
  }

  async candidates(file) {
    const extension = path.extname(file).toLowerCase();
    const output = [];
    for (const definition of this.definitions.values()) {
      if (!definition.extensions.includes(extension)) continue;
      const workspaceRoot = path.resolve(this.workspaceRoot());
      const root = await definition.root?.({ file, workspaceRoot }) || workspaceRoot;
      if (!isInside(file, workspaceRoot) || !isInside(root, workspaceRoot)) continue;
      output.push({ definition, root, cacheDir: this.cacheDir(definition) });
    }
    return output;
  }

  async #start(candidate, options = {}) {
    const { definition, root, cacheDir } = candidate;
    const key = `${normalize(root)}::${definition.id}`;
    const current = this.clients.get(key);
    if (current && !current.closed) return current;
    if (current) this.clients.delete(key);
    if (!options.retryInstall && (this.declined.has(definition.id) || this.failedInstalls.has(definition.id))) return undefined;
    let command = await definition.resolve({ file: candidate.file, root, workspaceRoot: this.workspaceRoot(), cacheDir });
    if (!command && definition.install) {
      const installed = await this.ensureInstalled(candidate, options);
      if (!installed) return undefined;
      command = await definition.resolve({ file: candidate.file, root, workspaceRoot: this.workspaceRoot(), cacheDir });
      if (!command) { this.failedInstalls.add(definition.id); throw new Error('安装完成后未找到语言服务器'); }
    }
    if (!command || options.signal?.aborted) return undefined;
    const child = spawn(command.command, command.args || [], {
      cwd: command.cwd || root,
      env: { ...process.env, ...(command.env || {}) },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const client = new JsonRpcClient({ child, root, initialization: command.initialization });
    try {
      await client.initialize();
    } catch (error) {
      client.terminate();
      this.errors.set(key, error.message);
      this.failedInstalls.add(definition.id);
      throw new Error(`${definition.name || definition.id} LSP 初始化失败：${error.message}`);
    }
    this.clients.set(key, client);
    this.failedInstalls.delete(definition.id);
    if (options.retryInstall && this.declined.delete(definition.id)) this.savePreferences();
    this.errors.delete(key);
    return client;
  }

  async clientFor(file, options = {}) {
    const target = path.resolve(this.workspaceRoot(), file);
    for (const candidate of await this.candidates(target)) {
      candidate.file = target;
      const key = `${normalize(candidate.root)}::${candidate.definition.id}`;
      try {
        let pending = this.starting.get(key);
        if (!pending) {
          pending = this.#start(candidate, options).finally(() => { if (this.starting.get(key) === pending) this.starting.delete(key); });
          this.starting.set(key, pending);
        }
        const client = await pending;
        if (client) return { ...candidate, client, key };
      } catch (error) {
        this.errors.set(key, error.message);
      }
    }
    return undefined;
  }

  async touch(file, options = {}) {
    const target = path.resolve(this.workspaceRoot(), file);
    if (!isInside(target, path.resolve(this.workspaceRoot()))) return { available: false, diagnostics: [], reason: '文件不在当前工作区内' };
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return { available: false, diagnostics: [], reason: '文件不存在' };
    const selected = await this.clientFor(target, options);
    if (!selected) return { available: false, diagnostics: [], reason: '没有可用的语言服务器' };
    try {
      const diagnostics = await selected.client.touch(target, { wait: options.wait !== false });
      return { available: true, diagnostics, server: selected.definition.id };
    } catch (error) {
      this.errors.set(selected.key, error.message);
      selected.client.terminate();
      this.clients.delete(selected.key);
      return { available: false, diagnostics: [], reason: error.message };
    }
  }

  async query({ operation, filePath, line, character, query, ...options }) {
    const target = path.resolve(this.workspaceRoot(), filePath || '.');
    if (!isInside(target, path.resolve(this.workspaceRoot()))) throw new Error('LSP 只能访问当前工作区内的文件');
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`文件不存在：${filePath}`);
    const selected = await this.clientFor(target, { ...options, retryInstall: true });
    if (!selected) throw new Error('没有可用的语言服务器。请安装对应语言包或在项目中配置语言服务器。');
    await selected.client.touch(target, { wait: true });
    return selected.client.query(operation, target, line, character, query);
  }

  status() {
    return [...this.definitions.values()].map((definition) => {
      const active = [...this.clients.entries()].filter(([key, client]) => key.endsWith(`::${definition.id}`) && !client.closed);
      const errors = [...this.errors.entries()].filter(([key]) => key.endsWith(`::${definition.id}`)).map(([, value]) => value);
      return { id: definition.id, name: definition.name || definition.id, extensions: definition.extensions, active: active.length, status: active.length ? 'connected' : this.declined.has(definition.id) ? 'disabled' : errors.length || this.failedInstalls.has(definition.id) ? 'error' : 'available', error: errors[0] || '' };
    });
  }

  dispose() {
    for (const controller of this.installControllers.values()) controller.abort();
    this.installControllers.clear();
    for (const client of this.clients.values()) client.terminate();
    this.clients.clear();
    this.installing.clear();
    this.starting.clear();
  }
}

export const lspManager = new LspManager();
export function registerLanguageServer(definition) { lspManager.register(definition); }
export function resetLanguageServers() { lspManager.dispose(); lspManager.clearDefinitions(); }
export function shutdownLanguageServers() { lspManager.dispose(); }

process.once('exit', () => {
  for (const child of activeInstallers) stopProcessTree(child, 'SIGTERM');
  lspManager.dispose();
});
