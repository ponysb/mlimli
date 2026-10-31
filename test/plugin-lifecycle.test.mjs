import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
test('failed setup rolls back, collisions preserve owner, cleanup awaits and events dispatch',async t=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'mli-plugin-life-'));t.after(()=>fs.rmSync(data,{recursive:true,force:true}));
 for(const [name,source] of [
 ['zz-a-failure',`export default ctx=>{ctx.registerTool({name:'audit_leak',run:()=> 'leak'});throw Error('setup failed')}`],
 ['zz-b-first',`export default ctx=>{ctx.registerTool({name:'audit_owner',run:()=> 'first'});ctx.on('on_event',()=>globalThis.auditEvent=true);ctx.registerCleanup(async()=>{await new Promise(r=>setTimeout(r,10));globalThis.auditClean=true})}`],
 ['zz-c-conflict',`export default ctx=>{ctx.registerTool({name:'audit_owner',run:()=> 'second'})}`],
 ]){const dir=path.join(data,'plugins',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'plugin.json'),JSON.stringify({name}));fs.writeFileSync(path.join(dir,'plugin.mjs'),source);}
 const script=`import assert from 'node:assert/strict';import {loadAll,getTool,disposePlugins} from './core/plugins.mjs';import {emit} from './core/events.mjs';const info=await loadAll();assert.equal(info.errors.length,2);assert.equal(getTool('audit_leak'),undefined);assert.equal(await getTool('audit_owner').run(),'first');emit('audit');await new Promise(r=>setImmediate(r));assert.equal(globalThis.auditEvent,true);await disposePlugins();assert.equal(globalThis.auditClean,true);console.log('LIFECYCLE_PASS');process.exit(0);`;
 const result=await execute(process.execPath,['--input-type=module','-e',script],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,MLI_AGENT_DATA_DIR:data},timeout:10000});assert.match(result.stdout,/LIFECYCLE_PASS/);
});
