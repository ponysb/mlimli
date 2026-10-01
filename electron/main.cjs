const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startRuntime } = require('./runtime.cjs');
require('./compat.cjs').installCompatibility();
let server;
let serverUrl;
let mainWindow;
let quitting = false;
const appIcon = path.join(__dirname, 'assets', 'icon.png');
const dataArgument = process.argv.find(argument => argument.startsWith('--mli-data-dir='));
const legacyRuntime = Number(process.versions.electron.split('.')[0]) <= 22;
const dataRoot = dataArgument ? path.resolve(dataArgument.slice('--mli-data-dir='.length)) : path.join(app.getPath('appData'), legacyRuntime ? 'MoliCreationLegacy' : 'MoliCreation');
app.setPath('userData', dataRoot);
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
async function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1024, minHeight: 680, backgroundColor: '#ffffff', icon: appIcon, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  mainWindow = win;
  if (process.platform === 'win32' && fs.existsSync(appIcon)) win.setIcon(appIcon);
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== serverUrl) event.preventDefault(); });
  win.on('closed', () => { mainWindow = null; });
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
    const report = { url: serverUrl, serverPid: server.pid, appPid: process.pid, dataRoot, packaged: app.isPackaged, title: win.getTitle(), arch: process.arch, electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome, renderer: 'passed' };
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    const closeFile = `${reportFile}.close`;
    fs.watchFile(closeFile, { interval: 100 }, current => { if (current.mtimeMs > 0 && !win.isDestroyed()) win.close(); });
    win.on('closed', () => fs.unwatchFile(closeFile));
  }
}
ipcMain.handle('choose-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
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
  app.setAppUserModelId(legacyRuntime ? 'com.molichuangzuo.app.legacy' : 'com.molichuangzuo.app');
  Menu.setApplicationMenu(null);
  const runtimeRoot = app.isPackaged ? path.join(process.resourcesPath, 'client') : path.join(__dirname, '..');
  const runtime = startRuntime({ executable: process.execPath, runtimeRoot, dataRoot, packaged: app.isPackaged });
  server = runtime.child;
  const address = await runtime.ready;
  serverUrl = address.url;
  server.on('error', error => { if (!quitting) { dialog.showErrorBox('本地服务出错', error.message); app.quit(); } });
  server.on('exit', () => { if (!quitting) { dialog.showErrorBox('本地服务已停止', `请重新打开应用。启动日志：${runtime.logFile}`); app.quit(); } });
  await createWindow();
  app.on('activate', () => { if (!mainWindow) createWindow().catch(error => dialog.showErrorBox('窗口启动失败', error.message)); });
}).catch(error => {
  quitting = true;
  if (server) server.kill();
  if (process.argv.some(argument => argument.startsWith('--mli-smoke-report='))) console.error(error);
  else dialog.showErrorBox('魔力工作台启动失败', `${error.message}\n日志目录：${dataRoot}`);
  app.exit(1);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { quitting = true; if (server) server.kill(); });
