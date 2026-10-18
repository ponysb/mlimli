import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { copyTerminalDependencies } from './terminal-package.mjs';

export function createSandboxRepairBundle(destination, root) {
  const temporary = fs.mkdtempSync(path.join(path.dirname(destination), 'sandbox-backup-'));
  try {
    copyTerminalDependencies(temporary, root, { packages: ['@anthropic-ai/sandbox-runtime'] });
    const runtime = path.join(temporary, 'node_modules', '@anthropic-ai', 'sandbox-runtime');
    for (const file of ['dist/index.js', 'vendor/srt-win/x64/srt-win.exe', 'vendor/srt-win/arm64/srt-win.exe']) {
      if (!fs.existsSync(path.join(runtime, file))) throw new Error(`沙箱组件不完整，停止打包：${file}`);
    }
    const files = [];
    function visit(directory, relative = 'node_modules') {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const name = `${relative}/${entry.name}`;
        const source = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(source, name);
        else files.push({ path: name, data: fs.readFileSync(source).toString('base64') });
      }
    }
    visit(path.join(temporary, 'node_modules'));
    const archive = gzipSync(Buffer.from(JSON.stringify(files)));
    fs.writeFileSync(path.join(destination, 'sandbox-runtime-repair.gz'), archive);
    fs.writeFileSync(path.join(destination, 'core', 'sandbox-repair-manifest.json'), JSON.stringify({ sha256: crypto.createHash('sha256').update(archive).digest('hex') }));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
