import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { withRunContext } from '../core/run-context.mjs';
import { verifyArtifact } from '../core/verification.mjs';
import { verifyDocument } from '../core/document-verifier.mjs';
import { verifyMedia } from '../core/media-verifier.mjs';
import { verifierProcess } from '../core/verifier-process.mjs';
import { assessTaskQuality, sourceEvidence } from '../core/task-quality.mjs';
import { fileEvidence, freshArtifact } from '../core/artifact-evidence.mjs';
import { xlsxWrite } from '../plugins/office/lib/ooxml.mjs';
import { verifyWeb } from '../core/verification.mjs';
import { convertOfficeFile } from '../plugins/office/plugin.mjs';
import { electronVerifierLaunch } from '../core/electron-verifier.mjs';
import { pdfFixture } from './fixtures/document-evidence.mjs';
import { findExecutable } from '../core/sandbox.mjs';

function fixture(t, config={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mli-delivery-evidence-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
  return {root,run:fn=>withRunContext({executionRoot:root,sessionStorageRoot:root,config,sandboxPolicy:{mode:'off'}},fn)};
}
const entry=(id,name,result={})=>({id,callId:`call-${id}`,turnId:'task',type:'tool_end',name,status:'ok',...result});

test('表格真实单元格检查区分数值位置，读取成功不代表内容或版式通过',t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'report.xlsx'),xlsxWrite([{name:'净额',rows:[['区域','金额'],['合计',123],['说明',350]]}]));
  run(()=>{
    const formatOnly=verifyArtifact({path:'report.xlsx'});
    assert.equal(formatOnly.status,'ok');
    assert.equal(assessTaskQuality({entries:[entry(1,'verify_artifact',formatOnly)],turnId:'task',files:[{path:'report.xlsx',status:'created'}]}).status,'needs_validation');
    const wrong=verifyArtifact({path:'report.xlsx',checks:[{type:'xlsx_cell',sheet:'净额',cell:'B2',value:350,criterion:'total'}]});
    assert.equal(wrong.status,'error','其他单元格出现 350 不能替代合计正确');
    const right=verifyArtifact({path:'report.xlsx',checks:[{type:'xlsx_cell',sheet:'净额',cell:'B2',value:123,criterion:'total'},{type:'xlsx_rows',sheet:'净额',value:3}]});
    assert.equal(right.status,'ok');
    const quality=assessTaskQuality({entries:[entry(1,'verify_artifact',right)],turnId:'task',files:[{path:'report.xlsx',status:'created'}]});
    assert.equal(quality.status,'limited');assert.match(quality.limitations.join(' '),/尚未渲染/);
  });
});

test('需求清单采用当前版本的最新断言，后续失败不能被旧通过覆盖',t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'report.md'),'实际预算 350，负责人张三');
  run(()=>{
    const contract=entry(1,'set_task_plan',{taskContract:{domain:'writing',deliverables:['report.md'],criteria:[{id:'budget',description:'预算 350'},{id:'owner',description:'负责人张三'}]}});
    const passed=verifyArtifact({path:'report.md',checks:[{type:'contains',value:'350',criterion:'budget'},{type:'contains',value:'张三',criterion:'owner'}]});
    const failed=verifyArtifact({path:'report.md',checks:[{type:'contains',value:'李四',criterion:'owner'}]});
    const quality=assessTaskQuality({entries:[contract,entry(2,'verify_artifact',passed),entry(3,'verify_artifact',failed)],turnId:'task'});
    assert.deepEqual(quality.requirements.map(row=>row.status),['covered','failed']);
    assert.equal(quality.status,'needs_validation');assert.ok(quality.requirements[1].evidence.some(row=>row.callId==='call-3'));
    fs.writeFileSync(path.join(root,'report.md'),'改成预算 999');
    const stale=assessTaskQuality({entries:[contract,entry(2,'verify_artifact',passed)],turnId:'task'});
    assert.deepEqual(stale.requirements.map(row=>row.status),['unverified','unverified']);
  });
});

