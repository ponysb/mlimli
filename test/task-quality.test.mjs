import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { withRunContext } from '../core/run-context.mjs';
import { assessTaskQuality, sourceEvidence, isVerificationCommand } from '../core/task-quality.mjs';
import { verifyArtifact, verifyWeb, verificationTools } from '../core/verification.mjs';
import { mediaProbeChecks } from '../plugins/ffmpeg/plugin.mjs';
import { verifyBrowser, browserTarget } from '../core/browser-verifier.mjs';
import { xlsxWrite } from '../plugins/office/lib/ooxml.mjs';

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'mli-quality-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));return {root,run:fn=>withRunContext({executionRoot:root,sessionStorageRoot:root,sandboxPolicy:{mode:'off'}},fn)};}
const result=(id,name,extra={})=>({id,type:'tool_end',turnId:'turn',name,status:'ok',...extra});

test('任务结束不等于验收通过，代码最后修改后须有实际测试',t=>{
 const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'main.mjs'),'export const n=1;');
 run(()=>{
  const files=[{path:'main.mjs',status:'created'}];
  assert.match(assessTaskQuality({entries:[result(1,'write_file')],turnId:'turn',files}).missing.join(),/实际测试/);
  const testEvidence=sourceEvidence();
  assert.equal(assessTaskQuality({entries:[result(1,'write_file'),result(2,'bash',{command:'node --test',exitCode:0,testEvidence})],turnId:'turn',files}).status,'limited');
  assert.equal(assessTaskQuality({entries:[result(1,'bash',{command:'node --test',exitCode:0}),result(2,'edit_file')],turnId:'turn',files}).status,'needs_validation');
  assert.equal(assessTaskQuality({entries:[result(1,'write_file'),result(2,'bash',{command:'node --test',exitCode:1,status:'error'})],turnId:'turn',files}).status,'needs_validation');
 });
});

test('shell 修改、测试修改与伪造 echo 不能沿用旧代码测试证据',t=>{
 const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'main.mjs'),'export const n=1;');
 run(()=>{
  assert.equal(isVerificationCommand('echo npm test'),false);assert.equal(isVerificationCommand('echo test'),false);
  assert.equal(isVerificationCommand('node public.test.mjs && node extended.test.mjs'),true);
  const entries=[result(1,'bash',{command:'node --test',exitCode:0,testEvidence:sourceEvidence()})],files=[{path:'main.mjs',status:'modified'}];
  assert.equal(assessTaskQuality({entries,turnId:'turn',files}).status,'limited');
  fs.writeFileSync(path.join(root,'main.mjs'),'export const n=2;');
  assert.equal(assessTaskQuality({entries,turnId:'turn',files}).status,'needs_validation');
  entries[0].testEvidence=sourceEvidence();fs.writeFileSync(path.join(root,'public.test.mjs'),'throw Error("broken");');
  assert.equal(assessTaskQuality({entries,turnId:'turn',files}).status,'needs_validation');
 });
});

test('任务计划拒绝描述文字，辅助日志失败不阻塞已验证交付',async t=>{
 const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'final.md'),'预算 12 万元');fs.writeFileSync(path.join(root,'test-evidence.log'),'bad');
 const plan=verificationTools.find(tool=>tool.name==='set_task_plan');
 await assert.rejects(run(()=>plan.run({goal:'完成文章',domain:'writing',deliverables:['完整的文章和测试结论'],criteria:[{id:'a',description:'预算准确'}]})),/真实文件路径/);
 run(()=>{
  const good=verifyArtifact({path:'final.md',checks:[{type:'contains',value:'12 万元'}]}),bad=verifyArtifact({path:'test-evidence.log',checks:[{type:'contains',value:'pass'}]});
  assert.equal(bad.status,'error');assert.equal(verifyArtifact({path:'test-evidence.log'}).status,'ok');
  assert.equal(assessTaskQuality({entries:[result(1,'verify_artifact',bad),result(2,'verify_artifact',good)],turnId:'turn',files:[{path:'final.md',status:'created'},{path:'test-evidence.log',status:'created'}]}).status,'checked');
 });
});

test('媒体元数据区分静态图像和有时长的音视频，不冒充内容已审查',()=>{
 assert.ok(mediaProbeChecks({streams:[{codec_type:'video',width:640,height:480}]},'image.png').every(c=>c.passed));
 assert.ok(mediaProbeChecks({streams:[{codec_type:'audio',duration:'3'}]},'audio.mp3').every(c=>c.passed));
 assert.ok(mediaProbeChecks({streams:[{codec_type:'video'}]},'video.mp4').some(c=>!c.passed));
 assert.ok(mediaProbeChecks({streams:[],format:{duration:'3'}},'fake.mp4').some(c=>!c.passed));
});

test('localhost 浏览器证据绑定工作区版本并支持按钮文本选择', {timeout:45000},async t=>{
 const {root,run}=fixture(t);const file=path.join(root,'index.html');fs.writeFileSync(file,'<button>添加</button><p id="result"></p><script>document.querySelector("button").onclick=()=>document.querySelector("p").textContent="已添加"</script>');
 const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(fs.readFileSync(file));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const url=`http://127.0.0.1:${server.address().port}`,actions=[{type:'click',selector:'button',text:'添加'},{type:'assert_text',selector:'#result',value:'已添加'},{type:'assert_no_errors'}];
 const verified=await run(()=>verifyWeb({url,paths:['index.html'],actions},{}));assert.equal(verified.status,'ok',verified.content);
 run(()=>{assert.equal(assessTaskQuality({entries:[result(1,'verify_browser',verified)],turnId:'turn',files:[{path:'index.html',status:'created'}]}).status,'checked');fs.appendFileSync(file,'<!-- changed -->');assert.equal(assessTaskQuality({entries:[result(1,'verify_browser',verified)],turnId:'turn',files:[{path:'index.html',status:'created'}]}).status,'needs_validation');});
 await assert.rejects(run(()=>verifyWeb({url,paths:['../outside.html'],actions},{})),/越界/);
});

