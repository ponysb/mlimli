// Dedicated hidden, sandboxed Chromium session. No access to the user's browser profile.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {fileURLToPath}=require('node:url');
const requestFile=process.argv.find(arg=>arg.startsWith('--mli-verifier-request='))?.slice('--mli-verifier-request='.length)||process.argv[2];
const request=JSON.parse(fs.readFileSync(requestFile,'utf8'));
app.setPath('userData',path.join(path.dirname(requestFile),'chromium'));
const inside=(candidate,root)=>{const relative=path.relative(root,candidate);return relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
function allowed(value){try{const url=new URL(value);if(['data:','blob:','about:'].includes(url.protocol))return true;if(url.protocol==='file:')return inside(fs.realpathSync(fileURLToPath(url)),fs.realpathSync(request.root));return ['http:','https:'].includes(url.protocol)&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!url.username&&!url.password;}catch{return false;}}
app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('disable-http-cache');
app.whenReady().then(async()=>{
 let window;const checks=[],trace=[],errors=[];let blocked=0;
 try{
  const isolated=session.fromPartition(`memory:${Date.now()}-${Math.random()}`);isolated.setPermissionRequestHandler((wc,permission,callback)=>callback(false));
  isolated.webRequest.onBeforeRequest((details,callback)=>{const ok=allowed(details.url);if(!ok)blocked++;callback({cancel:!ok});});
  isolated.on('will-download',event=>event.preventDefault());
  window=new BrowserWindow({show:false,width:Math.max(320,Math.min(1920,Number(request.width)||1280)),height:Math.max(300,Math.min(1400,Number(request.height)||900)),webPreferences:{session:isolated,offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault();});
  window.webContents.on('console-message',(...args)=>{const event=args[0];if(event.level==='error'||args[1]===3)errors.push(String(event.message||args[2]).slice(0,500));});
  const js=code=>window.webContents.executeJavaScript(code);
  await window.loadURL(request.target);
  for(const action of request.actions){
   if(!action||typeof action.type!=='string')throw new Error('无效测试步骤');
   const type=action.type,selector=String(action.selector||''),value=String(action.value??''),name=String(action.name||`${type} ${selector}`).slice(0,200);let observed;
   const matches=`Array.from(document.querySelectorAll(${JSON.stringify(selector||'body')})).filter(e=>${action.text==null?'true':`e.innerText?.trim()===${JSON.stringify(String(action.text))}`})`;
   // Wait for async rendering before each step rather than relying on a fixed page-load sleep.
   if(selector){const deadline=Date.now()+3000;while(!await js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)){if(Date.now()>deadline&&type!=='assert_count')throw new Error(`未找到元素 ${selector}`);if(Date.now()>deadline)break;await new Promise(r=>setTimeout(r,30));}}
   if(type==='viewport')window.setSize(Math.max(320,Math.min(1920,Number(action.width)||390)),Math.max(300,Math.min(1400,Number(action.height)||844)));
   else if(type==='reload')await window.loadURL(window.webContents.getURL());
   else if(type==='click')await js(`(()=>{const e=(${matches})[0];if(!e||e.disabled)throw new Error('元素不存在或禁用');e.click();})()`);
   else if(type==='fill')await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||!['INPUT','TEXTAREA','SELECT'].includes(e.tagName))throw new Error('不是输入控件');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
   else if(type==='assert_text'){observed=await js(`(document.querySelector(${JSON.stringify(selector||'body')})?.innerText||'').slice(0,20000)`);checks.push({name,criterion:action.criterion,passed:observed.includes(value),detail:observed.slice(0,800)});}
   else if(type==='assert_value'){observed=await js(`document.querySelector(${JSON.stringify(selector)})?.value`);checks.push({name,criterion:action.criterion,passed:observed===value,detail:String(observed)});}
   else if(type==='assert_count'){observed=await js(`(${matches}).length`);checks.push({name,criterion:action.criterion,passed:observed===Number(action.count),detail:String(observed)});}
   else if(type==='assert_no_overflow'){observed=await js('({width:innerWidth,scroll:document.documentElement.scrollWidth})');checks.push({name,criterion:action.criterion,passed:observed.scroll<=observed.width,detail:JSON.stringify(observed)});}
   else if(type==='assert_no_errors')checks.push({name,criterion:action.criterion,passed:!errors.length&&!blocked,detail:JSON.stringify({errors,blocked})});
   else if(type!=='screenshot')throw new Error(`不支持的页面动作 ${type}`);
   trace.push({type,selector,name});await new Promise(r=>setTimeout(r,100));
  }
  if(!checks.length)throw new Error('没有运行页面断言');
  await new Promise(r=>setTimeout(r,200));fs.writeFileSync(request.imageFile,(await window.webContents.capturePage()).toPNG());
 }catch(error){checks.push({name:'浏览器流程',passed:false,detail:error.message});}
 finally{fs.writeFileSync(request.resultFile,JSON.stringify({passed:checks.every(c=>c.passed),checks,trace,errors,blocked}));window?.destroy();app.exit(0);}
}).catch(error=>{fs.writeFileSync(request.resultFile,JSON.stringify({passed:false,checks:[{name:'浏览器启动',passed:false,detail:error.message}],trace:[]}));app.exit(1);});
