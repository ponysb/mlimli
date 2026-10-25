{
  const { contextBridge, ipcRenderer } = require('electron');
  contextBridge.exposeInMainWorld('workbenchAgent', {
    context: live => ipcRenderer.invoke('genoffice-agent-context', live),
    send: message => ipcRenderer.invoke('genoffice-agent-send', message),
  });
}
