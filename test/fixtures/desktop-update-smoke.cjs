const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { app } = require('electron');
const rootRequire = createRequire(process.env.MLI_UPDATE_SMOKE_ROOT);
const { NsisUpdater } = rootRequire('electron-updater');
const { registerDesktopUpdater } = rootRequire('./electron/updater.cjs');
const report = process.env.MLI_UPDATE_SMOKE_REPORT;
const timeout = setTimeout(() => { fs.writeFileSync(report, JSON.stringify({ error: 'updater smoke timed out' })); app.exit(1); }, 20000);

app.whenReady().then(async () => {
  const adapter = { isPackaged: true, getVersion: () => '0.2.0', getPath: name => app.getPath(name), once: (...args) => app.once(...args) };
  async function exercise(bad) {
    const handlers = new Map();
    const webContents = { mainFrame: {}, isDestroyed: () => false, send() {} };
    const event = { sender: webContents, senderFrame: webContents.mainFrame };
    const config = path.join(path.dirname(report), `update-${bad}.yml`);
    fs.writeFileSync(config, JSON.stringify({ updaterCacheDirName: `smoke-cache-${bad}` }));
    const controller = registerDesktopUpdater({ app: adapter, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, getWindow: () => ({ isDestroyed: () => false, webContents }),
      baseUrl: process.env.MLI_UPDATE_SMOKE_URL + (bad ? '/bad' : '/prefix'), portable: false,
      beforeInstall: async () => { throw new Error('smoke never installs'); }, logger: { info() {}, warn() {}, error() {}, debug() {} },
      factory: options => { const updater = new NsisUpdater(options); updater.forceDevUpdateConfig = true; updater.updateConfigPath = config; updater.setFeedURL(options); return updater; } });
    await handlers.get('desktop-update-check')(event);
    const checked = controller.snapshot();
    if (checked.status !== 'available') throw new Error(`check: ${JSON.stringify(checked)}`);
    await handlers.get('desktop-update-download')(event);
    const downloaded = controller.snapshot();
    if (downloaded.status !== (bad ? 'error' : 'downloaded')) throw new Error(`download: ${JSON.stringify(downloaded)}`);
    if (bad && !downloaded.message.includes('校验失败')) throw new Error(downloaded.message);
    return { status: downloaded.status, target: process.arch, message: downloaded.message };
  }
  async function developmentCheck() {
    const handlers = new Map();
    const webContents = { mainFrame: {}, isDestroyed: () => false, send() {} };
    const event = { sender: webContents, senderFrame: webContents.mainFrame };
    const controller = registerDesktopUpdater({ app, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, getWindow: () => ({ isDestroyed: () => false, webContents }),
      baseUrl: process.env.MLI_UPDATE_SMOKE_URL + '/development', portable: false, logger: { info() {}, warn() {}, error() {}, debug() {} },
      beforeInstall: async () => { throw new Error('development never installs'); } });
    await handlers.get('desktop-update-check')(event);
    const state = controller.snapshot();
    if (state.status !== 'available' || state.version !== '0.3.1' || state.canInstall !== false) throw new Error(`development check: ${JSON.stringify(state)}`);
    await handlers.get('desktop-update-download')(event);
    await handlers.get('desktop-update-install')(event);
    if (controller.snapshot().status !== 'available') throw new Error('development changed to installation mode');
    return state;
  }
  const result = { valid: await exercise(false), corrupt: await exercise(true), development: await developmentCheck(), node: process.versions.node, electron: process.versions.electron };
  fs.writeFileSync(report, JSON.stringify(result)); clearTimeout(timeout); app.exit(0);
}).catch(error => { fs.writeFileSync(report, JSON.stringify({ error: error.stack })); clearTimeout(timeout); app.exit(1); });
