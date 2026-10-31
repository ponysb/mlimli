// Real Electron renderer / file-engine smoke. Run after npm run build:office.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { app, BrowserWindow, ipcMain, protocol, webContents, dialog } = require('electron');
let dialogResponse = 0;
dialog.showMessageBox = async (...args) => { console.log('DIALOG', args.at(-1).message); return { response: dialogResponse }; };
const root = path.resolve(__dirname, '../..');
app.on('web-contents-created', (_event, wc) => { wc.on('console-message', details => console.log('EARLY', details.level, details.message)); wc.on('preload-error', (_e, file, error) => console.log('PRELOAD', file, error)); });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-genoffice-smoke-'));
app.setPath('userData', path.join(directory, 'data'));
const fixture = process.env.MLI_OFFICE_FIXTURES;
if (!fixture) throw new Error('MLI_OFFICE_FIXTURES is required');
fs.cpSync(fixture, path.join(directory, 'workspace'), { recursive: true });
const workspace = path.join(directory, 'workspace');
let win, url;
const handlers = new Map();
const bridge = require('../../electron/genoffice.cjs').registerGenOffice({ app, protocol, ipcMain: { on: ipcMain.on.bind(ipcMain), removeListener: ipcMain.removeListener.bind(ipcMain), handle(name, fn) { handlers.set(name, fn); ipcMain.handle(name, fn); } }, getWindow: () => win, getServerUrl: () => url, resourceRoot: path.join(root, 'resources/genoffice') });
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ workspace }));
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('GenOffice smoke timed out'); app.exit(1); }, 180000).unref();
app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); url = `http://127.0.0.1:${server.address().port}`;
  win = new BrowserWindow({ width: 1280, height: 900, show: true });
  await win.loadURL('about:blank');
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  let routedRequest;
  win.webContents.on('ipc-message', () => {});
  const originalSend = win.webContents.send.bind(win.webContents);
  win.webContents.send = (channel, payload) => { if (channel === 'genoffice-agent-request') routedRequest = payload; return originalSend(channel, payload); };
  console.log('STATUS', bridge.status());
  let agentRequestId = 0;
  for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['document.docx', 'slides.pptx', 'report.pdf', 'workbook.xlsx']) {
    const result = await handlers.get('genoffice-open')(event, { path: name, workspace });
    await handlers.get('genoffice-bounds')(event, { id: result.id, bounds: { x: 0, y: 0, width: 1280, height: 900 } });
    await wait(1000);
    const wc = win.contentView.children.at(-1).webContents;
    wc.on('console-message', details => console.log('CONSOLE', name, details.level, details.message));
    wc.on('did-fail-load', (_e, code, message) => console.log('LOADFAIL', name, code, message));
    for (let n = 0; n < 100; n++) { await wait(150); if (await wc.executeJavaScript('document.body.innerText.length > 100')) break; }
    await wait(9000);
    const state = await wc.executeJavaScript('({text:document.body.innerText.slice(0,1800),elements:document.querySelectorAll("canvas,.tiptap,.ProseMirror").length})');
    console.log('EDITOR', name, wc.getURL(), JSON.stringify(state));
    if (!state.elements) throw new Error(`${name}: editor content missing`);
    const assistant = await wc.executeJavaScript(`(() => {
      const visible = el => !!(el.getBoundingClientRect().width && el.getBoundingClientRect().height);
      return {panels:document.querySelectorAll('.ai-dock .ai-panel,.ai-chat-panel,.copilot-panel').length,entries:[...document.querySelectorAll('.ai-entry,.stage-ai-bar,.pdf-sel-ask')].filter(visible).length,text:document.body.innerText.includes('Friday')};
    })()`);
    console.log('ASSISTANT', name, assistant);
    if (assistant.entries || assistant.text) throw new Error(name + ': upstream AI is still visible');
    const composer = await wc.executeJavaScript(`({present:!!document.querySelector('#workbench-agent .preview-agent-composer'),bridge:!!window.workbenchAgent})`);
    if (!composer.present || !composer.bridge) throw new Error(name + ': workbench composer missing');
    const editorEvent = { sender:wc, senderFrame:wc.mainFrame };
    const agentContext = await handlers.get('genoffice-agent-context')(editorEvent, { location:'smoke location', selection:'smoke selection', visibleText:'must not be forwarded' });
    if (agentContext.path !== name || Object.hasOwn(agentContext, 'type') || Object.hasOwn(agentContext, 'summary') || Object.hasOwn(agentContext, 'content') || Object.hasOwn(agentContext.live, 'visibleText') || agentContext.live.location !== 'smoke location' || agentContext.live.selection !== 'smoke selection') throw new Error('Incorrect minimal Agent file context');
    const pending = handlers.get('genoffice-agent-send')(editorEvent, '修改当前文档');
    await handlers.get('genoffice-agent-result')(event, {requestId: ++agentRequestId, accepted:true});
    if (!await pending) throw new Error(name + ': Agent routing failed');
    if (name === 'workbook.xlsx') {
      const selected = await wc.executeJavaScript(`(() => {const detail={value:null};window.dispatchEvent(new CustomEvent('workbench-office-context',{detail}));return detail.value;})()`);
      if (selected?.kind !== 'spreadsheet' || !selected.sheetId || !selected.range || !Array.isArray(selected.cells)) throw new Error('Spreadsheet selection structure missing');
      console.log('SELECTION Excel worksheet + range + cell data passed');
    }
    if (name === 'slides.pptx') {
      const selected = await wc.executeJavaScript(`(() => {const detail={value:null};window.dispatchEvent(new CustomEvent('workbench-office-context',{detail}));return detail.value;})()`);
      if (selected?.kind !== 'slides' || selected.page !== 1 || !Array.isArray(selected.objectIds)) throw new Error('Slide selection structure missing');
      console.log('SELECTION PPT page + object IDs passed');
    }
    if (name === 'document.docx') {
      await wc.executeJavaScript(`(() => {
        const el = document.querySelector('.ProseMirror'); el.focus();
        const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
        if (!text) throw new Error('No document text to select');
        const range = document.createRange(); range.selectNodeContents(text);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      })()`);
      await wait(150);
      await wc.executeJavaScript(`document.querySelector('#workbench-agent textarea').focus()`);
      const retained = await wc.executeJavaScript(`document.querySelector('.office-agent-selection').innerText`);
      if (!retained.includes('文档选区')) throw new Error('Word selection lost on composer focus: ' + retained);
    }
    if (name === 'slides.pptx') wc.capturePage = async () => { throw new Error('Smoke: compositor unavailable'); };
    routedRequest = null;
    await wc.executeJavaScript(`(() => { const input=document.querySelector('#workbench-agent textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'检查当前内容'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await wc.executeJavaScript(`document.querySelector('#workbench-agent form').requestSubmit()`);
    for (let n=0; n<50 && !routedRequest; n++) await wait(100);
    if (!routedRequest?.message.includes('按需使用文件工具读取') || !routedRequest.message.includes(name) || routedRequest.message.includes('must not be forwarded') || routedRequest.message.includes('document_context')) throw new Error(name + ': routed Agent prompt has incorrect context: ' + JSON.stringify(routedRequest) + ' UI: ' + await wc.executeJavaScript('document.querySelector("#workbench-agent").innerText'));
    if (name === 'slides.pptx') {
      const attachment = routedRequest.attachments?.[0];
      if (attachment?.mime !== 'image/png') throw new Error('PPT screenshot attachment missing');
      const bytes = Buffer.from(attachment.dataUrl.split(',')[1], 'base64');
      fs.writeFileSync(path.join(directory, 'slides-selection.png'), bytes);
      console.log('SELECTION PPT canvas fallback PNG passed', bytes.length, 'bytes');
    }
    if (name === 'document.docx') {
      if (!routedRequest.message.includes('选区结构与定位') || !routedRequest.message.includes('fragment')) throw new Error('Word structure was not forwarded');
      if (routedRequest.attachments?.[0]?.mime !== 'image/png' || !routedRequest.attachments[0].dataUrl.startsWith('data:image/png;base64,')) throw new Error('Selection screenshot missing');
      if (await wc.executeJavaScript(`document.querySelector('#workbench-agent').style.visibility === 'hidden'`)) throw new Error('Composer remained hidden while waiting for Agent');
      console.log('SELECTION Word retained structure + screenshot attachment passed');
    }
    await handlers.get('genoffice-agent-result')(event, {requestId: ++agentRequestId, accepted:true});
    if (!state.elements && !state.text) console.log('HTML', await wc.executeJavaScript('document.documentElement.outerHTML.slice(0,2500)'));
    const before = fs.statSync(result.id).mtimeMs;
    if (name === 'document.docx') {
      await wc.executeJavaScript(`document.querySelector('.ProseMirror').focus(); document.execCommand('insertText', false, 'GenOffice smoke edit '); void 0`);
      if (!await handlers.get('genoffice-save')(event, result.id)) throw new Error('Standalone save failed');
    } else if (name === 'slides.pptx') {
      await wc.executeJavaScript(`window.slidesApi.setNotes({slideIndex:0, text:'GenOffice smoke note'})`);
      dialogResponse = 2;
      if (await handlers.get('genoffice-close')(event, result.id)) throw new Error('Cancel discarded the editor');
      if (wc.isDestroyed()) throw new Error('Cancel destroyed the editor');
      dialogResponse = 0;
      console.log('CANCEL passed');
      console.log('SAVE', name, await wc.executeJavaScript(`window.slidesApi.save()`));
    } else if (name === 'report.pdf') {
      console.log('SAVE', name, await wc.executeJavaScript(`window.pdfApi.save({path:${JSON.stringify(result.id)},markups:[],drawings:[],formValues:[],stamps:[],rotations:[{pageIndex:0,delta:90}]})`));
    } else if (name === 'workbook.xlsx') {
      const sheets = require(path.join(root, 'resources/genoffice/main/sheets.cjs'));
      sheets.queueWorkbookForView(wc, result.id);
      const saved = await wc.executeJavaScript(`(async () => {
        const file = await window.desktopApi.selectWorkbook();
        const request = {sessionId:file.sessionId,mode:'save',edits:[{sheetId:file.sheets[0].id,row:0,column:0,writeValue:true,value:'GenOffice smoke cell'}],definedNamesState:null,themeState:null,workbookProtectionState:null,protectedRangeStates:[]};
        for (const key of ['structuralOps','chartEdits','visualEdits','visualAdditions','tableAdditions','pivotAdditions','sheetOps','sheetOrder','filterStates','hyperlinkEdits','cfStates','dvStates','pageSetupStates','noteStates','formulaValues','pivotCacheRefreshPaths','pivotRefreshUpdates','sheetProtections','sparklineAdditions']) request[key]=[];
        return window.desktopApi.saveWorkbookEdits(request);
      })()`);
      console.log('SAVE', name, saved);
    }
    for (let n=0; n<100 && fs.statSync(result.id).mtimeMs === before; n++) await wait(100);
    if (fs.statSync(result.id).mtimeMs === before) throw new Error(name + ': file was not saved');
    console.log('CLOSING', name);
    if (name === 'slides.pptx') {
      try { fs.writeFileSync(path.join(directory, 'slides.png'), (await wc.capturePage()).toPNG()); }
      catch (error) { console.warn('SCREENSHOT skipped:', error.message); }
    }
    await handlers.get('genoffice-close')(event, result.id);
  }
  console.log('ARTIFACTS', directory);
  server.close(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
