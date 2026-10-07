import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, stageWindowsClient, bundleCompatibility } from './package-win.mjs';
import { installNodeRuntime } from './terminal-package.mjs';
import { buildTui } from './build-tui.mjs';

export function macBuildConfig(stage, arch) {
  return {
    appId: 'com.molichuangzuo.app', productName: '魔力工作台',
    directories: { app: stage.appDirectory, output: path.join(ROOT, 'release') },
    files: ['package.json', 'electron/**/*', 'core/**/*'], asar: true, npmRebuild: false,
    electronVersion: stage.manifest.devDependencies.electron,
    extraResources: [
      { from: stage.runtimeDirectory, to: 'client', filter: ['**/*'] },
      { from: path.join(stage.destination, 'stage', 'node'), to: 'node', filter: ['**/*'] },
      { from: path.join(ROOT, 'cli', 'launchers', 'mli'), to: 'bin/mli' },
    ],
    mac: { target: ['pkg'], category: 'public.app-category.productivity', artifactName: `MoliCreation-\${version}-${arch}.\${ext}`,
      extendInfo: { NSMicrophoneUsageDescription: '用于语音输入与会议录音，在本机转写发言。', NSCameraUsageDescription: '用于用户开启的会议视频录制。', NSScreenCaptureUsageDescription: '用于用户选择的会议屏幕或窗口录制。' },
    },
    pkg: { installLocation: '/Applications', scripts: path.join(ROOT, 'electron', 'pkg-scripts') },
    afterPack: async context => {
      const resources = path.join(context.appOutDir, '魔力工作台.app', 'Contents', 'Resources');
      fs.chmodSync(path.join(resources, 'bin', 'mli'), 0o755);
      fs.chmodSync(path.join(resources, 'node', 'node'), 0o755);
      fs.chmodSync(path.join(resources, 'client', 'cli', 'bin', 'mli-tui'), 0o755);
    },
  };
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('macOS PKG 打包需要在 macOS 上运行');
  const args = process.argv.slice(2);
  let arch = process.arch;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--arch') arch = args[++index];
    else throw new Error('用法：npm run dist:mac -- [--arch x64|arm64]');
  }
  if (!['x64', 'arm64'].includes(arch)) throw new Error('macOS 架构必须是 x64 或 arm64');
  const cache = path.join(ROOT, 'node_modules', '.cache', 'mli-mac-packaging');
  fs.mkdirSync(cache, { recursive: true });
  const working = fs.mkdtempSync(path.join(cache, 'build-'));
  const { build: buildWeb } = await import('vite');
  await buildWeb({ configFile: path.join(ROOT, 'vite.config.js'), root: path.join(ROOT, 'react') });
  const stage = stageWindowsClient({ output: path.join(working, 'desktop') });
  await bundleCompatibility(stage);
  await buildTui({ platform: 'darwin', arch, output: path.join(stage.runtimeDirectory, 'cli', 'bin') });
  await installNodeRuntime(path.join(stage.destination, 'stage', 'node'), { platform: 'darwin', arch });
  fs.chmodSync(path.join(ROOT, 'electron', 'pkg-scripts', 'postinstall'), 0o755);
  const { build, Platform, Arch } = await import('electron-builder');
  const files = await build({ projectDir: stage.appDirectory, targets: Platform.MAC.createTarget(['pkg'], arch === 'arm64' ? Arch.arm64 : Arch.x64), config: macBuildConfig(stage, arch) });
  for (const file of files) console.log(file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
