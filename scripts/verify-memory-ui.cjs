// Run with: node node_modules/electron/cli.js scripts/verify-memory-ui.cjs
// Uses an isolated temporary runtime and a hidden browser; never changes the user's running workspace.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { startRuntime } = require('../electron/runtime.cjs');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-memory-ui-'));
let runtime, window;
const pause = () => new Promise(resolve => setTimeout(resolve, 40));
const evaluate = code => window.webContents.executeJavaScript(code);
async function until(code) { const end = Date.now() + 7000; while (Date.now() < end) { if (await evaluate(code)) return; await pause(); } throw new Error('UI timeout: ' + code); }
async function click(text, selector = 'button') {
  await until(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(e => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled)`);
  await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled).click()`);
}
async function fill(label, value) {
  await evaluate(`(() => { const e=document.querySelector('[aria-label=${JSON.stringify(label)}]'); const setter=Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', {bubbles:true})); })()`);
}
app.whenReady().then(async () => {
  const errors = [];
  try {
    runtime = startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory });
    const { url } = await runtime.ready;
    const request = async (route, body) => { const res = await fetch(url + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); assert.ok(res.ok); return res.json(); };
    window = new BrowserWindow({ width: 1440, height: 1050, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    window.webContents.on('console-message', (...args) => { const event = args[0]; if (event.level === 'error') errors.push(event.message); });
    await window.loadURL(url);
    await click('设置', '.sidebar-footer button'); await click('记忆', '[role=tab]');
    await until('Boolean(document.querySelector(".memory-settings"))');
    await click('新建记忆');
    await fill('记忆标题', '构建与验证方法'); await fill('记忆内容', '修改后运行 npm test 与 npm run check，确认通过后再交付。'); await fill('记忆标签', '验证, 构建');
    await click('保存'); await until('document.querySelector(".memory-notice")?.textContent.includes("记忆已保存")');
    assert.equal((await request('/api/memories')).items.length, 1);
    await fill('记忆内容', '先运行专项测试，再运行 npm test 和 npm run check。'); await click('保存');
    await until('document.querySelector(".memory-detail-meta")?.textContent.includes("v2")');
    await click('历史版本（1）'); await click('恢复', '.memory-versions button');
    await until('document.querySelector(".memory-detail-meta")?.textContent.includes("v3")');
    await click('停用'); await until('document.querySelector(".memory-detail-meta")?.textContent.includes("已停用")');
    await click('重新启用'); await until('document.querySelector(".memory-detail-meta")?.textContent.includes("已启用")');
    await evaluate('document.querySelector("[aria-label=使用记忆]").click()');
    await until('document.querySelector("[aria-label=使用记忆]")?.checked === false && !document.querySelector("[aria-label=使用记忆]").disabled');
    assert.equal((await request('/api/memory/settings')).settings.enabled, false);
    await window.reload();
    await click('设置', '.sidebar-footer button'); await click('记忆', '[role=tab]');
    await until('Boolean(document.querySelector("[aria-label=使用记忆]"))');
    assert.equal(await evaluate('document.querySelector("[aria-label=使用记忆]").checked'), false);
    await evaluate('document.querySelector("[aria-label=使用记忆]").click()');
    await until('document.querySelector("[aria-label=使用记忆]")?.checked && !document.querySelector("[aria-label=使用记忆]").disabled');
    await request('/api/memories', { scope: 'global', kind: 'preference', title: '回答偏好', content: '用中文沟通，先说明结果，再列关键证据。', evidence: '用户明确要求', pinned: true });
    const session = await request('/api/session', { title: '审核验证' });
    await request(`/api/session/${session.id}/mode`, { mode: 'auto-all' });
    await request('/api/memory/settings', { reviewBeforeSave: true });
    const pending = await request(`/api/session/${session.id}/dev-tool`, { tool: 'write_memory', args: { title: '排错经验', kind: 'lesson', content: 'Windows 临时目录清理失败时，使用有限次数的重试等待文件句柄释放。', evidence: '测试验证' } });
    assert.equal(pending.ok, true);
    await until('document.querySelectorAll(".memory-row").length === 3');
    await evaluate('Array.from(document.querySelectorAll(".memory-row")).find(e => e.textContent.includes("排错经验")).click()');
    await click('审核启用'); await until('document.querySelector(".memory-detail-meta")?.textContent.includes("已启用")');
    await evaluate('Array.from(document.querySelectorAll(".memory-row")).find(e => e.textContent.includes("构建与验证方法")).click()');
    await until('document.querySelector("[aria-label=记忆标题]")?.value === "构建与验证方法"');
    await new Promise(resolve => setTimeout(resolve, 500));
    fs.writeFileSync(path.join(root, 'docs/memory-ui-check.png'), (await window.webContents.capturePage()).toPNG());
    window.setSize(390, 844);
    await evaluate('document.querySelector(".mobile-nav-toggle").click()');
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow');
    fs.writeFileSync(path.join(root, 'docs/memory-ui-mobile-check.png'), (await window.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    console.log('Memory UI passed: create, edit, restore, archive, approve, settings persistence, desktop/mobile layout');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    window?.destroy();
    if (runtime?.child.exitCode === null) { const exited = once(runtime.child, 'exit'); runtime.child.kill(); await exited; }
    try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch (error) { console.error(error.message); }
    app.exit(process.exitCode || 0);
  }
});
