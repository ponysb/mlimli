import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { CircleStop, Copy, Menu, PanelRightOpen, SquareTerminal, Trash2, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const layoutFallback = {
  workspace: { display: 'flex', flex: '1 1 0', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  topbar: { display: 'flex', flex: '0 0 40px', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 },
  title: { display: 'flex', alignItems: 'center', minWidth: 0 },
  actions: { display: 'flex', alignItems: 'center', flex: '0 0 auto' },
  panes: { display: 'grid', flex: '1 1 0', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  pane: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  paneHead: { display: 'flex', flex: '0 0 32px', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 },
  paneTitle: { display: 'flex', alignItems: 'center', minWidth: 0 },
  screen: { flex: '1 1 0', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  status: { display: 'flex', flex: '0 0 24px', alignItems: 'center', minWidth: 0 },
};

function TerminalPane({ pane, workspace, index, canClose, onStart, onInput, onResize, onStop, onClear, onClose }) {
  const host = useRef(null), controller = useRef(null), latest = useRef({}), terminalId = useRef(null), pendingInput = useRef([]);
  const [copyStatus, setCopyStatus] = useState('复制终端内容');
  const terminal = pane.terminal;
  const busy = pane.launching || terminal?.status === 'starting' || (terminal?.interactive && terminal?.status === 'running');
  const failed = terminal?.status === 'exited' && terminal.code !== 0;
  const cwd = terminal?.cwd || workspace?.path || '';
  const windowsShell = /^[a-z]:[\\/]|^\\\\/i.test(cwd);
  latest.current = { onInput, onResize, onStart, paneId: pane.id };

  useEffect(() => {
    const screen = new Terminal({ fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace', fontSize: 13, lineHeight: 1.35, cursorStyle: 'bar', cursorWidth: 2, cursorBlink: true, scrollback: 10000, convertEol: true, theme: { background: '#111514', foreground: '#d8dfdc', cursor: '#8fc6aa', selectionBackground: '#6e9f883d' } });
    const fit = new FitAddon(); screen.loadAddon(fit); screen.open(host.current);
    const state = { screen, processed: 0, disposed: false }; controller.current = state;
    screen.attachCustomKeyEventHandler(event => { if (event.ctrlKey && event.key.toLowerCase() === 'c' && screen.hasSelection()) { if (event.type === 'keydown') navigator.clipboard.writeText(screen.getSelection()).catch(() => {}); return false; } return true; });
    screen.onData(data => { const id = terminalId.current; if (id) latest.current.onInput?.(id, data); else pendingInput.current.push(data); });
    const resize = () => { if (!host.current?.clientWidth || !host.current?.clientHeight) return; fit.fit(); latest.current.onResize?.(terminalId.current, { cols: screen.cols, rows: screen.rows }); };
    const start = async () => { fit.fit(); const id = await latest.current.onStart?.(pane.id, { cols: screen.cols, rows: screen.rows }); if (!id || state.disposed) return; terminalId.current = id; for (const data of pendingInput.current.splice(0)) latest.current.onInput?.(id, data); latest.current.onResize?.(id, { cols: screen.cols, rows: screen.rows }); };
    const observer = new ResizeObserver(resize); observer.observe(host.current); start(); screen.focus();
    return () => { state.disposed = true; observer.disconnect(); controller.current = null; screen.dispose(); };
  }, [workspace?.id, pane.id]);

  useEffect(() => { const state = controller.current; if (!state) return; const lines = terminal?.lines || []; if (lines.length < state.processed) { state.screen.clear(); state.processed = 0; } for (const line of lines.slice(state.processed)) state.screen.write(line.text || ''); state.processed = lines.length; }, [terminal]);
  async function copyOutput() { const screen = controller.current?.screen; if (!screen) return; const buffer = screen.buffer.active; const text = screen.getSelection() || Array.from({ length: buffer.length }, (_, line) => buffer.getLine(line)?.translateToString(true) || '').join('\n').trimEnd(); try { await navigator.clipboard.writeText(text); setCopyStatus('已复制'); } catch { setCopyStatus('无法访问剪贴板'); } }
  function clearOutput() { controller.current?.screen.clear(); onClear(); controller.current?.screen.focus(); }
  return <section className="terminal-pane" style={layoutFallback.pane} aria-label={`终端 ${index + 1}`}>
    <header className="terminal-pane-head" style={layoutFallback.paneHead}><span style={layoutFallback.paneTitle}><SquareTerminal size={14}/><b>{windowsShell ? 'cmd' : 'sh'}</b>{index > 0 && <small>{index + 1}</small>}</span><div className="terminal-pane-actions" style={layoutFallback.actions}>{busy && <button title="停止终端" aria-label="停止终端" onClick={onStop}><CircleStop size={14}/></button>}<button title={copyStatus} aria-label="复制终端内容" onClick={copyOutput} onMouseLeave={() => setCopyStatus('复制终端内容')}><Copy size={13}/></button><button title="清空终端" aria-label="清空终端" onClick={clearOutput}><Trash2 size={13}/></button>{canClose && <button title="终止并关闭此终端" aria-label="终止并关闭此终端" onClick={onClose}><X size={15}/></button>}</div></header>
    <div ref={host} className="terminal-screen" style={layoutFallback.screen} aria-label={`项目终端 ${index + 1}`}/><footer className="terminal-bottom-bar" style={layoutFallback.status}><span className={`terminal-status ${busy ? 'running' : failed ? 'failed' : ''}`}>{busy ? '交互中' : failed ? `退出码 ${terminal.code ?? '未知'}` : terminal?.status === 'stopped' ? '已停止' : '就绪'}</span><span className="terminal-directory" title={cwd}>{cwd}</span></footer>
  </section>;
}

export default function TerminalWorkspace({ panes, workspace, onStart, onInput, onResize, onStop, onClear, onAddPane, onClosePane, onClose, onToggle }) {
  return <div className="terminal-workspace" style={layoutFallback.workspace}><header className="terminal-topbar" style={layoutFallback.topbar}><div className="terminal-title" style={layoutFallback.title}><button className="mobile-menu" title="展开导航" onClick={onToggle}><Menu size={18}/></button><SquareTerminal size={15}/><b>终端</b><small>{panes.length > 1 ? `${panes.length} 个面板` : 'xterm.js · PTY'}</small></div><div className="terminal-actions" style={layoutFallback.actions}><button title="添加终端" aria-label="添加终端" onClick={onAddPane}><PanelRightOpen size={15}/></button><button title="终止并关闭终端" aria-label="终止并关闭终端" onClick={onClose}><X size={16}/></button></div></header><div className={`terminal-panes ${panes.length > 1 ? 'is-split' : ''}`} style={layoutFallback.panes}>{panes.map((pane, index) => <TerminalPane key={pane.id} pane={pane} workspace={workspace} index={index} canClose={panes.length > 1} onStart={onStart} onInput={onInput} onResize={onResize} onStop={() => onStop(pane.id)} onClear={() => onClear(pane.id)} onClose={() => onClosePane(pane.id)}/>)}</div></div>;
}
