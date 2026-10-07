// plugins/ffmpeg —— 工作区内的 FFmpeg 音视频工具
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveInWorkspace, resolveReadable } from '../../core/paths.mjs';
import { fileEvidence } from '../../core/verification.mjs';
import { assertLocalVerification, verificationEnvironment } from '../../core/artifact-evidence.mjs';

function runBinary(binary, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    const abort = () => { try { child.kill(); } catch {} };
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => {
      signal?.removeEventListener('abort', abort);
      reject(new Error(`${binary} 不可用：${error.message}`));
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      const out = Buffer.concat(stdout).toString('utf8').trim();
      const err = Buffer.concat(stderr).toString('utf8').trim();
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(err || out || `${binary} 退出码 ${code}`));
    });
  });
}

function inputPath(value) {
  const file = resolveReadable(String(value || ''));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`输入文件不存在：${value}`);
  return file;
}

function outputPath(value) {
  const file = resolveInWorkspace(String(value || ''), { write: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function extension(value, fallback) {
  const ext = path.extname(String(value || '')).toLowerCase();
  return ext || fallback;
}

export function mediaProbeChecks(data,input) {
  const streams=Array.isArray(data.streams)?data.streams:[];
  const still=/\.(?:png|jpe?g|webp)$/i.test(input);
  return [{name:'媒体流存在',passed:streams.length>0},still?{name:'图像尺寸有效',passed:streams.some(stream=>stream.codec_type==='video'&&Number(stream.width)>0&&Number(stream.height)>0)}:{name:'媒体时长有效',passed:Number(data.format?.duration)>0||streams.some(stream=>Number(stream.duration)>0)}];
}
async function probe({ input }, ctx) {
  assertLocalVerification();
  const file = inputPath(input);
  const artifact=fileEvidence(input);
  const result = await runBinary('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file], ctx);
  let data;
  try { data = JSON.parse(result.stdout); } catch { throw new Error('ffprobe 返回了无效 JSON'); }
  const checks=mediaProbeChecks(data,input);checks.push({name:'读取期间文件保持一致',passed:fileEvidence(input).sha256===artifact.sha256});
  return { content: JSON.stringify(data, null, 2), data, status:checks.every(check=>check.passed)?'ok':'error', verification:{kind:'media',environment:verificationEnvironment(),artifacts:[artifact],checks,assertions:checks.length,decoded:false,scope:'ffprobe 元数据；仍需实际解码及抽帧核对内容与音画质量'} };
}

async function check(_args, ctx) {
  const [ffmpeg, ffprobe] = await Promise.all([
    runBinary('ffmpeg', ['-version'], ctx),
    runBinary('ffprobe', ['-version'], ctx),
  ]);
  const firstLine = (value) => value.stdout.split(/\r?\n/)[0];
  return { content: `${firstLine(ffmpeg)}\n${firstLine(ffprobe)}`, ffmpeg: firstLine(ffmpeg), ffprobe: firstLine(ffprobe) };
}

async function convert({ input, output, videoCodec, audioCodec, format }, ctx) {
  const src = inputPath(input), dst = outputPath(output || `output${extension(input, '.mp4')}`);
  const args = ['-y', '-i', src];
  if (videoCodec) args.push('-c:v', String(videoCodec));
  if (audioCodec) args.push('-c:a', String(audioCodec));
  if (format) args.push('-f', String(format));
  args.push(dst);
  await runBinary('ffmpeg', args, ctx);
  return { content: `已完成转码：${path.relative(process.cwd(), dst)}`, path: dst };
}

async function trim({ input, output, start = '0', duration, end }, ctx) {
  const src = inputPath(input), dst = outputPath(output || `trimmed${extension(input, '.mp4')}`);
  const args = ['-y', '-ss', String(start), '-i', src];
  if (duration != null && String(duration) !== '') args.push('-t', String(duration));
  else if (end != null && String(end) !== '') args.push('-to', String(end));
  args.push('-c', 'copy', dst);
  await runBinary('ffmpeg', args, ctx);
  return { content: `已完成裁剪：${path.relative(process.cwd(), dst)}`, path: dst };
}

async function concat({ inputs, output, reencode = false }, ctx) {
  if (!Array.isArray(inputs) || inputs.length < 2) throw new Error('拼接至少需要两个输入文件');
  const files = inputs.map(inputPath);
  const dst = outputPath(output || 'joined.mp4');
  const list = path.join(path.dirname(dst), `.ffmpeg-concat-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(list, files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  try {
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', list];
    args.push(...(reencode ? ['-c:v', 'libx264', '-c:a', 'aac'] : ['-c', 'copy']), dst);
    await runBinary('ffmpeg', args, ctx);
  } finally { fs.rmSync(list, { force: true }); }
  return { content: `已完成拼接：${path.relative(process.cwd(), dst)}`, path: dst };
}

async function extractAudio({ input, output, codec = 'mp3' }, ctx) {
  const src = inputPath(input), dst = outputPath(output || `audio.${String(codec).replace(/[^a-z0-9]/gi, '') || 'mp3'}`);
  await runBinary('ffmpeg', ['-y', '-i', src, '-vn', '-c:a', String(codec), dst], ctx);
  return { content: `已提取音频：${path.relative(process.cwd(), dst)}`, path: dst };
}

async function thumbnail({ input, output, time = '00:00:01' }, ctx) {
  const src = inputPath(input), dst = outputPath(output || 'thumbnail.jpg');
  await runBinary('ffmpeg', ['-y', '-ss', String(time), '-i', src, '-frames:v', '1', dst], ctx);
  return { content: `已生成缩略图：${path.relative(process.cwd(), dst)}`, path: dst };
}

export default function setup(ctx) {
  const common = { permission: 'L2', capability: 'workspace-write' };
  ctx.registerTool({ name: 'ffmpeg_check', description: '检测本机是否安装 ffmpeg 和 ffprobe。', permission: 'L0', parameters: { type: 'object', properties: {} }, run: check });
  ctx.registerTool({ name: 'ffmpeg_probe', description: '读取音视频格式、时长和流信息。', permission: 'L0', parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] }, run: probe });
  ctx.registerTool({ name: 'ffmpeg_convert', description: '转码或转换音视频格式。', ...common, parameters: { type: 'object', properties: { input: { type: 'string' }, output: { type: 'string' }, videoCodec: { type: 'string' }, audioCodec: { type: 'string' }, format: { type: 'string' } }, required: ['input', 'output'] }, run: convert });
  ctx.registerTool({ name: 'ffmpeg_trim', description: '按开始时间和时长或结束时间裁剪音视频。', ...common, parameters: { type: 'object', properties: { input: { type: 'string' }, output: { type: 'string' }, start: { type: 'string' }, duration: { type: 'string' }, end: { type: 'string' } }, required: ['input', 'output'] }, run: trim });
  ctx.registerTool({ name: 'ffmpeg_concat', description: '按顺序拼接多个媒体文件。', ...common, parameters: { type: 'object', properties: { inputs: { type: 'array', items: { type: 'string' } }, output: { type: 'string' }, reencode: { type: 'boolean' } }, required: ['inputs', 'output'] }, run: concat });
  ctx.registerTool({ name: 'ffmpeg_extract_audio', description: '从视频中提取音频。', ...common, parameters: { type: 'object', properties: { input: { type: 'string' }, output: { type: 'string' }, codec: { type: 'string' } }, required: ['input', 'output'] }, run: extractAudio });
  ctx.registerTool({ name: 'ffmpeg_thumbnail', description: '从视频指定时间生成一张缩略图。', ...common, parameters: { type: 'object', properties: { input: { type: 'string' }, output: { type: 'string' }, time: { type: 'string' } }, required: ['input', 'output'] }, run: thumbnail });
}
