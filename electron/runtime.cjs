const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

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

function startRuntime({ executable, runtimeRoot, dataRoot, timeoutMs = 30000, legacy = Number(process.versions.node.split('.')[0]) < 18, packaged = false, environment = {} }) {
  prepareData(runtimeRoot, dataRoot);
  const logFile = path.join(dataRoot, 'desktop.log');
  const args = legacy ? ['--experimental-loader', pathToFileURL(path.join(runtimeRoot, 'core', 'plugin-resolver.mjs')).href] : [];
  args.push(path.join(runtimeRoot, 'core', 'bootstrap.cjs'));
  const child = spawn(executable, args, {
    cwd: dataRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      ...environment,
      ELECTRON_RUN_AS_NODE: '1',
      MLI_CLIENT_PACKAGED: packaged ? '1' : '0',
      MLI_AGENT_DATA_DIR: dataRoot,
      MLI_AGENT_PORT: '0',
      MLI_AGENT_HOST: '127.0.0.1',
      MLI_ACCOUNT_SESSION_FILE: path.join(dataRoot, 'account-session.json'),
    },
  });
  child.stdout.on('data', data => fs.appendFileSync(logFile, data));
  child.stderr.on('data', data => fs.appendFileSync(logFile, data));
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
      resolve({ url: `http://127.0.0.1:${message.port}`, pid: message.pid });
    }
    child.once('error', fail);
    child.once('exit', earlyExit);
    child.on('message', receive);
  });
  return { child, ready, logFile };
}

module.exports = { prepareData, startRuntime };
