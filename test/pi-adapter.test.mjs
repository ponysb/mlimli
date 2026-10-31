import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadPiPackage,discoverPiPackage} from '../core/pi-adapter.mjs';

function fixture(t,code,manifest={}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'mli-pi-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'test-pi',version:'1',pi:{extensions:['index.ts']},...manifest}));fs.writeFileSync(path.join(root,'index.ts'),code);return root;}
function host(){const tools=new Map(),commands=new Map(),hooks={},cleanups=[],skills=[];return {name:'pi:test',tools,commands,hooks,cleanups,skills,registerTool:t=>tools.set(t.name,t),registerCommand:(n,c)=>commands.set(n,c),registerCleanup:f=>cleanups.push(f),on:(n,f)=>(hooks[n]??=[]).push(f),getTools:()=>[...tools.values()],addSkills:s=>skills.push(...s),makeUi:()=>({}),callTool:async()=>({content:'nested'})};}
test('unmodified TypeScript tool contract, schema validation, content and updates',async t=>{
 const root=fixture(t,`import {Type} from '@sinclair/typebox'; import type {ExtensionAPI} from '@mariozechner/pi-coding-agent'; export default (pi:ExtensionAPI)=>{pi.registerTool({name:'greet',parameters:Type.Object({name:Type.String()}),async execute(id,params,signal,onUpdate,ctx){onUpdate({content:[{type:'text',text:'working'}]});return {content:[{type:'text',text:params.name+':'+typeof id+':'+!!signal}],details:{cwd:ctx.cwd}}}});pi.registerCommand('greet',{handler:async(args,ctx)=>{ctx.ui.notify(args);return args}})}`);
 const h=host();await loadPiPackage(root,h);const events=[];const r=await h.tools.get('greet').run({name:'张三'},{signal:new AbortController().signal,emit:(...x)=>events.push(x)});assert.match(r.content,/张三:string:true/);assert.equal(events.length,1);assert.ok(r.details.cwd);assert.equal(h.tools.get('greet').permission,'L2');await assert.rejects(h.tools.get('greet').run({name:1},{}),/参数错误/);assert.equal(await h.commands.get('greet').handler('hello',{}),'hello');
});
test('unsupported API rejects load without committing partial contributions',async t=>{const root=fixture(t,`export default pi=>{pi.registerTool({name:'bad',execute:async()=>({})});pi.registerProvider('bad',{})}`);const h=host();await assert.rejects(loadPiPackage(root,h),/pi.registerProvider/);assert.equal(h.tools.size,0);});
test('tool_call denial and tool_result blocks map correctly',async t=>{const root=fixture(t,`export default pi=>{pi.on('tool_call',async e=>({block:e.input.deny}));pi.on('tool_result',async e=>({content:[{type:'text',text:'changed'}]}))}`);const h=host();await loadPiPackage(root,h);assert.equal(await h.hooks.authorize_tool_call[0]({tool:{name:'x'},args:{deny:true}}),false);const result=await h.hooks.process_tool_result[0]({tool:{name:'x'},args:{},result:{content:'old',status:'error'}});assert.equal(result.content,'changed');assert.equal(result.status,'error');});
test('manifest paths and YAML skills load, escaping resources rejected',async t=>{const root=fixture(t,'export default pi=>{}',{pi:{extensions:['index.ts'],skills:['skills']}});fs.mkdirSync(path.join(root,'skills'));fs.writeFileSync(path.join(root,'skills','SKILL.md'),'---\nname: sample\ndescription: >\n  multiline\n  description\n---\nbody');const h=host();await loadPiPackage(root,h);assert.equal(h.skills[0].description,'multiline description\n');fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({pi:{extensions:['../nope.ts']}}));assert.throws(()=>discoverPiPackage(root));});
test('session lifecycle runs once per session and shutdown awaits cleanup',async t=>{
 const root=fixture(t,`export default pi=>{pi.on('session_start',async(e,ctx)=>{ctx.ui.notify('started')});pi.on('session_shutdown',async(e,ctx)=>{await new Promise(r=>setTimeout(r,5));ctx.ui.notify('stopped')});pi.registerTool({name:'session',execute:async()=>({content:[{type:'text',text:'ok'}]})})}`);
 const h=host();await loadPiPackage(root,h);const notifications=[];const ctx={session:{id:'session-a'},ui:{notify:x=>notifications.push(x)}};await h.tools.get('session').run({},ctx);await h.tools.get('session').run({},ctx);assert.deepEqual(notifications,['started']);await h.cleanups[0]();assert.deepEqual(notifications,['started','stopped']);await assert.rejects(h.tools.get('session').run({},ctx),/卸载/);
});
test('official todo extension restores state across reloads and interleaved sessions',async()=>{
 const {fileURLToPath}=await import('node:url');const root=fileURLToPath(new URL('./fixtures/pi-upstream-todo',import.meta.url));
 const session=id=>{const entries=[];return {id,append:data=>entries.push({id:entries.length+1,ts:Date.now(),...structuredClone(data)}),entries:()=>entries,chain:()=>entries}};
 const a=session('a'),b=session('b');let h=host();await loadPiPackage(root,h);
 const invoke=(session,args)=>h.tools.get('todo').run(args,{session});
 await invoke(a,{action:'add',text:'A task'});await invoke(b,{action:'add',text:'B task'});
 assert.match((await invoke(a,{action:'list'})).content,/A task/);assert.doesNotMatch((await invoke(a,{action:'list'})).content,/B task/);
 assert.match((await invoke(b,{action:'list'})).content,/B task/);
 for(const cleanup of h.cleanups)await cleanup();h=host();await loadPiPackage(root,h);
 assert.match((await invoke(a,{action:'list'})).content,/A task/);assert.equal((await invoke(a,{action:'toggle',id:1})).details.todos[0].done,true);
 for(const cleanup of h.cleanups)await cleanup();
});
test('custom entries bind to invocation, survive history mapping, events unsubscribe and flags work',async t=>{
 const root=fixture(t,`export default pi=>{pi.registerFlag('demo',{type:'boolean',default:true});let count=0;const off=pi.events.on('test',()=>count++);pi.events.emit('test');off();pi.events.emit('test');const un=pi.on('tool_call',()=>({block:true}));un();pi.registerTool({name:'state',execute:async(id,args,signal,update,ctx)=>{pi.appendEntry('saved',{count,flag:pi.getFlag('demo')});return {content:[{type:'text',text:JSON.stringify(ctx.sessionManager.getBranch())}]}}})}`);
 const entries=[];const session={id:'custom',append:data=>entries.push({id:entries.length+1,...data}),chain:()=>entries,entries:()=>entries};const h=host();await loadPiPackage(root,h);const result=await h.tools.get('state').run({},{session});assert.match(result.content,/"type":"custom"/);assert.match(result.content,/"count":1/);assert.match(result.content,/"flag":true/);
});
test('resource negative globs exclude files and directory descendants',t=>{
 const root=fixture(t,'export default pi=>{}',{pi:{extensions:['extensions','!extensions/legacy/**','!extensions/skip.ts']}});
 fs.mkdirSync(path.join(root,'extensions','legacy'),{recursive:true});
 for(const file of ['keep.ts','skip.ts','legacy/index.ts'])fs.writeFileSync(path.join(root,'extensions',file),'export default pi=>{}');
 assert.deepEqual(discoverPiPackage(root).extensions.map(file=>path.relative(root,file)),['extensions/keep.ts']);
});
test('pi.events connects packages and unload removes only the owning listeners',async t=>{
 const a=fixture(t,`export default pi=>{let count=0;pi.events.on('compat:shared',()=>count++);pi.registerTool({name:'receiver',execute:async()=>({content:[{type:'text',text:String(count)}]})})}`);
 const b=fixture(t,`export default pi=>{pi.registerTool({name:'sender',execute:async()=>{pi.events.emit('compat:shared',{});return {content:[]}}})}`);
 const ha=host(),hb=host();await loadPiPackage(a,ha);await loadPiPackage(b,hb);
 await hb.tools.get('sender').run({},{});assert.equal((await ha.tools.get('receiver').run({},{})).content,'1');
 for(const cleanup of hb.cleanups)await cleanup();
 const hc=host();await loadPiPackage(b,hc);await hc.tools.get('sender').run({},{});assert.equal((await ha.tools.get('receiver').run({},{})).content,'2');
 for(const cleanup of ha.cleanups)await cleanup();for(const cleanup of hc.cleanups)await cleanup();
});
