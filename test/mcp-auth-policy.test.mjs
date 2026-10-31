import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpAuthentication as policy,observeMcpAuthentication as observe} from '../core/mcp-auth-policy.mjs';
test('transport never implies browser OAuth and declared credential types win',()=>{
 assert.equal(policy({name:'local',command:'node'}).type,'local');
 assert.equal(policy({url:'https://example.com/none',auth:{type:'none'}}).action,'connect');
 assert.equal(policy({url:'https://example.com/token',bearer_token_env_var:'TOKEN'}).action,'configure');
 assert.equal(policy({url:'https://example.com/key',headers:{'x-api-key':'private'}}).type,'header');
 assert.equal(policy({url:'https://example.com/unknown'}).action,'detect');
 assert.equal(policy({url:'https://api.githubcopilot.com/mcp/'}).action,'configure');
 for(const type of ['device_code','client_credentials','jwt_bearer']) assert.equal(policy({url:'https://example.com/'+type,auth:{type}}).action,'unsupported');
});
test('remote evidence selects anonymous, challenge, preregistered, CIMD and DCR separately',()=>{
 const server={url:'https://example.com/evidence'};
 observe(server,{public:true});assert.equal(policy(server).action,'connect');
 observe(server,{unauthorized:true});assert.equal(policy(server).action,'configure');
 observe(server,{oauth:true});assert.equal(policy(server).action,'authorize');
 observe(server,{metadata:{}});assert.equal(policy(server).action,'configure');
 observe(server,{metadata:{registration_endpoint:'https://example.com/register'}});assert.equal(policy(server).registration,'dcr');
 assert.equal(policy({...server,oauth:{client_id:'own'}}).registration,'preregistered');
 observe(server,{metadata:{client_id_metadata_document_supported:true}});
 assert.equal(policy({...server,oauth:{client_metadata_url:'https://client.example/metadata.json'}}).registration,'cimd');
});
