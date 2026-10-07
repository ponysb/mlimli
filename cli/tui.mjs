import kit from 'terminal-kit';
import { configureModel, login } from './forms.mjs';
import { installPasteHandler } from './paste.mjs';

export function safeText(value) {
  return String(value ?? '').replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

export function snapshotText(snapshot) {
  return (snapshot.entries || []).filter(entry => entry.type === 'message').map(entry => {
    const content = entry.text || (typeof entry.content === 'string' ? entry.content : (entry.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n'));
    return `${entry.role === 'user' ? 'You' : entry.role === 'tool' ? 'Tool' : 'MLI'}\n${safeText(content)}`;
  }).join('\n\n');
}

export function modelLabel(info) {
  const model = info?.models?.find(item => item.id === (info.activeModelId || info.provider?.modelId));
  return model?.name || model?.model || info?.provider?.model || '未配置模型';
}

export function sessionOverview(info, session, cwd) {
  const account = info?.account;
  return safeText([
    '魔力工作台', '', session?.title || '新会话', '',
    `模型    ${modelLabel(info)}`,
    `服务商  ${info?.provider?.providerName || '未配置'}`,
    `账户    ${account?.authenticated ? account.user?.email || account.user?.name || '已登录' : account?.enabled === false ? '本地模式' : '未登录'}`,
    `权限    ${session?.mode === 'auto-all' ? '完全访问' : '人工审批'}`,
    '', `项目    ${cwd}`,
  ].join('\n'));
}

export class TuiView {
  constructor({ onSend, onStop, onExit, term = kit.terminal }) {
    this.term = term;
    this.onSend = onSend;
    this.onStop = onStop;
    this.onExit = onExit;
    this.content = '';
    this.emptyContent = '魔力工作台\n\n连接中';
    this.status = 'MLI Agent';
    this.draft = '';
    this.history = [];
    this.historyIndex = 0;
    this.form = null;
    this.menu = null;
    this.closed = false;
    this.onKey = (key, _matches, data) => {
      const focus = this.document?.focusElement;
      const displayFocused = !focus || focus === this.header || focus === this.label || focus === this.transcript || this.transcript?.isAncestorOf(focus);
      // Transcript selection can take focus; message input must remain reachable by typing.
      if (this.editor && displayFocused && (data?.isCharacter || ['ENTER', 'KP_ENTER', 'ALT_ENTER', 'CTRL_J', 'BACKSPACE', 'DELETE', 'TAB', 'SHIFT_TAB', 'CTRL_V', 'CTRL_A'].includes(key))) {
        this.document.giveFocusTo(this.editor);
      }
      if (key === 'CTRL_C') onStop();
      if (key === 'CTRL_D') onExit();
      if (key === 'ESCAPE' && this.form) this.finishForm(null);
      if (key === 'PAGE_UP' || key === 'PAGE_DOWN') {
        this.follow = key === 'PAGE_DOWN';
        this.transcript.scroll(0, key === 'PAGE_UP' ? -Math.max(1, this.transcript.outputHeight - 2) : Math.max(1, this.transcript.outputHeight - 2));
      }
    };
    this.onResize = () => this.layout();
    term.fullscreen(true);
    this.removePasteHandler = installPasteHandler(term, text => this.editor?.insert(safeText(text.replace(/\r\n?/g, '\n'))));
    this.follow = true;
    term.on('key', this.onKey);
    term.on('resize', this.onResize);
    this.layout();
  }

  layout() {
    if (this.closed) return;
    if (this.editor) this.draft = this.editor.getValue();
    this.document?.destroy();
    const width = Math.max(12, this.term.width || 80);
    const height = Math.max(8, this.term.height || 24);
    this.document = this.term.createDocument();
    const inputHeight = this.menu ? Math.min(height - 6, Math.max(3, this.menu.choices.length + 1)) : Math.min(5, height - 7);
    const contentHeight = Math.max(1, height - inputHeight - 5);
    this.header = new kit.TextBox({ parent: this.document, x: 0, y: 0, width, height: 1, content: this.status, textAttr: { color: 'cyan', bold: true } });
    this.toolbar = new kit.RowMenu({ parent: this.document, x: 0, y: 2, width, height: 1,
      items: COMMANDS.filter(command => ['/new', '/resume', '/model', '/config'].includes(command.value)).concat({ label: '更多', value: '/' }).map(command => ({ content: command.label, value: command.value, disabled: !!this.form })),
      buttonBlurAttr: { color: 'cyan', bgColor: 'default' }, buttonFocusAttr: { color: 'black', bgColor: 'cyan' },
      buttonDisabledAttr: { color: 'gray', bgColor: 'default' }, separator: '  ',
      keyBindings: { ...kit.RowMenu.prototype.keyBindings, TAB: 'focusEditor', SHIFT_TAB: 'focusEditor', ESCAPE: 'focusEditor' },
    });
    this.toolbar.userActions = Object.create(this.toolbar.userActions);
    this.toolbar.userActions.focusEditor = () => { if (this.editor) this.document.giveFocusTo(this.editor); };
    this.toolbar.on('submit', async command => {
      if (this.form || this.toolbarBusy) return;
      this.toolbarBusy = true;
      try { await this.onSend(command); }
      catch (error) { this.append(`\n\nError\n${error.message}`); }
      finally {
        this.toolbarBusy = false;
        if (!this.closed && this.editor) this.document.giveFocusTo(this.editor);
      }
    });
    this.transcript = new kit.TextBox({ parent: this.document, x: 0, y: 4, width, height: contentHeight, scrollable: true, lineWrap: true, content: this.content || this.emptyContent, textAttr: { color: 'white' } });
    this.label = new kit.TextBox({ parent: this.document, x: 0, y: height - inputHeight - 1, width, height: 1, content: this.form?.label || this.inputLabel(), textAttr: { color: 'green' } });
    this.label.on('click', () => this.document.giveFocusTo(this.editor || this.menuWidget));
    if (this.menu) {
      this.editor = null;
      this.menuWidget = new kit.ColumnMenu({ parent: this.document, x: 0, y: height - inputHeight, width, maxHeight: inputHeight,
        items: this.menu.choices.map((choice, index) => ({ content: safeText(choice.label), value: index })),
        buttonBlurAttr: { color: 'white', bgColor: 'default' }, buttonFocusAttr: { color: 'black', bgColor: 'cyan' },
      });
      this.menuWidget.on('submit', index => this.finishForm(this.menu?.choices[index]?.value ?? null));
      this.document.giveFocusTo(this.menuWidget);
    } else {
      this.editor = new kit.EditableTextBox({ parent: this.document, x: 0, y: height - inputHeight, width, height: inputHeight, lineWrap: true, scrollable: true, content: this.draft,
        hiddenContent: this.form?.secret ? '*' : undefined, textAttr: { color: 'white' },
        keyBindings: { ...kit.EditableTextBox.prototype.keyBindings, ENTER: 'send', KP_ENTER: 'send', ALT_ENTER: 'newLine', CTRL_J: 'newLine', CTRL_UP: 'historyPrevious', CTRL_DOWN: 'historyNext', PAGE_UP: 'pass', PAGE_DOWN: 'pass', TAB: 'focusToolbar', SHIFT_TAB: 'focusToolbar' },
      });
      this.editor.userActions = Object.create(this.editor.userActions);
      this.editor.userActions.pass = () => false;
      this.editor.userActions.focusToolbar = () => { if (!this.form && this.toolbar.buttons[0]) this.document.giveFocusTo(this.toolbar.buttons[0]); };
      this.editor.userActions.send = () => {
        const text = this.editor.getValue();
        if (this.form) { this.finishForm(text); return; }
        if (!text.trim()) return;
        this.history.push(text);
        this.historyIndex = this.history.length;
        this.draft = '';
        this.editor.setContent('');
        Promise.resolve(this.onSend(text)).catch(error => this.append(`\n\nError\n${error.message}`));
      };
      const history = direction => {
        if (this.form) return;
        this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + direction));
        this.editor.setContent(this.history[this.historyIndex] || '');
        this.editor.textBuffer.moveToEndOfBuffer();
        this.editor.draw();
      };
      this.editor.userActions.historyPrevious = () => history(-1);
      this.editor.userActions.historyNext = () => history(1);
      this.document.giveFocusTo(this.editor);
    }
    if (this.follow && this.content) this.transcript.scrollToBottom();
    this.document.draw();
  }

  inputLabel() { return this.running ? '消息 · 排队' : '消息'; }
  setStatus(value, running = false) {
    this.running = running;
    this.status = safeText(value);
    this.header.setContent(this.status);
    if (!this.form) this.label.setContent(this.inputLabel());
  }
  setOverview(value) { this.emptyContent = safeText(value); if (!this.content) this.renderContent(); }
  setContent(value) { this.content = safeText(value).slice(-250000); this.renderContent(); }
  append(value) { this.content = (this.content + safeText(value)).slice(-250000); this.renderContent(); }
  renderContent() {
    if (this.renderTimer || this.closed) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      if (this.closed) return;
      this.transcript.setContent(this.content || this.emptyContent);
      if (this.follow && this.content) this.transcript.scrollToBottom();
    }, 40);
  }
  prompt(label, { choices, secret = false, initial = '' } = {}) {
    if (this.closed || (choices && !choices.length)) return Promise.resolve(null);
    if (this.form) return Promise.reject(new Error('另一个输入正在等待处理'));
    this.savedDraft = this.editor?.getValue() || '';
    this.editor = null;
    this.draft = initial;
    return new Promise(resolve => {
      this.form = { label: safeText(label), secret, resolve };
      this.menu = choices ? { choices } : null;
      this.layout();
    });
  }
  ask(label, options) { return this.prompt(label, options); }
  choose(label, choices) { return this.prompt(label, { choices }); }
  finishForm(value) {
    if (!this.form) return;
    const { resolve } = this.form;
    this.form = null;
    this.menu = null;
    this.editor = null;
    this.draft = this.savedDraft || '';
    this.layout();
    resolve(value);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.renderTimer);
    this.form?.resolve(null);
    this.document?.destroy();
    this.term.off('key', this.onKey);
    this.term.off('resize', this.onResize);
    this.term.grabInput(false);
    this.removePasteHandler();
    this.term.styleReset();
    this.term.fullscreen(false);
    this.term.hideCursor(false);
  }
}

