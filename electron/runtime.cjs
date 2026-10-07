const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const { alive } = require('../core/runtime-host.cjs');

function prepareData(runtimeRoot, dataRoot) {
  fs.mkdirSync(dataRoot, { recursive: true });
  const configFile = path.join(dataRoot, 'config.json');
  if (!fs.existsSync(configFile)) {
    const config = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'config.example.json'), 'utf8'));
    config.security = { ...config.security, workspaceRoot: path.join(dataRoot, 'workspace') };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  }
  return configFile;
}

function startRuntime({ executable, runtimeRoot, dataRoot, timeoutMs = 30000, legacy = Number(process.versions.node.split('.')[0]) < 18, packaged = false, environment = {}, managed = false }) {
  prepareData(runtimeRoot, dataRoot);
  const logFile = path.join(dataRoot, 'desktop.log');
  const args = legacy ? ['--experimental-loader', pathToFileURL(path.join(runtimeRoot, 'core', 'plugin-resolver.mjs')).href] : [];
  args.push(path.join(runtimeRoot, 'core', 'bootstrap.cjs'));
  const logDescriptor = managed ? fs.openSync(logFile, 'a') : null;
  let child;
  try { child = spawn(executable, args, {
    cwd: dataRoot,
    windowsHide: true,
    detached: managed,
    stdio: ['ignore', managed ? logDescriptor : 'pipe', managed ? logDescriptor : 'pipe', 'ipc'],
    env: {
      ...process.env,
      ...environment,
      ELECTRON_RUN_AS_NODE: '1',
      MLI_CLIENT_PACKAGED: packaged ? '1' : '0',
      MLI_AGENT_DATA_DIR: dataRoot,
      MLI_AGENT_PORT: '0',
      MLI_AGENT_HOST: '127.0.0.1',
      MLI_ACCOUNT_SESSION_FILE: path.join(dataRoot, 'account-session.json'),
      MLI_RUNTIME_MANAGED: managed ? '1' : '0',
    },
  }); } finally { if (logDescriptor !== null) fs.closeSync(logDescriptor); }
  child.stdout?.on('data', data => fs.appendFileSync(logFile, data));
  child.stderr?.on('data', data => fs.appendFileSync(logFile, data));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('本地服务启动超时，请查看 desktop.log')), timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      child.off('error', fail);
      child.off('exit', earlyExit);
      child.off('message', receive);
    }
    function fail(error) { cleanup(); child.kill(); reject(error); }
    function earlyExit(code) { fail(new Error(`本地服务提前退出 (${code})，请查看 desktop.log`)); }
    function receive(message) {
      if (message?.type !== 'mli-ready' || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) return;
      cleanup();
      if (managed) { child.disconnect(); child.unref(); }
      resolve({ url: `http://127.0.0.1:${message.port}`, pid: message.pid });
    }
    child.once('error', fail);
    child.once('exit', earlyExit);
    child.on('message', receive);
  });
  return { child, ready, logFile };
}

async function request(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `运行时连接失败 HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

async function discoverRuntime(dataRoot) {
  let record;
  try { record = JSON.parse(fs.readFileSync(path.join(dataRoot, 'runtime.json'), 'utf8')); }
  catch { return null; }
  if (!alive(record.pid)) return null;
  const url = new URL(record.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('无效的本地运行时地址');
  try {
    const info = await request(`${record.url}/api/runtime`);
    if (info.pid === record.pid && info.instance === record.instance && path.resolve(info.dataRoot) === path.resolve(dataRoot)) return { ...record, dataRoot };
  } catch {}
  return null;
}

async function acquireRuntime(options) {
  const dataRoot = path.resolve(options.dataRoot);
  prepareData(options.runtimeRoot, dataRoot);
  let spawned;
  let record;
  const deadline = Date.now() + (options.timeoutMs || 30000);
  while (Date.now() < deadline) {
    record = await discoverRuntime(dataRoot);
    if (record) break;
    let lock;
    const lockFile = path.join(dataRoot, 'runtime-lock.json');
    try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); }
    catch { if (fs.existsSync(lockFile)) lock = { pid: 0, pending: true }; }
    if (!spawned && !lock?.pending && !alive(lock?.pid)) {
      spawned = startRuntime({ ...options, dataRoot, managed: true });
      try { await spawned.ready; }
      catch (error) {
        // A concurrent client can win the runtime lock while this child starts.
        let winner;
        try { winner = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch {}
        if (!alive(winner?.pid)) throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!record) throw new Error(`本地运行时连接超时，请检查 ${path.join(dataRoot, 'desktop.log')}`);
  return leaseRuntime(record, spawned);
}

async function leaseRuntime(record, spawned) {
  const id = crypto.randomUUID();
  const lease = { id, instance: record.instance };
  await request(`${record.url}/api/runtime/lease`, lease);
  const heartbeat = setInterval(() => { request(`${record.url}/api/runtime/lease`, lease).catch(() => {}); }, 25000);
  heartbeat.unref();
  let released = false;
  return {
    url: record.url, pid: record.pid, child: spawned?.child.pid === record.pid ? spawned.child : undefined, logFile: record.dataRoot ? path.join(record.dataRoot, 'desktop.log') : spawned?.logFile,
    async prepareUpdate() {
      await request(`${record.url}/api/runtime/prepare-update`, lease);
      released = true;
      clearInterval(heartbeat);
      const deadline = Date.now() + 6000;
      while (alive(record.pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      if (alive(record.pid)) throw new Error('本地服务尚未退出，本次更新未启动，请重新打开应用后重试');
    },
    async release() {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      const response = await request(`${record.url}/api/runtime/lease`, { ...lease, release: true }).catch(() => null);
      if (response?.remaining === 0) {
        const deadline = Date.now() + 4000;
        while (alive(record.pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      }
    },
  };
}

async function connectRuntime(url) {
  const record = await request(`${url}/api/runtime`);
  if (!record.instance) return { url, pid: record.pid, release: async () => {} };
  return leaseRuntime({ ...record, url });
}

module.exports = { prepareData, startRuntime, discoverRuntime, acquireRuntime, connectRuntime };