test('代码总命令成功不能自动覆盖每项需求，命令关联也明确保留覆盖范围限制',t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'main.mjs'),'export const n=2;');
  run(()=>{
    const contract=entry(1,'set_task_plan',{taskContract:{domain:'code',deliverables:['main.mjs'],criteria:[{id:'refund',description:'退款金额正确'}]}}),testEvidence=sourceEvidence();
    const tested=entry(2,'bash',{command:'node --test public.test.mjs',exitCode:0,testEvidence});
    assert.equal(assessTaskQuality({entries:[contract,tested],turnId:'task'}).status,'needs_validation');
    tested.verification={kind:'command',environment:testEvidence.environment,sourceVersion:testEvidence,artifacts:[],checks:[{name:'实际退款测试',criterion:'refund',passed:true}],scope:'真实命令；关联不证明测试覆盖'};
    const quality=assessTaskQuality({entries:[contract,tested],turnId:'task'});
    assert.equal(quality.requirements[0].status,'covered');assert.equal(quality.status,'limited');
    fs.writeFileSync(path.join(root,'main.mjs'),'export const n=999;');
    assert.equal(assessTaskQuality({entries:[contract,tested],turnId:'task'}).requirements[0].status,'unverified');
  });
});

test('宿主证据不能冒充另一个工作区或远端同名同内容的产物',t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'report.md'),'350');
  const evidence=run(()=>verifyArtifact({path:'report.md',checks:[{type:'contains',value:'350'}]}));
  const another=path.join(root,'other');fs.mkdirSync(another);fs.copyFileSync(path.join(root,'report.md'),path.join(another,'report.md'));
  withRunContext({executionRoot:another},()=>assert.equal(freshArtifact(evidence.verification.artifacts[0]),false));
  withRunContext({executionRoot:root,executionEnvironment:{type:'container',cwd:'/remote'}},()=>{
    assert.throws(()=>verifyArtifact({path:'report.md'}),/不能验证远端/);
    const quality=assessTaskQuality({entries:[entry(1,'verify_artifact',evidence)],turnId:'task',files:[{path:'report.md',status:'created'}]});
    assert.equal(quality.checks.length,0);assert.equal(quality.status,'limited');assert.match(quality.limitations[0],/远端/);
  });
});

test('PDF 实际渲染返回真实页面图片和文字，错误约束、修改和坏文件不会假报成功',{timeout:30000},async t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'report.pdf'),pdfFixture(['Budget 350','Owner Alice']));
  const verified=await run(()=>verifyDocument({path:'report.pdf',checks:[{type:'page_count',value:2,criterion:'pages'},{type:'page_contains',page:1,value:'Budget 350',criterion:'budget'}]}));
  assert.equal(verified.status,'ok',verified.content);assert.equal(verified.media.length,2);assert.equal(verified.verification.renderedAll,true);
  const png=Buffer.from(verified.media[0].dataUrl.split(',')[1],'base64');assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.length>1000);
  const failed=await run(()=>verifyDocument({path:'report.pdf',pages:[2],checks:[{type:'page_contains',page:2,value:'Wrong owner',criterion:'owner'}]}));
  assert.equal(failed.status,'error');assert.equal(failed.verification.renderedAll,false);
  fs.writeFileSync(path.join(root,'report.pdf'),'not a PDF');
  run(()=>assert.equal(freshArtifact(verified.verification.artifacts[0]),false));
  const broken=await run(()=>verifyDocument({path:'report.pdf'}));assert.equal(broken.status,'error');assert.equal(broken.verification.rendered,false);
});

test('验收进程取消和超时都等待退出，不能把挂起的工具视为通过',async()=>{
  const controller=new AbortController();const pending=verifierProcess(process.execPath,['-e','setTimeout(()=>{},10000)'],{signal:controller.signal});
  setTimeout(()=>controller.abort(),20);await assert.rejects(pending,/停止/);
  await assert.rejects(verifierProcess(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeoutMs:30}),/超时/);
});

