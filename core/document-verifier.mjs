import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_ROOT, resolveReadable } from './paths.mjs';
import { fileEvidence, assertLocalVerification, verificationEnvironment } from './artifact-evidence.mjs';
import { verifierProcess } from './verifier-process.mjs';
import { convertOfficeFile } from '../plugins/office/plugin.mjs';
import { electronVerifierLaunch } from './electron-verifier.mjs';
import { cleanCommandEnv } from './sandbox.mjs';

export async function verifyDocument({path:file,pages=[],checks=[]},ctx={}) {
  assertLocalVerification();
  if(!/\.(?:pdf|docx|xlsx|pptx)$/i.test(file||''))throw new Error('verify_document 支持 PDF、DOCX、XLSX、PPTX');
  if(!Array.isArray(pages)||pages.length>6||pages.some(page=>!Number.isInteger(page)||page<1)||!Array.isArray(checks)||checks.length>30)throw new Error('一次最多渲染 6 个指定页和执行 30 项检查；其他页可继续调用');
  const artifact=fileEvidence(file),input=resolveReadable(file),results=[],media=[];
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mli-document-verify-'));
  let rendered=false,result;
  try{
    const renderer=path.join(APP_ROOT,'dist','document-renderer.html');
    if(!fs.existsSync(renderer))throw new Error('文档渲染组件尚未构建，请构建前端或更新客户端');
    const pdf=/\.pdf$/i.test(file)?input:await convertOfficeFile(input,path.join(directory,'rendered.pdf'),'pdf',{...ctx,preferNative:false});
    if(fs.statSync(pdf).size>64*1024*1024)throw new Error('单次 PDF 渲染读取预算为 64 MiB，请拆分文档后继续检查');
    const resultFile=path.join(directory,'result.json'),requestFile=path.join(directory,'request.json');
    fs.writeFileSync(requestFile,JSON.stringify({pdf,pages,renderer,resultFile}));
    const launch=electronVerifierLaunch('document',requestFile);
    const child=await verifierProcess(launch.executable,launch.args,{...ctx,env:cleanCommandEnv()});
    result=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):null;
    if(child.code!==0||result?.error||!result?.pages?.length)throw new Error(result?.error||child.stderr||'未取得实际渲染页面');
    rendered=true;
    results.push({name:'文档实际渲染',passed:true,detail:`${result.pages.length}/${result.pageCount} 页`});
    for(const page of result.pages){media.push({type:'image',mime:'image/png',name:`${path.basename(file)} · 第 ${page.page} 页`,dataUrl:page.image});results.push({name:`第 ${page.page} 页画布有效`,passed:page.width>0&&page.height>0});}
    for(const rule of checks){
      let passed=false,actual;
      if(rule.type==='page_count'){actual=result.pageCount;passed=actual===Number(rule.value);}
      else if(rule.type==='min_pages'){actual=result.pageCount;passed=actual>=Number(rule.value);}
      else if(rule.type==='max_pages'){actual=result.pageCount;passed=actual<=Number(rule.value);}
      else if(rule.type==='page_contains'){const page=result.pages.find(page=>page.page===rule.page);if(!page)throw new Error('page_contains 必须检查本次实际渲染的页码');actual=page.text;passed=Boolean(rule.value)&&actual.includes(String(rule.value));}
      else throw new Error('不支持的文档渲染约束');
      results.push({name:String(rule.name||rule.type).slice(0,200),criterion:rule.criterion,passed,detail:String(actual).slice(0,1000)});
    }
    results.push({name:'渲染期间原产物版本一致',passed:fileEvidence(file).sha256===artifact.sha256});
  }catch(error){if(ctx.signal?.aborted)throw error;results.push({name:'文档实际验收',passed:false,detail:error.message});}
  finally{try{fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{}}
  const verification={kind:'document',environment:verificationEnvironment(),artifacts:[artifact],checks:results,assertions:checks.length,rendered,renderedPages:result?.pages?.map(page=>page.page)||[],pageCount:result?.pageCount,renderedAll:!!result?.renderedAll,scope:'实际 PDF 页面渲染及页数/页面文字约束；图片供视觉核对，不代表排版审美和内容事实已自动通过'};
  return {content:JSON.stringify({artifact,checks:results,pageCount:result?.pageCount,renderedPages:verification.renderedPages,renderedAll:verification.renderedAll,scope:verification.scope},null,2),status:results.length&&results.every(check=>check.passed)?'ok':'error',media,verification};
}
