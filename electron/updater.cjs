const fs = require('node:fs');
const path = require('node:path');

function updateFeedUrl(baseUrl, target) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('更新服务地址无效');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/v2/releases/updates/${target}/`;
  return url.href;
}

function createUpdater(options, { development, currentVersion }) {
  const updater = new (require('electron-updater').NsisUpdater)(options);
  if (development) {
    updater.forceDevUpdateConfig = true;
    // Electron reports its own version when launched with a source entry point.
    updater.currentVersion = new updater.currentVersion.constructor(currentVersion);
  }
  return updater;
}

function registerDesktopUpdater({ app, ipcMain, getWindow, baseUrl, beforeInstall, platform = process.platform, arch = process.arch, portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE), factory = createUpdater, logger = console }) {
  const supported = platform === 'win32' && !portable && ['x64', 'ia32'].includes(arch);
  const development = !app.isPackaged;
  const canInstall = supported && !development;
  const target = arch === 'ia32' ? 'windows-legacy-ia32' : 'windows-x64';
  const currentVersion = app.isPackaged ? app.getVersion() : require('../package.json').version;
  let state = { status: 'idle', currentVersion, version: null, releaseNotes: '', percent: 0, message: '', mode: development ? 'development' : 'installed', canInstall };
  let updater;
  let operation;
  let installing = false;
  let startupTimer;
  let intervalTimer;
  const snapshot = () => ({ ...state });
  function publish(changes) {
    state = { ...state, ...changes };
    const win = getWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('desktop-update-changed', snapshot());
  }
  function errorMessage(error) {
    if (error.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') return '后台尚未发布可自动更新的 Windows 安装版';
    if (error.code === 'ERR_UPDATER_INVALID_SIGNATURE') return '安装包签名校验失败，请联系发布者';
    if (/checksum|sha512/i.test(error.message || '')) return '安装包校验失败，请重新检查并下载更新';
    return `更新失败：${error.message || '请检查网络后重试'}`;
  }
  if (!supported) state = { ...state, status: 'unsupported', message: portable ? '便携版请下载安装版后使用自动更新' : '自动更新目前支持 Windows 安装版' };
  else if (!baseUrl) state = { ...state, status: 'unsupported', message: '尚未配置更新服务地址' };
  else {
    try {
      updater = factory({ provider: 'generic', url: updateFeedUrl(baseUrl, target), channel: 'latest', useMultipleRangeRequest: false }, { development, currentVersion });
      updater.logger = logger;
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowPrerelease = false;
      updater.allowDowngrade = false;
      updater.disableDifferentialDownload = true;
      updater.disableWebInstaller = true;
      if (canInstall) updater.installDirectory = path.dirname(app.getPath('exe'));
      updater.on('checking-for-update', () => publish({ status: 'checking', message: '', percent: 0 }));
      updater.on('update-available', info => publish({ status: 'available', version: info.version, releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '', message: '' }));
      updater.on('update-not-available', () => publish({ status: 'idle', version: null, releaseNotes: '', message: '当前已是最新版本' }));
      updater.on('download-progress', progress => publish({ status: 'downloading', percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)) }));
      updater.on('update-downloaded', info => publish({ status: 'downloaded', version: info.version, percent: 100, message: '' }));
      updater.on('error', error => publish({ status: 'error', message: errorMessage(error) }));
    } catch (error) { state = { ...state, status: 'unsupported', message: errorMessage(error) }; }
  }
  function authorize(event) {
    const win = getWindow();
    if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('更新仅允许应用主窗口操作');
  }
  async function check() {
    if (!updater || operation || ['downloading', 'downloaded', 'installing'].includes(state.status)) return snapshot();
    operation = Promise.resolve().then(() => updater.checkForUpdates());
    try { await operation; }
    catch (error) { publish({ status: 'error', message: errorMessage(error) }); }
    finally { operation = null; }
    return snapshot();
  }
  async function download() {
    if (!updater || !canInstall || operation || state.status !== 'available') return snapshot();
    publish({ status: 'downloading', percent: 0, message: '' });
    operation = Promise.resolve().then(() => updater.downloadUpdate());
    try { await operation; }
    catch (error) { publish({ status: 'error', message: errorMessage(error) }); }
    finally { operation = null; }
    return snapshot();
  }
  async function install() {
    if (!updater || !canInstall || installing || state.status !== 'downloaded') return snapshot();
    installing = true;
    publish({ status: 'installing', message: '' });
    try {
      // Stop the shared runtime before NSIS starts, not in the asynchronous before-quit handler.
      await beforeInstall();
      updater.quitAndInstall(true, true);
    } catch (error) { publish({ status: 'downloaded', message: error.message }); }
    finally { installing = false; }
    return snapshot();
  }
  for (const [channel, handler] of Object.entries({ 'desktop-update-status': snapshot, 'desktop-update-check': check, 'desktop-update-download': download, 'desktop-update-install': install })) {
    ipcMain.handle(channel, (event) => { authorize(event); return handler(); });
  }
  function start() {
    if (!updater || startupTimer) return;
    startupTimer = setTimeout(() => check(), 0);
    startupTimer.unref?.();
    intervalTimer = setInterval(() => check(), 6 * 60 * 60 * 1000);
    intervalTimer.unref?.();
  }
  function dispose() { clearTimeout(startupTimer); clearInterval(intervalTimer); }
  app.once('will-quit', dispose);
  return { snapshot, start, dispose };
}

function configuredUpdateServer({ runtimeRoot, dataRoot }) {
  if (process.env.MLI_ACCOUNT_SERVER_URL) return process.env.MLI_ACCOUNT_SERVER_URL;
  for (const filename of [path.join(dataRoot, 'config.json'), path.join(runtimeRoot, 'config.example.json')]) {
    try { const url = JSON.parse(fs.readFileSync(filename, 'utf8')).account?.baseUrl; if (url) return url; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return '';
}
module.exports = { registerDesktopUpdater, updateFeedUrl, configuredUpdateServer };
