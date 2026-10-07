const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const requestFile=process.argv.find(arg=>arg.startsWith('--mli-verifier-request='))?.slice('--mli-verifier-request='.length)||process.argv[2];
const request=JSON.parse(fs.readFileSync(requestFile,'utf8'));
app.setPath('userData',path.join(path.dirname(requestFile),'chromium'));
app.whenReady().then(async()=>{
  let win;
  try{
    const isolated=session.fromPartition(`mli-document-${Date.now()}`);
    isolated.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    isolated.on('will-download',event=>event.preventDefault());
    isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!/^file:|^blob:|^data:/.test(details.url)}));
    win=new BrowserWindow({show:false,width:1440,height:2000,webPreferences:{session:isolated,offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    await win.loadFile(request.renderer);
    for(let attempt=0;attempt<100;attempt++){
      if(await win.webContents.executeJavaScript('typeof window.renderVerificationDocument==="function"'))break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    const data=fs.readFileSync(request.pdf).toString('base64');
    const result=await win.webContents.executeJavaScript(`window.renderVerificationDocument(${JSON.stringify({data,pages:request.pages})})`);
    fs.writeFileSync(request.resultFile,JSON.stringify(result));
    app.exit(0);
  }catch(error){fs.writeFileSync(request.resultFile,JSON.stringify({error:error.message}));app.exit(1);}
  finally{win?.destroy();}
});
