import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRecording, captureErrorMessage, requestUserMedia } from '../react/src/browser-recording.mjs';

test('a camera stream arriving after startup timeout is stopped', async context => {
  let deliver, stopped = false;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise(resolve => { deliver = resolve; }) } } });
  context.after(() => { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; });
  await assert.rejects(requestUserMedia({ video: true }, 5), { name: 'MediaTimeoutError' });
  deliver({ getTracks: () => [{ stop: () => { stopped = true; } }] });
  await Promise.resolve();
  assert.equal(stopped, true);
});

test('cancellation is silent and unavailable camera and display sources have actionable messages', () => {
  assert.equal(captureErrorMessage({ name: 'AbortError' }, 'screen'), '');
  assert.match(captureErrorMessage({ name: 'NotFoundError' }, 'camera'), /摄像头/);
  assert.match(captureErrorMessage({ name: 'NotReadableError' }, 'camera'), /驱动/);
  assert.match(captureErrorMessage({ message: 'Invalid capture constraints' }, 'screen'), /刷新/);
});

function recordingHarness() {
  const events = new EventTarget();
  const chunks = [];
  const browser = new BrowserRecording({ mode: 'audio', onMedia: chunk => chunks.push(chunk) });
  let stops = 0, released = 0, closed = 0;
  browser.streams = [{ getTracks: () => [{ stop: () => { released++; } }] }];
  browser.context = { state: 'suspended', close: async () => { closed++; } };
  browser.recorder = {
    state: 'recording',
    addEventListener: (...args) => events.addEventListener(...args),
    removeEventListener: (...args) => events.removeEventListener(...args),
    stop: () => { stops++; browser.recorder.state = 'inactive'; },
  };
  browser.pausePcm = () => { throw new Error('suspended worklet must not be contacted'); };
  return { browser, chunks, counts: () => ({ stops, released, closed }), finish: () => { browser.onMedia('final chunk'); events.dispatchEvent(new Event('stop')); } };
}

test('stopping a suspended recorder is shared and waits for the final media chunk', async () => {
  const harness = recordingHarness();
  const first = harness.browser.stop();
  assert.equal(harness.browser.stop(), first);
  assert.equal(harness.counts().stops, 1);
  harness.finish();
  await first;
  assert.deepEqual(harness.chunks, ['final chunk']);
  assert.equal(harness.counts().closed, 1);
  assert.equal(harness.counts().released, 1);
});

test('interrupted capture releases devices immediately and bounds missing stop events', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const harness = recordingHarness();
  harness.browser.interrupted = true;
  const stopped = harness.browser.stop();
  assert.equal(harness.counts().released, 1);
  context.mock.timers.tick(3000);
  await stopped;
  assert.equal(harness.counts().closed, 1);
});

test('recorder stop failure still releases capture resources', async () => {
  const harness = recordingHarness();
  harness.browser.recorder.stop = () => { throw new Error('device lost'); };
  await assert.rejects(harness.browser.stop(), /device lost/);
  assert.equal(harness.counts().released, 1);
  assert.equal(harness.counts().closed, 1);
});

test('power events interrupt capture only once and remove their subscription', async context => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => {} } } });
  let listener, removed = 0, interrupted = 0, ended = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { desktop: {
    onSystemPowerChanged: callback => { listener = callback; return () => { removed++; }; },
  } } });
  context.after(() => { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else delete globalThis.window; });
  context.after(() => {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
  });
  const browser = new BrowserRecording({ mode: 'audio', recordMedia: false, onInterrupted: () => { interrupted++; }, onEnded: () => { ended++; } });
  browser.prepareAudio = async () => {};
  browser.context = { resume: async () => {}, close: async () => {} };
  browser.requestMedia = async () => ({ getTracks: () => [], getAudioTracks: () => [] });
  await browser.acquire();
  listener('suspend'); listener('resume');
  await browser.stop();
  assert.equal(interrupted, 1);
  assert.equal(ended, 0);
  assert.equal(removed, 1);
});
