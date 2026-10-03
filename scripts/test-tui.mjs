import { spawn } from 'node:child_process';
import { bunExecutable } from './build-tui.mjs';
const child = spawn(bunExecutable(), ['test', '--preload', '@opentui/solid/preload', './test/tui'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, MLI_TEST_NODE: process.execPath } });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
