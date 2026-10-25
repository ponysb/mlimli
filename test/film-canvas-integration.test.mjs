import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('AI 影视画布从新标签页工具区打开，并复用当前会话发送与附件队列', () => {
  const app = read('../react/src/main.jsx');
  const browser = read('../react/src/BrowserWorkspace.jsx');
  assert.ok(browser.includes('<button onClick={onFilmCanvas}><Film size={20}/><span>AI 画布</span></button>'));
  assert.ok(app.includes("item.id === tab.id ? { ...item, kind: 'film-canvas', title: 'AI 画布', url: '' } : item"));
  assert.ok(app.includes("browserTabs.filter(tab => tab.kind !== 'film-canvas')"));
  assert.ok(app.includes('{terminalTabOpen &&'));
  assert.ok(!app.includes('filmCanvasOpen'));
  assert.match(app, /<FilmCanvas workspace=\{activeWorkspace\} current=\{current\} running=\{running\} entries=\{entries\} onSend=\{send\}/);
  assert.match(app, /const keepFilmCanvasOpen = direct && \(view === "film-canvas" \|\| view === "file"\)/);
  assert.match(app, /setView\(keepFilmCanvasOpen \? view : "task"\)/);
  assert.match(app, /const pending = direct \? extraAttachments : \[\.\.\.attachments, \.\.\.extraAttachments\]/);
  assert.match(app, /if \(!preserveScroll\) setView\("task"\)/);
});

test('AI 影视画布 exposes validated persistence, media preview and Agent editing tools', () => {
  const server = read('../server.mjs');
  const plugins = read('../core/plugins.mjs');
  const tools = read('../core/film-canvas-tools.mjs');
  assert.match(server, /pathname === '\/api\/film-canvas' && req\.method === 'GET'/);
  assert.match(server, /pathname === '\/api\/film-canvas' && req\.method === 'PUT'/);
  assert.match(server, /pathname === '\/api\/film-canvas\/media'/);
  assert.match(plugins, /for \(const tool of filmCanvasTools\)/);
  for (const name of ['film_canvas_read', 'film_canvas_add_node', 'film_canvas_update_node', 'film_canvas_connect']) assert.ok(tools.includes(name));
});
