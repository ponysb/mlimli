const path = require('path');
const fs = require('fs');
const verifierMode = process.argv.find(argument => argument.startsWith('--mli-verifier='))?.slice('--mli-verifier='.length);
if (verifierMode) {
  if (!['document', 'browser'].includes(verifierMode)) throw new Error('未知验收组件');
  require(path.join(require('electron').app.isPackaged ? path.join(process.resourcesPath, 'client') : path.join(__dirname, '..'), 'core', `${verifierMode}-verifier.cjs`));
  return;
}
const smokeArgument = process.argv.find(argument => argument.startsWith('--mli-smoke-report='));
function smokeStage(stage) {
  if (smokeArgument) fs.appendFileSync(`${path.resolve(smokeArgument.slice('--mli-smoke-report='.length))}.startup.log`, `${stage}\n`);
}
smokeStage('entry');
const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell } = require('electron');
smokeStage('electron');
const { acquireRuntime } = require('./runtime.cjs');
const { registerDebugConsole, observeDebugConsole } = require('./debug-console.cjs');
const { userDataRoot } = require('../core/user-data.cjs');
const { registerDesktopUpdater, configuredUpdateServer } = require('./updater.cjs');
const { loadClientEnvironment } = require('../core/client-env.cjs');
const { registerSandboxSetup } = require('./sandbox-setup.cjs');
const { createAppBrowser, registerAppBrowser } = require('./app-center.cjs');
require('./compat.cjs').installCompatibility();
smokeStage('modules');
let server;
let serverUrl;
let mainWindow;
let quitting = false;
let runtimeConnection;
let appBrowser;
const appIcon = path.join(__dirname, 'assets', 'icon.png');
const dataArgument = process.argv.find(argument => argument.startsWith('--mli-data-dir='));
const legacyRuntime = Number(process.versions.electron.split('.')[0]) <= 22;
const dataRoot = dataArgument ? path.resolve(dataArgument.slice('--mli-data-dir='.length)) : userDataRoot({ legacy: legacyRuntime });
fs.mkdirSync(dataRoot, { recursive: true });
app.setPath('userData', dataRoot);
const ownsInstance = app.requestSingleInstanceLock();
smokeStage(`instance:${ownsInstance}`);
if (!ownsInstance) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
const { registerDisplayCapture } = require('./display-capture.cjs');
const configureDisplayCapture = registerDisplayCapture(ipcMain, () => mainWindow);
async function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1024, minHeight: 680, backgroundColor: '#ffffff', icon: appIcon, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  mainWindow = win;
  observeDebugConsole(win.webContents);
  // Keep capture grants scoped to the local workbench; the OS/browser still
  // handles microphone/camera permission prompts.
  const captureSession = win.webContents.session;
  const fromWorkbench = details => {
    try { return new URL(details.securityOrigin || details.requestingUrl || details.url).origin === serverUrl; } catch { return false; }
  };
  const appPermissions = ['media', 'display-capture', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock'];
  captureSession.setPermissionCheckHandler((_contents, permission, origin) => appPermissions.includes(permission) && origin.replace(/\/$/, '') === serverUrl);
  captureSession.setPermissionRequestHandler((_contents, permission, callback, details) => callback(appPermissions.includes(permission) && fromWorkbench(details)));
  configureDisplayCapture(win, serverUrl);
  if (process.platform === 'win32' && fs.existsSync(appIcon)) win.setIcon(appIcon);
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== serverUrl) event.preventDefault(); });
  win.on('closed', () => { smokeStage('window-closed'); appBrowser?.bounds(null); mainWindow = null; });
  await win.loadURL(serverUrl);
  const reportArgument = process.argv.find(argument => argument.startsWith('--mli-smoke-report='));
  if (reportArgument) {
    const reportFile = path.resolve(reportArgument.slice('--mli-smoke-report='.length));
    const deadline = Date.now() + 15000;
    let rendererText = '';
    while (Date.now() < deadline) {
      rendererText = await win.webContents.executeJavaScript("document.getElementById('root')?.innerText || ''");
      if (rendererText.includes('工作台')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!rendererText.includes('工作台')) throw new Error('前端工作台未成功渲染');
    const report = { url: serverUrl, serverPid: runtimeConnection.pid, appPid: process.pid, dataRoot, packaged: app.isPackaged, title: win.getTitle(), arch: process.arch, electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome, renderer: 'passed' };
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    const closeFile = `${reportFile}.close`;
    fs.watchFile(closeFile, { interval: 100 }, current => { if (current.mtimeMs > 0 && !win.isDestroyed()) win.close(); });
    win.on('closed', () => fs.unwatchFile(closeFile));
  }
}
registerDebugConsole(ipcMain, () => mainWindow);
ipcMain.handle('choose-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('show-notification', async (_event, payload = {}) => {
  if (!Notification.isSupported()) return false;
  const title = String(payload.title || '魔力工作台').slice(0, 120);
  const body = String(payload.body || '').slice(0, 500);
  const notification = new Notification({ title, body, silent: false });
  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
  return true;
});
ipcMain.handle('choose-media-files', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: '媒体资源', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg'] }] });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle('import-media-assets', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: '媒体资源', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg'] }] });
  if (result.canceled) return [];
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
  const imported = [];
  for (const filePath of result.filePaths) {
    const type = mime[path.extname(filePath).toLowerCase()];
    const dataUrl = `data:${type};base64,${fs.readFileSync(filePath).toString('base64')}`;
    const response = await fetch(`${serverUrl}/api/assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataUrl, title: path.basename(filePath), source: 'import' }) });
    if (!response.ok) throw new Error((await response.json()).error || `导入失败 HTTP ${response.status}`);
    imported.push((await response.json()).asset);
  }
  return imported;
});
ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('无效文件路径');
  shell.showItemInFolder(path.normalize(filePath));
  return true;
});
ipcMain.handle('open-workspace-file', async (_event, relativePath) => {
  const response = await fetch(`${serverUrl}/api/info`);
  const info = await response.json();
  const root = path.resolve(info.workspace);
  const target = path.resolve(root, String(relativePath || ''));
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) throw new Error('文件路径超出工作目录');
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
  return true;
});
if (ownsInstance) app.whenReady().then(async () => {
  smokeStage('ready');
  app.setAppUserModelId(legacyRuntime ? 'com.molichuangzuo.app.legacy' : 'com.molichuangzuo.app');
  Menu.setApplicationMenu(null);
  const runtimeRoot = app.isPackaged ? path.join(process.resourcesPath, 'client') : path.join(__dirname, '..');
  loadClientEnvironment({ runtimeRoot, dataRoot, packaged: app.isPackaged });
  const runtime = await acquireRuntime({ executable: process.execPath, runtimeRoot, dataRoot, packaged: app.isPackaged });
  runtimeConnection = runtime;
  smokeStage('runtime');
  server = runtime.child;
  serverUrl = runtime.url;
  appBrowser = createAppBrowser({ electron: require('electron'), getWindow: () => mainWindow, serverUrl, dataRoot });
  registerAppBrowser({ ipcMain, controller: appBrowser, getWindow: () => mainWindow, serverUrl });
  appBrowser.start();
  server?.on('error', error => { if (!quitting) { dialog.showErrorBox('本地服务出错', error.message); app.quit(); } });
  server?.on('exit', () => { if (!quitting) { dialog.showErrorBox('本地服务已停止', `请重新打开应用。启动日志：${runtime.logFile}`); app.quit(); } });
  const desktopUpdater = registerDesktopUpdater({ app, ipcMain, getWindow: () => mainWindow,
    baseUrl: configuredUpdateServer({ runtimeRoot, dataRoot }),
    beforeInstall: async () => {
      quitting = true;
      try { await runtimeConnection.prepareUpdate(); }
      catch (error) { quitting = false; throw error; }
      appBrowser?.destroy();
    },
    logger: Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, message => {
      fs.appendFileSync(path.join(dataRoot, 'desktop.log'), `[update:${level}] ${String(message)}\n`);
    }])),
  });
  registerSandboxSetup({ipcMain,getWindow:()=>mainWindow,serverUrl,
    preflight:async()=>{
      const response=await fetch(`${serverUrl}/api/sandbox/install-preflight`,{method:'POST'});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'无法确认沙箱安装状态');
    },
    install:async()=>{
      const {pathToFileURL}=require('node:url');
      const {installNativeWindowsSandbox}=await import(pathToFileURL(path.join(runtimeRoot,'core/windows-sandbox.mjs')).href);
      return installNativeWindowsSandbox();
    },
  });
  await createWindow();
  if (!smokeArgument) desktopUpdater.start();
  app.on('activate', () => { if (!mainWindow) createWindow().catch(error => dialog.showErrorBox('窗口启动失败', error.message)); });
}).catch(async error => {
  quitting = true;
  if (runtimeConnection) await runtimeConnection.release();
  if (process.argv.some(argument => argument.startsWith('--mli-smoke-report='))) console.error(error);
  else dialog.showErrorBox('魔力工作台启动失败', `${error.message}\n日志目录：${dataRoot}`);
  app.exit(1);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => {
  smokeStage(`before-quit:${quitting}`);
  if (quitting || !runtimeConnection) return;
  event.preventDefault();
  quitting = true;
  appBrowser?.destroy();
  runtimeConnection.release().finally(() => { smokeStage('runtime-released'); app.quit(); });
});
app.on('will-quit', () => smokeStage('will-quit'));
