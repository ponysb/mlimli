import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mcpSearch,mcpCall,mcpTool,closeMcp,registerMcpServers } from '../core/mcp.mjs';
import { withRunContext,assertAgentTool } from '../core/run-context.mjs';
const fixture=fileURLToPath(new URL('./fixtures/mcp-sdk-server.mjs',import.meta.url));
const config=(name='sdk')=>({mcp:{servers:[{name,command:process.execPath,args:[fixture],timeout:2000}]}});
afterEach(closeMcp);
test('official SDK stdio supports Chinese, pagination and simultaneous discovery',async()=>{
 const cfg=config(); const results=await Promise.all([mcpSearch(cfg),mcpSearch(cfg)]);
 for(const result of results){assert.equal(result.tools.length,2);assert.equal(result.errors.length,0);assert.equal(result.tools[0].description,'中文工具 😀');}
 assert.equal((await mcpCall(cfg,'sdk/echo',{text:'你好'})).content[0].text,'你好');
});
test('missing command is a connection diagnostic, not a process crash',async()=>{
 const r=await mcpSearch({mcp:{servers:[{name:'bad',command:'/definitely-not-a-mli-command',timeout:500}]}});assert.equal(r.tools.length,0);assert.match(r.errors[0].message,/ENOENT/);
});
test('error status survives the public proxy and requests cancel promptly',async()=>{
 const tool=mcpTool(()=>config());assert.equal((await tool.run({action:'call',name:'sdk/echo',arguments:{fail:true}})).status,'error');
 const ac=new AbortController();const pending=mcpCall(config(),'sdk/echo',{wait:true},{signal:ac.signal});setTimeout(()=>ac.abort(),30);await assert.rejects(pending);
 assert.equal((await mcpCall(config(),'sdk/echo',{})).content[0].text,'中文回声 😀');
});
test('qualified calls ignore unrelated failed servers and duplicate bare names fail',async()=>{
 const cfg=config();cfg.mcp.servers.push({name:'bad',command:'/missing'});assert.ok(await mcpCall(cfg,'sdk/echo',{}));
 const both=config();both.mcp.servers.push(config('other').mcp.servers[0]);await assert.rejects(mcpCall(both,'echo',{}),/名称重复/);
});
test('same-name changed configuration replaces connection and invalid configuration fails cleanly',async()=>{
 await mcpSearch(config());const cfg=config();cfg.mcp.servers[0].command='/missing';const result=await mcpSearch(cfg);assert.equal(result.errors.length,1);
 assert.equal((await mcpSearch({mcp:{servers:[{name:'bad',url:'file:///tmp/x'}]}})).errors.length,1);
});
test('plugin configuration ownership is removable and read-only blocks actual proxy',()=>{
 const remove=registerMcpServers('test',config().mcp.servers);assert.throws(()=>withRunContext({readOnly:true},()=>assertAgentTool(mcpTool(()=>({})),{action:'call'})),/只读/);remove();
});
test('official Streamable HTTP server receives authorization headers and calls work',async t=>{
 const {createServer}=await import('node:http');const {randomUUID}=await import('node:crypto');
 const {Server}=await import('@modelcontextprotocol/sdk/server/index.js');const {StreamableHTTPServerTransport}=await import('@modelcontextprotocol/sdk/server/streamableHttp.js');const {ListToolsRequestSchema,CallToolRequestSchema}=await import('@modelcontextprotocol/sdk/types.js');
 const sdk=new Server({name:'http-fixture',version:'1'},{capabilities:{tools:{}}});
 sdk.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'echo',inputSchema:{type:'object'}}]}));sdk.setRequestHandler(CallToolRequestSchema,async()=>({content:[{type:'text',text:'HTTP 中文'}]}));
 const transport=new StreamableHTTPServerTransport({sessionIdGenerator:randomUUID});await sdk.connect(transport);
 const server=createServer(async(req,res)=>{if(req.headers.authorization!=='Bearer audit'){res.writeHead(401);res.end();return}await transport.handleRequest(req,res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await closeMcp();await sdk.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const cfg={mcp:{servers:[{name:'http',url:`http://127.0.0.1:${server.address().port}/mcp`,headers:{Authorization:'Bearer audit'},timeout:2000}]}};
 assert.equal((await mcpCall(cfg,'http/echo',{})).content[0].text,'HTTP 中文');
});
test('legacy SSE transport uses official server and refreshes changed tool lists',async t=>{
 const {createServer}=await import('node:http');const {Server}=await import('@modelcontextprotocol/sdk/server/index.js');
 const {SSEServerTransport}=await import('@modelcontextprotocol/sdk/server/sse.js');const {ListToolsRequestSchema,CallToolRequestSchema}=await import('@modelcontextprotocol/sdk/types.js');
 const sdk=new Server({name:'sse-fixture',version:'1'},{capabilities:{tools:{listChanged:true}}});let toolName='first';let transport;
 sdk.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:toolName,inputSchema:{type:'object'}}]}));sdk.setRequestHandler(CallToolRequestSchema,async()=>({content:[{type:'text',text:'SSE'}]}));
 const server=createServer(async(req,res)=>{try{if(req.method==='GET'){transport=new SSEServerTransport('/messages',res);await sdk.connect(transport)}else await transport.handlePostMessage(req,res)}catch(error){res.writeHead(500);res.end(error.message)}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await closeMcp();await sdk.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const cfg={mcp:{servers:[{name:'sse',type:'sse',url:`http://127.0.0.1:${server.address().port}/sse`,timeout:2000}]}};
 assert.equal((await mcpCall(cfg,'sse/first',{})).content[0].text,'SSE');toolName='changed';await sdk.notification({method:'notifications/tools/list_changed'});await new Promise(resolve=>setTimeout(resolve,20));assert.equal((await mcpSearch(cfg)).tools[0].name,'changed');
});

test('untargeted discovery only returns catalog; chosen or explicitly decided server never touches others',async()=>{
 const {withRunContext}=await import('../core/run-context.mjs');
 const cfg=config('figma');cfg.mcp.servers.push({name:'modao',url:'https://modao.cc/agent-py/ai/mcp'});
 const tool=mcpTool(()=>cfg);
 const catalog=JSON.parse((await tool.run({action:'search',query:'design'})).content);
 assert.deepEqual(catalog.servers.map(s=>s.name),['figma','modao']);assert.equal(catalog.tools.length,0);
 const selected=await withRunContext({selectedMcpServers:['figma']},()=>tool.run({action:'search'}));
 assert.equal(JSON.parse(selected.content).tools.length,2);
 const decided=JSON.parse((await tool.run({action:'search',server:'figma'})).content);
 assert.equal(decided.tools.length,2);assert.equal(decided.errors.length,0);
 await assert.rejects(tool.run({action:'describe',name:'echo'}),/明确目标服务/);
 await assert.rejects(withRunContext({selectedMcpServers:['figma']},()=>tool.run({action:'call',name:'modao/test'})),/范围内/);
});
