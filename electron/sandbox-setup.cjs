function registerSandboxSetup({ipcMain,getWindow,serverUrl,preflight,install,repair,platform=process.platform}) {
  let installing=false;
  const register=(channel,action)=>ipcMain.handle(channel,async event=>{
    const win=getWindow(),contents=win?.webContents;
    if(!win||win.isDestroyed()||!contents||contents.isDestroyed()||event.sender!==contents||event.senderFrame!==contents.mainFrame)throw new Error('安装沙箱仅允许应用主窗口操作');
    if(new URL(contents.getURL()).origin!==new URL(serverUrl).origin)throw new Error('安装沙箱仅允许本地设置页面操作');
    if(platform!=='win32')throw new Error('原生沙箱安装仅支持 Windows');
    if(installing)throw new Error('沙箱正在安装，请等待管理员授权和安装完成');
    installing=true;
    try {await preflight();return await action();}
    finally {installing=false;}
  });
  register('install-windows-sandbox',install);
  if(repair)register('repair-windows-sandbox',repair);
}
module.exports={registerSandboxSetup};
