import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { SyntaxStyle, type TextareaRenderable, type ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard, usePaste, useRenderer, useTerminalDimensions } from '@opentui/solid';
import { createPatch } from 'diff';
import { modelLabel, safeText } from './state.mjs';

const colors = { bg: '#141619', panel: '#202327', text: '#e5e7e9', muted: '#969ca4', accent: '#79d5c2', selected: '#303a3e', warning: '#e6bf78', error: '#ef9393' };
const styles = () => SyntaxStyle.fromStyles({
  default: { fg: colors.text }, 'markup.heading': { fg: colors.accent, bold: true },
  'markup.strong': { fg: colors.text, bold: true }, 'markup.italic': { fg: colors.text, italic: true },
  'markup.raw': { fg: colors.warning }, keyword: { fg: '#db9fc5' }, string: { fg: colors.accent },
  comment: { fg: colors.muted }, number: { fg: colors.warning }, function: { fg: '#9fc6ef' },
});

function Part(props: { part: any; syntax: SyntaxStyle; expanded: boolean }) {
  const [open, setOpen] = createSignal(false);
  const [thinking, setThinking] = createSignal(false);
  const part = () => props.part;
  return <box flexShrink={0} paddingBottom={1}>
    <Show when={part().kind === 'user'}>
      <box border={['left']} borderColor={colors.accent} paddingLeft={1} paddingRight={1} backgroundColor={colors.panel}>
        <text fg={colors.accent}>你</text>
        <text fg={colors.text} wrapMode="word">{part().text}</text>
      </box>
    </Show>
    <Show when={part().kind === 'assistant'}>
      <Show when={part().thinking}>
        <text fg={colors.muted} onMouseDown={() => setThinking(!thinking())}>{thinking() ? '▾' : '▸'} 思考</text>
        <Show when={thinking()}><text fg={colors.muted} wrapMode="word">{part().thinking}</text></Show>
      </Show>
      <Show when={part().text} fallback={<text fg={colors.muted}>{part().status === 'running' ? '正在思考…' : ''}</text>}>
        <markdown content={part().text} syntaxStyle={props.syntax} fg={colors.text} streaming={part().status === 'running'} internalBlockMode="top-level" />
      </Show>
    </Show>
    <Show when={part().kind === 'tool'}>
      <text fg={['error', 'denied'].includes(part().status) ? colors.error : colors.warning} onMouseDown={() => setOpen(!open())}>
        {open() || props.expanded ? '▾' : '▸'} {part().status === 'running' ? '●' : '✓'} {safeText(part().name)} · {safeText(part().args?.path || part().args?.command || part().status).slice(0, 100)}
      </text>
      <Show when={open() || props.expanded}>
        <box paddingLeft={2} border={['left']} borderColor={colors.selected}>
          <text fg={colors.muted} wrapMode="word">{safeText(JSON.stringify(part().args || {}, null, 2))}</text>
          <text fg={colors.text} wrapMode="word">{part().text}</text>
          <For each={part().media || []}>{(media: any) => <text fg={colors.accent}>{safeText(media.name || media.path || media.type)}</text>}</For>
        </box>
      </Show>
    </Show>
    <Show when={part().kind === 'end'}><text fg={part().reason === 'error' ? colors.error : colors.muted}>
      {part().reason === 'done' ? '已完成' : part().reason === 'aborted' ? '已停止' : part().text} · {Math.round((part().durationMs || 0) / 1000)}s
    </text></Show>
  </box>;
}

