import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {withRunContext} from '../core/run-context.mjs';
import {spawnSandboxedCommand} from '../core/sandbox.mjs';

test('Windows shell 保留脚本内嵌引号、空格路径和条件命令', {skip:process.platform!=='win32'},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mli quote 中文 '));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 await withRunContext({executionRoot:root,sandboxPolicy:{mode:'off'}},async()=>{
  const child=await spawnSandboxedCommand('node -e "console.log(JSON.stringify({message: \'hello world\', n: 3}))" && echo VERIFIED');let output='',error='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>error+=d);const code=await new Promise(resolve=>child.on('close',resolve));await child.cleanupSandbox();
  assert.equal(code,0,error);assert.match(output,/"message":"hello world"/);assert.match(output,/VERIFIED/);
 });
});
