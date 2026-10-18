const { ipcRenderer } = require('electron');

// executeJavaScriptInIsolatedWorld(999) shares the preload's isolated world.
// Keep a tiny non-site-facing bridge there for immediate delivery.
globalThis.__mliBrowserBridge = Object.freeze({
  copy(value) {
    const text = String(value || '').slice(0, 10000);
    if (text) ipcRenderer.send('app-browser-copy-request', text);
  },
});

// postMessage remains a fallback for Chromium versions where the evaluated
// isolated world is not the same world as the preload.
window.addEventListener('message', event => {
  if (event.data?.type !== 'mli-element-copy') return;
  const text = String(event.data.text || '').slice(0, 10000);
  if (text) globalThis.__mliBrowserBridge.copy(text);
});
