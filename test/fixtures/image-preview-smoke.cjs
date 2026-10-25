const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-image-preview-'));
app.setPath('userData', path.join(dir, 'data'));
setTimeout(() => app.exit(1), 45000).unref();
app.whenReady().then(async () => {
  await require('esbuild').build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import PreviewAnnotations from './react/src/PreviewAnnotations.jsx';import ImagePreview from './react/src/ImagePreview.jsx';window.sent=[];createRoot(document.getElementById('root')).render(<PreviewAnnotations path="assets/demo.png" storageKey="test" onSend={async text=>{window.sent.push(text);return true}}><ImagePreview src="./sample.svg" name="demo.png"/></PreviewAnnotations>);`,resolveDir:root,loader:'jsx'},outfile:path.join(dir,'app.js'),bundle:true,platform:'browser',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff2':'file'}});
  fs.writeFileSync(path.join(dir,'sample.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#329b6c"/><circle cx="400" cy="200" r="100" fill="#f9d358"/></svg>');
  fs.writeFileSync(path.join(dir,'index.html'), '<html><head><link rel="stylesheet" href="app.css"><style>body{margin:0;font-family:system-ui}#root{height:100vh}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');
  const win = new BrowserWindow({width:1100,height:800,show:true});
  win.webContents.on('console-message',details=>console.log(details.message));
  await win.loadFile(path.join(dir,'index.html'));
  const run = async code => {try{return await win.webContents.executeJavaScript(code,true);}catch(error){console.error('SCRIPT',code);throw error;}};
  const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
  for(let i=0;i<100;i++){if(await run('!!document.querySelector("canvas")'))break;await wait(50);}
  await wait(200);
  assert.equal(await run('document.querySelector("canvas").width'),800);
  await run('document.querySelector("[aria-label=向右旋转]").click()');await wait(100);
  assert.equal(await run('document.querySelector("canvas").width'),400);
  await run('document.querySelector("[aria-label=放大]").click()');await wait(100);
  assert.ok(await run('document.querySelector(".image-zoom").innerText.includes("%")'));
  await run(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='移除背景 · Agent').click()`);await wait(100);
  assert.ok(await run('document.querySelector("textarea[aria-label=文件协作要求]").value.includes("移除")'));
  await run('document.querySelector(".preview-agent-send").click()');await wait(100);
  assert.equal(await run('window.sent.length'),1);
  assert.ok(await run('window.sent[0].includes("assets/demo.png")'));
  assert.equal(await run('document.querySelector("textarea[aria-label=文件协作要求]").value'),'');
  await run(`window.sent.push = () => { throw new Error('模拟发送失败'); }; [...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='移除背景 · Agent').click()`);await wait(100);
  await run('document.querySelector(".preview-agent-send").click()');await wait(100);
  assert.ok(await run('document.querySelector("textarea[aria-label=文件协作要求]").value.includes("移除")'));
  assert.ok(await run('document.querySelector("[role=alert]").textContent.includes("模拟发送失败")'));
  for(const width of [1100,390]){
    win.setSize(width,800);await wait(200);
    const box=await run('(()=>{const r=document.querySelector(".preview-agent-composer").getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})()');
    assert.ok(box.left>=0&&box.right<=box.width,JSON.stringify(box));
    fs.writeFileSync(path.join(dir,`preview-${width}.png`),(await win.webContents.capturePage()).toPNG());
  }
  console.log('Image preview smoke passed',dir);app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
