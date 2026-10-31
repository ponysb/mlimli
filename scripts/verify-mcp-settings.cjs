// Isolated desktop/mobile MCP settings UI verification.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {once}=require('node:events');
const {startRuntime}=require('../electron/runtime.cjs');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'mli-mcp-ui-'));
app.setPath('userData',path.join(data,'chromium'));
let runtime,win;
app.whenReady().then(async()=>{
 try {
  const config=JSON.parse(fs.readFileSync(path.join(root,'config.example.json'),'utf8'));
  config.mcp={servers:[{name:'figma',command:'node',args:['mcp-remote','https://mcp.figma.com/mcp']},{name:'modao',url:'https://modao.cc/agent-py/ai/mcp',type:'http'}]};
  config.security.workspaceRoot=path.join(data,'workspace');fs.writeFileSync(path.join(data,'config.json'),JSON.stringify(config));
  runtime=startRuntime({executable:process.execPath,runtimeRoot:root,dataRoot:data,managed:true,environment:{MLI_ACCOUNT_ENABLED:'false'}});
  const {url}=await runtime.ready;
  win=new BrowserWindow({show:false,width:1400,height:1000,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const evaluate=code=>win.webContents.executeJavaScript(code);
  const until=async code=>{const deadline=Date.now()+12000;while(Date.now()<deadline){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,40));}throw Error('UI timeout: '+code+' BODY: '+await evaluate('document.body.innerText.slice(0,2500)'));};
  const click=label=>evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(label)}).click()`);
  win.webContents.on('console-message',e=>{if(e.level==='error')console.error(e.message);});
  await win.loadURL(url);await until(`Boolean(document.querySelector('.app-shell'))`);
  await evaluate(`window.dispatchEvent(new CustomEvent('mli:open-settings',{detail:{tab:'mcp'}}))`);await until(`Boolean(document.querySelector('.settings-tabs'))`);await click('MCP 服务');
  await until(`Boolean(document.querySelector('.mcp-settings')) && !document.querySelector('.mcp-settings').textContent.includes('正在加载配置')`);
  await click('添加服务');
  const setInput=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${selector.includes('textarea')?'HTMLTextAreaElement':'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await setInput('.mcp-settings input[pattern]','sdk-ui');
  await setInput('.mcp-settings input[placeholder="npx"]',process.execPath);
  await setInput('.mcp-settings textarea[required]',JSON.stringify([path.join(root,'test/fixtures/mcp-sdk-server.mjs')]));
  await click('保存配置');await until(`document.querySelector('.mcp-settings').textContent.includes('已保存并生效')`);
  await click('测试已保存配置');await until(`document.querySelector('.mcp-state.connected')`);
  assert.ok(await evaluate(`document.querySelector('.mcp-test-result').textContent.includes('echo')`));
  await evaluate(`document.querySelector('[aria-label="关闭配置"]').click()`);
  await evaluate(`document.querySelector('[aria-label="配置 modao"]').click()`);
  assert.ok(await evaluate(`!document.querySelector('.mcp-design-strip') && !document.querySelector('.mcp-editor').textContent.includes('墨刀个人空间令牌')`));
  await evaluate(`document.querySelector('[aria-label="关闭配置"]').click()`);
  await evaluate(`document.querySelector('[aria-label="配置 github"]')?.click()`);
  if(await evaluate(`Boolean(document.querySelector('[aria-label="配置 github"]'))`)) {
    await until(`Boolean(document.querySelector('.mcp-editor input[type="password"]'))`);
    assert.ok(await evaluate(`document.querySelector('.mcp-editor input[type="url"]').disabled`));
    await evaluate(`document.querySelector('[aria-label="关闭配置"]').click()`);
  }
  const artifacts=path.join(root,'artifacts/mcp-settings-20261030');fs.mkdirSync(artifacts,{recursive:true});
  for(const mobile of [false,true]){
   if(mobile){win.setSize(390,844);await new Promise(r=>setTimeout(r,150));await evaluate(`if (!document.querySelector('.app-shell').classList.contains('sidebar-collapsed')) document.querySelector('.mobile-nav-toggle')?.click()`);}
   await new Promise(r=>setTimeout(r,250));
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'page overflow');
   assert.ok(await evaluate(`document.querySelector('.page-content').scrollWidth<=document.querySelector('.page-content').clientWidth`),'content overflow');
   fs.writeFileSync(path.join(artifacts,mobile?'mobile.png':'desktop.png'),(await win.webContents.capturePage()).toPNG());
  }
  console.log('MCP settings UI passed: navigation, add, save, real SDK connection and tools, desktop/mobile layout.');
 }catch(e){console.error(e);process.exitCode=1;}
 finally{win?.destroy();if(runtime?.child.exitCode===null){const end=once(runtime.child,'exit');runtime.child.kill();await end;}fs.rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:100});app.exit(process.exitCode||0);}
});
