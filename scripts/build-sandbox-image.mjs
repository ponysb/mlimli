import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findExecutable } from '../core/sandbox.mjs';
const executable = findExecutable('docker');
if (!executable) { console.error('请安装并启动 Docker Desktop（Linux 容器）后重试。'); process.exit(1); }
const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sandbox');
const child = spawn(executable, ['--context', 'default', 'build', '--tag', 'mli-agent-sandbox:1', directory], { stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
