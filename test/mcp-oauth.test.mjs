import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mli-oauth-test-'));
process.env.MLI_AGENT_DATA_DIR=directory;
const {beginOAuth,oauthStatus,oauthProvider,cancelOAuth}=await import('../core/mcp-oauth.mjs');
test('OAuth registers public PKCE client, validates callback state, stores private credentials and cancels',async t=>{
 let base,redirect,challenge;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url.startsWith('/.well-known/oauth-protected-resource'))return res.end(JSON.stringify({resource:base+(req.url.includes('/other')?'/other':'/mcp'),authorization_servers:[base]}));
  if(req.url.startsWith('/.well-known/'))return res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',registration_endpoint:base+'/register',response_types_supported:['code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']}));
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url==='/register'){const data=JSON.parse(body);assert.equal(data.token_endpoint_auth_method,'none');redirect=data.redirect_uris[0];return res.end(JSON.stringify({client_id:'public-client',...data}));}
  if(req.url==='/token'){const data=new URLSearchParams(body);assert.ok(data.get('code_verifier'));assert.equal(data.get('code'),'test-code');return res.end(JSON.stringify({access_token:'private-access',refresh_token:'private-refresh',token_type:'Bearer',expires_in:3600}));}
  res.writeHead(401);res.end('{}');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(directory,{recursive:true,force:true});});
 const configured={name:'test',url:base+'/mcp'};
 let ready;const waiting=new Promise(r=>ready=r);
 const job=beginOAuth(configured,{openBrowser:false,notify:url=>ready(url)});
 const authUrl=new URL(await Promise.race([waiting,job.done.then(()=>{throw new Error(job.error || 'ended before redirect')})]));challenge=authUrl.searchParams.get('code_challenge');assert.ok(challenge);assert.equal(authUrl.searchParams.get('code_challenge_method'),'S256');
 const wrong=await fetch(redirect+'?code=test-code&state=wrong');assert.equal(wrong.status,400);assert.equal(oauthStatus(configured).status,'waiting');
 assert.ok(!JSON.stringify(oauthStatus(configured)).includes('private-access'));
 await fetch(redirect+'?code=test-code&state='+authUrl.searchParams.get('state'));await job.done;
 assert.equal(job.status,'authorized');assert.equal(oauthProvider(configured).tokens().access_token,'private-access');
 const file=fs.readdirSync(path.join(directory,'.security','mcp-oauth'))[0];assert.equal(fs.statSync(path.join(directory,'.security','mcp-oauth',file)).mode&0o777,0o600);
 const other={name:'cancel',url:base+'/other'};let wait2;const ready2=new Promise(r=>wait2=r);const pending=beginOAuth(other,{openBrowser:false,notify:()=>wait2()});await Promise.race([ready2,pending.done.then(()=>{throw new Error(pending.error || 'no redirect')})]);cancelOAuth(other);await pending.done;assert.equal(pending.status,'cancelled');
});

test('Agent connects from chat before registration; failed registration is shown in chat, not a silent settings redirect',async t=>{
 const {mcpTool,closeMcp}=await import('../core/mcp.mjs');
 const {pendingUiRequests,resolveUiRequest}=await import('../core/plugins.mjs');
 let base,registrations=0;
 const server=http.createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url.startsWith('/.well-known/oauth-protected-resource'))return res.end(JSON.stringify({resource:base+'/mcp',authorization_servers:[base]}));
  if(req.url.startsWith('/.well-known/'))return res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',registration_endpoint:base+'/register',response_types_supported:['code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['client_secret_post']}));
  if(req.url==='/register'){registrations++;res.writeHead(403);return res.end('Forbidden');}
  res.writeHead(401,{'www-authenticate':`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`});res.end('{}');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await closeMcp();server.closeAllConnections();server.close();fs.rmSync(directory,{recursive:true,force:true});});
 const session={id:'auth-chat-fixture'},tool=mcpTool(()=>({mcp:{servers:[{name:'design',url:base+'/mcp',timeout:2000}]}}));
 const pending=tool.run({action:'connect',server:'design'},{session});
 async function waitRequest(kind){const end=Date.now()+3000;while(Date.now()<end){const value=pendingUiRequests(session.id).find(r=>r.kind===kind);if(value)return value;await new Promise(r=>setTimeout(r,10));}throw Error('missing '+kind);}
 const confirm=await waitRequest('confirm');assert.equal(registrations,0);assert.match(confirm.title,/design/);resolveUiRequest(confirm.reqId,true,session.id);
 const failed=await waitRequest('present');assert.match(failed.text,/客户端注册.*403/);resolveUiRequest(failed.reqId,true,session.id);
 await assert.rejects(pending,/授权失败/);assert.equal(registrations,1);assert.equal(pendingUiRequests(session.id).length,0);
});

test('remote OAuth follows challenge metadata URL and scope, configured client skips DCR', async t => {
 const dataRoot=fs.mkdtempSync(path.join(os.tmpdir(),'mli-oauth-remote-'));
 let base, registrations=0, probe=0;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/mcp') { probe++; res.writeHead(401,{'www-authenticate':`Bearer resource_metadata="${base}/custom/resource", scope="design:read"`});return res.end('{}'); }
  if(req.url==='/custom/resource') return res.end(JSON.stringify({resource:base+'/mcp',authorization_servers:[base+'/issuer']}));
  if(req.url.includes('.well-known/') && req.url.includes('issuer')) return res.end(JSON.stringify({issuer:base+'/issuer',authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',registration_endpoint:base+'/register',response_types_supported:['code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']}));
  if(req.url==='/register') { registrations++;res.writeHead(403);return res.end('{}'); }
  if(req.url==='/token') { let body='';for await(const chunk of req)body+=chunk;assert.equal(new URLSearchParams(body).get('client_id'),'own-client');return res.end(JSON.stringify({access_token:'remote-token',token_type:'Bearer',expires_in:3600})); }
  res.writeHead(404);res.end('{}');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(dataRoot,{recursive:true,force:true});fs.rmSync(directory,{recursive:true,force:true});});
 const configured={name:'online-only',url:base+'/mcp',oauth:{client_id:'own-client'}};
 let ready;const waiting=new Promise(r=>ready=r);
 const job=beginOAuth(configured,{notify:url=>ready(url)});
 const url=new URL(await Promise.race([waiting,job.done.then(()=>{throw Error(job.error || 'no redirect')})]));
 assert.equal(url.searchParams.get('scope'),'design:read');assert.equal(url.searchParams.get('client_id'),'own-client');assert.equal(registrations,0);assert.equal(probe,1);
 await fetch(url.searchParams.get('redirect_uri')+'?code=test&state='+url.searchParams.get('state'));await job.done;assert.equal(job.status,'authorized');
});

test('unsupported automatic GitHub registration and template client IDs fail before browser waiting', async () => {
 for (const server of [{name:'github',url:'https://api.githubcopilot.com/mcp/'},{name:'template',url:'https://example.com/mcp',oauth:{client_id:'<CLIENT_ID>'}}]) {
  assert.throws(()=>beginOAuth(server), /不支持动态注册|占位符/);
 }
});
