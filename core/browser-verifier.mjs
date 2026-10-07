import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getWorkspaceRoot, resolveInWorkspace } from './paths.mjs';
import { electronVerifierLaunch } from './electron-verifier.mjs';
import { verifierProcess } from './verifier-process.mjs';
export function browserTarget(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('浏览器测试需要 URL 或 HTML 文件路径');
  if (!/^\w+:/.test(value) || /^[a-z]:[\\/]/i.test(value)) return pathToFileURL(resolveInWorkspace(value)).href;
  const url = new URL(value);
  if (url.protocol === 'file:') return pathToFileURL(resolveInWorkspace(fileURLToPath(url))).href;
  if (!['http:','https:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('浏览器验收仅支持工作区文件和本机 localhost 网页');
  return url.href;
}
export async function verifyBrowser({ url, actions = [], width = 1280, height = 900, ...options }, { signal } = {}) {
  const target = browserTarget(url);
  if (!Array.isArray(actions) || actions.length > 60 || !actions.some(action => action?.type?.startsWith('assert_'))) throw new Error('至少提供一项实际页面断言，最多 60 步；仅截图不算测试通过');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'mli-browser-check-'));
  const request = { target, actions, width, height, root:getWorkspaceRoot(), resultFile:path.join(directory,'result.json'), imageFile:path.join(directory,'page.png') };
  const inputFile = path.join(directory,'request.json');fs.writeFileSync(inputFile,JSON.stringify(request));
  let launch;
  try { launch = electronVerifierLaunch('browser',inputFile); }
  catch { fs.rmSync(directory,{recursive:true,force:true});throw new Error('浏览器验收需要 Electron 桌面运行时或开发依赖'); }
  try {
    const child=await verifierProcess(launch.executable,launch.args,{signal,timeoutMs:35000});
    if(child.code!==0)throw new Error(`浏览器验收启动失败：${child.stderr||child.code}`);
    const result=JSON.parse(fs.readFileSync(request.resultFile,'utf8'));
    const image=fs.existsSync(request.imageFile)?`data:image/png;base64,${fs.readFileSync(request.imageFile).toString('base64')}`:undefined;
    return {...result,image,target};
  } finally {try{fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{/* Chromium may retain a temporary screenshot handle briefly on Windows. */}}
}
