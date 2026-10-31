export const COMMAND_STORAGE='mli.terminal.commands.v1';
export {commandDictionary as commandSeeds} from './terminal-command-dictionary.mjs';
import {quoteParameter} from './terminal-command-dictionary.mjs';
export function parameters(command){return [...new Set([...command.matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1]))];}
export function renderCommand(command,values,shell='unix'){return command.replace(/\{\{([^{}]+)\}\}/g,(_,key)=>{if(!String(values[key]||'').trim())throw Error(`请填写${key}`);return quoteParameter(values[key],shell);});}
export function sensitiveCommand(value){return /(?:password|passwd|token|secret|api[_-]?key|authorization)\s*(?:=|:|\s)\s*\S+|--(?:password|token|secret)\b|Bearer\s+\S+|BEGIN .*PRIVATE KEY|:\/\/[^\s/@]+:[^\s/@]+@/i.test(value);}
export function cleanContext(value){return String(value||'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').split('\n').map(line=>sensitiveCommand(line)?'[敏感内容已隐藏]':line).join('\n').slice(-8000);}
export function validateSavedCommand(value){
 if(!value||typeof value.name!=='string'||typeof value.command!=='string'||!value.name.trim()||!value.command.trim())throw Error('名称和命令不能为空');
 if(value.name.length>100||value.command.length>4000||/[\x00-\x1f\x7f]/.test(value.command))throw Error('命令过长或包含控制字符');
 if(sensitiveCommand(value.command.replace(/\{\{[^{}]+\}\}/g,'')))throw Error('命令包含密码或密钥字段，请改成参数模板后保存');
 return {id:String(value.id||'').slice(0,100),name:value.name.trim(),command:value.command.trim(),description:cleanContext(value.description||'').slice(0,1000),tag:String(value.tag||'我的命令').slice(0,40),scope:value.scope==='global'?'global':String(value.scope||'global').slice(0,100),favorite:!!value.favorite};
}
export function parseCommandImport(text){const data=JSON.parse(text);if(!Array.isArray(data)||data.length>200)throw Error('请导入最多 200 条命令的 JSON 数组');return data.map(validateSavedCommand);}
export function parseAiCommands(text){
 const data=JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
 if(typeof data.explanation!=='string'||!Array.isArray(data.commands)||data.commands.length>8)throw Error('AI 返回格式无效，请重试');
 return {explanation:cleanContext(data.explanation).slice(0,4000),commands:data.commands.map(item=>{if(typeof item.command!=='string'||!item.command.trim()||item.command.length>4000||/[\x00-\x1f\x7f]/.test(item.command)||sensitiveCommand(item.command))throw Error('AI 命令包含敏感内容、换行或无效字符，请重新生成');return {command:item.command,description:String(item.description||'').slice(0,1000)};})};
}

export function readCommandStore(storage=localStorage){const data=JSON.parse(storage.getItem(COMMAND_STORAGE)||'{}');return {saved:parseCommandImport(JSON.stringify(data.saved||[])),history:(Array.isArray(data.history)?data.history:[]).filter(x=>typeof x.command==='string'&&!sensitiveCommand(x.command)).slice(0,50)};}
export function writeCommandStore(update,storage=localStorage){const next=update(readCommandStore(storage));if(next.saved.length>200)throw Error('命令库最多保存200条，请先导出或删除');storage.setItem(COMMAND_STORAGE,JSON.stringify(next));return next;}
