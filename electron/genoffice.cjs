const fs = require('node:fs');
const path = require('node:path');
const { inspectGenOfficePackage } = require('./genoffice-package.cjs');

const TYPES = { '.docx': 'docs', '.xlsx': 'sheets', '.pptx': 'slides', '.pdf': 'pdf' };
function resolveOfficeFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\0')) throw new Error('无效文件路径');
  const base = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(base, relative));
  const rel = path.relative(base, file);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) || rel.split(path.sep).includes('.agent')) throw new Error('文件路径超出工作目录');
  if (!fs.statSync(file).isFile() || !TYPES[path.extname(file).toLowerCase()]) throw new Error('仅支持 DOCX、XLSX、PPTX 和 PDF 编辑');
  return file;
}
function registerGenOffice({ app, protocol, ipcMain, getWindow, getServerUrl, resourceRoot }) {
  // Schemes must be registered before app.ready, without loading the editor engines.
  protocol.registerSchemesAsPrivileged([
    { scheme: 'genoffice-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
    { scheme: 'genoffice-docx-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
  const modules = new Map();
  const views = new Map();
  const agentRequests = new Map();
  let requestSequence = 0;
  function editorEntry(event) {
    const entry = [...views.values()].find(item => item.view.webContents === event.sender);
    if (!entry || event.senderFrame !== event.sender.mainFrame) throw new Error('无效文档编辑器');
    return entry;
  }
  ipcMain.handle('genoffice-agent-context', (event, live = {}) => {
    const entry = editorEntry(event);
    const safeLive = Object.fromEntries(['location', 'selection'].flatMap(key =>
      typeof live?.[key] === 'string' && live[key].trim() ? [[key, live[key].replace(/\0/g, '').slice(0, 5000)]] : []));
    return { path: entry.relative, live: safeLive };
  });
  ipcMain.handle('genoffice-agent-send', (event, message) => {
    const entry = editorEntry(event);
    const win = getWindow();
    if (!win || typeof message !== 'string' || !message.trim() || message.length > 100000) return false;
    const requestId = ++requestSequence;
    return new Promise(resolve => {
      const timer = setTimeout(() => { agentRequests.delete(requestId); resolve(false); }, 30000);
      agentRequests.set(requestId, accepted => { clearTimeout(timer); agentRequests.delete(requestId); resolve(accepted === true); });
      win.webContents.send('genoffice-agent-request', { requestId, message, path: entry.relative, workspace: entry.workspace });
    });
  });
  ipcMain.handle('genoffice-agent-result', (event, { requestId, accepted } = {}) => {
    authorize(event);
    agentRequests.get(requestId)?.(accepted);
  });
  ipcMain.handle('app:get-auto-save-default', () => ({ on: false, updatedAt: 0 }));
  ipcMain.handle('app:get-theme', () => 'light');
  ipcMain.handle('app:get-ai-panel-prefs', () => ({ side: 'left', fontSize: 'default', customFontSize: 14, spellcheck: true }));
  ipcMain.handle('app:set-ai-panel-prefs', (_event, patch = {}) => ({ side: patch.side === 'right' ? 'right' : 'left', fontSize: ['small', 'default', 'large'].includes(patch.fontSize) ? patch.fontSize : 'default', customFontSize: Math.max(10, Math.min(24, Number(patch.customFontSize) || 14)), spellcheck: patch.spellcheck !== false }));
  let ready = false;
  let closing;
  function authorize(event) {
    const win = getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('仅工作台可操作编辑器');
    return win;
  }
  function status() {
    return inspectGenOfficePackage(resourceRoot).status;
  }
  function load(type) {
    if (modules.has(type)) return modules.get(type);
    const inspection = inspectGenOfficePackage(resourceRoot);
    if (!inspection.status[type]) throw new Error(`文档编辑模块不可用（${type}）：${inspection.details[type].reasons.join('；')}。请构建当前平台组件包（参见 docs/GENOFFICE.md）`);
    if (!ready) {
      const runtime = require(path.join(resourceRoot, 'main/runtime.cjs'));
      runtime.installRendererProtocol(Object.fromEntries(['docs', 'sheets', 'slides', 'pdf'].map(name => [name, path.join(resourceRoot, name, 'renderer')])));
      runtime.setUiLang('zh');
      ipcMain.handle('app:get-language', () => 'zh');
      const docs = require(path.join(resourceRoot, 'main/docs.cjs'));
      docs.configureDocsRuntime({ preloadPath: path.join(resourceRoot, 'docs/preload/index.js'), rendererFile: path.join(resourceRoot, 'docs/renderer/index.html') });
      docs.registerDocsIpc();
      docs.registerAiIpc();
      docs.registerProjectIpc();
      modules.set('docs', docs);
      ready = true;
    }
    const mod = require(path.join(resourceRoot, 'main', `${type}.cjs`));
    const title = type[0].toUpperCase() + type.slice(1);
    mod[`configure${title}Runtime`]({ preloadPath: path.join(resourceRoot, type, 'preload/index.js'), rendererFile: path.join(resourceRoot, type, 'renderer/index.html'), rendererFilePath: path.join(resourceRoot, type, 'renderer/index.html'), sidecarPath: path.join(resourceRoot, 'sheets/native', process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar') });
    if (type === 'docs') return modules.get('docs');
    modules.set(type, mod);
    return mod;
  }
  async function close(entry, win) {
    if (entry.view.webContents.isDestroyed()) { views.delete(entry.id); return true; }
    const title = entry.type[0].toUpperCase() + entry.type.slice(1);
    if (!await entry.mod[`request${title}Close`](entry.view.webContents, win)) return false;
    win?.contentView.removeChildView(entry.view);
    entry.view.webContents.close();
    views.delete(entry.id);
    return true;
  }
  ipcMain.handle('genoffice-status', event => { authorize(event); return status(); });
  ipcMain.handle('genoffice-open', async (event, { path: relative, workspace } = {}) => {
    const win = authorize(event);
    const response = await fetch(`${getServerUrl()}/api/info`);
    if (!response.ok) throw new Error('无法读取工作目录');
    const info = await response.json();
    if (workspace && path.resolve(workspace) !== path.resolve(info.workspace)) throw new Error('请切换到文件所属工作目录后编辑');
    const file = resolveOfficeFile(info.workspace, relative);
    const id = file;
    if (views.has(id) && !views.get(id).view.webContents.isDestroyed()) return { id };
    views.delete(id);
    const type = TYPES[path.extname(file).toLowerCase()];
    const mod = load(type);
    const title = type[0].toUpperCase() + type.slice(1);
    const view = type === 'sheets' ? mod.createSheetsView({ includeAiHandlers: false }) : mod[`create${title}View`](file);
    if (type === 'sheets') mod.queueWorkbookForView(view.webContents, file);
    mod[`set${title}ShellWindow`]?.(win);
    mod[`setActive${title}WebContents`]?.(view.webContents);
    view.setVisible(false);
    win.contentView.addChildView(view);
    views.set(id, { id, type, view, mod, relative, workspace: info.workspace });
    view.webContents.on('render-process-gone', () => { view.setVisible(false); views.delete(id); if (!win.isDestroyed()) win.webContents.send('genoffice-failed', { id, error: '编辑器进程已退出，请重新打开文件' }); });
    return { id };
  });
  ipcMain.handle('genoffice-bounds', (event, { id, bounds } = {}) => {
    const win = authorize(event);
    if (id && !bounds) { views.get(id)?.view.setVisible(false); return; }
    for (const entry of views.values()) entry.view.setVisible(false);
    const entry = views.get(id);
    if (!entry || !bounds) return;
    if (['x', 'y', 'width', 'height'].some(key => !Number.isFinite(bounds[key]))) throw new Error('无效编辑器尺寸');
    const [width, height] = win.getContentSize();
    const zoom = win.webContents.getZoomFactor();
    const x = Math.max(0, Math.min(width, Math.round(bounds.x * zoom)));
    const y = Math.max(0, Math.min(height, Math.round(bounds.y * zoom)));
    const w = Math.max(0, Math.min(width - x, Math.round(bounds.width * zoom)));
    const h = Math.max(0, Math.min(height - y, Math.round(bounds.height * zoom)));
    entry.view.setBounds({ x, y, width: w, height: h });
    entry.view.setVisible(w > 0 && h > 0);
  });
  ipcMain.handle('genoffice-close', async (event, id) => {
    const win = authorize(event);
    if (typeof id === 'string') { try { id = fs.realpathSync(id); } catch {} }
    return close(views.get(id) || { view: { webContents: { isDestroyed: () => true } }, id }, win);
  });
  function closeAll() {
    if (closing) return closing;
    closing = (async () => {
      for (const entry of [...views.values()]) if (!await close(entry, getWindow())) return false;
      modules.get('sheets')?.stopSheetsSidecar();
      return true;
    })().finally(() => { closing = null; });
    return closing;
  }
  return { status, closeAll, hasViews: () => views.size > 0 };
}
module.exports = { registerGenOffice, resolveOfficeFile, TYPES };
