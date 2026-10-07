import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRunContext } from './run-context.mjs';
import { resolveReadable } from './paths.mjs';
import { fileEvidence, assertLocalVerification, verificationEnvironment } from './artifact-evidence.mjs';
import { verifierProcess } from './verifier-process.mjs';
import { findExecutable } from './sandbox.mjs';

export async function verifyMedia({ path: file, checks = [], samples = 3 }, ctx = {}) {
  assertLocalVerification();
  if(!/\.(?:mp4|webm|mov|mkv|mp3|wav|m4a|ogg|flac|png|jpe?g|webp|gif)$/i.test(file || ''))throw new Error('verify_media 需要实际音视频或图像文件');
  if(!Array.isArray(checks)||checks.length>30||!Number.isInteger(samples)||samples<0||samples>6)throw new Error('checks 最多 30 项，samples 为 0–6 张实际抽帧');
  const artifact = fileEvidence(file), input = resolveReadable(file), results = [], media = [];
  const binaries = getRunContext()?.config?.media || {};
  const ffmpeg = binaries.ffmpegPath || findExecutable('ffmpeg'), ffprobe = binaries.ffprobePath || findExecutable('ffprobe');
  let decoded = false, data;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-media-verify-'));
  try {
    if (!ffmpeg || !ffprobe) throw new Error('媒体验收需要 FFmpeg 和 FFprobe；请安装到系统 PATH 或配置 media.ffmpegPath/ffprobePath');
    if (!path.isAbsolute(ffmpeg) || !path.isAbsolute(ffprobe)) throw new Error('媒体程序配置必须为绝对路径');
    const probe = await verifierProcess(ffprobe, ['-v','error','-protocol_whitelist','file,pipe','-print_format','json','-show_format','-show_streams',input], ctx);
    if(probe.code!==0)throw new Error(`媒体读取失败：${probe.stderr || probe.code}`);
    data=JSON.parse(probe.stdout);
    const streams=Array.isArray(data.streams)?data.streams:[],video=streams.find(stream=>stream.codec_type==='video'),audio=streams.find(stream=>stream.codec_type==='audio');
    const still=/\.(?:png|jpe?g|webp)$/i.test(file),duration=Number(data.format?.duration || video?.duration || audio?.duration || 0);
    results.push({name:'实际音视频流存在',passed:!!(video||audio)});
    if(!still)results.push({name:'媒体时长有效',passed:duration>0});
    // Decode every selected audio/video stream, without trusting metadata as playback proof.
    const decode=await verifierProcess(ffmpeg,['-nostdin','-v','error','-xerror','-protocol_whitelist','file,pipe','-i',input,'-map','0:v?','-map','0:a?','-progress','pipe:1','-f','null','-'],ctx);
    const frames=Math.max(0,...[...decode.stdout.matchAll(/^frame=(\d+)/gm)].map(match=>Number(match[1]))),decodedTime=Math.max(0,...[...decode.stdout.matchAll(/^out_time_us=(\d+)/gm)].map(match=>Number(match[1])));
    decoded=decode.code===0&&!!(video||audio)&&(frames>0||decodedTime>0);
    results.push({name:'音视频流完整解码',passed:decoded,detail:decode.stderr.slice(-2000)});
    for(const rule of checks){
      let passed=false,actual;
      if(rule.type==='duration_min'){actual=duration;passed=duration>=Number(rule.value);}
      else if(rule.type==='duration_max'){actual=duration;passed=duration<=Number(rule.value);}
      else if(rule.type==='width'){actual=Number(video?.width||0);passed=actual===Number(rule.value);}
      else if(rule.type==='height'){actual=Number(video?.height||0);passed=actual===Number(rule.value);}
      else if(rule.type==='has_audio'){actual=!!audio;passed=actual===rule.value;}
      else if(rule.type==='has_video'){actual=!!video;passed=actual===rule.value;}
      else throw new Error('不支持的媒体约束');
      results.push({name:String(rule.name||rule.type).slice(0,200),criterion:rule.criterion,passed,detail:String(actual)});
    }
    if(decoded&&video&&samples){
      const count=still?1:samples;
      for(let index=0;index<count;index++){
        const time=still?0:duration*(index+0.5)/count,target=path.join(directory,`frame-${index}.png`);
        const args=['-nostdin','-v','error','-xerror','-protocol_whitelist','file,pipe',...(still?[]:['-ss',String(time)]),'-i',input,'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease',target];
        const frame=await verifierProcess(ffmpeg,args,ctx);
        const ok=frame.code===0&&fs.existsSync(target)&&fs.statSync(target).size>0;
        results.push({name:`实际抽帧 ${index+1}（${time.toFixed(2)}s）`,passed:ok,detail:frame.stderr.slice(-1000)});
        if(ok)media.push({type:'image',mime:'image/png',name:`${path.basename(file)} · ${time.toFixed(2)}s`,dataUrl:`data:image/png;base64,${fs.readFileSync(target).toString('base64')}`});
      }
    }
    results.push({name:'解码及抽帧期间产物版本一致',passed:fileEvidence(file).sha256===artifact.sha256});
  }catch(error){if(ctx.signal?.aborted)throw error;results.push({name:'媒体实际验收',passed:false,detail:error.message});}
  finally{fs.rmSync(directory,{recursive:true,force:true});}
  const verification={kind:'media',environment:verificationEnvironment(),artifacts:[artifact],checks:results,assertions:checks.length,decoded,scope:'实际解码、媒体约束和抽帧；不证明剧情、审美、语音内容或音画同步符合要求'};
  return {content:JSON.stringify({artifact,checks:results,decoded,streamSummary:data?.streams?.map(stream=>({type:stream.codec_type,codec:stream.codec_name,width:stream.width,height:stream.height})),scope:verification.scope},null,2),status:results.length&&results.every(check=>check.passed)?'ok':'error',media,verification};
}
