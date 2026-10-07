import { speechStatus } from './runtime.mjs';

export default function setup(ctx) {
  ctx.registerTool({ name: 'local_speech_status', description: '查看本地语音插件的安装状态；开启、录音及下载由用户在会议录制界面操作。', permission: 'L0', parameters: { type: 'object', properties: {} }, run: async () => speechStatus() });
}
