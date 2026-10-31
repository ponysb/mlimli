import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import runtime from '../electron/runtime.cjs';
import { publicMcpSettings, updateMcpSettings } from '../core/mcp-settings.mjs';

test('MCP settings preserve hidden secrets, import atomically and migrate legacy config', () => {
 const cfg={mcpServers:{old:{command:'node',env:{KEY:'secret'},headers:{Authorization:'private'}}}};
 assert.ok(!JSON.stringify(publicMcpSettings(cfg)).includes('secret'));
 const mcp=updateMcpSettings(cfg,{action:'save',server:{name:'old',command:'node',enabled:false}});
 assert.equal(mcp.servers[0].env.KEY,'secret');assert.equal(mcp.servers[0].headers.Authorization,'private');
 assert.deepEqual(updateMcpSettings({mcp},{action:'save',server:{name:'old',command:'node',env:{}}}).servers[0].env,{});
 assert.throws(()=>updateMcpSettings(cfg,{action:'import',config:{mcpServers:{new:{command:'node'},bad:{url:'file:///tmp/x'}}}}));
 assert.equal(publicMcpSettings(cfg).servers.length,1);
 assert.throws(()=>updateMcpSettings(cfg,{action:'import',config:{mcpServers:{old:{command:'node'}}}}),/已存在/);
 assert.throws(()=>updateMcpSettings(cfg,{action:'save',server:{name:'bad',command:'node',args:'x'}}),/数组/);
});
test('MCP settings HTTP save, SDK connection test, disable, import, delete and persistence', {timeout:20000}, async t=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'mli-mcp-settings-')), root=fileURLToPath(new URL('../',import.meta.url));
 const instance=runtime.startRuntime({executable:process.execPath,runtimeRoot:root,dataRoot:data,managed:true,environment:{MLI_ACCOUNT_ENABLED:'false'}});
 t.after(async()=>{if(instance.child.exitCode===null){const end=once(instance.child,'exit');instance.child.kill();await end;}fs.rmSync(data,{recursive:true,force:true});});
 const url=(await instance.ready).url;
 async function request(route,body,status=200,headers={}) {const response=await fetch(url+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;}
 const server={name:'sdk',command:process.execPath,args:[path.join(root,'test/fixtures/mcp-sdk-server.mjs')],env:{SECRET:'hidden-value'},timeout:2000};
 const saved=await request('/api/mcp/settings',{action:'save',server});assert.deepEqual(saved.servers[0].envKeys,['SECRET']);assert.ok(!JSON.stringify(saved).includes('hidden-value'));
 assert.equal((await request('/api/mcp/test',{name:'sdk'})).tools.length,2);
 await request('/api/mcp/settings',{action:'save',server:{...server,env:undefined,enabled:false}});
 await request('/api/mcp/test',{name:'sdk'},400);
 const disk=JSON.parse(fs.readFileSync(path.join(data,'config.json'),'utf8'));assert.equal(disk.mcp.servers[0].enabled,false);assert.equal(disk.mcp.servers[0].env.SECRET,'hidden-value');
 await request('/api/mcp/settings',{action:'import',config:{mcpServers:{remote:{url:'https://example.com/mcp'}}}});
 assert.equal((await request('/api/mcp/settings')).servers.length,2);
 await request('/api/mcp/settings',{action:'delete',name:'sdk'});
 assert.equal((await request('/api/mcp/settings')).servers.length,1);
 await request('/api/mcp/settings',{action:'delete',name:'remote'},403,{origin:'https://evil.example'});
 await request('/api/mcp/test',{name:'remote'},403,{'sec-fetch-site':'cross-site'});
});

test('Modao credential input persists as a header and never returns its value', () => {
 const cfg={mcp:{servers:[{name:'modao',url:'https://modao.cc/agent-py/ai/mcp',headers:{Other:'kept'}}]}};
 cfg.mcp=updateMcpSettings(cfg,{action:'save',server:{name:'modao',url:'https://modao.cc/agent-py/ai/mcp'},modaoToken:' private-token '});
 assert.equal(cfg.mcp.servers[0].headers['modao-token'],'private-token');
 assert.equal(cfg.mcp.servers[0].headers.Other,'kept');
 assert.ok(!JSON.stringify(publicMcpSettings(cfg)).includes('private-token'));
});

test('private credential UI requests resolve without retaining secrets and support cancellation', async () => {
 const {uiRequest,pendingUiRequests,resolveUiRequest}=await import('../core/plugins.mjs');
 const session={id:'credential-ui-test'},abort=new AbortController();
 const pending=uiRequest(session,'secret',{title:'连接服务'},1000,abort.signal);
 const [request]=pendingUiRequests(session.id);assert.equal(request.kind,'secret');
 assert.equal(resolveUiRequest(request.reqId,'secret-value','wrong-session'),false);
 assert.equal(resolveUiRequest(request.reqId,'secret-value',session.id),true);
 assert.equal(await pending,'secret-value');assert.equal(pendingUiRequests(session.id).length,0);
 const cancelled=uiRequest(session,'secret',{title:'连接服务'},1000,abort.signal);abort.abort();assert.equal(await cancelled,null);assert.equal(pendingUiRequests(session.id).length,0);
});

test('plugin credentials are configurable, preserve ownership, redact secrets and reach actual MCP transport', async t => {
 const {registerMcpServers,mcpServers,testMcpServer,closeMcp}=await import('../core/mcp.mjs');
 const {Server}=await import('@modelcontextprotocol/sdk/server/index.js');
 const {StreamableHTTPServerTransport}=await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
 const {ListToolsRequestSchema}=await import('@modelcontextprotocol/sdk/types.js');
 const http=await import('node:http');
 const clients=[];
 const endpoint=http.createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer plugin-private-token');
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
  const sdk=new Server({name:'plugin-auth-fixture',version:'1'},{capabilities:{tools:{}}});
  sdk.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'authenticated',inputSchema:{type:'object'}}]}));
  clients.push(sdk);await sdk.connect(transport);await transport.handleRequest(req,res);
 });
 await new Promise(r=>endpoint.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${endpoint.address().port}/mcp`;
 const remove=registerMcpServers('auth-fixture',[{name:'plugin-auth',url,bearer_token_env_var:'MLI_NONEXISTENT_PLUGIN_TOKEN'}]);
 t.after(async()=>{await closeMcp();await remove();await Promise.allSettled(clients.map(s=>s.close()));endpoint.closeAllConnections();endpoint.close();});
 const cfg={mcp:{servers:[]}};
 cfg.mcp=updateMcpSettings(cfg,{action:'plugin-auth',owner:'auth-fixture',name:'plugin-auth',headers:{Authorization:'Bearer plugin-private-token'}});
 const configured=mcpServers(cfg).find(s=>s.name==='plugin-auth');assert.equal(configured.owner,'auth-fixture');assert.equal(configured.url,url);
 assert.ok(!JSON.stringify(publicMcpSettings(cfg)).includes('plugin-private-token'));
 const result=await testMcpServer(configured);assert.equal(result.tools[0].name,'authenticated');
 assert.throws(()=>updateMcpSettings(cfg,{action:'plugin-auth',owner:'other',name:'plugin-auth'}),/不存在/);
});
