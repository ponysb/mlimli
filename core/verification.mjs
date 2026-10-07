import fs from 'node:fs';
import path from 'node:path';
import { resolveReadable, resolveInWorkspace } from './paths.mjs';
import { readZipMap } from '../plugins/office/lib/zip.mjs';
import { docxExtractText, pptxExtractText, xlsxRead } from '../plugins/office/lib/ooxml.mjs';
import { verifyBrowser, browserTarget } from './browser-verifier.mjs';
import { fileURLToPath } from 'node:url';
import { fileEvidence, assertLocalVerification, verificationEnvironment } from './artifact-evidence.mjs';
import { verifyDocument } from './document-verifier.mjs';
import { verifyMedia } from './media-verifier.mjs';
export { fileEvidence } from './artifact-evidence.mjs';

export function verifyArtifact({path:file,checks=[]}) {
  assertLocalVerification();
  const artifact = fileEvidence(file), abs=resolveReadable(file), ext=path.extname(abs).toLowerCase();
  if(artifact.size>64*1024*1024)throw new Error('通用内容断言最多读取 64 MiB，较大媒体请用 verify_media');
  const data=fs.readFileSync(abs);
  const result = [{name:'交付文件存在且非空',passed:artifact.size>0}];let text, workbook, slides;
  try {
    if(ext==='.docx') text=docxExtractText(data);
    else if(ext==='.xlsx') {workbook=xlsxRead(data);text=JSON.stringify(workbook);}
    else if(ext==='.pptx') {slides=[...readZipMap(data).keys()].filter(key=>/^ppt\/slides\/slide\d+\.xml$/.test(key)).length;text=pptxExtractText(data);}
    else if(ext==='.json'){JSON.parse(data.toString('utf8'));text=data.toString('utf8');}
    else if(['.md','.txt','.log','.csv','.html','.htm','.svg','.mjs','.js','.py','.ts','.jsx','.tsx','.srt','.vtt'].includes(ext))text=data.toString('utf8');
    else throw new Error('该格式需要相应的渲染/媒体工具验证，通用文件验收不能确认它可用');
    if(['.docx','.xlsx','.pptx'].includes(ext)) {
      const zip=readZipMap(data);if(!zip.has('[Content_Types].xml'))throw new Error('Office 文件缺少内容类型定义');
    }
    result.push({name:'格式读取',passed:true});
  }catch(error){result.push({name:'格式读取',passed:false,detail:error.message});text='';}
  if(!Array.isArray(checks)||checks.length>50)throw new Error('checks 必须为最多 50 项实际内容检查');
  for(const rule of checks){
    let passed=false,detail='';const value=String(rule?.value??'');
    if(rule?.type==='contains')passed=text.includes(value)&&Boolean(value);
    else if(rule?.type==='not_contains')passed=Boolean(value)&&!text.includes(value);
    else if(rule?.type==='min_chars'){detail=String(text.replace(/\s/g,'').length);passed=Number(detail)>=Number(rule.value);}
    else if(rule?.type==='max_chars'){detail=String(text.replace(/\s/g,'').length);passed=Number(detail)<=Number(rule.value);}
    else if(rule?.type==='json_value') {try{let current=JSON.parse(text);for(const key of String(rule.key||'').split('.').filter(Boolean))current=current?.[key];passed=JSON.stringify(current)===JSON.stringify(rule.value);}catch{}}
    else if(rule?.type==='xlsx_cell') {
      if(!workbook)throw new Error('xlsx_cell 只适用于工作簿');
      const match=/^([A-Z]+)([1-9]\d*)$/i.exec(String(rule.cell||''));if(!match)throw new Error('cell 必须是实际单元格坐标，如 B4');
      const sheet=workbook.find(item=>item.name===rule.sheet);if(!sheet)throw new Error('指定工作表不存在');
      const column=[...match[1].toUpperCase()].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1;
      detail=String(sheet.rows[Number(match[2])-1]?.[column]??'');passed=typeof rule.value==='number'?detail.trim()!==''&&Number.isFinite(rule.value)&&Number(detail)===rule.value:detail===String(rule.value);
    }
    else if(rule?.type==='xlsx_rows') {if(!workbook)throw new Error('xlsx_rows 只适用于工作簿');const sheet=workbook.find(item=>item.name===rule.sheet);if(!sheet)throw new Error('指定工作表不存在');detail=String(sheet.rows.length);passed=sheet.rows.length===Number(rule.value);}
    else if(rule?.type==='slide_count') {if(slides===undefined)throw new Error('slide_count 只适用于 PPTX');detail=String(slides);passed=slides===Number(rule.value);}
    else throw new Error('不支持的内容断言类型');
    result.push({name:String(rule.name||`${rule.type} ${value}`).slice(0,200),criterion:rule.criterion,passed,detail});
  }
  result.push({name:'检查期间文件保持一致',passed:fileEvidence(file).sha256===artifact.sha256});
  return {content:JSON.stringify({artifact,checks:result},null,2),status:result.every(check=>check.passed)?'ok':'error',verification:{kind:'artifact',environment:verificationEnvironment(),artifacts:[artifact],checks:result,assertions:checks.length,scope:'文件格式与显式内容约束；不代表美学、事实真实性或全部功能已验证'}};
}
export async function verifyWeb(args,ctx) {
  assertLocalVerification();
  const target=browserTarget(args.url),paths=target.startsWith('file:')?[fileURLToPath(target),...(args.paths||[])]:args.paths||[];
  if(!Array.isArray(paths)||paths.length>30)throw new Error('paths 必须为最多 30 个本次测试对应的工作区文件');
  const artifacts=paths.map(file=>fileEvidence(resolveInWorkspace(file))),result=await verifyBrowser(args,ctx);
  if(artifacts.some(item=>fileEvidence(item.path).sha256!==item.sha256))result.checks.push({name:'测试期间文件保持一致',passed:false,detail:'文件已改变，请重新验收'});
  result.passed=result.checks.every(check=>check.passed);
  return {content:JSON.stringify({...result,image:undefined},null,2),image:result.image,status:result.passed?'ok':'error',verification:{kind:'browser',environment:verificationEnvironment(),artifacts,checks:result.checks,assertions:result.checks.length,scope:'本次本机 Chromium 场景断言'}};
}
export const verificationTools=[
  {name:'verify_document',permission:'L2',managesTimeout:true,description:'实际渲染 PDF/Office 文档，返回页数、指定页文字约束和真实页面图片供检查。Office 使用独立 LibreOffice 无界面转换；缺失时明确失败，不用文本预览冒充原版布局。默认前 6 页，其余页继续调用 pages。图片本身不证明排版与内容质量通过。',parameters:{type:'object',properties:{path:{type:'string'},pages:{type:'array',items:{type:'integer'}},checks:{type:'array',items:{type:'object',properties:{type:{type:'string',enum:['page_count','min_pages','max_pages','page_contains']},page:{type:'integer'},value:{},name:{type:'string'},criterion:{type:'string'}},required:['type','value']}}},required:['path']},run:verifyDocument},
  {name:'verify_media',permission:'L2',managesTimeout:true,description:'使用 FFprobe 读取真实流、FFmpeg 完整解码音视频/图像，并返回实际抽帧供核对。可检查时长、尺寸和音视频流并关联 criterion。缺少解码器不算通过；元数据或抽帧不证明剧情、审美、语音内容和音画同步。',parameters:{type:'object',properties:{path:{type:'string'},samples:{type:'integer',description:'实际抽帧数 0–6，默认 3'},checks:{type:'array',items:{type:'object',properties:{type:{type:'string',enum:['duration_min','duration_max','width','height','has_audio','has_video']},value:{},name:{type:'string'},criterion:{type:'string'}},required:['type','value']}}},required:['path']},run:verifyMedia},
  {name:'set_task_plan',permission:'L0',description:'制作成品前记录用户目标、真实文件路径和必要验收条件。deliverables 只填路径，例如 money.mjs；不要填说明或额外创建测试日志。实际工具结果就是证据，不必保存证据文件。不新增用户未要求的目标；条件使用稳定 id，不能自报 passed。',parameters:{type:'object',properties:{goal:{type:'string'},domain:{type:'string',enum:['code','web','writing','office','media','general']},deliverables:{type:'array',items:{type:'string'},description:'用户要使用的真实文件路径；不填描述和验证结论'},criteria:{type:'array',items:{type:'object',properties:{id:{type:'string'},description:{type:'string'}},required:['id','description']}}},required:['goal','domain','deliverables','criteria']},async run(args){
    if(!String(args.goal||'').trim()||!['code','web','writing','office','media','general'].includes(args.domain))throw new Error('任务计划需要明确目标和有效领域');
    if(!Array.isArray(args.deliverables)||!Array.isArray(args.criteria)||!args.criteria.length||args.criteria.length>30||args.deliverables.length>20)throw new Error('任务计划需要 1–30 项验收条件和最多 20 个交付文件');
    const criteria=args.criteria.map(row=>({id:String(row.id||'').slice(0,80),description:String(row.description||'').slice(0,500)}));
    if(criteria.some(row=>!row.id||!row.description)||new Set(criteria.map(row=>row.id)).size!==criteria.length)throw new Error('验收条件 id 必须唯一且有描述');
    const taskContract={goal:String(args.goal||'').slice(0,1500),domain:args.domain,deliverables:args.deliverables.map(file=>{if(typeof file!=='string'||file.length>1000||!(/\.[a-z0-9]{1,12}$/i.test(file)||/^(?:README|LICENSE|Makefile)$/i.test(file)))throw new Error('deliverables 只能填写真实文件路径（如 src/main.mjs），不要填写说明或测试结论');resolveInWorkspace(file);return file;}),criteria};
    return {content:JSON.stringify(taskContract),taskContract};
  }},
  {name:'verify_artifact',permission:'L0',description:'重新读取真实交付物，检查非空、可读格式与显式内容约束。支持文字、JSON、DOCX/XLSX/PPTX；Office 外观仍须渲染查看。代码功能用 bash 实际运行测试，网页交互用 verify_browser，媒体用 ffprobe/播放/抽帧。检查可关联任务计划的 criterion id。',parameters:{type:'object',properties:{path:{type:'string'},checks:{type:'array',items:{type:'object',properties:{type:{type:'string',enum:['contains','not_contains','min_chars','max_chars','json_value','xlsx_cell','xlsx_rows','slide_count']},value:{},key:{type:'string'},sheet:{type:'string'},cell:{type:'string'},name:{type:'string'},criterion:{type:'string'}},required:['type','value']}}},required:['path']},run:verifyArtifact},
  {name:'verify_browser',permission:'L2',description:'在隔离的 Chromium 浏览器实际打开工作区 HTML 或 localhost 开发服务器，点击/填写/刷新/手机尺寸并执行断言，返回步骤、结果和截图。不控制用户浏览器；不支持外网站点和登录。至少一个 assert_* 步骤；截图本身不证明功能。selector 使用 CSS。',parameters:{type:'object',properties:{url:{type:'string'},paths:{type:'array',items:{type:'string'},description:'localhost 服务测试对应的交付文件，用于版本检查；如 index.html、src/App.jsx'},width:{type:'number'},height:{type:'number'},actions:{type:'array',items:{type:'object',properties:{type:{type:'string',enum:['click','fill','reload','viewport','screenshot','assert_text','assert_value','assert_count','assert_no_overflow','assert_no_errors']},selector:{type:'string'},text:{type:'string',description:'可选：只匹配 innerText 等于该文本的元素，如 添加、删除'},value:{type:'string'},count:{type:'number'},width:{type:'number'},height:{type:'number'},name:{type:'string'},criterion:{type:'string'}},required:['type']}}},required:['url','actions']},run:verifyWeb},
];
