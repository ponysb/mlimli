import test from 'node:test';
import assert from 'node:assert/strict';
import { captureErrorMessage, requestUserMedia } from '../react/src/browser-recording.mjs';

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
