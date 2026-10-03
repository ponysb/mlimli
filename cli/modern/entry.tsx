import path from 'node:path';
import { createCliRenderer, setRenderLibPath } from '@opentui/core';
import { render } from '@opentui/solid';
import { RuntimeClient } from '../client.mjs';
import { App } from './app';
import { TuiController } from './controller.mjs';
import { guardConsoleInput } from './windows';

process.env.OTUI_ASSET_ROOT = path.join(path.dirname(process.execPath), 'assets');
setRenderLibPath(path.join(process.env.OTUI_ASSET_ROOT, `@opentui/core-${process.platform}-${process.arch}`, { win32: 'opentui.dll', linux: 'libopentui.so', darwin: 'libopentui.dylib' }[process.platform]!));
if (process.argv.includes('--self-test')) {
  const { testRender } = await import('@opentui/solid');
  const controller = new TuiController({}, { cwd: 'self-test' });
  controller.connected = true;
  controller.session = { ...controller.session, id: 'self-test', parts: [{ id: 'code', kind: 'assistant', text: '```js\nconst verified = true;\n```', status: 'ok' }] };
  const test = await testRender(() => <App controller={controller} />, { width: 80, height: 24 });
  try {
    await test.waitForFrame(frame => frame.includes('const verified'));
    await new Promise(resolve => setTimeout(resolve, 200));
    await test.flush();
    console.log('OpenTUI native renderer ready; Markdown assets ready');
  } finally { controller.close(); test.renderer.destroy(); }
} else {
  const options = JSON.parse(process.env.MLI_TUI_OPTIONS || '{}');
  const client = new RuntimeClient(options.url);
  client.workspace = options.cwd;
  const restoreConsole = guardConsoleInput();
  const renderer = await createCliRenderer({ exitOnCtrlC: false, exitSignals: [], useMouse: true, targetFps: 30 }).catch(error => { restoreConsole(); throw error; });
  const controller = new TuiController(client, options);
  let exited = false;
  const exit = () => { if (exited) return; exited = true; controller.close(); renderer.destroy(); restoreConsole(); };
  controller.onExit = exit;
  process.once('SIGTERM', exit);
  await render(() => <App controller={controller} />, renderer);
  await controller.start().catch(error => controller.error(error));
}
