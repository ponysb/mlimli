import test from 'node:test';
import assert from 'node:assert/strict';
import {terminalAgentBinding,assertTerminalAgentTarget,terminalAgentContext} from '../core/terminal-agent.mjs';

test('terminal binding comes from server PTY, unknown and stopped terminals cannot bind',()=>{
 const deps={localTerminals:new Map([['a',{cwd:'/tmp/a',status:'running'}],['b',{cwd:'/tmp/b',status:'exited'}]]),sshOwners:new Map()};
 assert.equal(terminalAgentBinding('a',deps).cwd,'/tmp/a');
 assert.throws(()=>terminalAgentBinding('b',deps));assert.throws(()=>terminalAgentBinding('fake',deps));
});
test('SSH binding rejects disconnect, terminal replacement and root change without local fallback',()=>{
 let root='/srv/a',connected=true;const deps={localTerminals:new Map(),sshOwners:new Map([['pty-a','host-a']]),connection:()=>({workspaceRoot:root}),workspaceRoot:'/tmp',sshClient:()=>{if(!connected)throw Error('断线');}};
 const target=terminalAgentBinding('pty-a',deps);assert.equal(target.connectionId,'host-a');assertTerminalAgentTarget(target,deps);
 connected=false;assert.throws(()=>assertTerminalAgentTarget(target,deps),/断线/);connected=true;root='/srv/b';assert.throws(()=>assertTerminalAgentTarget(target,deps),/目录已改变/);root='/srv/a';deps.sshOwners.set('pty-a','host-b');assert.throws(()=>assertTerminalAgentTarget(target,deps),/原 SSH/);
});
test('context pins both execution and storage and checks liveness again at execution after approval',()=>{
 let alive=true;const local={cwd:'/tmp/a',connectionId:null};const context=terminalAgentContext({executionRoot:'/tmp/b',remoteWorkspace:{kind:'ssh'},assertResource(){}},local,()=>{if(!alive)throw Error('closed');});
 assert.equal(context.executionRoot,'/tmp/a');assert.equal(context.remoteWorkspace,undefined);assert.ok(!context.allowedTools.includes('agent_spawn'));context.assertResource({},{});alive=false;assert.throws(()=>context.assertResource({},{}),/closed/);
});
