export function terminalPrompt(cwd = '') {
  const directory = String(cwd).replace(/[\x00-\x1f\x7f]/g, '');
  return /^[a-z]:[\\/]|^\\\\/i.test(directory) ? `${directory}> ` : `${directory || '~'} $ `;
}

export function applyTerminalEvent(terminal, event) {
  if (!terminal || terminal.terminalId !== event.terminalId) return terminal;
  if (event.type === 'terminal_started') return { ...terminal, status: 'running', cwd: event.cwd || terminal.cwd };
  if (event.type === 'terminal_output') return { ...terminal, lines: [...terminal.lines, { stream: event.stream, text: event.text }] };
  if (event.type !== 'terminal_exit' || ['exited', 'stopped'].includes(terminal.status)) return terminal;
  const stopped = Boolean(event.signal);
  const failed = !stopped && event.code !== 0;
  const message = stopped ? `已停止 · ${event.signal}` : failed ? `进程退出 · ${event.code ?? '未知退出码'}` : '';
  return { ...terminal, status: stopped ? 'stopped' : 'exited', code: event.code, signal: event.signal, lines: message ? [...terminal.lines, { stream: failed ? 'stderr' : 'status', text: `\r\n${message}\r\n` }] : terminal.lines };
}

export function createTerminalSession(previous, result, events = []) {
  const terminal = { ...result, status: 'starting', lines: [...(previous?.lines || []), { stream: 'command', command: result.command, text: `${terminalPrompt(result.cwd)}${result.command}\r\n` }] };
  return events.reduce(applyTerminalEvent, terminal);
}
