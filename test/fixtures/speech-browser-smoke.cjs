// Run with: node node_modules/electron/cli.js test/fixtures/speech-browser-smoke.cjs
// Native browser recording with synthetic media; speech HTTP responses are fixtures.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow } = require('electron');
const runtime = require('../../electron/runtime.cjs');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-speech-browser-'));
app.setPath('userData', path.join(directory, 'electron'));
let instance;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => { console.error('Speech browser smoke timed out'); app.exit(1); }, 90000);

app.whenReady().then(async () => {
  instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory });
  const { url } = await instance.ready;
  const { MODELS } = await import('../../plugins/local-speech/models.mjs');
  const choices = MODELS.map(model => ({ ...model, supported: true, installed: true, totalDownloadMB: model.downloadMB + 162, recommended: model.id === 'paraformer', platformNote: '测试平台' })).sort((a, b) => Number(b.recommended) - Number(a.recommended));
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false } });
  const evaluate = async source => { try { return await win.webContents.executeJavaScript(source, true); } catch (error) { console.error('RENDERER SCRIPT:', source); console.error(await win.webContents.executeJavaScript('document.body.innerText')); throw error; } };
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
  const waitFor = async condition => {
    const until = Date.now() + 15000;
    while (Date.now() < until) { if (await evaluate(condition)) return; await delay(100); }
    throw new Error(`Timed out: ${condition}\n${await evaluate('document.body.innerText')}\n${await evaluate("JSON.stringify({sessions:window.__speechSmoke?.sessions,streams:window.__speechSmoke?.streams.map(s=>s.getTracks().map(t=>t.readyState)),contexts:window.__speechSmoke?.contexts.map(c=>c.state)})")}`);
  };
  await win.loadURL(url);
  await waitFor("Boolean(document.querySelector('[aria-label=\"语音输入与会议录制\"]')) && !document.querySelector('[aria-label=\"语音输入与会议录制\"]').disabled");
  await evaluate(`(() => {
    const original = window.fetch;
    window.__speechSmoke = { sessions: [], media: [], pcmBytes: 0, streams: [], contexts: [], patches: [], profiles: [], displayCalls: 0, cameraCalls: 0, choices: ${JSON.stringify(choices)}, modelId: 'sensevoice', switches: [], earlySamples: 0, delaySession: 0, delayReady: 0, warmups: 0 };
    const result = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    window.fetch = async (url, options = {}) => {
      if (!String(url).startsWith('/api/speech/')) return original(url, options);
      const log = window.__speechSmoke;
      if (url === '/api/speech/warmup') { log.warmups++; return result({ dictation: { state: 'ready', resident: true, idleTimeoutSeconds: 600 } }); }
      if (url === '/api/speech/status') return result({ ready: true, state: 'ready', modelId: log.modelId, model: log.choices.find(item => item.id === log.modelId).name, models: log.choices, recommendation: { id: 'paraformer', reason: '本机轻量推荐' }, hardware: { arch: 'x64', memoryGB: 16, cores: 8 }, activeSessions: log.sessions.some(item => item.state === 'recording') ? 1 : 0, downloadSource: 'server', ...log.download });
      if (url.startsWith('/api/speech/models/') && options.method === 'DELETE') { const id = url.split('/').at(-1); log.deleted = id; log.choices.find(item => item.id === id).installed = false; log.choices.find(item => item.id === id).removable = false; if (log.modelId === id) log.modelId = log.choices.find(item => item.installed).id; return window.fetch('/api/speech/status'); }
      if (url === '/api/speech/install') { const { modelId } = JSON.parse(options.body); log.download = { state: 'installing', installingModelId: modelId, stage: '下载模型权重', currentFile: 'model.int8.onnx', fileDownloadedBytes: 1024, fileTotalBytes: 4096, downloadedBytes: 1024, speedBps: 2048, etaSeconds: 2 }; return window.fetch('/api/speech/status'); }
      if (url === '/api/speech/settings') { const body = JSON.parse(options.body); log.switches.push(body.modelId); log.modelId = body.modelId; return window.fetch('/api/speech/status'); }
      if (url === '/api/speech/meetings') return result({ meetings: [] });
      if (url === '/api/speech/profiles' && (options.method || 'GET') === 'GET') return result({ profiles: log.profiles });
      if (url === '/api/speech/profiles' && options.method === 'POST') {
        const body = JSON.parse(options.body), meta = log.sessions.at(-1);
        const profile = { id: crypto.randomUUID(), name: body.name, role: body.role };
        log.profiles.push(profile); meta.rememberedSpeakers = { [body.speaker]: profile.id }; return result({ profile, meeting: meta });
      }
      if (url === '/api/speech/sessions') {
        const body = JSON.parse(options.body);
        const meta = { ...body, id: crypto.randomUUID(), modelLoading: true, createdAt: Date.now(), state: 'recording', segments: [], participants: {}, mediaBytes: 0 };
        await new Promise(resolve => setTimeout(resolve, log.delaySession));
        log.sessions.push(meta); return result(meta);
      }
      const meta = log.sessions.at(-1);
      if (url.endsWith('/summary')) { const created = await original('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: meta.title + ' · 会议纪要' }) }).then(response => response.json()); await original('/api/session/' + created.id + '/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '整理会议纪要：小李负责开发，周五交付。' }) }); meta.summarySessionId = created.id; log.summarySessionId = created.id; return result({ sessionId: created.id }); }
      if (url.endsWith('/ready')) { log.readyRequested = true; await new Promise(resolve => setTimeout(resolve, log.delayReady)); meta.modelLoading = false; return result({ ready: true }); }
      if (url.endsWith('/pcm')) {
        log.pcmBytes += options.body.byteLength;
        log.earlySamples += new Int16Array(options.body).filter(sample => Math.abs(sample) > 100).length;
        const segments = !meta.segments.length ? [{ id: 1, text: meta.kind === 'dictation' ? '语音测试' : '项目由小李负责', speaker: 'speaker-1', start: 0, end: 1 }] : [];
        meta.segments.push(...segments); meta.rememberableSpeakers = ['speaker-1']; return result({ segments, partial: '正在转写', speaker: 'speaker-1', speaking: true, rememberableSpeakers: ['speaker-1'] });
      }
      if (url.endsWith('/media')) { log.media.push({ size: options.body.size, type: options.body.type, mode: meta.mode }); meta.mediaBytes += options.body.size; return result({ ok: true }); }
      if (url.endsWith('/finish')) { if (meta.kind === 'dictation') await new Promise(resolve => setTimeout(resolve, 600)); if (meta.state !== 'finished') meta.segments.push({ id: 2, text: '会议结束', speaker: 'speaker-1', start: 1, end: 2 }); meta.state = 'finished'; return result(meta); }
      if (options.method === 'PATCH') { const body = JSON.parse(options.body); log.patches.push(body); Object.assign(meta, body); return result(meta); }
      return result(meta);
    };
    const synthesize = async constraints => {
      const context = new AudioContext(); await context.resume();
      const tone = context.createOscillator(), output = context.createMediaStreamDestination(); tone.frequency.value = 220; tone.connect(output); tone.start();
      if (window.__speechSmoke.burst) setTimeout(() => tone.stop(), 180);
      const tracks = [...output.stream.getAudioTracks()];
      if (constraints.video) {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const paint = () => { const ctx = canvas.getContext('2d'); ctx.fillStyle = '#245b43'; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = '#fff'; ctx.fillText('Meeting recording test ' + Date.now(), 30, 30); };
        paint(); const timer = setInterval(paint, 40); const video = canvas.captureStream(24).getVideoTracks()[0];
        video.addEventListener('ended', () => clearInterval(timer)); tracks.push(video);
      }
      const stream = new MediaStream(tracks); window.__speechSmoke.streams.push(stream); window.__speechSmoke.contexts.push(context); return stream;
    };
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (constraints?.video) { window.__speechSmoke.cameraCalls++; window.__speechSmoke.cameraConstraint=constraints; if(window.__speechSmoke.cameraFailure) throw new DOMException('Camera unavailable','NotReadableError'); }
      return synthesize(constraints);
    };
    navigator.mediaDevices.getDisplayMedia = async constraints => { window.__speechSmoke.displayCalls++; return synthesize(constraints); };
    navigator.mediaDevices.enumerateDevices = async () => window.__speechSmoke.noCamera ? [] : [{kind:'videoinput',deviceId:'test-camera',label:'测试摄像头'},{kind:'videoinput',deviceId:'test-camera-2',label:'测试摄像头 2'}];
    window.desktop = {
      listDisplaySources: async () => [{id:'window:1:0',name:'测试窗口',kind:'window',thumbnail:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#dae8e1"/></svg>')},{id:'screen:1:0',name:'整个屏幕 1',kind:'screen',thumbnail:''}],
      setDisplaySource: (id,audio) => { window.__speechSmoke.selection={id,audio}; return true; }
    };
    navigator.permissions.query = async () => ({ state: 'prompt' });
    dispatchEvent(new Event('speech-settings-changed'));
  })()`);
  await delay(200);
  await evaluate("document.querySelector('[aria-label=\"语音输入与会议录制\"]').click()");
  await waitFor("document.body.innerText.includes('开始会议录制')");
  await delay(300);
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  const assertDialogFits = async () => {
    const layout = await evaluate("(() => {const dialog=document.querySelector('#meeting-dialog'),r=dialog.getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,top:r.top,bottom:r.bottom,viewport:[innerWidth,innerHeight],overflow:dialog.scrollWidth>dialog.clientWidth,choices:[...dialog.querySelectorAll('.voice-modes button')].map(b=>b.scrollWidth>b.clientWidth)};})()");
    if (layout.width>460 || layout.left<0 || layout.right>layout.viewport[0] || layout.top<0 || layout.bottom>layout.viewport[1] || layout.overflow || layout.choices.some(Boolean)) throw new Error('Meeting dialog overflows: '+JSON.stringify(layout));
  };
  await assertDialogFits();
  win.webContents.invalidate(); await delay(200);
  fs.writeFileSync(path.join(root, 'logs/speech-smoke-meeting-dialog.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(360, 700); await delay(300); await assertDialogFits();
  fs.writeFileSync(path.join(root, 'logs/speech-smoke-meeting-dialog-mobile.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(1440, 1000); await delay(300);
  await evaluate("document.querySelector('[aria-label=\"关闭面板\"]').click()");
  const microphoneBounds = () => evaluate("(() => { const r = document.querySelector('[aria-label=\"语音输入与会议录制\"]').getBoundingClientRect(); return {x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)}; })()");
  const assertInlineStatus = async () => {
    const layout = await evaluate("(() => { const status=document.querySelector('.voice-live'),mic=document.querySelector('.voice-button'),send=document.querySelector('.send-button'),meta=document.querySelector('.composer-meta');const bounds=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,centerY:r.y+r.height/2};};return {inSlot:status.parentElement.id==='voice-input-slot',status:bounds(status),mic:bounds(mic),send:bounds(send),meta:bounds(meta),width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}; })()");
    const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    if (!layout.inSlot || layout.status.right > layout.mic.left || Math.abs(layout.status.centerY-layout.mic.centerY)>1 || overlaps(layout.status,layout.meta) || layout.status.left<0 || layout.send.right>layout.width || layout.overflow) throw new Error('Microphone status is not aligned safely to its left: ' + JSON.stringify(layout));
  };
  let bounds = await microphoneBounds();
  win.webContents.sendInputEvent({type:'mouseMove',...bounds});
  await waitFor("getComputedStyle(document.querySelector('#voice-button-tooltip')).visibility==='visible'");
  const tooltip = await evaluate("document.querySelector('#voice-button-tooltip').textContent");
  if (!tooltip.includes('长按：语音输入') || !tooltip.includes('点击：会议录制')) throw new Error('Microphone tooltip is missing interaction hints');
  fs.writeFileSync(path.join(root, 'logs/speech-smoke-microphone-tooltip.png'), (await win.webContents.capturePage()).toPNG());
  win.webContents.sendInputEvent({type:'mouseMove',x:20,y:20});
  await waitFor("getComputedStyle(document.querySelector('#voice-button-tooltip')).visibility==='hidden'");
  const sizes = await evaluate("[...document.querySelectorAll('.voice-button,.send-button')].map(button => { const r = button.getBoundingClientRect(); return [r.width,r.height]; })");
  if (sizes.some(size => size[0] !== 29 || size[1] !== 29)) throw new Error('Composer button sizes differ: ' + JSON.stringify(sizes));
  // A short pointer click must release capture and create no speech session.
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...bounds });
  await delay(80);
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...bounds });
  await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
  await waitFor("__speechSmoke.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))");
  if (await evaluate('__speechSmoke.sessions.length')) throw new Error('Short click created dictation');
  await evaluate("document.querySelector('[aria-label=\"关闭面板\"]').click(); __speechSmoke.burst=true; __speechSmoke.delaySession=1200; __speechSmoke.delayReady=1800;");
  await evaluate("document.querySelector('.composer textarea').focus()");
  await delay(300);
  // Speech exists only during the first 180ms, before the 350ms hold decision.
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...bounds });
  await delay(600);
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...bounds });
  // Capture is paused immediately; the already authorized device stays warm briefly.
  await waitFor("__speechSmoke.streams.some(s => s.getAudioTracks().some(t => t.readyState === 'live'))");
  if (await evaluate('__speechSmoke.sessions.length')) throw new Error('Slow backend responded before capture-stop assertion');
  await waitFor("__speechSmoke.readyRequested === true");
  const loadingFeedback = await evaluate("document.querySelector('.voice-live').innerText");
  await assertInlineStatus();
  if ((await microphoneBounds()).x !== bounds.x) throw new Error('Loading status moved the microphone button horizontally');
  if (!loadingFeedback.includes('加载') || /\d\d:\d\d/.test(loadingFeedback)) throw new Error('Cold model shows a recording clock before readiness: ' + loadingFeedback);
  if (await evaluate('__speechSmoke.pcmBytes') !== 0) throw new Error('Audio was drained before model readiness');
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'logs/speech-smoke-loading.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(360, 800);
  await delay(100);
  await evaluate("if (!document.querySelector('.app-shell').classList.contains('sidebar-collapsed')) document.querySelector('.mobile-nav-toggle').click()");
  await assertInlineStatus();
  const loadingBounds = await evaluate("(() => { const panel=document.querySelector('.voice-live'); const r=panel.getBoundingClientRect(); return {left:r.left,right:r.right,width:innerWidth,overflow:panel.scrollWidth > panel.clientWidth}; })()");
  if (loadingBounds.left < 0 || loadingBounds.right > loadingBounds.width || loadingBounds.overflow) throw new Error('Mobile loading feedback overflows: ' + JSON.stringify(loadingBounds));
  fs.writeFileSync(path.join(root, 'logs/speech-smoke-loading-mobile.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(1440, 1000);
  await waitFor("document.querySelector('.composer textarea').value === '语音测试会议结束'");
  if (await evaluate('__speechSmoke.earlySamples') < 500) throw new Error('Immediate speech was lost before hold/backend readiness');
  if (await evaluate("Boolean(document.querySelector('#meeting-dialog'))")) throw new Error('Early release opened meeting dialog');
  await evaluate("__speechSmoke.burst=false; __speechSmoke.delaySession=0; __speechSmoke.delayReady=0; (() => { const input=document.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,''); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  bounds = await microphoneBounds();
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...bounds });
  await waitFor("Boolean(document.querySelector('.voice-live:not(.voice-standby)'))");
  await waitFor("window.__speechSmoke.sessions.length === 2");
  await waitFor("document.querySelector('.composer textarea').value === '语音测试正在转写'");
  if (await evaluate("Boolean(document.querySelector('#meeting-dialog'))")) throw new Error('Long hold opened a meeting dialog');
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...bounds });
  await waitFor("document.querySelector('.voice-live')?.innerText.includes('确认文字中')");
  if (await evaluate("Boolean(document.querySelector('#meeting-dialog'))")) throw new Error('Release opened a meeting dialog while finalizing');
  await waitFor("document.querySelector('.composer textarea').value.includes('语音测试会议结束')");
  if (await evaluate("Boolean(document.querySelector('#meeting-dialog'))")) throw new Error('Dictation finish opened a meeting dialog');
  const finalDraft = await evaluate("document.querySelector('.composer textarea').value");
  if (finalDraft !== '语音测试会议结束') throw new Error('Preview was duplicated: ' + finalDraft);
  await waitFor("Boolean(document.querySelector('[aria-label=\"关闭待命麦克风\"]'))");
  await assertInlineStatus();
  if ((await microphoneBounds()).x !== bounds.x) throw new Error('Standby status moved the microphone button horizontally');
  fs.writeFileSync(path.join(root, 'logs/speech-smoke-microphone-standby.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(360, 800); await delay(100);
  await assertInlineStatus();
  fs.writeFileSync(path.join(root, 'logs/speech-smoke-microphone-standby-mobile.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(1440, 1000); await delay(100);
  await evaluate("document.querySelector('[aria-label=\"关闭待命麦克风\"]').click()");
  await waitFor("__speechSmoke.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))");
  // Cancel either picker without opening a new native window or creating a meeting.
  for (const label of ['屏幕会议', '摄像头会议']) {
    const count = await evaluate('__speechSmoke.sessions.length');
    const displays = await evaluate('__speechSmoke.displayCalls');
    await evaluate("document.querySelector('[aria-label=\"语音输入与会议录制\"]').click()");
    await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
    await evaluate(`[...document.querySelectorAll('.voice-modes button')].find(button=>button.innerText===${JSON.stringify(label)}).click()`);
    await evaluate("document.querySelector('#meeting-dialog .primary-action').click()");
    await waitFor("Boolean(document.querySelector('.capture-picker'))");
    if (BrowserWindow.getAllWindows().length !== 1) throw new Error('Picker opened a new window');
    if (label === '摄像头会议') await waitFor("Boolean(document.querySelector('.capture-camera-preview video')?.srcObject)");
    win.webContents.invalidate(); await delay(200);
    fs.writeFileSync(path.join(root, `logs/capture-picker-${label === '屏幕会议' ? 'screen' : 'camera'}.png`), (await win.webContents.capturePage()).toPNG());
    win.setSize(360, 700); await delay(150);
    const overflow = await evaluate("(() => {const p=document.querySelector('.capture-picker'),r=p.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight||p.scrollWidth>p.clientWidth;})()");
    if (overflow) throw new Error('Source picker overflows on mobile');
    fs.writeFileSync(path.join(root, `logs/capture-picker-${label === '屏幕会议' ? 'screen' : 'camera'}-mobile.png`), (await win.webContents.capturePage()).toPNG());
    win.setSize(1440, 1000); await delay(150);
    await evaluate("document.querySelector('[aria-label=\"关闭录制来源选择\"]').click()");
    await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
    if (await evaluate(`__speechSmoke.sessions.length!==${count} || __speechSmoke.displayCalls!==${displays} || document.body.innerText.includes('Invalid capture constraints')`)) throw new Error('Cancel created a session or capture error');
    await evaluate("document.querySelector('[aria-label=\"关闭面板\"]').click()");
    await waitFor("__speechSmoke.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))");
  }
  await evaluate("__speechSmoke.noCamera=true; document.querySelector('[aria-label=\"语音输入与会议录制\"]').click()");
  await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
  await evaluate("[...document.querySelectorAll('.voice-modes button')].find(b=>b.innerText==='摄像头会议').click()");
  await evaluate("document.querySelector('#meeting-dialog .primary-action').click()");
  await waitFor("document.body.innerText.includes('未检测到摄像头')");
  if (!await evaluate("document.querySelector('.capture-picker .primary-action').disabled")) throw new Error('No-camera capture is enabled');
  await evaluate("document.querySelector('[aria-label=\"关闭录制来源选择\"]').click(); __speechSmoke.noCamera=false;");
  await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
  await evaluate("document.querySelector('[aria-label=\"关闭面板\"]').click()");
  await evaluate("__speechSmoke.cameraFailure=true; document.querySelector('[aria-label=\"语音输入与会议录制\"]').click()");
  await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
  await evaluate("[...document.querySelectorAll('.voice-modes button')].find(b=>b.innerText==='摄像头会议').click()");
  await evaluate("document.querySelector('#meeting-dialog .primary-action').click()");
  await waitFor("document.body.innerText.includes('摄像头无法启动')");
  if (!await evaluate("document.querySelector('.capture-picker .primary-action').disabled")) throw new Error('Broken-camera capture is enabled');
  await evaluate("document.querySelector('[aria-label=\"关闭录制来源选择\"]').click(); __speechSmoke.cameraFailure=false;");
  await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
  await evaluate("document.querySelector('[aria-label=\"关闭面板\"]').click()");
  for (const label of ['语音会议', '屏幕会议', '摄像头会议']) {
    await evaluate("document.querySelector('[aria-label=\"语音输入与会议录制\"]').click()");
    await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
    await evaluate(`(() => { [...document.querySelectorAll('.voice-modes button')].find(button => button.innerText === ${JSON.stringify(label)}).click(); const check = document.querySelector('.voice-check input'); if (check.checked) check.click(); })()`);
    await evaluate("[...document.querySelectorAll('#meeting-dialog button')].find(button => button.innerText.includes('开始会议录制')).click()");
    if (label !== '语音会议') {
      await waitFor("Boolean(document.querySelector('.capture-picker'))");
      if (label === '屏幕会议') {
        await waitFor("Boolean(document.querySelector('.capture-source'))");
        await evaluate("document.querySelector('.capture-source').click()");
      } else {
        await waitFor("Boolean(document.querySelector('.capture-camera-preview video')?.srcObject)");
        await evaluate("(() => {const select=document.querySelector('[aria-label=\"选择摄像头设备\"]');select.value='test-camera-2';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
        await waitFor("__speechSmoke.cameraConstraint.video.deviceId.exact==='test-camera-2' && Boolean(document.querySelector('.capture-camera-preview video')?.srcObject) && !document.querySelector('.capture-picker .primary-action').disabled");
      }
      await evaluate("document.querySelector('.capture-picker .primary-action').click()");
    }
    await waitFor("Boolean(document.querySelector('.meeting-workspace'))");
    if (label !== '语音会议') await waitFor("Boolean(document.querySelector('.meeting-media-preview video')?.srcObject?.getVideoTracks().length)");
    await waitFor("Boolean(document.querySelector('.meeting-finish'))");
    await waitFor("Boolean(document.querySelector('[aria-label=\"说话人 1姓名\"]'))");
    if (!await evaluate("Boolean(document.querySelector('.meeting-control-panel [aria-label=\"说话人 1姓名\"]')) && !document.querySelector('.meeting-transcript-panel input')")) throw new Error('Participants did not move to the left control panel');
    await evaluate(`(() => { const input = document.querySelector('[aria-label="说话人 1姓名"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'小李'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitFor("Boolean(document.querySelector('.voice-remember')) && !document.querySelector('.voice-remember').disabled");
    await evaluate("document.querySelector('.voice-remember').click()");
    await waitFor("document.body.innerText.includes('已记住 小李')");
    await delay(1100);
    await evaluate("document.querySelector('.meeting-finish').click()");
    await waitFor("document.body.innerText.includes('导出逐字稿') && document.querySelector('.meeting-workspace')");
    if (!await evaluate("document.querySelector('.meeting-transcript').innerText.includes('项目由小李负责') && document.querySelector('.meeting-transcript').innerText.includes('会议结束')")) throw new Error('Finishing a meeting hid the saved transcript');
    await evaluate("document.querySelector('[aria-label=\"返回工作台\"]').click()");
  }
  await evaluate("document.querySelector('[aria-label=\"语音输入与会议录制\"]').click()");
  await waitFor("Boolean(document.querySelector('#meeting-dialog'))");
  await evaluate("[...document.querySelectorAll('.voice-modes button')].find(button=>button.innerText==='语音会议').click(); const check=document.querySelector('.voice-check input'); if(!check.checked)check.click(); [...document.querySelectorAll('#meeting-dialog button')].find(button=>button.innerText.includes('开始会议录制')).click()");
  await waitFor("Boolean(document.querySelector('.meeting-finish')) && Boolean(document.querySelector('.meeting-transcript article'))");
  await evaluate("document.querySelector('.meeting-finish').click()");
  await waitFor("Boolean(__speechSmoke.summarySessionId) && !document.querySelector('.meeting-workspace') && Boolean(document.querySelector('.topbar-title b')) && document.querySelector('.topbar-title b').innerText.includes('会议纪要')");
  await waitFor("!document.querySelector('.send-button.stop')");
  const report = await evaluate(`({ modes: __speechSmoke.sessions.map(s => s.mode), displayCalls: __speechSmoke.displayCalls, cameraCalls: __speechSmoke.cameraCalls, cameraConstraint: __speechSmoke.cameraConstraint, pcmBytes: __speechSmoke.pcmBytes, media: __speechSmoke.media, patches: __speechSmoke.patches, profiles: __speechSmoke.profiles, stopped: __speechSmoke.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')), draft: document.querySelector('.composer textarea').value })`);
  if (!report.stopped || report.displayCalls !== 1 || report.cameraCalls < 4 || report.cameraConstraint.video.deviceId.exact !== 'test-camera-2' || !report.media.some(item => item.type.startsWith('video/') && item.mode==='camera') || !report.media.some(item => item.type.startsWith('video/') && item.mode==='screen') || !report.patches.some(item => item.participants?.['speaker-1']?.name === '小李')) throw new Error(JSON.stringify(report));
  console.log(JSON.stringify(report));
  // The permission toggle persists to the backend and is inherited by new sessions.
  await evaluate("document.querySelector('.permission-chip').click()");
  await waitFor("Boolean(document.querySelector('[role=switch][aria-label=\"允许完全访问\"]'))");
  const screenshots = path.join(root, 'logs'); fs.mkdirSync(screenshots, { recursive: true });
  fs.writeFileSync(path.join(screenshots, 'speech-smoke-permissions.png'), (await win.webContents.capturePage()).toPNG());
  await evaluate("document.querySelector('[role=switch][aria-label=\"允许完全访问\"]').click()");
  await waitFor("document.querySelector('.permission-chip').innerText.includes('完全访问')");
  await evaluate("document.querySelector('.project-create').click()");
  await waitFor("document.querySelector('.permission-chip').innerText.includes('完全访问')");
  const mode = await evaluate("fetch('/api/session', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'permission smoke'})}).then(r=>r.json()).then(s=>fetch('/api/session/'+s.id)).then(r=>r.json()).then(s=>s.mode)");
  if (mode !== 'auto-all') throw new Error('New session did not inherit toggle');
  await evaluate("document.querySelector('[aria-label=\"设置\"]').click()");
  await evaluate("[...document.querySelectorAll('[role=tab]')].find(b => b.innerText === '语音与声纹').click()");
  await waitFor("document.querySelectorAll('.speech-model-card').length === 4");
  await evaluate("document.querySelector('[aria-label=\"删除 SenseVoice Small INT8\"]').click()");
  await waitFor("Boolean(document.querySelector('.action-popover-danger'))");
  await evaluate("document.querySelector('.action-popover-danger').click()");
  await waitFor("__speechSmoke.deleted === 'sensevoice' && !document.querySelector('[aria-label=\"删除 SenseVoice Small INT8\"]')");
  await evaluate("__speechSmoke.choices.find(m=>m.id==='qwen06').installed=false; dispatchEvent(new Event('speech-settings-changed'))");
  await waitFor("[...document.querySelectorAll('.speech-model-card')].find(c => c.innerText.includes('Qwen3-ASR 0.6B')).querySelector('button').innerText.includes('下载')");
  await evaluate("[...document.querySelectorAll('.speech-model-card')].find(c => c.innerText.includes('Qwen3-ASR 0.6B')).querySelector('button').click()");
  await waitFor("Boolean(document.querySelector('.speech-model-card .speech-download-progress'))");
  const progress = await evaluate("document.querySelector('.speech-download-progress').innerText");
  if (!progress.includes('25%') || !progress.includes('2.0 KB/秒') || !progress.includes('剩余 3.0 KB')) throw new Error('Inline progress incorrect: ' + progress);
  fs.writeFileSync(path.join(screenshots, 'speech-smoke-models.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(430, 932); await delay(200);
  await evaluate("if (!document.querySelector('.app-shell').classList.contains('sidebar-collapsed')) document.querySelector('.mobile-nav-toggle').click(); [...document.querySelectorAll('.speech-model-card')].find(c=>c.innerText.includes('Qwen3-ASR 0.6B')).scrollIntoView({block:'center'});");
  await delay(100);
  const mobile = await evaluate("({width:innerWidth,content:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('.speech-model-card')].map(c=>{const r=c.getBoundingClientRect();return [r.left,r.right]})})");
  if (mobile.content > mobile.width || mobile.cards.some(r=>r[0]<0 || r[1]>mobile.width)) throw new Error('Mobile model layout overflows: ' + JSON.stringify(mobile));
  fs.writeFileSync(path.join(screenshots, 'speech-smoke-models-mobile.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(1440, 1000);
  await win.reload();
  await waitFor("document.querySelector('.permission-chip')?.innerText.includes('完全访问')");
  await delay(300);
  await instance.release?.(); instance.child?.kill(); clearTimeout(deadline); win.destroy(); app.exit(0);
}).catch(error => { console.error(error.stack); instance?.child?.kill(); clearTimeout(deadline); app.exit(1); });
