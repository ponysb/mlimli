import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { createIconLoader, iconCandidates, publicRequest, rasterType } from '../core/app-center-icons.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
test('website icons discover relative and CDN links, ignore private links, fall back to favicon and cache requests', async () => {
  const calls = [], url = 'https://example.com/work';
  const load = createIconLoader({ request: async target => {
    calls.push(target);
    if (target === url) return { data: Buffer.from('<link href="https://127.0.0.1/icon.png" rel="icon"><link rel="shortcut icon" href="/bad.svg"><link href="https://cdn.example/icon.png?a=1&amp;b=2" rel="apple-touch-icon">'), headers: { 'content-type': 'text/html' }, url };
    return { data: target.includes('bad.svg') ? Buffer.from('<svg onload="alert(1)"></svg>') : png, headers: {} };
  } });
  const [a, b] = await Promise.all([load(url), load(url)]);
  assert.equal(a.type, 'image/png'); assert.equal(a, b);
  assert.deepEqual(calls, [url, 'https://example.com/bad.svg', 'https://cdn.example/icon.png?a=1&b=2']);
  await load(url); assert.equal(calls.length, 3);
  const fallback = createIconLoader({ request: async target => { if (!target.endsWith('/favicon.ico')) throw new Error('no HTML'); return { data: png, headers: {} }; } });
  assert.equal((await fallback(url)).type, 'image/png');
  assert.deepEqual(iconCandidates('<link rel=icon href=/small.png>', url), ['https://example.com/small.png', 'https://example.com/favicon.ico']);
});
test('icon loading returns a fallback result for missing icons and rejects active content or local URLs', async () => {
  const load = createIconLoader({ request: async () => { throw new Error('not found'); } });
  assert.equal(await load('https://example.com'), null);
  await assert.rejects(load('https://localhost'));
  for (const data of ['<svg><script>alert(1)</script></svg>', '<html>login</html>', 'javascript:evil']) assert.equal(rasterType(Buffer.from(data)), null);
});
test('icon HTTP connections pin a validated DNS address and deny private resolution before connecting', async t => {
  let connected = false;
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(https, 'get', (_url, options, callback) => {
    connected = true; assert.equal(options.agent, false); assert.equal(options.autoSelectFamily, false);
    options.lookup('example.com', {}, (error, address) => { assert.equal(error, null); assert.equal(address, '93.184.216.34'); });
    const req = new EventEmitter(); req.destroy = error => { req.emit('error', error); req.emit('close'); };
    queueMicrotask(() => { const res = new EventEmitter(); res.statusCode = 200; res.headers = { 'content-type': 'image/png' }; callback(res); res.emit('data', png); res.emit('end'); req.emit('close'); });
    return req;
  });
  assert.equal((await publicRequest('https://example.com/icon.png')).data.length, png.length);
  connected = false; t.mock.method(dns, 'lookup', async () => [{ address: '127.0.0.1', family: 4 }]);
  await assert.rejects(publicRequest('https://example.com/icon.png'), /内网/); assert.equal(connected, false);
});
