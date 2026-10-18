// Trusted long-lived broker, outside the sandbox. Initializing Anthropic
// Sandbox Runtime is the expensive part (Windows: provisioning check, WFP
// probe, inheritable ACL grants over the whole workspace), so it happens once
// per workspace/policy and every command reuses it. Commands run concurrently;
// a different workspace or policy waits for running commands, then resets.
import { spawn } from 'node:child_process';
import { SandboxManager, SandboxRuntimeConfigSchema, getWindowsSandboxUserStatusAsync, grantWindowsAcl, resolveSrtWin, revokeWindowsAcl } from '@anthropic-ai/sandbox-runtime';

const WINDOWS = process.platform === 'win32';
const commands = new Map();
let current = null; // { key, ready: Promise }
let switching = Promise.resolve();
let helperAcl, shuttingDown = false;

const send = message => { if (process.connected) try { process.send(message, () => {}); } catch {} };
const failure = error => ({ code: String(error?.code || 'sandbox_failed'), message: String(error?.message || error).slice(0, 4000) });
// Commands still waiting for a session have no child and never block a switch.
const drained = () => new Promise(resolve => { const check = () => [...commands.values()].some(entry => entry.child) ? setTimeout(check, 100) : resolve(); check(); });

async function helperAccess(helper) {
  // CreateProcessWithLogonW launches the pinned helper as the sandbox account.
  // Per-user installs are unreadable to it until this grant exists.
  if (!WINDOWS || helperAcl) return;
  const srtWin = resolveSrtWin({ path: helper.file });
  const user = await getWindowsSandboxUserStatusAsync({ srtWin });
  if (!user.provisioned || !user.credPresent) throw Object.assign(new Error('Windows sandbox user is not provisioned'), { code: 'not_provisioned' });
  helperAcl = { sandboxUserSid: user.sid, read: [helper.directory], write: [], srtWin };
  grantWindowsAcl(helperAcl);
}

function revokeHelperAccess() {
  if (!helperAcl) return;
  try { revokeWindowsAcl(helperAcl); } catch (error) { process.stderr.write(`helper ACL 撤销失败：${error.message}\n`); }
  helperAcl = undefined;
}

// Upstream reset() revokes every grant held by this process, the helper
// grant included; the next initialize must grant it again or the sandbox
// account cannot start srt-win (CreateProcessWithLogonW: access denied).
async function resetSession() {
  try { await SandboxManager.reset(); }
  finally { helperAcl = undefined; }
}

// Serialized: only one initialize/reset sequence runs at a time.
function session({ key, config, helper }) {
  if (current?.key === key) return current.ready;
  switching = switching.catch(() => {}).then(async () => {
    if (current?.key === key) return current.ready;
    if (current) {
      await drained();
      try { await current.ready; } catch {}
      try { await resetSession(); } catch {}
      current = null;
    }
    const ready = (async () => {
      await helperAccess(helper);
      await SandboxManager.initialize(SandboxRuntimeConfigSchema.parse(config), undefined, false);
      if (!await SandboxManager.waitForNetworkInitialization()) throw Object.assign(new Error('网络隔离代理初始化失败'), { code: 'network_init_failed' });
    })();
    current = { key, ready };
    // A failed initialization must not be reused by the next command.
    ready.catch(async () => { if (current?.ready === ready) { current = null; try { await resetSession(); } catch {} } });
    return ready;
  });
  return switching;
}

// Windows exposes the target's environment only through `srt-win exec --env`.
// Disable schannel revocation checks there; WFP blocks the CRL/OCSP endpoints.
function withWindowsEnv(argv, extra) {
  const separator = argv.indexOf('--');
  if (separator < 0) return argv;
  const added = Object.entries(extra).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
  return [...argv.slice(0, separator), ...added, ...argv.slice(separator)];
}

async function execute(message) {
  const { id } = message;
  const entry = { child: null, stopped: false };
  commands.set(id, entry);
  try {
    await session(message.session);
    send({ type: 'phase', id, phase: 'initialized' });
    if (entry.stopped) return send({ type: 'exit', id, code: 1, signal: null });
    const shell = WINDOWS ? 'cmd' : '/bin/sh';
    let { argv, env } = await SandboxManager.wrapWithSandboxArgv(message.command, shell, message.perExec, undefined, message.cwd, { commandId: id });
    if (WINDOWS && message.windowsEnv) argv = withWindowsEnv(argv, message.windowsEnv);
    if (entry.stopped) return send({ type: 'exit', id, code: 1, signal: null });
    const child = spawn(argv[0], argv.slice(1), { cwd: message.cwd, env: { ...env, ...(message.env || {}) }, shell: false, windowsHide: true, detached: !WINDOWS, stdio: ['ignore', 'pipe', 'pipe'] });
    entry.child = child;
    send({ type: 'started', id, pid: child.pid });
    child.stdout.on('data', data => send({ type: 'stdout', id, data }));
    child.stderr.on('data', data => send({ type: 'stderr', id, data }));
    child.once('error', error => { send({ type: 'stderr', id, data: Buffer.from(`命令启动失败：${error.message}\n`) }); });
    child.once('close', (code, signal) => send({ type: 'exit', id, code: entry.stopped ? 1 : code, signal }));
  } catch (error) {
    // Only initialization/wrapping failures land here; the target never ran,
    // so a retry cannot replay its side effects.
    send({ type: 'sandbox_error', id, ...failure(error) });
    send({ type: 'exit', id, code: 1, signal: null });
  } finally {
    if (!entry.child) commands.delete(id);
    else entry.child.once('close', () => commands.delete(id));
  }
}

function stop(id) {
  const entry = commands.get(id);
  if (!entry) return;
  entry.stopped = true;
  const child = entry.child;
  if (!child?.pid || child.exitCode !== null) return;
  // Windows: the helper owns a kill-on-close job, so killing it terminates
  // descendants under the sandbox SID. POSIX: the command has its own group.
  if (WINDOWS) child.kill();
  else try { process.kill(-child.pid, 'SIGKILL'); } catch {}
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const id of commands.keys()) stop(id);
  try { await current?.ready; } catch {}
  // Revoke the helper grant explicitly too: reset() releases it only when a
  // session was initialized.
  revokeHelperAccess();
  try { await resetSession(); } catch (error) { process.stderr.write(`沙箱清理失败：${error.message}\n`); }
  current = null;
  process.disconnect?.();
}

process.on('message', message => {
  if (message?.type === 'execute' && shuttingDown) {
    send({ type: 'sandbox_error', id: message.id, code: 'broker_shutting_down', message: '沙箱 broker 正在退出，请重试' });
    send({ type: 'exit', id: message.id, code: 1, signal: null });
  } else if (message?.type === 'execute') execute(message);
  else if (message?.type === 'stop') stop(message.id);
  else if (message?.type === 'shutdown') shutdown();
});
process.on('disconnect', () => { shutdown().catch(() => {}); });
