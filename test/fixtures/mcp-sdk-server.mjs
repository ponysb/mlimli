import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const server = new Server({name:'fixture',version:'1'},{capabilities:{tools:{listChanged:true}}});
server.setRequestHandler(ListToolsRequestSchema,async request=>({tools:[{name:request.params?.cursor?'second':'echo',description:'中文工具 😀',inputSchema:{type:'object',properties:{text:{type:'string'}}}}],...(!request.params?.cursor?{nextCursor:'next'}:{})}));
server.setRequestHandler(CallToolRequestSchema,async (request,extra)=>{
  if(request.params.arguments?.wait) await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,10000);extra.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('cancelled'))},{once:true})});
  return {content:[{type:'text',text:request.params.arguments?.text||'中文回声 😀'}],isError:!!request.params.arguments?.fail};
});
await server.connect(new StdioServerTransport());