const require=createRequire(import.meta.url);
let binaries;
try{const modules=path.join(os.homedir(),'.cache','mli-agent-test-tools','ffmpeg','node_modules');binaries={ffmpegPath:require(path.join(modules,'ffmpeg-static')),ffprobePath:require(path.join(modules,'ffprobe-static')).path};if(!Object.values(binaries).every(file=>fs.existsSync(file)))binaries=null;}catch{}
test('真实视频完整解码和抽帧，尺寸/时长/音轨实际检查，元数据和缺失解码器不能替代',{skip:!binaries,timeout:30000},async t=>{
  const {root,run}=fixture(t,{media:binaries}),file=path.join(root,'film.mp4');
  const created=await verifierProcess(binaries.ffmpegPath,['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:size=160x90:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','mpeg4','-c:a','aac','-shortest',file]);assert.equal(created.code,0,created.stderr);
  const verified=await run(()=>verifyMedia({path:'film.mp4',samples:2,checks:[{type:'width',value:160,criterion:'width'},{type:'height',value:90},{type:'has_audio',value:true},{type:'duration_min',value:0.8}]}));
  assert.equal(verified.status,'ok',verified.content);assert.equal(verified.verification.decoded,true);assert.equal(verified.media.length,2);
  run(()=>{
    const metadataOnly={...verified,verification:{...verified.verification,decoded:false}};
    assert.equal(assessTaskQuality({entries:[entry(1,'ffmpeg_probe',metadataOnly)],turnId:'task',files:[{path:'film.mp4',status:'created'}]}).status,'needs_validation');
    assert.equal(assessTaskQuality({entries:[entry(1,'verify_media',verified)],turnId:'task',files:[{path:'film.mp4',status:'created'}]}).status,'limited');
  });
  const wrong=await run(()=>verifyMedia({path:'film.mp4',samples:0,checks:[{type:'has_audio',value:false}]}));assert.equal(wrong.status,'error');
  const missing=await withRunContext({executionRoot:root,config:{media:{ffmpegPath:path.join(root,'absent.exe'),ffprobePath:binaries.ffprobePath}}},()=>verifyMedia({path:'film.mp4'}));assert.equal(missing.status,'error');assert.equal(missing.verification.decoded,false);
  fs.writeFileSync(path.join(root,'film.mp4'),'corrupt video');const corrupt=await run(()=>verifyMedia({path:'film.mp4'}));assert.equal(corrupt.status,'error');assert.equal(corrupt.verification.decoded,false);
});

test('产物哈希分块读取，超过旧 64 MiB 上限仍可绑定视频版本',t=>{
  const {root,run}=fixture(t),file=path.join(root,'large.mp4'),descriptor=fs.openSync(file,'w');fs.ftruncateSync(descriptor,65*1024*1024);fs.closeSync(descriptor);
  run(()=>{const evidence=fileEvidence('large.mp4');assert.equal(evidence.size,65*1024*1024);assert.equal(freshArtifact(evidence),true);fs.appendFileSync(file,'new version');assert.equal(freshArtifact(evidence),false);});
});

test('网页证据绑定所有相关文件，脚本修改后不能沿用旧页面验收',{timeout:15000},async t=>{
  const {root,run}=fixture(t);
  fs.writeFileSync(path.join(root,'index.html'),'<div id="total"></div><script src="app.js"></script>');
  fs.writeFileSync(path.join(root,'app.js'),'document.querySelector("#total").textContent="350";');
  const result=await run(()=>verifyWeb({url:'index.html',paths:['app.js'],actions:[{type:'assert_text',selector:'#total',value:'350',criterion:'total'}]}));
  assert.equal(result.status,'ok',result.content);
  const entries=[entry(1,'set_task_plan',{taskContract:{domain:'web',deliverables:['index.html'],criteria:[{id:'total',description:'显示 350'}]}}),entry(2,'verify_browser',result)];
  run(()=>assert.equal(assessTaskQuality({entries,turnId:'task'}).requirements[0].status,'covered'));
  fs.writeFileSync(path.join(root,'app.js'),'document.querySelector("#total").textContent="999";');
  run(()=>{
    const quality=assessTaskQuality({entries,turnId:'task'});
    assert.equal(quality.status,'needs_validation');assert.equal(quality.requirements[0].status,'unverified');
    assert.ok(quality.missing.some(item=>item.includes('实际交互验收')));
  });
});

test('相对和绝对路径指向同一文件，后续真实通过解除该类旧失败，其他类型失败仍保留',t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'report.md'),'Budget 350');
  run(()=>{
    const failed=verifyArtifact({path:'report.md',checks:[{type:'contains',value:'999'}]});
    const passed=verifyArtifact({path:path.join(root,'report.md'),checks:[{type:'contains',value:'350'}]});
    const entries=[entry(1,'verify_artifact',failed),entry(2,'verify_artifact',passed)];
    assert.equal(assessTaskQuality({entries,turnId:'task',files:[{path:'report.md',status:'created'}]}).status,'checked');
    const otherFailure=entry(3,'verify_document',{status:'error',verification:{...passed.verification,kind:'document',checks:[{name:'实际渲染',passed:false}]}});
    entries.push(otherFailure,entry(4,'verify_artifact',passed));
    assert.equal(assessTaskQuality({entries,turnId:'task',files:[{path:'report.md',status:'created'}]}).status,'needs_validation');
  });
});