function Dialog(props: { dialog: any; controller: any; onBind: (value: any) => void }) {
  const dimensions = useTerminalDimensions();
  const [query, setQuery] = createSignal(props.dialog.initial || '');
  const [index, setIndex] = createSignal(0);
  let search: TextareaRenderable;
  let list: ScrollBoxRenderable;
  const choices = createMemo(() => (props.dialog.choices || []).filter((item: any) => `${item.label} ${item.detail || ''} ${item.value}`.toLowerCase().includes(query().toLowerCase())));
  const select = () => {
    if (props.dialog.kind === 'input') props.controller.finishDialog(query());
    else if (choices()[index()]) props.controller.finishDialog(choices()[index()].value);
  };
  const change = (value: string) => { setQuery(value); setIndex(0); };
  onMount(() => {
    props.onBind({
      select,
      move(delta: number) {
        setIndex(previous => Math.max(0, Math.min(choices().length - 1, previous + delta)));
        list?.scrollChildIntoView(`choice:${index()}`);
      },
      secret: props.dialog.secret,
      text: query,
      change,
    });
    if (!props.dialog.secret) search?.focus();
  });
  onCleanup(() => props.onBind(null));
  return <box position="absolute" left={0} top={0} width="100%" height="100%" zIndex={100} backgroundColor={colors.bg} alignItems="center" justifyContent="center" padding={1}>
    <box width="100%" maxWidth={76} maxHeight={Math.max(4, dimensions().height - 2)} backgroundColor={colors.panel} padding={1} border borderColor={colors.selected}>
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <text fg={colors.accent} wrapMode="word" flexGrow={1}>{props.dialog.title}</text>
        <text fg={colors.muted} onMouseDown={() => props.controller.finishDialog(null)}> × </text>
      </box>
      <Show when={props.dialog.description}>
        <scrollbox maxHeight={Math.max(2, Math.floor(dimensions().height / 3))} flexShrink={1}><text fg={colors.warning} wrapMode="word">{safeText(props.dialog.description)}</text></scrollbox>
      </Show>
      <box paddingTop={1} paddingBottom={1} flexShrink={0}>
        <Show when={!props.dialog.secret} fallback={<text fg={colors.text}>{'*'.repeat(Array.from(query()).length) || ' '}</text>}>
          <textarea ref={value => { search = value; }} initialValue={props.dialog.initial || ''} minHeight={1} maxHeight={props.dialog.kind === 'input' ? 4 : 1} wrapMode="word"
            placeholder={props.dialog.kind === 'select' ? '搜索…' : '输入…'} textColor={colors.text} backgroundColor={colors.panel}
            keyBindings={[{ name: 'return', action: 'submit' }, { name: 'return', shift: true, action: 'newline' }]}
            onContentChange={() => change(search.plainText)} onSubmit={select} />
        </Show>
      </box>
      <Show when={props.dialog.kind === 'select'}>
        <scrollbox ref={value => { list = value; }} height={Math.max(1, Math.min(dimensions().height - 10, choices().reduce((count: number, item: any) => count + (item.detail ? 2 : 1), 0)))} minHeight={1} flexShrink={1} flexGrow={0}>
          <For each={choices()}>{(choice: any, i) => <box id={`choice:${i()}`} flexShrink={0} paddingLeft={1} paddingRight={1} backgroundColor={i() === index() ? colors.selected : colors.panel}
            onMouseDown={() => props.controller.finishDialog(choice.value)}>
            <text fg={i() === index() ? colors.accent : colors.text} wrapMode="word">{safeText(choice.label)}</text>
            <Show when={choice.detail}><text fg={colors.muted} wrapMode="word">{safeText(choice.detail)}</text></Show>
          </box>}</For>
          <Show when={!choices().length}><text fg={colors.muted}>没有匹配项</text></Show>
        </scrollbox>
      </Show>
      <Show when={props.dialog.kind === 'input'}><text fg={colors.accent} onMouseDown={select}>确认</text></Show>
    </box>
  </box>;
}

