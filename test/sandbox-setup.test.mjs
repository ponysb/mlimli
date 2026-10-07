import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {registerSandboxSetup}=createRequire(import.meta.url)('../electron/sandbox-setup.cjs');
function fixture(options={}) {
  let handler,installed=0;
  const contents={mainFrame:{},isDestroyed:()=>false,getURL:()=> 'http://127.0.0.1:1234/'};
  const win={webContents:contents,isDestroyed:()=>false},event={sender:contents,senderFrame:contents.mainFrame};
  registerSandboxSetup({ipcMain:{handle:(name,fn)=>{assert.equal(name,'install-windows-sandbox');handler=fn;}},getWindow:()=>win,serverUrl:'http://127.0.0.1:1234',platform:'win32',preflight:async()=>{},install:async()=>{installed++;return {cancelled:false,status:{available:true}};},...options});
  return {invoke:(value=event)=>handler(value),event,contents,installed:()=>installed};
}
test('sandbox system setup is restricted to the desktop main frame and the local application origin',async()=>{
  const f=fixture();assert.equal(f.installed(),0,'registration must not install');
  await assert.rejects(f.invoke({...f.event,sender:{}}),/主窗口/);
  await assert.rejects(f.invoke({...f.event,senderFrame:{}}),/主窗口/);
  f.contents.getURL=()=> 'https://example.com/';await assert.rejects(f.invoke(),/本地设置/);
  assert.equal(f.installed(),0);
  await assert.rejects(fixture({platform:'linux'}).invoke(),/Windows/);
});
test('active-task preflight failure does not launch installation and allows a later retry',async()=>{
  let blocked=true;
  const f=fixture({preflight:async()=>{if(blocked)throw Error('任务正在运行');}});
  await assert.rejects(f.invoke(),/任务/);assert.equal(f.installed(),0);
  blocked=false;assert.equal((await f.invoke()).status.available,true);assert.equal(f.installed(),1);
});
test('UAC cancellation and installer errors release the pending state; duplicate clicks cannot install twice',async()=>{
  let finish,calls=0;
  const f=fixture({install:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  const first=f.invoke();await Promise.resolve();await assert.rejects(f.invoke(),/正在安装/);assert.equal(calls,1);
  finish({cancelled:true,status:{available:false}});assert.equal((await first).cancelled,true);
  const second=f.invoke();await Promise.resolve();finish({cancelled:false,status:{available:true}});assert.equal((await second).status.available,true);assert.equal(calls,2);
  let fail=true;
  const broken=fixture({install:async()=>{if(fail)throw Error('helper 校验失败');return {cancelled:false};}});
  await assert.rejects(broken.invoke(),/校验失败/);fail=false;assert.equal((await broken.invoke()).cancelled,false);
});