test('取消 Office 转换时不能拿旧目标文件冒充成功',async t=>{
  const {root}=fixture(t),source=path.join(root,'source.xlsx'),destination=path.join(root,'source.pdf');
  fs.writeFileSync(source,xlsxWrite([{name:'数据',rows:[[350]]}]));fs.writeFileSync(destination,'old PDF');
  const controller=new AbortController();controller.abort();
  await assert.rejects(convertOfficeFile(source,destination,'pdf',{preferNative:false,signal:controller.signal}),/停止/);
  assert.equal(fs.readFileSync(destination,'utf8'),'old PDF');
});

const hasLibreOffice=findExecutable('soffice')||(process.platform==='win32'&&['C:/Program Files/LibreOffice/program/soffice.exe','C:/Program Files (x86)/LibreOffice/program/soffice.exe'].some(file=>fs.existsSync(file)));
test('Office 缺少 LibreOffice 时明确失败，不启动用户 Office 或把文本预览当渲染',{skip:!!hasLibreOffice},async t=>{
  const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'report.xlsx'),xlsxWrite([{name:'数据',rows:[['金额'],[350]]}]));
  const result=await run(()=>verifyDocument({path:'report.xlsx'}));
  assert.equal(result.status,'error');assert.equal(result.verification.rendered,false);assert.equal(result.media.length,0);
  assert.match(result.content,/需要安装 LibreOffice/);
});

test('验证进程正确拼接分段中文，过滤凭据环境，并限制 stderr 输出',async()=>{
  const previous=process.env.MLI_VERIFIER_SECRET_FIXTURE;process.env.MLI_VERIFIER_SECRET_FIXTURE='synthetic-secret';
  try {
    const result=await verifierProcess(process.execPath,['-e','const b=Buffer.from("中文验证");process.stdout.write(b.subarray(0,2));setTimeout(()=>{process.stdout.write(b.subarray(2));process.stdout.write(String(process.env.MLI_VERIFIER_SECRET_FIXTURE));},20);']);
    assert.equal(result.stdout,'中文验证undefined');
    await assert.rejects(verifierProcess(process.execPath,['-e','process.stderr.write("x".repeat(5000));setTimeout(()=>{},10000);'],{maxOutputBytes:1000}),/读取预算/);
  } finally {if(previous===undefined)delete process.env.MLI_VERIFIER_SECRET_FIXTURE;else process.env.MLI_VERIFIER_SECRET_FIXTURE=previous;}
});

test('桌面独立验收入口和旧 Chromium 都真实渲染 PDF，不进入正常主界面',{skip:process.platform!=='win32',timeout:30000},async t=>{
  const {root}=fixture(t),application=path.resolve('.');
  fs.writeFileSync(path.join(root,'report.pdf'),pdfFixture(['Budget 350']));
  const engines=[{binary:path.resolve('node_modules/electron/dist/electron.exe'),dist:'dist'},{binary:path.resolve('node_modules/.cache/electron-22.3.27-win32-ia32/electron.exe'),dist:'dist-legacy'}];
  for(const [index,engine] of engines.entries()){
    if(!fs.existsSync(engine.binary)){t.diagnostic('缺少可选 Electron 22 引擎');continue;}
    const requestFile=path.join(root,`request-${index}.json`),resultFile=path.join(root,`result-${index}.json`);
    fs.writeFileSync(requestFile,JSON.stringify({pdf:path.join(root,'report.pdf'),pages:[1],renderer:path.join(application,engine.dist,'document-renderer.html'),resultFile}));
    const result=await verifierProcess(engine.binary,[application,'--mli-verifier=document',`--mli-verifier-request=${requestFile}`]);
    assert.equal(result.code,0,result.stderr);
    const data=JSON.parse(fs.readFileSync(resultFile,'utf8'));assert.equal(data.pageCount,1);assert.match(data.pages[0].text,/Budget 350/);assert.ok(data.pages[0].image.startsWith('data:image/png;base64,'));
    t.diagnostic(`${engine.dist}: 独立入口实际渲染通过`);
  }
  const previous=process.env.MLI_CLIENT_PACKAGED;process.env.MLI_CLIENT_PACKAGED='1';
  try{assert.deepEqual(electronVerifierLaunch('document',path.join(root,'request.json')).args,['--mli-verifier=document',`--mli-verifier-request=${path.join(root,'request.json')}`]);}
  finally{if(previous===undefined)delete process.env.MLI_CLIENT_PACKAGED;else process.env.MLI_CLIENT_PACKAGED=previous;}
});
