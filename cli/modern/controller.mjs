import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { configureModel, login } from '../forms.mjs';
import { COMMANDS, emptySession, hydrate, reduceEvent, safeText } from './state.mjs';
import { ACTION_COMMANDS, terminalAction, pendingAttachments, attachmentKey, agentDetails } from '../actions.mjs';

export class TuiController extends EventEmitter {
  constructor(client, options = {}) {
    super();
    this.client = client;
    this.options = options;
    this.session = emptySession();
    this.info = {};
    this.connected = false;
    this.ready = false;
    this.busy = false;
    this.notice = '';
    this.dialog = null;
    this.history = [];
    this.drafts = {};
    this.attachments = {};
    this.cursor = 0;
    this.draft = '';
    this.streamAbort = new AbortController();
    this.generation = 0;
    this.closed = false;
    this.watermark = 0;
    this.hydrating = null;
    this.requestBusy = false;
    this.stateFile = options.dataRoot ? path.join(options.dataRoot, 'terminal', `${crypto.createHash('sha256').update(options.cwd || '').digest('hex').slice(0, 24)}.json`) : null;
    try {
      const saved = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      this.history = (saved.history || []).filter(item => typeof item === 'string').slice(-100);
      this.drafts = saved.drafts || {};
    } catch {}
    this.loadDraft();
  }

