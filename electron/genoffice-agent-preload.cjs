{
  const { contextBridge, ipcRenderer } = require('electron');
  contextBridge.exposeInMainWorld('workbenchAgent', {
    context: live => ipcRenderer.invoke('genoffice-agent-context', live),
    capture: rect => ipcRenderer.invoke('genoffice-agent-capture', rect),
    send: message => ipcRenderer.invoke('genoffice-agent-send', message),
  });
}
