import { spawn } from 'node:child_process';

export function stopProcessTree(child, signal = 'SIGTERM') {
  if (!child?.pid || child.exitCode !== null || child.signalCode) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => { try { child.kill(); } catch {} });
  } else {
    try { process.kill(-child.pid, signal); }
    catch { try { child.kill(signal); } catch {} }
  }
}
