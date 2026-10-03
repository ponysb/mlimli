import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { ROOT, stageTerminalClient, installNodeRuntime } from './terminal-package.mjs';
import { bundleCompatibility } from './package-win.mjs';
import { buildTui } from './build-tui.mjs';

export async function packageLinux(args = process.argv.slice(2)) {
  let arch = 'x64', directoryOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--arch') arch = args[++i];
    else if (args[i] === '--dir') directoryOnly = true;
    else throw new Error('用法：npm run dist:linux -- [--arch x64|arm64] [--dir]');
  }
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Linux 架构必须是 x64 或 arm64');
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'))).version;
  const name = `mli-${version}-linux-${arch}`;
  const cache = path.join(ROOT, 'node_modules', '.cache', 'mli-linux-packaging');
  fs.mkdirSync(cache, { recursive: true });
  const working = fs.mkdtempSync(path.join(cache, 'build-'));
  const stage = stageTerminalClient({ output: path.join(working, name), arch, platform: 'linux' });
  await bundleCompatibility({ appDirectory: stage.client, runtimeDirectory: stage.client });
  await buildTui({ platform: 'linux', arch, output: path.join(stage.client, 'cli', 'bin') });
  await installNodeRuntime(path.join(stage.destination, 'runtime'), { platform: 'linux', arch });
  if (directoryOnly) { console.log(stage.destination); return stage.destination; }
  const release = path.join(ROOT, 'release');
  fs.mkdirSync(release, { recursive: true });
  const file = path.join(release, `${name}.tar.gz`);
  await promisify(execFile)('tar', ['-czf', `${file}.tmp`, '-C', working, name]);
  fs.renameSync(`${file}.tmp`, file);
  fs.writeFileSync(`${file}.sha256`, `${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${path.basename(file)}\n`);
  console.log(file);
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) packageLinux().catch(error => { console.error(error.message); process.exitCode = 1; });