const COMMANDS = [
  { label: '新会话', value: '/new' }, { label: '恢复会话', value: '/resume' },
  { label: '选择模型', value: '/model' }, { label: '配置模型', value: '/config' },
  { label: '权限模式', value: '/mode' }, { label: '选择专家', value: '/expert' },
  { label: 'Skills', value: '/skills' }, { label: '账户登录', value: '/login' },
  { label: '停止任务', value: '/stop' }, { label: '退出', value: '/exit' },
];

export async function runTui(client, options, { signal, term, onReady } = {}) {
  let current;
  let info;
  let running = false;
  let exiting;
  let handling = false;
  let selecting = false;
  let connected = false;
  let activeRequest;
  const requests = [];
  const seenRequests = new Set();
  const finished = new Promise(resolve => { exiting = resolve; });
  const streamAbort = new AbortController();
  const stop = async () => {
    if (view.form) view.finishForm(null);
    if (current && running) await client.request(`/api/session/${current.id}/abort`, {}).catch(error => view.append(`\n${error.message}`));
  };
  const view = new TuiView({ onSend: send, onStop: stop, onExit: exiting, term });
  const onAbort = () => { stop().finally(exiting); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const updateStatus = () => {
    view.setStatus(`MLI · ${modelLabel(info)} · ${current?.title || '新会话'} · ${connected ? running ? '运行中' : '就绪' : '连接中'}`, running);
    view.setOverview(sessionOverview(info, current, options.cwd));
  };
  async function refresh(settingsOnly = false) {
    const updated = await client.request(settingsOnly ? '/api/settings' : '/api/info');
    info = settingsOnly ? { ...info, ...updated } : updated;
    updateStatus();
  }
  async function restore(id) {
    if (selecting) return;
    selecting = true;
    try {
      current = await client.request(`/api/session/${id}`);
      running = current.running;
      view.setContent(snapshotText(current));
      updateStatus();
      if (current.permission) enqueue('permission_request', current.permission);
      for (const request of current.uiRequests || []) enqueue('ui_request', request);
    } finally { selecting = false; }
  }
  function enqueue(type, request) {
    if (seenRequests.has(request.reqId)) return;
    seenRequests.add(request.reqId);
    requests.push({ type, request, sessionId: request.sessionId || current.id });
    processRequests().catch(error => view.append(`\nError\n${error.message}`));
  }
  async function processRequests() {
    if (handling || view.form || !requests.length) return;
    handling = true;
    try {
      while (requests.length) {
        const { type, request, sessionId } = requests.shift();
        activeRequest = request.reqId;
        if (type === 'permission_request') {
          const preview = request.preview;
          view.append(`\n\n审批 · ${request.levelLabel} · ${request.tool}\n${request.summary}\n${request.sessionScope || ''}`);
          if (preview?.kind === 'diff') view.append(`\n${preview.path}\n${preview.before ? `--- before\n${preview.before}\n` : ''}+++ after\n${preview.after}`);
          const decision = await view.choose('执行审批', [
            { label: '拒绝', value: 'deny' }, { label: '允许一次', value: 'allow' },
            { label: '当前会话允许此操作', value: 'allow_session' }, { label: '始终允许此操作', value: 'allow_always' },
          ]);
          await client.request(`/api/session/${sessionId}/permission/${request.reqId}`, { decision: decision || 'deny' }).catch(error => { if (error.status !== 404) throw error; });
        } else {
          let value;
          if (request.kind === 'input') value = await view.ask(request.text, { initial: '' });
          else if (['select', 'choose'].includes(request.kind)) value = await view.choose(request.text, (request.options || []).map(option => ({ label: typeof option === 'string' ? option : option.label || option.name || String(option.value), value: typeof option === 'string' ? option : option.value ?? option.id })));
          else {
            if (request.kind === 'present') view.append(`\n\n${request.title || ''}\n${request.text || ''}`);
            value = await view.choose(request.text || request.title || '确认', [{ label: '取消', value: false }, { label: '确认', value: true }]);
          }
          await client.request(`/api/session/${sessionId}/ui/${request.reqId}`, { value }).catch(error => { if (error.status !== 404) throw error; });
        }
      }
    } finally { handling = false; activeRequest = null; }
  }
  async function command(text) {
    const [name, ...args] = text.trim().split(/\s+/);
    if (name === '/exit') { exiting(); return true; }
    if (name === '/stop') { await stop(); return true; }
    if (name === '/help' || name === '/') {
      const selected = await view.choose('MLI', COMMANDS);
      if (selected) await command(selected);
      return true;
    }
    if (['/new', '/resume', '/model', '/config', '/mode', '/expert', '/login', '/logout', '/compact'].includes(name) && running) throw new Error('请先停止当前任务');
    if (name === '/new') {
      const session = await client.request('/api/session', { title: '新会话' });
      await restore(session.id);
    } else if (name === '/resume') {
      const { sessions } = await client.request('/api/sessions');
      if (!sessions.length) { view.append('\n没有历史会话'); return true; }
      const id = args[0] || await view.choose('会话', sessions.map(session => ({ label: `${session.title} · ${session.id}`, value: session.id })));
      if (id) await restore(id);
    } else if (name === '/model') {
      await refresh();
      const id = args[0] || await view.choose('模型', info.models.map(model => ({ label: `${model.name} · ${model.id}`, value: model.id })));
      if (id) await client.request('/api/settings', { action: 'activate_model', modelId: id });
      await refresh();
    } else if (name === '/config') { await configureModel(client, view); await refresh(); }
    else if (name === '/login') { await login(client, view); await refresh(); }
    else if (name === '/logout') { await client.request('/api/account/logout', {}); await refresh(); }
    else if (name === '/mode') {
      const mode = await view.choose('权限模式', [{ label: '人工审批', value: 'default' }, { label: '完全访问 · 自动允许写入和命令执行', value: 'auto-all' }]);
      if (mode) { await client.request(`/api/session/${current.id}/mode`, { mode }); await restore(current.id); }
    } else if (name === '/expert') {
      const expertId = await view.choose('专家', [{ label: '无专家', value: '' }, ...info.experts.map(expert => ({ label: expert.name, value: expert.id }))]);
      if (expertId !== null) await client.request(`/api/session/${current.id}/expert`, { expertId });
    } else if (name === '/skills') view.append(`\n\nSkills\n${info.plugins.skills.map(skill => `${skill.name} · ${skill.description}`).join('\n')}`);
    else if (name === '/compact') { await client.request(`/api/session/${current.id}/compact`, {}); await restore(current.id); }
    else return false;
    return true;
  }
  async function send(text) {
    if (!connected) throw new Error('运行时未连接');
    try {
      if (await command(text)) return;
      await client.request(`/api/session/${current.id}/${running ? 'queue' : 'message'}`, { text });
      running = true;
      updateStatus();
    } finally { await processRequests(); }
  }
  const stream = client.events(event => {
    if (event.type === 'workspace_changed' || event.type === 'session_workspace_changed') {
      if (event.workspace?.path !== options.cwd) { connected = false; view.append('\n\n工作目录已被其他客户端切换。请退出后重新打开此项目。'); updateStatus(); }
    }
    if (event.type === 'settings_updated' || event.type === 'catalog_updated') refresh(true).catch(() => {});
    if (event.sessionId !== current?.id && event.rootSessionId === current?.id && ['permission_request', 'ui_request'].includes(event.type)) { enqueue(event.type, event.request); return; }
    if (event.sessionId !== current?.id && event.rootSessionId === current?.id && ['permission_resolved', 'ui_resolved'].includes(event.type)) { const index = requests.findIndex(item => item.request.reqId === event.reqId); if (index !== -1) requests.splice(index, 1); if (activeRequest === event.reqId) view.finishForm(null); return; }
    if (event.sessionId !== current?.id || selecting) return;
    if (event.type === 'message_start') view.append('\n\nMLI\n');
    if (event.type === 'text_delta') view.append(event.text);
    if (event.type === 'user_message') { running = true; view.append(`\n\nYou\n${event.text}`); updateStatus(); }
    if (event.type === 'tool_call') view.append(`\n\nTool · ${event.call.name}\n${JSON.stringify(event.call.args, null, 2)}`);
    if (event.type === 'tool_result') view.append(`\n${event.status || 'ok'}\n${event.content || ''}`);
    if (event.type === 'tool_output') view.append(event.text);
    if (event.type === 'permission_request' || event.type === 'ui_request') enqueue(event.type, event.request);
    if (event.type === 'permission_resolved' || event.type === 'ui_resolved') {
      const index = requests.findIndex(item => item.request.reqId === event.reqId);
      if (index !== -1) requests.splice(index, 1);
      if (activeRequest === event.reqId) view.finishForm(null);
    }
    if (event.type === 'error') view.append(`\n\nError\n${event.message}`);
    if (event.type === 'model_retry') view.append(`\nRetry · ${event.message}`);
    if (event.type === 'turn_end') { running = false; view.append(`\n\n${event.reason} · ${Math.round((event.durationMs || 0) / 1000)}s`); updateStatus(); }
    if (event.type === 'queue_updated') view.append(`\n队列 · ${event.queue.length}`);
  }, {
    signal: streamAbort.signal,
    onConnected: async () => { connected = true; if (current) await restore(current.id); updateStatus(); },
    onDisconnected: error => { connected = false; view.append(`\n连接中断 · ${error.message}`); updateStatus(); },
  });
  try {
    await refresh();
    if (options.resume) {
      const { sessions } = await client.request('/api/sessions');
      const id = typeof options.resume === 'string' ? options.resume : sessions[0]?.id;
      if (id) await restore(id);
    }
    if (!current) { const session = await client.request('/api/session', { title: '新会话' }); await restore(session.id); }
    onReady?.(view);
    if (options.positional?.length) await send(options.positional.join(' '));
    await finished;
    return 0;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    streamAbort.abort();
    view.close();
    await stream;
  }
}
