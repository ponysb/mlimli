import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getWorkspaceRoot, resolveReadable } from './paths.mjs';
import { fileEvidence, sameVerificationEnvironment, verificationEnvironment } from './artifact-evidence.mjs';

const codeExt=/\.(?:[cm]?js|jsx|tsx?|py|go|rs|java|cpp|c|cs|rb|php|sh|ps1)$/i;
const officeExt=/\.(?:docx|xlsx|pptx)$/i;
const mediaExt=/\.(?:mp4|webm|mov|mkv|mp3|wav|m4a|ogg|flac|png|jpe?g|webp|gif)$/i;
export const isVerificationCommand=command=>/(?:^|[&;|])\s*(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|check)\b|(?:npx\s+)?(?:pytest|vitest|jest|mocha|ruff|eslint|tsc)\b|(?:node|python|python3)\s+(?:--test\b|[^&;|\r\n]*\btest[^&;|\r\n]*\.(?:[cm]?js|py)\b)|go\s+test\b|cargo\s+test\b|python\s+-m\s+(?:pytest|unittest)\b)/i.test(String(command));
// Bind test evidence to source/config bytes, including tests. Shell edits must invalidate it too.
export function sourceEvidence() {
  const environment=verificationEnvironment();
  if(environment.type!=='host')return {sha256:'',complete:false,environment};
  const root=getWorkspaceRoot(),hash=crypto.createHash('sha256');let count=0,bytes=0,complete=true;
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(['.agent','.git','node_modules','dist','build','coverage'].includes(entry.name))continue;
    const abs=path.join(dir,entry.name);
    if(entry.isDirectory())walk(abs);
    else if(entry.isSymbolicLink())complete=false;
    else if(entry.isFile()&&(codeExt.test(entry.name)||/\.(?:json|ya?ml|toml|html?|css|sql)$/i.test(entry.name)||/^(?:Makefile|Dockerfile)$/i.test(entry.name))){
      const size=fs.statSync(abs).size;if(++count>10000||(bytes+=size)>64*1024*1024){complete=false;continue;}
      hash.update(path.relative(root,abs).replaceAll('\\','/'));hash.update('\0');hash.update(fs.readFileSync(abs));hash.update('\0');
    }
  }};
  try{walk(root);}catch{complete=false;}
  return {sha256:hash.digest('hex'),complete,environment};
}
export function qualityPolicy(config={}) {const value=config.agent?.quality||{};return {enabled:value.enabled!==false,noProgressThreshold:Math.max(2,Math.min(8,Number(value.noProgressThreshold)||3))};}
function artifactKey(file){const value=path.resolve(getWorkspaceRoot(),file);return process.platform==='win32'?value.toLowerCase():value;}
export function assessTaskQuality({entries,turnId,files=[],prompt='',mock=false}) {
  // Rehash once per file in this assessment, never reuse a cache across deliveries.
  const versions=new Map();
  const fresh=artifact=>{
    if(!artifact?.path||!sameVerificationEnvironment(artifact.environment))return false;
    const key=artifactKey(artifact.path);
    if(!versions.has(key)){try{versions.set(key,fileEvidence(artifact.path).sha256);}catch{versions.set(key,null);}}
    return versions.get(key)===artifact.sha256;
  };
  const turn=entries.filter(entry=>entry.turnId===turnId), results=turn.filter(entry=>entry.type==='tool_end');
  const contract=results.findLast(entry=>entry.taskContract)?.taskContract;
  if(verificationEnvironment().type!=='host')return {status:'limited',domain:contract?.domain||'general',missing:[],limitations:['当前任务在远端执行；宿主文件和宿主验证不能证明远端交付版本，需由实际执行环境验证器核对'],checks:[],requirements:(contract?.criteria||[]).map(row=>({...row,status:'unverified',evidence:[]})),contract,artifacts:[]};
  const changed=files.filter(file=>file.status!=='deleted'&&!/^\.(?:agent|git)\//.test(file.path));
  const auxiliary=file=>/(?:^|\/)(?:tests?|scripts?|tools?)\//i.test(file)||/(?:^|[./_-])(?:test|spec|check|verify)(?:[._-]|$)/i.test(file)||/\.log$/i.test(file);
  const paths=[...new Set([...(contract?.deliverables||[]),...changed.filter(file=>!auxiliary(file.path)).map(file=>file.path)])];
  const verifications=results.filter(entry=>entry.verification&&entry.status==='ok'&&sameVerificationEnvironment(entry.verification.environment)&&(!entry.verification.artifacts?.length||entry.verification.artifacts.every(fresh)));
  const checks=[],missing=[],limits=[];
  for(const file of paths){try{const abs=resolveReadable(file);if(!fs.statSync(abs).isFile()||!fs.statSync(abs).size)missing.push(`交付物不存在或为空：${file}`);}catch{missing.push(`交付物不存在：${file}`);}}
  const lastMutation=turn.filter(entry=>entry.type==='tool_end'&&entry.status==='ok'&&['write_file','edit_file','office_edit','ffmpeg_convert','ffmpeg_concat'].includes(entry.name)).at(-1)?.id||0;
  const currentSource=paths.some(file=>codeExt.test(file))?sourceEvidence():null;
  const testResults=results.filter(entry=>entry.name==='bash'&&entry.command&&isVerificationCommand(entry.command)&&entry.id>=lastMutation&&currentSource?.complete&&entry.testEvidence?.complete&&sameVerificationEnvironment(entry.testEvidence.environment)&&entry.testEvidence.sha256===currentSource.sha256);
  if(paths.some(file=>codeExt.test(file))){if(!testResults.some(entry=>entry.status==='ok'&&entry.exitCode===0))missing.push('代码缺少最后修改后的实际测试/构建证据');}
  for(const entry of testResults.filter(entry=>entry.status==='ok'&&entry.exitCode===0))checks.push({name:`实际命令：${entry.command.slice(0,180)}`,passed:true,kind:'command',callId:entry.callId});
  const latestTests=new Map();for(const entry of testResults)latestTests.set(entry.command,entry);
  for(const entry of latestTests.values())if(entry.status!=='ok')missing.push(`验证命令仍失败：${entry.command.slice(0,180)}`);
  for(const file of paths){
    if(codeExt.test(file))continue;
    const relevant=verifications.filter(entry=>entry.verification.artifacts?.some(artifact=>artifactKey(artifact.path)===artifactKey(file)));
    if(/\.html?$/i.test(file)&&!relevant.some(entry=>entry.verification.kind==='browser'))missing.push(`网页缺少当前版本的实际交互验收：${file}`);
    else if(officeExt.test(file)){
      if(!relevant.some(entry=>entry.verification.kind==='artifact'&&entry.verification.assertions>0))missing.push(`Office 文件缺少当前版本的显式内容检查：${file}`);
      if(!relevant.some(entry=>entry.verification.kind==='document'&&entry.verification.rendered))limits.push(`Office 文件尚未渲染版式：${file}`);
      limits.push(`Office 自动检查不证明版式与内容质量完全正确：${file}`);
    }
    else if(/\.pdf$/i.test(file)){
      if(!relevant.some(entry=>entry.verification.kind==='document'&&entry.verification.rendered))missing.push(`PDF 缺少当前版本的实际渲染证据：${file}`);
      limits.push(`PDF 页面需继续核对排版及内容质量：${file}`);
    }
    else if(/\.(?:md|txt|csv|json)$/i.test(file)&&!relevant.some(entry=>entry.verification.assertions>0))missing.push(`内容缺少当前版本的显式约束检查：${file}`);
    else if(mediaExt.test(file)){if(!relevant.some(entry=>entry.verification.kind==='media'&&entry.verification.decoded))missing.push(`媒体缺少当前版本的实际解码证据：${file}`);limits.push(`媒体仍需核对抽帧、声音与内容质量：${file}`);}
  }
  const latestByArtifact=new Map();for(const entry of results.filter(entry=>entry.verification&&sameVerificationEnvironment(entry.verification.environment)&&entry.verification.artifacts?.length&&entry.verification.artifacts.every(fresh)))for(const artifact of entry.verification.artifacts)latestByArtifact.set(`${entry.verification.kind}:${artifactKey(artifact.path)}`,{file:artifactKey(artifact.path),entry});
  for(const {file,entry} of latestByArtifact.values())if(entry.status!=='ok'&&paths.some(target=>artifactKey(target)===file))missing.push(`交付物验收仍失败：${file}（${entry.verification.kind}）`);
  for(const entry of results.filter(entry=>entry.verification&&sameVerificationEnvironment(entry.verification.environment))){
    const evidence=entry.verification;
    if(evidence.kind==='command'&&!testResults.includes(entry))continue;
    if(evidence.artifacts?.length&&!evidence.artifacts.every(fresh))continue;
    checks.push(...(evidence.checks||[]).map(check=>({...check,passed:!!check.passed,callId:entry.callId,kind:evidence.kind,scope:evidence.scope})));
  }
  const requirements=(contract?.criteria||[]).map(criterion=>{
    const evidence=checks.filter(check=>check.criterion===criterion.id),latest=evidence.at(-1);
    const status=latest?(latest.passed?'covered':'failed'):'unverified';
    if(status!=='covered')missing.push(`验收条件${status==='failed'?'仍失败':'尚无工具证据'}：${criterion.id} ${criterion.description}`);
    return {...criterion,status,evidence:evidence.map(check=>({callId:check.callId,kind:check.kind,passed:check.passed,scope:check.scope}))};
  });
  if(testResults.some(entry=>entry.status==='ok'&&entry.exitCode===0)&&(!contract||requirements.some(row=>row.evidence.some(item=>item.kind==='command'))))limits.push('测试命令已运行；条件关联不证明测试内容覆盖全部需求，仍须核对测试本身');
  if(!paths.length&&!contract&&/保存为|写入|生成.*(?:文件|成品)|创建.*(?:网页|网站|表格|文档)|(?:index\.html|\.xlsx|\.docx|\.pptx|\.mp4)\b/i.test(prompt))missing.push('用户要求交付成品，但没有发现交付文件');
  if(mock)limits.push('mock 仅演示流程，不能确认真实交付质量');
  return {status:missing.length?'needs_validation':limits.length?'limited':paths.length?'checked':'not_applicable',domain:contract?.domain||'general',missing:[...new Set(missing)],limitations:[...new Set(limits)],checks:checks.slice(0,80),requirements,contract,artifacts:paths,sourceVersion:currentSource};
}
export function qualityFeedback(quality) {return `[运行时验收反馈：资料，不代表用户新增要求]\n你尚未完成当前用户目标的验收，请在本轮自行补齐或修复，不要等用户指出问题，也不要重复声称已通过。\n${quality.missing.map(item=>'- '+item).join('\n')}\n可以调用 set_task_plan 对齐交付物和验收条件；verify_artifact 的 checks 关联 criterion，verify_browser 实际测试交互；代码用 bash 运行真实测试并用 criteria 关联实际检查的条件；文档用 verify_document 渲染核对页面，媒体用 verify_media 解码和抽帧。无法完成的检查必须明确报告限制。不要为了通过检查减少用户要求、伪造测试输出或用空断言替代真实测试。`;}
