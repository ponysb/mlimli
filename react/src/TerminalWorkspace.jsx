import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Readline } from 'xterm-readline';
import { CircleStop, Copy, Menu, SquareTerminal, Trash2, X } from 'lucide-react';
import { terminalPrompt } from './terminal-session.mjs';
import '@xterm/xterm/css/xterm.css';

export default function TerminalWorkspace({ terminal, workspace, onRun, onStop, onClear, onClose, onToggle }) {
  const host = useRef(null), controller = useRef(null), latest = useRef(null);
  const [copyStatus, setCopyStatus] = useState('复制终端内容');
  const busy = terminal?.status === 'starting' || terminal?.status === 'running';
  const failed = terminal?.status === 'exited' && terminal.code !== 0;
  const cwd = terminal?.cwd || workspace?.path || '';
  const windowsShell = /^[a-z]:[\\/]|^\\\\/i.test(cwd);
  latest.current = { terminal, workspace, onRun, onStop, busy };

  useEffect(() => {
    const screen = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, "Liberation Mono", monospace',
      fontSize: 14, lineHeight: 1.3, letterSpacing: 0,
      cursorStyle: 'block', cursorBlink: true, scrollback: 5000,
      convertEol: true,
      theme: { background: '#181818', foreground: '#d4d4d4', cursor: '#e5e5e5', selectionBackground: '#ffffff33', black: '#181818', red: '#f48771', green: '#a3be8c', yellow: '#e5c07b', blue: '#75baff', magenta: '#c678dd', cyan: '#56b6c2', white: '#d4d4d4', brightBlack: '#858585', brightRed: '#ff9d8b', brightGreen: '#b8d7a3', brightYellow: '#f2d398', brightBlue: '#a1ceff', brightMagenta: '#dba4ed', brightCyan: '#8adbe4', brightWhite: '#ffffff' },
    });
    const fit = new FitAddon(), readline = new Readline();
    screen.loadAddon(fit);
    screen.loadAddon(readline);
    screen.open(host.current);
    const state = { screen, readline, processed: 0, reading: false, submitted: false, echoedCommand: null, disposed: false };
    controller.current = state;
    readline.setCtrlCHandler(() => { if (latest.current.busy || state.submitted) latest.current.onStop(); });
    screen.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'c' && screen.hasSelection()) {
        if (event.type === 'keydown') navigator.clipboard.writeText(screen.getSelection()).catch(() => {});
        return false;
      }
      if (latest.current.busy || state.submitted) {
        if (event.type === 'keydown' && event.ctrlKey && event.key.toLowerCase() === 'c') latest.current.onStop();
        return false;
      }
      if (event.key === 'Enter' && event.shiftKey) {
        if (event.type === 'keydown') screen.input('\x1b\r', true);
        return false;
      }
      return true;
    });
    function readPrompt() {
      if (state.disposed || state.reading || state.submitted || latest.current.busy || !latest.current.workspace) return;
      state.reading = true;
      readline.read(terminalPrompt(latest.current.workspace.path)).then(async (input) => {
        state.reading = false;
        if (state.disposed) return;
        const command = input.trim();
        if (!command) { readPrompt(); return; }
        state.submitted = true;
        screen.options.disableStdin = true;
        state.echoedCommand = command;
        const started = await latest.current.onRun(command);
        if (state.disposed) return;
        if (!started) { state.submitted = false; state.echoedCommand = null; screen.options.disableStdin = false; readPrompt(); }
      }).catch(() => { state.reading = false; });
    }
    state.readPrompt = readPrompt;
    const resize = () => { if (host.current?.clientWidth && host.current?.clientHeight) fit.fit(); };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    screen.focus();
    return () => { state.disposed = true; observer.disconnect(); controller.current = null; screen.dispose(); };
  }, [workspace?.id]);

  useEffect(() => {
    const state = controller.current;
    if (!state) return;
    const lines = terminal?.lines || [];
    if (lines.length < state.processed) state.processed = 0;
    for (const line of lines.slice(state.processed)) {
      if (line.stream === 'command' && line.command === state.echoedCommand) { state.echoedCommand = null; continue; }
      const text = line.stream === 'stderr' ? `\x1b[31m${line.text}\x1b[0m` : line.stream === 'status' ? `\x1b[90m${line.text}\x1b[0m` : line.text;
      state.screen.write(text);
    }
    state.processed = lines.length;
    state.screen.options.disableStdin = busy;
    if (!busy) {
      state.submitted = false;
      if (!state.reading) state.screen.write('', () => {
        if (state.disposed) return;
        if (state.screen.buffer.active.cursorX) state.screen.write('\r\n');
        state.readPrompt();
      });
    }
  }, [terminal, busy, workspace?.id]);

  async function copyOutput() {
    const screen = controller.current?.screen;
    if (!screen) return;
    const buffer = screen.buffer.active;
    const text = screen.getSelection() || Array.from({ length: buffer.length }, (_, index) => buffer.getLine(index)?.translateToString(true) || '').join('\n').trimEnd();
    try { await navigator.clipboard.writeText(text); setCopyStatus('已复制'); } catch { setCopyStatus('无法访问剪贴板'); }
  }

  function clearOutput() {
    controller.current?.screen.input('\x0c', true);
    controller.current?.screen.write('\x1b[3J');
    onClear();
    controller.current?.screen.focus();
  }

  return <div className="terminal-workspace">
    <header className="terminal-topbar">
      <div className="terminal-tab"><button className="mobile-menu" title="展开导航" onClick={onToggle}><Menu size={18}/></button><SquareTerminal size={15}/><b>{windowsShell ? 'cmd' : 'sh'}</b></div>
      <div className="terminal-actions">
        {busy && <button title="停止命令" onClick={onStop}><CircleStop size={15}/></button>}
        <button title={copyStatus} aria-label="复制终端内容" onClick={copyOutput} onMouseLeave={() => setCopyStatus('复制终端内容')}><Copy size={14}/></button>
        <button title="清空终端" disabled={busy} onClick={clearOutput}><Trash2 size={14}/></button>
        <button title="关闭终端" disabled={busy} onClick={onClose}><X size={16}/></button>
      </div>
    </header>
    <div ref={host} className="terminal-screen" aria-label="项目终端"/>
    <footer className="terminal-bottom-bar"><span className={`terminal-status ${busy ? 'running' : failed ? 'failed' : ''}`}>{busy ? '运行中' : failed ? `退出码 ${terminal.code ?? '未知'}` : terminal?.status === 'stopped' ? '已停止' : '就绪'}</span><span className="terminal-directory" title={cwd}>{cwd}</span></footer>
  </div>;
}