export function App(props: { controller: any; onReady?: (value: any) => void }) {
  const controller = props.controller;
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const [revision, setRevision] = createSignal(0);
  const changed = () => setRevision(value => value + 1);
  controller.on('change', changed);
  onCleanup(() => controller.off('change', changed));
  const session = createMemo(() => { revision(); return controller.session; });
  const partIds = createMemo(() => session().parts.map((part: any) => part.id));
  const info = createMemo(() => { revision(); return controller.info; });
  const dialog = createMemo(() => { revision(); return controller.dialog; });
  const status = createMemo(() => {
    revision();
    return { connected: controller.connected, busy: controller.busy, notice: controller.notice };
  });
  const pending = createMemo(() => session().permission || session().uiRequests[0]);
  const [draft, setDraft] = createSignal(controller.draft);
  const [completionIndex, setCompletionIndex] = createSignal(0);
  const [completionHidden, setCompletionHidden] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [approvalIndex, setApprovalIndex] = createSignal(0);
  const [escapeAt, setEscapeAt] = createSignal(0);
  let editor: TextareaRenderable;
  let transcript: ScrollBoxRenderable;
  let modal: any;
  let previousDialog: any;
  let historyIndex = controller.history.length;
  let historyDraft = '';
  const syntax = styles();
  onCleanup(() => syntax.destroy());
  const approvalChoices = [{ label: '拒绝', value: 'deny' }, { label: '允许一次', value: 'allow' }, { label: '会话允许', value: 'allow_session' }, { label: '始终允许', value: 'allow_always' }];
  const completion = createMemo(() => {
    revision();
    if (completionHidden() || dialog() || pending() || !/^\/[\w-]*$/.test(draft())) return [];
    return controller.commands().filter((item: any) => item.value.startsWith(draft())).slice(0, 7);
  });
  const syncEditor = () => {
    if (!editor || editor.isDestroyed) return;
    const text = controller.draft;
    const cursor = controller.cursor;
    if (editor.plainText !== text) {
      editor.setText(text);
      setDraft(text);
    }
    if (editor.cursorOffset !== cursor) editor.cursorOffset = Math.min(cursor, editor.plainText.length);
  };
  const focus = () => { if (!dialog() && !pending() && !editor?.isDestroyed) editor?.focus(); };
  const setText = (text: string, cursor = text.length) => {
    controller.saveDraft(text, cursor);
    syncEditor();
    setDraft(text);
    setCompletionIndex(0);
    focus();
  };
  const onContent = () => {
    const text = editor.plainText;
    controller.saveDraft(text, editor.cursorOffset);
    setDraft(text);
    setCompletionIndex(0);
    setCompletionHidden(false);
  };
  const perform = (action: () => any) => Promise.resolve().then(action).catch(error => controller.error(error));
  const submit = () => { setCompletionHidden(true); perform(() => controller.send(editor.plainText)); };
  const chooseCompletion = (execute: boolean) => {
    const choice = completion()[completionIndex()];
    if (!choice) return;
    if (execute) { setText(choice.value); setCompletionHidden(true); perform(() => controller.send(choice.value)); }
    else { setText(choice.value + ' '); setCompletionHidden(true); }
  };
  const history = (delta: number) => {
    if (historyIndex === controller.history.length) historyDraft = editor.plainText;
    const index = Math.max(0, Math.min(controller.history.length, historyIndex + delta));
    if (index === historyIndex) return;
    historyIndex = index;
    setText(index === controller.history.length ? historyDraft : controller.history[index]);
  };
  createEffect(() => {
    revision();
    syncEditor();
    if (controller.history.length !== historyIndex && !controller.draft) historyIndex = controller.history.length;
    const active = dialog();
    if (active || pending()) editor?.blur();
    else queueMicrotask(focus);
    if (previousDialog && !active) queueMicrotask(focus);
    previousDialog = active;
    if (!active && session().uiRequests.length && !session().permission && !controller.requestBusy) queueMicrotask(() => perform(() => controller.answer()));
  });
  createEffect(() => { session().permission?.reqId; setApprovalIndex(0); });
  onMount(() => { syncEditor(); focus(); props.onReady?.({ editor, transcript, setText }); });

  usePaste(event => {
    if (dialog()?.secret && modal) {
      event.preventDefault(); event.stopPropagation();
      modal.change(modal.text() + safeText(new TextDecoder().decode(event.bytes)).replace(/\r?\n/g, ''));
    } else if (!dialog() && !pending()) focus();
  });
  useKeyboard(event => {
    const consume = () => { event.preventDefault(); event.stopPropagation(); };
    if (dialog()) {
      if (event.name === 'escape' || event.ctrl && event.name === 'c') { consume(); controller.finishDialog(null); return; }
      if (dialog().kind === 'select' && (event.name === 'up' || event.name === 'down')) { consume(); modal?.move(event.name === 'up' ? -1 : 1); return; }
      if (event.name === 'return' && !event.shift) { consume(); modal?.select(); return; }
      if (dialog().secret && modal) {
        consume();
        if (event.name === 'backspace') modal.change(Array.from(modal.text()).slice(0, -1).join(''));
        else if (event.ctrl && event.name === 'u') modal.change('');
        else if (!event.ctrl && !event.meta && event.sequence && !event.sequence.startsWith('\x1b')) modal.change(modal.text() + safeText(event.sequence));
      }
      return;
    }
    if (event.ctrl && event.name === 'd') { consume(); controller.onExit?.(); return; }
    if (event.name === 'escape') {
      consume();
      if (completion().length) { setCompletionHidden(true); return; }
      if (session().running) {
        if (escapeAt() && Date.now() - escapeAt() < 5000) { setEscapeAt(0); perform(() => controller.stop()); }
        else { setEscapeAt(Date.now()); controller.notice = '再次按 Esc 停止任务'; controller.changed(); }
      }
      return;
    }
    if (pending()) {
      consume();
      if (session().permission) {
        if (['pageup', 'pagedown'].includes(event.name)) {
          const preview = renderer.root.findDescendantById('approval-preview') as ScrollBoxRenderable;
          preview?.scrollBy((event.name === 'pageup' ? -1 : 1) * Math.max(1, Math.floor(dimensions().height / 3)));
        }
        if (event.name === 'left' || event.name === 'up') setApprovalIndex(value => Math.max(0, value - 1));
        if (event.name === 'right' || event.name === 'down' || event.name === 'tab') setApprovalIndex(value => (value + 1) % 4);
        if (event.name === 'return') perform(() => controller.permission(approvalChoices[approvalIndex()].value));
      }
      return;
    }
    if (event.ctrl && event.name === 'c') { consume(); if (editor.plainText) setText(''); else controller.onExit?.(); return; }
    if (event.ctrl && event.name === 'p') { consume(); perform(() => controller.palette()); return; }
    if (event.ctrl && event.name === 'o') { consume(); setExpanded(!expanded()); return; }
    if (completion().length && ['up', 'down', 'return', 'tab'].includes(event.name)) {
      consume();
      if (event.name === 'up' || event.name === 'down') setCompletionIndex(value => (value + (event.name === 'up' ? -1 : 1) + completion().length) % completion().length);
      else chooseCompletion(event.name === 'return');
      return;
    }
    if (['pageup', 'pagedown'].includes(event.name)) { consume(); transcript?.scrollBy((event.name === 'pageup' ? -1 : 1) * Math.max(1, dimensions().height - 8)); return; }
    if (event.name === 'up' && (event.ctrl || editor?.logicalCursor.row === 0)) { consume(); history(-1); return; }
    if (event.name === 'down' && (event.ctrl || editor?.cursorOffset === editor?.plainText.length)) { consume(); history(1); return; }
    // A transcript click must not make the next character disappear.
    if (!event.ctrl && !event.meta || ['backspace', 'delete'].includes(event.name)) focus();
  });

  return <box width="100%" height="100%" backgroundColor={colors.bg} flexDirection="column" paddingLeft={dimensions().width < 60 ? 1 : 2} paddingRight={dimensions().width < 60 ? 1 : 2}>
    <Show when={session().id}>
      <box flexShrink={0} paddingTop={1} paddingBottom={1} flexDirection="row" justifyContent="space-between">
        <text fg={colors.accent} flexGrow={1} wrapMode="word">MLI · {safeText(session().title)}</text>
        <text fg={colors.muted} onMouseDown={() => perform(() => controller.command('/resume'))}> 会话 </text>
      </box>
    </Show>
    <box flexGrow={1} minHeight={0} justifyContent={session().id ? 'flex-start' : 'flex-end'} alignItems="center">
      <Show when={!session().id} fallback={<scrollbox id="transcript" ref={value => { transcript = value; }} width="100%" flexGrow={1} minHeight={0} stickyScroll stickyStart="bottom" paddingRight={1}>
        <For each={partIds()}>{id => <Part part={session().parts.find((part: any) => part.id === id)} syntax={syntax} expanded={expanded()} />}</For>
      </scrollbox>}>
        <box width="100%" maxWidth={75} flexShrink={0} paddingBottom={2}>
          <ascii_font font="tiny" text="MLI" color={colors.accent} />
          <text fg={colors.text}>魔力工作台</text>
        </box>
      </Show>
    </box>
    <box width="100%" maxWidth={session().id ? undefined : 75} alignSelf="center" flexShrink={0} paddingTop={1}>
      <Show when={completion().length}>
        <box backgroundColor={colors.panel} paddingLeft={1} paddingRight={1} flexShrink={0}>
          <For each={completion()}>{(item: any, index) => <box backgroundColor={index() === completionIndex() ? colors.selected : colors.panel} onMouseDown={() => { setCompletionIndex(index()); chooseCompletion(true); }}>
            <text fg={index() === completionIndex() ? colors.accent : colors.text}>{item.value}   {item.label}</text>
          </box>}</For>
        </box>
      </Show>
      <Show when={session().permission}>
        <box maxHeight={Math.max(4, Math.floor(dimensions().height * 0.5))} backgroundColor={colors.panel} border={['left']} borderColor={colors.warning} paddingLeft={1} paddingRight={1}>
          <text fg={colors.warning}>执行审批 · {session().permission.levelLabel} · {session().permission.tool}</text>
          <scrollbox id="approval-preview" minHeight={1} maxHeight={Math.max(1, Math.floor(dimensions().height / 3))} flexShrink={1}>
            <text fg={colors.text} wrapMode="word">{safeText(session().permission.summary)}</text>
            <Show when={session().permission.preview?.kind === 'diff'}>
              <text fg={colors.muted}>{safeText(session().permission.preview.path)}</text>
              <diff diff={createPatch(session().permission.preview.path || 'file', session().permission.preview.before || '', session().permission.preview.after || '')} syntaxStyle={syntax} view="unified" showLineNumbers wrapMode="word" />
            </Show>
          </scrollbox>
          <box flexDirection="row" flexWrap="wrap" flexShrink={0}>
            <For each={approvalChoices}>{(choice, index) => <text fg={index() === approvalIndex() ? colors.bg : colors.text} bg={index() === approvalIndex() ? colors.warning : colors.panel}
              onMouseDown={() => perform(() => controller.permission(choice.value))}> {choice.label} </text>}</For>
          </box>
        </box>
      </Show>
      <box border={['left']} borderColor={colors.accent} paddingLeft={1} paddingRight={1} backgroundColor={colors.panel} visible={!pending()}>
        <textarea ref={value => { editor = value; }} initialValue={controller.draft} minHeight={1} maxHeight={Math.max(1, Math.floor(dimensions().height / 4))} wrapMode="word"
          textColor={colors.text} backgroundColor={colors.panel} placeholder={session().running ? '补充任务…' : '你想做什么？'}
          keyBindings={[{ name: 'return', action: 'submit' }, { name: 'return', shift: true, action: 'newline' }, { name: 'return', meta: true, action: 'newline' }, { name: 'j', ctrl: true, action: 'newline' }]}
          onContentChange={onContent} onCursorChange={() => { if (editor) controller.saveDraft(editor.plainText, editor.cursorOffset); }} onSubmit={submit} />
      </box>
      <box flexDirection="row" flexWrap="wrap" backgroundColor={colors.panel} paddingLeft={1} paddingRight={1}>
        <text fg={colors.accent} onMouseDown={() => perform(() => controller.command('/model'))}> {modelLabel(info())} </text>
        <text fg={colors.warning} onMouseDown={() => perform(() => controller.command('/mode'))}> {session().mode === 'auto-all' ? '完全访问' : '人工审批'} </text>
        <text fg={colors.muted} onMouseDown={() => perform(() => controller.command('/expert'))}> {safeText(info().experts?.find((expert: any) => expert.id === session().expertId)?.name || '无专家')} </text>
      </box>
      <box flexDirection="row" flexWrap="wrap" paddingTop={1} flexShrink={0}>
        <text fg={colors.muted} onMouseDown={() => perform(() => controller.palette())}> / 命令  </text>
        <text fg={colors.muted} onMouseDown={() => perform(() => controller.command('/model'))}> 模型  </text>
        <text fg={colors.muted} onMouseDown={() => perform(() => controller.command('/resume'))}> 会话  </text>
        <text fg={session().running ? colors.warning : colors.accent}>{!status().connected ? '连接中…' : status().busy ? '提交中…' : session().permission ? '等待审批' : session().running ? '● 运行中' : '● 就绪'}{session().queue.length ? ` · 队列 ${session().queue.length}` : ''}</text>
      </box>
    </box>
    <Show when={!session().id}><box flexGrow={1} minHeight={0} /></Show>
    <box flexShrink={0} paddingTop={1} paddingBottom={1}>
      <Show when={status().notice}><text fg={colors.error} wrapMode="word">{status().notice}</text></Show>
      <text fg={colors.muted} wrapMode="word">{safeText(controller.options.cwd)}{session().context ? ` · ${session().context.percent}%` : ''}</text>
    </box>
    <Show when={dialog()} keyed>{active => <Dialog dialog={active} controller={controller} onBind={value => { modal = value; }} />}</Show>
  </box>;
}
