// Published scores describe original checkpoints and their evaluation sets,
// not the accuracy of this application's quantized models on a user's meeting.
export const PREVIEW = 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30';
export const VAD = 'silero_vad.onnx';
export const SPEAKER = '3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx';
export const MODELS = [
  { id: 'paraformer', name: 'Paraformer 中文 INT8', directory: 'sherpa-onnx-paraformer-zh-int8-2025-10-07', engine: 'onnx', downloadMB: 229,
    languages: '普通话', purpose: '中文输入、低配置电脑，CPU 推理', configuration: '建议 4 GB 内存、双核 CPU；32 位 Windows 优先选此项', minRAM: 2,
    reference: '原版 Paraformer-zh：AISHELL-1 CER 1.95%；WenetSpeech meeting CER 6.97%（SenseVoice 论文同表）', source: 'https://arxiv.org/html/2407.04051v1' },
  { id: 'sensevoice', name: 'SenseVoice Small INT8', directory: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09', engine: 'onnx', downloadMB: 166,
    languages: '中文、粤语、英语、日语、韩语（5 种）', purpose: '多语种轻量方案、现有模型', configuration: '建议 8 GB 内存、四核 CPU', minRAM: 2,
    reference: '原版 Small：AISHELL-1 CER 2.96%；WenetSpeech meeting CER 7.44%（SenseVoice 论文）', source: 'https://arxiv.org/html/2407.04051v1' },
  { id: 'qwen06', name: 'Qwen3-ASR 0.6B INT8', directory: 'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25', engine: 'onnx', downloadMB: 879,
    languages: '30 种语言，22 类中文方言 / 口音（官方声明）', purpose: '多语言与复杂语音，体积、CPU 延迟高于轻量模型', configuration: '建议 16 GB 内存、四核以上 CPU；仅 64 位', minRAM: 8,
    reference: '原版 0.6B：WenetSpeech meeting 6.88%（Qwen 官方评测，不能与上述结果直接排名）', source: 'https://github.com/QwenLM/Qwen3-ASR' },
  { id: 'qwen17', name: 'Qwen3-ASR 1.7B', directory: 'qwen3-asr-1.7b', engine: 'transformers', downloadMB: 4703,
    languages: '30 种语言，22 类中文方言 / 口音（官方声明）', purpose: '精度优先；推荐独立显卡，CPU 转写可能跟不上录制', configuration: '建议 16 GB 内存 + NVIDIA 6 GB 显存，或 24 GB Apple Silicon；仅 64 位', minRAM: 12,
    reference: '原版 1.7B：WenetSpeech meeting 5.88%（与 Qwen 0.6B 同一官方评测）', source: 'https://github.com/QwenLM/Qwen3-ASR' },
];

export function modelById(id) {
  const model = MODELS.find(item => item.id === id);
  if (!model) throw new Error('未知语音模型');
  return model;
}
export function modelSupport(model, hardware) {
  if (!['win32', 'linux', 'darwin'].includes(hardware.platform) || !['x64', 'arm64', 'ia32'].includes(hardware.arch)) return '此平台没有可用的本地运行包';
  if (hardware.platform === 'win32' && Number(hardware.osRelease.split('.')[0]) < 10) return '本地推理需要 Windows 10 或更新版本；Windows 7 尚未验证';
  if (hardware.arch === 'ia32' && (hardware.platform !== 'win32' || !['paraformer', 'sensevoice'].includes(model.id))) return '此模型需要 64 位运行环境';
  if (hardware.platform === 'win32' && hardware.arch === 'arm64') return 'Windows ARM64 的运行环境尚未集成';
  return '';
}
export function recommendModel(hardware) {
  if (hardware.arch === 'ia32' || hardware.memoryGB < 8 || hardware.cores < 4) return { id: 'paraformer', reason: '优先降低内存占用和转写延迟，适合中文与低配置电脑' };
  if (hardware.memoryGB >= 16 && hardware.gpu?.memoryGB >= 6) return { id: 'qwen17', reason: '检测到至少 16 GB 内存和 6 GB NVIDIA 显存，可尝试精度档' };
  if (hardware.memoryGB >= 12 && hardware.cores >= 4) return { id: 'qwen06', reason: '内存和 CPU 可尝试 0.6B 多语言档；实时速度需以本机体验为准' };
  return { id: 'sensevoice', reason: '采用较轻的五语种模型，减少 CPU 与内存负担' };
}
