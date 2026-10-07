const { desktopCapturer } = require('electron');

function registerDisplayCapture(ipcMain, getWindow) {
  let listed = [], selection = null;
  const authorized = event => {
    const win = getWindow();
    return win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  };
  ipcMain.handle('display-sources', async event => {
    if (!authorized(event)) throw new Error('无法访问录制来源');
    listed = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 480, height: 270 } });
    return listed.map(source => ({ id: source.id, name: source.name, kind: source.id.startsWith('screen:') ? 'screen' : 'window', thumbnail: source.thumbnail.toDataURL() }));
  });
  // A synchronous handoff preserves the Share button's user activation for getDisplayMedia.
  ipcMain.on('display-source-selection', (event, value) => {
    selection = null;
    if (!authorized(event) || !listed.some(source => source.id === value?.sourceId)) { event.returnValue = false; return; }
    selection = { sourceId: value.sourceId, audio: value.audio === true, expires: Date.now() + 60000 };
    event.returnValue = true;
  });
  return (win, origin) => {
    selection = null; listed = [];
    win.webContents.on('did-start-navigation', () => { selection = null; listed = []; });
    win.webContents.session.setDisplayMediaRequestHandler?.(async (request, callback) => {
      const chosen = selection; selection = null;
      try {
        if (request.securityOrigin.replace(/\/$/, '') !== origin || request.frame !== win.webContents.mainFrame || !chosen || chosen.expires < Date.now()) return callback({});
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
        const video = sources.find(source => source.id === chosen.sourceId);
        if (!video) return callback({});
        callback({ video, ...(process.platform === 'win32' && request.audioRequested && chosen.audio ? { audio: 'loopback' } : {}) });
      } catch { callback({}); }
    });
  };
}
module.exports = { registerDisplayCapture };
