// Host side of the long-lived sandbox broker (sandbox-broker-worker.mjs).
// One broker per runtime keeps Anthropic Sandbox Runtime initialized between
// commands; it shuts down after a short idle period so its ACL session and
// the cross-process Windows claim are not held forever.
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { SandboxError } from './sandbox-policy.mjs';
import { stopProcessTree } from './process-tree.mjs';

const WORKER = fileURLToPath(new URL('./sandbox-broker-worker.mjs', import.meta.url));
// Re-initializing re-applies workspace ACLs on Windows, so keep a warm
// session across the pauses of a normal agent turn.
const IDLE_MS = 10 * 60 * 1000;
let broker, starting;

const settleWithin = (promise, ms) => { let timer; return Promise.race([promise.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), ms); })]).finally(() => clearTimeout(timer)); };

// Another runtime (CLI, second client) may hold the Windows claim. Wait for it
// instead of failing at once; parallel commands in this runtime share the broker.
async function acquire({ claim, requestRelease, onContention }, signal, timeoutMs = 120000) {
  if (!claim) return null;
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    try { return await claim(onContention); }
    catch (error) {
      if (error.code !== 'SANDBOX_BUSY' || Date.now() > deadline) throw error.code === 'SANDBOX_BUSY'
        ? new SandboxError('原生沙箱正被另一个 MLI 进程（如命令行版或另一个客户端）的运行中命令占用，等待 2 分钟后仍未释放；请结束那边的命令后重试', 'SANDBOX_BUSY')
        : error;
      if (signal?.aborted) throw new SandboxError('任务已停止', 'ABORT_ERR');
      // An idle holder releases on request; a busy one finishes first.
      if (attempt % 8 === 0) await requestRelease?.();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}

async function startBroker({ env, claim, requestRelease, signal }) {
  // A broker that is resetting accepts no new work; wait for a fresh one.
  if (broker?.shuttingDown) await broker.closed;
  if (broker && !broker.exited) return broker;
  return starting ??= (async () => {
    const holder = {};
    const onContention = () => { const state = holder.state; if (!state || state.exited) return; state.releaseRequested = true; touch(state); };
    const release = await acquire({ claim, requestRelease, onContention }, signal);
    let child;
    try { child = spawn(process.execPath, [WORKER], { cwd: os.tmpdir(), env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced' }); }
    catch (error) { await release?.(); throw new SandboxError(`沙箱 broker 启动失败：${error.message}`, 'SANDBOX_UNAVAILABLE'); }
    const state = { child, release, commands: new Map(), stderr: '', exited: false, idle: null };
    state.closed = new Promise(resolve => child.once('exit', resolve));
    child.stderr.on('data', chunk => { state.stderr = (state.stderr + chunk).slice(-4000); });
    child.on('message', message => { state.commands.get(message?.id)?.receive(message); });
    child.once('error', () => {});
    state.closed.then(async () => {
      state.exited = true;
      clearTimeout(state.idle);
      const detail = state.stderr.trim() || '沙箱 broker 意外退出';
      for (const command of state.commands.values()) command.brokerExited(detail);
      if (broker === state) broker = undefined;
      await release?.();
    });
    broker = state;
    holder.state = state;
    return state;
  })().finally(() => { starting = undefined; });
}

// An idle broker must not keep a one-shot CLI process alive; when the parent
// exits, the broker sees the IPC disconnect and resets its session.
function hold(state, active) {
  for (const handle of [state.child, state.child.channel, state.child.stderr]) {
    try { active ? handle?.ref?.() : handle?.unref?.(); } catch {}
  }
  state.release?.hold?.(active);
}

function touch(state) {
  clearTimeout(state.idle);
  hold(state, state.commands.size > 0);
  if (state.commands.size) return;
  state.idle = setTimeout(() => { shutdownSandboxBroker().catch(() => {}); }, state.releaseRequested ? 0 : IDLE_MS);
  state.idle.unref?.();
}

export function sandboxBrokerRunning() { return Boolean(broker && !broker.exited); }

export async function shutdownSandboxBroker() {
  const state = broker;
  if (!state || state.exited) return;
  clearTimeout(state.idle);
  state.shuttingDown = true;
  if (state.child.connected) state.child.send({ type: 'shutdown' }, () => {});
  // reset() revokes the session ACLs; give it time before forcing.
  if (!await settleWithin(state.closed, 30000)) { stopProcessTree(state.child, 'SIGKILL'); await settleWithin(state.closed, 5000); }
}

class BrokerCommand extends EventEmitter {
  constructor(state, id, sandbox, onCleanup) {
    super();
    Object.assign(this, { state, id, sandbox, onCleanup, stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, done: false, started: false });
    this.closed = new Promise(resolve => this.once('close', resolve));
  }
  receive(message) {
    if (message.type === 'stdout') { this.wroteStdout = true; this.stdout.write(message.data); }
    else if (message.type === 'stderr') { if ((this.stderrHead ??= '').length < 2000) this.stderrHead += Buffer.from(message.data).toString('utf8'); this.stderr.write(message.data); }
    else if (message.type === 'started') { this.started = true; this.pid = message.pid; this.sandbox.phase = 'target-started'; }
    else if (message.type === 'phase') this.sandbox.phase = String(message.phase || '').slice(0, 80);
    else if (message.type === 'sandbox_error') this.sandboxFailure = { code: String(message.code || ''), message: String(message.message || '').slice(0, 4000) };
    else if (message.type === 'exit') {
      // srt-win reports its own launch failures on stderr before the target
      // exists (e.g. CreateProcessWithLogonW); those are sandbox failures.
      const launch = !this.sandboxFailure && message.code !== 0 && !this.wroteStdout && /^srt-win: error: (.*)/.exec(this.stderrHead || '');
      if (launch) this.sandboxFailure = { code: 'srt_win_launch', message: launch[1].trim().slice(0, 4000) };
      this.finish(message.code ?? 1, message.signal || null);
    }
  }
  brokerExited(detail) {
    // Only a command that never started may be retried; a started one may
    // have side effects.
    if (!this.started && !this.sandboxFailure) this.sandboxFailure = { code: 'broker_exited', message: detail };
    this.finish(1, null);
  }
  finish(code, signal) {
    if (this.done) return;
    this.done = true;
    this.exitCode = code; this.signalCode = signal;
    this.state.commands.delete(this.id);
    const ended = stream => stream.readableEnded ? Promise.resolve() : settleWithin(new Promise(resolve => stream.once('end', resolve)), 1000);
    this.stdout.end(); this.stderr.end();
    Promise.all([ended(this.stdout), ended(this.stderr)]).then(() => this.emit('close', code, signal));
  }
  stopSandbox() {
    return this.stopping ??= (async () => {
      if (this.done) return;
      if (this.state.child.connected) this.state.child.send({ type: 'stop', id: this.id }, () => {});
      if (await settleWithin(this.closed, 8000)) return;
      if (this.pid) stopProcessTree({ pid: this.pid, exitCode: null }, 'SIGKILL');
      if (!await settleWithin(this.closed, 3000)) this.finish(1, 'SIGKILL');
    })();
  }
  cleanupSandbox() {
    return this.cleaning ??= (async () => {
      try { await this.stopSandbox(); }
      finally { this.onCleanup?.(); touch(this.state); }
    })();
  }
}

export async function runBrokerCommand(command, { session, perExec, cwd, env, windowsEnv, brokerEnv, claim, requestRelease, signal, sandbox, onCleanup }) {
  const state = await startBroker({ env: brokerEnv, claim, requestRelease, signal });
  if (signal?.aborted) { touch(state); throw new SandboxError('任务已停止', 'ABORT_ERR'); }
  const id = crypto.randomUUID();
  const child = new BrokerCommand(state, id, sandbox, onCleanup);
  state.commands.set(id, child);
  clearTimeout(state.idle);
  hold(state, true);
  state.child.send({ type: 'execute', id, command, session, perExec, cwd, env, windowsEnv }, error => {
    if (error) { child.sandboxFailure = { code: 'broker_ipc', message: error.message }; child.finish(1, null); }
  });
  return child;
}
