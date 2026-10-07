import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import runtime from '../electron/runtime.cjs';
import { pdfFixture } from './fixtures/document-evidence.mjs';

test('Agent 完成门槛：真实工具证据、多次修复、停滞后换策略、拒绝伪完成', {timeout:45000},async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mli-quality-http-')),runtimeRoot=fileURLToPath(new URL('..',import.meta.url));let instance,url;const counters=new Map(),observations=[],pageInputs=[];
 const provider=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
  const original=body.messages.find(message=>message.role==='user'&&!message.content.startsWith('[运行时'))?.content||'';
  const id=original.match(/CASE:(\w+)/)?.[1]||'none',count=(counters.get(id)||0)+1;counters.set(id,count);
  let call;
  if(id==='document') {
   if(count===1)call={name:'set_task_plan',args:{goal:'核对预算文档',domain:'office',deliverables:['report.pdf'],criteria:[{id:'budget',description:'第一页预算为 350'}]}};
   if(count===2)call={name:'verify_document',args:{path:'report.pdf',checks:[{type:'page_contains',page:1,value:'Budget 350',criterion:'budget'}]}};
   if(count===3)pageInputs.push(body.messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(part=>part.type==='image_url'));
  }else if(id==='mapped') {
   if(count===1)call={name:'set_task_plan',args:{goal:'退款金额正确',domain:'code',deliverables:['main.mjs'],criteria:[{id:'refund',description:'退款金额为 2'}]}};
   if(count===2)call={name:'write_file',args:{path:'main.mjs',content:'export const n=2;'}};
   if(count===3)call={name:'bash',args:{command:'node --test public.test.mjs',criteria:['refund']}};
  }else if(id==='recoverLate') {
   if(count===1)call={name:'write_file',args:{path:'main.mjs',content:'export const n=1;'}};
   if([3,6,9,12].includes(count))call={name:'bash',args:{command:'node --test public.test.mjs'}};
   if([4,7,10].includes(count)){const before=(count-4)/3+1;call={name:'edit_file',args:{path:'main.mjs',old_string:`n=${before}`,new_string:`n=${before+1}`}};}
  }else if(id==='recover') {
   if(count===1)call={name:'write_file',args:{path:'main.mjs',content:'export const n=1;'}};
   if(count===3)call={name:'bash',args:{command:'node --test public.test.mjs'}};
   if(count===4)call={name:'edit_file',args:{path:'main.mjs',old_string:'n=1',new_string:'n=2'}};
   if(count===5)call={name:'bash',args:{command:'node --test public.test.mjs'}};
  }else if(count===1&&id!=='missing')call={name:'write_file',args:{path:id==='code'?'main.mjs':id==='office'?'final.xlsx':'final.md',content:id==='code'?'export const n=1;':id==='office'?'not a real workbook':'未复核的内容'}};
  const delta=call?{tool_calls:[{index:0,id:`call-${id}-${count}`,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}:{content:'已经全部完成并测试通过，可以直接使用。'};
  res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({choices:[{delta,finish_reason:call?'tool_calls':'stop'}],usage:{prompt_tokens:40,completion_tokens:20}})}\n\ndata: [DONE]\n\n`);
 });
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
 const config=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'config.example.json'),'utf8'));
 config.security.workspaceRoot=path.join(directory,'workspace');config.security.sandbox.mode='off';config.memory={enabled:false,autoLearn:false};config.agent.subagents.enabled=false;config.providers[0].protocol='openai-chat';config.providers[0].baseUrl=`http://127.0.0.1:${provider.address().port}/v1`;
 config.models[0].capabilities={image:true};
 async function stop(){if(instance?.child.exitCode===null&&!instance.child.signalCode){const exited=once(instance.child,'exit');instance.child.kill();await exited;}}
 t.after(async()=>{await stop();provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 const request=async(route,body)=>{const response=await fetch(url+route,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert.ok(response.ok,route);return response.json();};
 for(const enabled of [false,true]){
  counters.clear();config.agent.quality={enabled,noProgressThreshold:3};fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify(config));instance=runtime.startRuntime({executable:process.execPath,runtimeRoot,dataRoot:directory});url=(await instance.ready).url;
  for(const id of ['code','writing','office','missing','recover','recoverLate','mapped','document']){
   const root=path.join(directory,`${enabled?'gated':'baseline'}-${id}`);fs.mkdirSync(root);
   if(id.startsWith('recover')||id==='mapped')fs.writeFileSync(path.join(root,'public.test.mjs'),`import assert from 'node:assert/strict';import {n} from './main.mjs';assert.equal(n,${id==='recoverLate'?4:2});`);
   if(id==='document')fs.writeFileSync(path.join(root,'report.pdf'),pdfFixture(['Budget 350']));
   await request('/api/workspaces',{path:root,name:id});const session=await request('/api/session',{title:id});await request(`/api/session/${session.id}/mode`,{mode:'auto-all'});
   await request(`/api/session/${session.id}/message`,{text:`CASE:${id} 请${id==='missing'?'生成 final.mp4 文件':'创建成品文件'}，自行验证后交付。`});
   let data;const end=Date.now()+8000;while(Date.now()<end){data=await request(`/api/session/${session.id}`);for(const item of data.uiRequests||[])if(/语言|language|安装|install/i.test(JSON.stringify(item)))await request(`/api/session/${session.id}/ui/${item.reqId}`,{value:false});if(!data.running&&data.entries.some(e=>e.type==='task_summary'))break;await new Promise(resolve=>setTimeout(resolve,20));}
   const summary=data.entries.findLast(e=>e.type==='task_summary');assert.ok(summary,JSON.stringify({id,enabled,counters:[...counters],running:data.running,permission:data.permission,entries:data.entries.slice(-5)}));
   const expected=!enabled||id.startsWith('recover')||['mapped','document'].includes(id)?'done':'needs_validation';assert.equal(summary.reason,expected,id);
   const feedback=data.entries.filter(e=>e.type==='message'&&e.source==='runtime');
   assert.equal(feedback.length,enabled?(['mapped','document'].includes(id)?0:id==='recover'?1:4):0);
   if(enabled&&!id.startsWith('recover')&&!['mapped','document'].includes(id))assert.ok(feedback.some(entry=>entry.content.includes('改变修复假设')), '持续无进展时先要求换策略，再如实结束');
   assert.equal(data.entries.filter(e=>e.type==='message'&&e.role==='user'&&!e.source).length,1,'不需要用户反复发修正消息');
   if(enabled&&id.startsWith('recover')){assert.ok(fs.readFileSync(path.join(root,'main.mjs'),'utf8').includes(`n=${id==='recoverLate'?4:2}`));assert.equal(summary.quality.status,'limited');assert.ok(data.entries.some(e=>e.type==='tool_end'&&e.name==='bash'&&e.exitCode===0));}
   if(enabled&&id==='recoverLate')assert.equal(data.entries.filter(e=>e.type==='tool_end'&&e.name==='edit_file'&&e.status==='ok').length,3,'连续真实进展不会被旧两次修复上限中止');
   if(enabled&&id==='mapped'){
    const command=data.entries.find(e=>e.type==='tool_end'&&e.name==='bash');
    assert.equal(command.exitCode,0);assert.equal(command.verification.checks[0].criterion,'refund');
    assert.equal(summary.quality.status,'limited');assert.equal(summary.quality.requirements[0].status,'covered');
    assert.equal(summary.quality.requirements[0].evidence[0].callId,command.callId);
    assert.equal(summary.quality.requirements[0].evidence[0].kind,'command');
   }
   if(enabled&&id==='document'){
    const rendered=data.entries.find(e=>e.type==='tool_end'&&e.name==='verify_document');
    assert.equal(rendered.verification.rendered,true);assert.equal(rendered.media.length,1);
    assert.equal(summary.quality.status,'limited');assert.equal(summary.quality.requirements[0].status,'covered');
    assert.equal(pageInputs.at(-1).length,1);assert.ok(pageInputs.at(-1)[0].image_url.url.startsWith('data:image/png;base64,'),'实际页面 PNG 进入模型下一步，而非只显示前端预览');
    const imageResponse=await fetch(url+rendered.media[0].url);assert.equal(imageResponse.status,200);assert.ok((await imageResponse.arrayBuffer()).byteLength>1000);
   }
   observations.push({mode:enabled?'gated':'baseline',case:id,reason:summary.reason,feedbackRounds:feedback.length});
  }
  await stop();
 }
 t.diagnostic(JSON.stringify({kind:'deterministic runtime regression, not model pass@1',observations}));
});