test('文字约束由工具实际读取验证，修改后旧证据失效',t=>{
 const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'final.md'),'## 进展\n预算 12 万元。\n');
 run(()=>{
  const check=verifyArtifact({path:'final.md',checks:[{type:'contains',value:'12 万元',criterion:'budget'},{type:'not_contains',value:'TODO',criterion:'placeholder'}]});
  assert.equal(check.status,'ok');
  const contract=result(1,'set_task_plan',{taskContract:{domain:'writing',deliverables:['final.md'],criteria:[{id:'budget',description:'预算准确'},{id:'placeholder',description:'无占位'}]}});
  const entries=[contract,result(2,'verify_artifact',check)];
  assert.equal(assessTaskQuality({entries,turnId:'turn'}).status,'checked');
  fs.appendFileSync(path.join(root,'final.md'),'TODO');
  assert.equal(assessTaskQuality({entries,turnId:'turn'}).status,'needs_validation');
  assert.equal(verifyArtifact({path:'final.md',checks:[{type:'not_contains',value:'TODO'}]}).status,'error');
 });
});

test('工作簿重新读取核对数值，假 Office 和不支持媒体不冒充通过',t=>{
 const {root,run}=fixture(t);fs.writeFileSync(path.join(root,'final.xlsx'),xlsxWrite([{name:'汇总',rows:[['区域','净额'],['合计',350]]}]));
 run(()=>{
  const verified=verifyArtifact({path:'final.xlsx',checks:[{type:'contains',value:'350'}]});assert.equal(verified.status,'ok');
  assert.equal(assessTaskQuality({entries:[result(1,'verify_artifact',verified)],turnId:'turn',files:[{path:'final.xlsx',status:'created'}]}).status,'limited');
  fs.writeFileSync(path.join(root,'fake.xlsx'),'a text file');assert.equal(verifyArtifact({path:'fake.xlsx'}).status,'error');
  fs.writeFileSync(path.join(root,'fake.mp4'),'a text file');assert.equal(verifyArtifact({path:'fake.mp4'}).status,'error');
 });
});

test('必须有真实交付文件，未满足的计划条件不能靠自报成功',t=>{
 const {run}=fixture(t);run(()=>{
  assert.equal(assessTaskQuality({entries:[],turnId:'turn',prompt:'生成 final.xlsx 文件'}).status,'needs_validation');
  assert.equal(assessTaskQuality({entries:[],turnId:'turn',prompt:'解释一下闭包'}).status,'not_applicable');
  const entry=result(1,'set_task_plan',{taskContract:{domain:'office',deliverables:['missing.xlsx'],criteria:[{id:'sum',description:'合计正确'}]}});
  const missing=assessTaskQuality({entries:[entry],turnId:'turn'}).missing;assert.ok(missing.some(item=>item.includes('不存在')));assert.ok(missing.some(item=>item.includes('sum')));
 });
});

test('浏览器实际验证输入、点击、刷新、删除、错误和手机宽度', {timeout:45000},async t=>{
 const {root,run}=fixture(t);
 fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><input aria-label="待办内容"><button id="add">添加</button><ul></ul><script>let items=JSON.parse(localStorage.getItem('items')||'[]');function render(){document.querySelector('ul').innerHTML='';items.forEach((text,i)=>{const li=document.createElement('li');li.textContent=text;const button=document.createElement('button');button.textContent='删除';button.onclick=()=>{items.splice(i,1);save()};li.append(button);document.querySelector('ul').append(li)})}function save(){localStorage.setItem('items',JSON.stringify(items));render()}document.querySelector('#add').onclick=()=>{const input=document.querySelector('input');if(!input.value.trim())return;items.push(input.value.trim());input.value='';save()};render();</script></body></html>`);
 const actions=[{type:'fill',selector:'input',value:'验收事项'},{type:'click',selector:'#add'},{type:'assert_count',selector:'li',count:1},{type:'assert_text',selector:'li',value:'验收事项'},{type:'assert_value',selector:'input',value:''},{type:'reload'},{type:'assert_count',selector:'li',count:1},{type:'click',selector:'li button'},{type:'assert_count',selector:'li',count:0},{type:'fill',selector:'input',value:'   '},{type:'click',selector:'#add'},{type:'assert_count',selector:'li',count:0},{type:'viewport',width:390,height:844},{type:'assert_no_overflow'},{type:'assert_no_errors'}];
 const verified=await run(()=>verifyWeb({url:'index.html',actions},{}));assert.equal(verified.status,'ok',verified.content);assert.match(verified.image,/^data:image\/png;base64,/);
 run(()=>assert.equal(assessTaskQuality({entries:[result(1,'verify_browser',verified)],turnId:'turn',files:[{path:'index.html',status:'created'}]}).status,'checked'));
 const failed=await run(()=>verifyBrowser({url:'index.html',actions:[{type:'assert_text',selector:'body',value:'不存在的内容'}]}));assert.equal(failed.passed,false);
 run(()=>{assert.throws(()=>browserTarget('https://example.com'),/仅支持/);assert.throws(()=>browserTarget('../outside.html'),/越界/);});
 await assert.rejects(run(()=>verifyBrowser({url:'index.html',actions:[{type:'screenshot'}]})),/实际页面断言/);
});