  changed() { if (!this.closed) this.emit('change'); }
  error(error) { this.notice = safeText(error.message || error); this.changed(); }
  saveDraft(text, cursor = text.length) {
    this.draft = text;
    this.cursor = cursor;
    this.drafts[this.session.id || 'home'] = { text, cursor };
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 250);
  }
  loadDraft() {
    const saved = this.drafts[this.session.id || 'home'];
    this.draft = saved?.text || '';
    this.cursor = saved?.cursor ?? this.draft.length;
  }
  persist() {
    if (!this.stateFile) return;
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true, mode: 0o700 });
      const temp = `${this.stateFile}.${process.pid}.tmp`;
      const drafts = Object.fromEntries(Object.entries(this.drafts).slice(-100));
      fs.writeFileSync(temp, JSON.stringify({ history: this.history, drafts }), { mode: 0o600 });
      fs.renameSync(temp, this.stateFile);
    } catch (error) { this.error(new Error(`草稿保存失败：${error.message}`)); }
  }

  async refresh() { this.info = await this.client.request('/api/info'); this.changed(); }
  async start() {
    await this.refresh();
    if (this.options.resume) {
      const { sessions } = await this.client.request('/api/sessions');
      const id = typeof this.options.resume === 'string' ? this.options.resume : sessions[0]?.id;
      if (id) await this.restore(id);
    }
    this.stream = this.client.events(event => this.event(event), {
      signal: this.streamAbort.signal,
      onConnected: async () => {
        this.connected = false;
        // Runtime sequence counters restart after a server restart.
        this.watermark = 0;
        await this.refresh();
        if (this.session.id) await this.restore(this.session.id, { preserveDraft: true });
        this.connected = true;
        this.ready = true;
        this.changed();
        if (!this.initialSent && this.options.positional?.length) {
          this.initialSent = true;
          await this.send(this.options.positional.join(' '));
        }
      },
      onDisconnected: error => { this.connected = false; this.error(new Error(`连接中断，正在重连：${error.message}`)); },
    }).catch(error => this.error(error));
  }

  async restore(id, { preserveDraft = false } = {}) {
    const generation = ++this.generation;
    const pending = { id, events: [] };
    this.hydrating = pending;
    try {
      const snapshot = await this.client.request(`/api/session/${encodeURIComponent(id)}?limit=120`);
      if (generation !== this.generation || this.closed) return;
      this.session = hydrate(snapshot);
      for (const event of pending.events) this.session = reduceEvent(this.session, event);
      this.watermark = this.session.eventSeq;
      if (!preserveDraft) this.loadDraft();
      this.notice = '';
      this.changed();
    } finally { if (this.hydrating === pending) this.hydrating = null; }
  }

  async loadOlder() {
    const { id, history } = this.session;
    if (!id || !history?.hasMore || this.loadingOlder) return;
    this.loadingOlder = true;
    try {
      const page = await this.client.request(`/api/session/${id}/entries?limit=120&before=${history.oldestId}`);
      if (this.session.id !== id) return;
      const older = hydrate({ id, entries: page.entries || [] }).parts;
      const current = new Map(this.session.parts.map(part => [part.id, part]));
      const merged = older.map(part => { const live = current.get(part.id); current.delete(part.id); return live ? { ...part, ...live } : part; });
      this.session = { ...this.session, parts: [...merged, ...current.values()], history: { ...history, hasMore: page.hasMore, oldestId: page.oldestId } };
      this.changed();
    } finally { this.loadingOlder = false; }
  }

  event(event) {
    if (this.closed) return;
    if (event.type === 'settings_updated' || event.type === 'catalog_updated') this.refresh().catch(error => this.error(error));
    if (event.type === 'workspace_changed' || event.type === 'session_workspace_changed') {
      if (!this.switchingWorkspace && event.workspace?.path && event.workspace.path !== this.options.cwd) {
        this.connected = false;
        this.error(new Error('项目已被其他客户端切换，请重新打开此项目'));
      }
    }
    if (this.hydrating && (event.sessionId === this.hydrating.id || event.rootSessionId === this.hydrating.id)) { this.hydrating.events.push(event); return; }
    const previous = this.session;
    this.session = reduceEvent(previous, event);
    if (event.type === 'session_run_finished' && event.sessionId === this.session.id) this.restore(this.session.id, { preserveDraft: true }).catch(error => this.error(error));
    if (this.session === previous) return;
    if (['permission_request', 'ui_request'].includes(event.type) && this.dialog && !this.dialog.reqId) this.finishDialog(null);
    this.watermark = this.session.eventSeq;
    if (event.type === 'error') this.notice = safeText(event.message);
    if (event.type === 'model_retry') this.notice = `重试 ${event.attempt}/${event.maxAttempts} · ${safeText(event.message)}`;
    if (['permission_resolved', 'ui_resolved'].includes(event.type) && this.dialog?.reqId === event.reqId) this.finishDialog(null);
    this.changed();
  }

  openDialog(dialog) {
    if (this.closed) return Promise.resolve(null);
    if (this.dialog) return Promise.reject(new Error('请先关闭当前弹层'));
    return new Promise(resolve => { this.dialog = { ...dialog, resolve }; this.changed(); });
  }
  finishDialog(value) {
    const dialog = this.dialog;
    if (!dialog) return;
    this.dialog = null;
    this.changed();
    dialog.resolve(value);
  }
  choose(title, choices, extra = {}) { return this.openDialog({ kind: 'select', title, choices, ...extra }); }
  ask(title, { initial = '', secret = false, ...extra } = {}) { return this.openDialog({ kind: 'input', title, initial, secret, ...extra }); }

  async palette({ fromSubmit = false } = {}) {
    if (this.busy && !fromSubmit) throw new Error('消息正在提交，请稍候');
    const value = await this.choose('命令', this.commands());
    if (value && !await this.command(value, { fromSubmit })) { this.saveDraft(`${value} `); this.changed(); }
  }
  commands() {
    const plugins = this.info.commands || [];
    const extra = Array.isArray(plugins) ? plugins.map(item => ({ value: item.name || item.command, label: item.description || item.name })) : Object.entries(plugins).map(([value, item]) => ({ value, label: item.description || value }));
    const local = [...COMMANDS, ...ACTION_COMMANDS];
    return [...local, ...extra.filter(item => item.value?.startsWith('/') && !local.some(command => command.value === item.value))];
  }
  async command(text, { fromSubmit = false } = {}) {
    const [name, ...args] = text.trim().split(/\s+/);
    if (this.busy && !fromSubmit && !['/stop', '/exit'].includes(name)) throw new Error('消息正在提交，请稍候');
    if (['/', '/help'].includes(name)) { await this.palette({ fromSubmit }); return true; }
    if (name === '/exit') { this.onExit?.(); return true; }
    if (name === '/stop') { await this.stop(); return true; }
    if (await terminalAction(this, name, text.trim().slice(name.length).trim())) return true;
    if (!COMMANDS.some(item => item.value === name)) return false;
    if (this.session.running && !['/resume', '/new', '/skills', '/agents', '/queue', '/stop'].includes(name)) throw new Error('当前任务正在运行，请先停止任务');
    if (name === '/new') {
      ++this.generation;
      this.session = emptySession();
      this.loadDraft();
    } else if (name === '/resume') {
      const { sessions } = await this.client.request('/api/sessions');
      const id = args[0] || await this.choose('历史会话', sessions.map(session => ({ label: safeText(session.title), detail: new Date(session.updated || session.updatedAt || session.created || session.ts || Date.now()).toLocaleString(), value: session.id })));
      if (id) await this.restore(id);
    } else if (name === '/model') {
      await this.refresh();
      const providers = this.info.providers || [];
      const id = args[0] || await this.choose('模型', (this.info.models || []).map(model => ({ label: `${model.id === (this.info.activeModelId || this.info.provider?.modelId) ? '* ' : ''}${safeText(model.name || model.model)}`, detail: safeText(providers.find(provider => provider.id === model.providerId)?.name || model.model), value: model.id })));
      if (id) await this.client.request('/api/settings', { action: 'activate_model', modelId: id });
      await this.refresh();
    } else if (name === '/config') { await configureModel(this.client, this); await this.refresh(); }
    else if (name === '/login') { await login(this.client, this); await this.refresh(); }
    else if (name === '/logout') { await this.client.request('/api/account/logout', {}); await this.refresh(); }
    else if (name === '/skills') {
      const skills = [...(this.info.localSkills || []), ...(this.info.plugins?.skills || [])].filter((item, index, all) => all.findIndex(other => other.name === item.name) === index);
      const value = await this.choose('Skills', skills.map(skill => ({ label: safeText(skill.name), detail: safeText(skill.description), value: skill.name })));
      if (value) this.saveDraft(`${this.draft}${this.draft ? ' ' : ''}@skill(${JSON.stringify(value)}) `);
    } else if (name === '/mode') {
      const mode = await this.choose('权限模式', [{ label: '人工审批', value: 'default' }, { label: '完全访问', detail: '自动允许工作区写入和系统命令', value: 'auto-all' }]);
      if (mode) {
        if (mode === 'auto-all' && await this.choose('允许写入文件和执行系统命令？', [{ label: '取消', value: false }, { label: '启用完全访问', value: true }]) !== true) return true;
        if (this.session.id) await this.client.request(`/api/session/${this.session.id}/mode`, { mode });
        this.session = { ...this.session, mode };
      }
    } else if (name === '/expert') {
      const expertId = await this.choose('专家', [{ label: '无专家', value: '' }, ...(this.info.experts || []).map(expert => ({ label: safeText(expert.name), value: expert.id }))]);
      if (expertId !== null) {
        if (this.session.id) await this.client.request(`/api/session/${this.session.id}/expert`, { expertId });
        this.session = { ...this.session, expertId };
      }
    } else if (name === '/compact' && this.session.id) {
      await this.client.request(`/api/session/${this.session.id}/compact`, {});
      await this.restore(this.session.id, { preserveDraft: true });
    } else if (name === '/agents' && this.session.id) {
      const group = await this.client.request(`/api/session/${this.session.id}/agents`);
      const tasks = group.tasks || [];
      const choice = await this.choose(`Agent 任务组 · ${tasks.length}`, tasks.length ? tasks.map(task => ({ label: safeText(task.title), detail: `${safeText(task.profile)} · ${safeText(task.status)} · ${safeText(task.result?.summary || '')}`.slice(0, 180), value: task.agentId })) : [{ label: '暂无子 Agent', value: null }]);
      const task = tasks.find(item => item.agentId === choice);
      if (task) {
        const terminal = ['completed', 'failed', 'cancelled', 'budget_exceeded', 'interrupted'].includes(task.status);
        const action = await this.choose(safeText(task.title), [
          { label: '执行详情与工具记录', value: 'detail' },
          { label: terminal ? '追加要求并续跑' : '追加指令', value: 'message' },
          ...(!terminal ? [{ label: '停止此 Agent', value: 'stop' }] : []),
          { label: '返回', value: null },
        ], { description: safeText(task.result?.summary || `${task.status} · ${task.usage?.totalTokens || 0} tokens`) });
        if (action === 'stop') await this.client.request(`/api/session/${this.session.id}/agents/${task.agentId}/stop`, {});
        if (action === 'detail') await agentDetails(this, task);
        if (action === 'message') {
          const message = await this.ask(`向 ${safeText(task.title)} 追加指令`, { initial: '' });
          if (message?.trim()) await this.client.request(`/api/session/${this.session.id}/agents/${task.agentId}/message`, { text: message.trim(), kind: terminal ? 'follow_up' : 'steer' });
        }
      }
      this.session = { ...this.session, group: await this.client.request(`/api/session/${this.session.id}/agents`) };
    } else if (name === '/queue' && this.session.id) {
      await this.restore(this.session.id, { preserveDraft: true });
      const queue = this.session.queue || [];
      const choice = await this.choose('任务队列', queue.length ? queue.map(item => ({ label: safeText(item.text).slice(0, 100), detail: `${item.mode === 'adjust' ? '调整当前任务' : '下一轮执行'} · ${item.queueId}`, value: item.queueId })) : [{ label: '队列为空', value: null }]);
      if (choice) {
        const action = await this.choose('队列操作', [{ label: '移除', value: 'remove' }, { label: '取回编辑', value: 'edit' }, { label: '改为调整当前任务', value: 'adjust' }, { label: '取消', value: null }]);
        if (action === 'edit') {
          const item = queue.find(item => item.queueId === choice);
          if (this.draft || pendingAttachments(this).length) throw new Error('请先处理当前草稿和附件');
          const restored = await Promise.all((item.attachments || []).map(async part => {
            const response = await fetch(new URL(part.url, this.client.url));
            if (!response.ok) throw new Error('附件读取失败');
            return { name: part.name, mime: part.mime, size: part.size, dataUrl: `data:${part.mime};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}` };
          }));
          await this.client.request(`/api/session/${this.session.id}/queue/${choice}`, undefined, { method: 'DELETE' });
          this.saveDraft(item.text); this.attachments[attachmentKey(this.session)] = restored;
        }
        if (action === 'remove') await this.client.request(`/api/session/${this.session.id}/queue/${choice}`, undefined, { method: 'DELETE' });
        if (action === 'adjust') await this.client.request(`/api/session/${this.session.id}/queue/${choice}/adjust`, {});
        await this.restore(this.session.id, { preserveDraft: true });
      }
    }
    this.changed();
    return true;
  }

  async send(text = this.draft) {
    text = text.trim();
    if ((!text && !pendingAttachments(this).length) || this.busy || this.dialog || this.session.permission || this.session.uiRequests.length) return false;
    if (!this.connected) { this.error(new Error('运行时尚未连接')); return false; }
    this.busy = true;
    const originalDraft = this.draft;
    const originalSession = this.session.id;
    try {
      if ([...COMMANDS, ...ACTION_COMMANDS].some(item => item.value === text.split(/\s+/)[0]) || ['/', '/help'].includes(text)) {
        // Commands run beside the message draft; dialogs must not discard it.
        if (this.draft === text) this.saveDraft('');
        await this.command(text, { fromSubmit: true });
        return true;
      }
      if (!this.session.id) {
        const preferences = { mode: this.session.mode, expertId: this.session.expertId };
        const created = await this.client.request('/api/session', { title: text.slice(0, 60) || pendingAttachments(this)[0]?.name || '附件任务' });
        this.session = { ...emptySession(created.id), title: created.title, ...preferences };
        this.attachments[created.id] = this.attachments.home || [];
        delete this.attachments.home;
        if (preferences.mode !== 'default') await this.client.request(`/api/session/${created.id}/mode`, { mode: preferences.mode });
        if (preferences.expertId) await this.client.request(`/api/session/${created.id}/expert`, { expertId: preferences.expertId });
        this.changed();
      }
      const queued = this.session.running;
      const id = this.session.id;
      const draftUnchanged = () => this.draft === originalDraft && (this.session.id === id || this.session.id === originalSession);
      const key = id;
      const attachments = this.attachments[key] || [];
      await this.client.request(`/api/session/${id}/${queued ? 'queue' : 'message'}`, { text, attachments, clientMessageId: crypto.randomUUID() });
      this.attachments[key] = (this.attachments[key] || []).filter(item => !attachments.includes(item));
      this.history = [...this.history.filter(item => item !== text), text].slice(-100);
      if (draftUnchanged()) {
        this.saveDraft('');
        this.drafts[originalSession || 'home'] = { text: '', cursor: 0 };
      }
      // Events may have completed before the POST response returns.
      if (this.session.id === id) await this.restore(id, { preserveDraft: true });
      return true;
    } catch (error) { this.error(error); return false; }
    finally { this.busy = false; this.changed(); }
  }

  async stop() {
    if (this.session.id && this.session.running) await this.client.request(`/api/session/${this.session.id}/abort`, {});
  }
  async permission(decision) {
    const request = this.session.permission;
    if (!request || this.requestBusy) return;
    this.requestBusy = true;
    const id = this.session.id;
    try {
      if (decision === 'allow_always') {
        const confirmed = await this.choose('保存永久允许规则？', [{ label: '取消', value: false }, { label: '保存规则', value: true }], { reqId: request.reqId, description: `${request.tool}\n${request.rememberPattern || request.summary}` });
        if (confirmed !== true || this.session.permission?.reqId !== request.reqId) return;
      }
      await this.client.request(`/api/session/${request.sessionId || id}/permission/${request.reqId}`, { decision });
      const permissions = (this.session.permissions || (this.session.permission ? [this.session.permission] : [])).filter(item => item.reqId !== request.reqId);
      this.session = { ...this.session, permissions, permission: permissions[0] || null };
    } catch (error) { if (error.status !== 404) this.error(error); }
    finally { this.requestBusy = false; this.changed(); }
  }
  async answer() {
    const request = this.session.uiRequests[0];
    if (!request || this.dialog || this.requestBusy) return;
    this.requestBusy = true;
    const id = this.session.id;
    try {
      const extra = { reqId: request.reqId, description: safeText(request.kind === 'present' ? request.text : '') };
      const choices = ['select', 'choose'].includes(request.kind)
        ? (request.options || []).map(option => ({ label: safeText(typeof option === 'string' ? option : option.label || option.name || option.value), value: typeof option === 'string' ? option : option.value ?? option.id }))
        : [{ label: '取消', value: false }, { label: '确认', value: true }];
      const value = request.kind === 'input' ? await this.ask(safeText(request.text), extra) : await this.choose(safeText(request.title || request.text || '确认'), choices, extra);
      if (!this.session.uiRequests.some(item => item.reqId === request.reqId)) return;
      await this.client.request(`/api/session/${request.sessionId || id}/ui/${request.reqId}`, { value });
      this.session = { ...this.session, uiRequests: this.session.uiRequests.filter(item => item.reqId !== request.reqId) };
    } catch (error) { if (error.status !== 404) this.error(error); }
    finally { this.requestBusy = false; this.changed(); }
  }
  close() {
    if (this.closed) return;
    this.persist();
    this.closed = true;
    clearTimeout(this.saveTimer);
    this.streamAbort.abort();
    this.finishDialog(null);
    this.removeAllListeners();
  }
}
