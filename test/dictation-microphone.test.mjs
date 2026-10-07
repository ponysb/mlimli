import assert from 'node:assert/strict';
import test from 'node:test';
import { DictationMicrophone } from '../react/src/dictation-microphone.mjs';

function fixture({ grant = 'granted', permission, acquire } = {}) {
  const devices = [], timers = new Set(), states = [];
  const pool = new DictationMicrophone({
    onState: state => states.push(state),
    permission: permission || (async () => ({ state: grant })),
    schedule: (run, delay) => { const timer = { run, delay }; timers.add(timer); return timer; },
    cancel: timer => timers.delete(timer),
    create: callbacks => {
      const device = { callbacks, commands: [], acquired: 0, stopped: false,
        prepareAudio: async () => {},
        acquire: async () => { device.acquired++; await acquire?.(); },
        start: async () => {},
        beginPcm: async () => { device.commands.push('begin'); },
        pausePcm: async () => { device.commands.push('pause'); callbacks.onPcm('tail'); },
        releaseMicrophone: () => { device.released = true; },
        cleanup: () => { device.stopped = true; },
      };
      devices.push(device); return device;
    },
  });
  return { pool, devices, timers, states };
}

test('audio preparation does not acquire a microphone and hover never requests a new grant', async () => {
  const { pool, devices } = fixture({ grant: 'prompt' });
  await pool.prepareAudio(); await pool.prewarm();
  assert.equal(devices.length, 1);
  assert.equal(devices[0].acquired, 0);
  pool.clear();
});

test('warm microphone preserves first PCM and tail, reuses the device, and excludes standby audio', async () => {
  const { pool, devices, timers } = fixture();
  await pool.prewarm();
  const staleTimer = [...timers][0];
  const firstAudio = [], secondAudio = [];
  devices[0].callbacks.onPcm('standby');
  const first = pool.take({ onPcm: data => firstAudio.push(data) });
  staleTimer.run(); assert.equal(devices[0].stopped, false, 'queued idle expiry cannot kill an active capture');
  devices[0].callbacks.onPcm('onset');
  await first.acquire(); await first.stop();
  devices[0].callbacks.onPcm('between recordings');
  const second = pool.take({ onPcm: data => secondAudio.push(data) });
  assert.equal(timers.size, 0, 'active capture has no idle eviction timer');
  await second.acquire(); devices[0].callbacks.onPcm('second onset'); await second.stop();
  assert.deepEqual(firstAudio, ['onset', 'tail']);
  assert.deepEqual(secondAudio, ['second onset', 'tail']);
  assert.equal(devices.length, 1); assert.equal(devices[0].acquired, 1);
  first.cleanup(); assert.equal(devices[0].stopped, false, 'old lease cannot close a reused device');
  const timer = [...timers][0]; assert.equal(timer.delay, 15000); timer.run();
  assert.equal(devices[0].released, true); assert.equal(devices[0].stopped, false);
  const audioTimer = [...timers].find(item => item !== timer);
  assert.equal(audioTimer.delay, 600000); audioTimer.run();
  assert.equal(devices[0].stopped, true); assert.equal(pool.entry, null);
});

test('cancelled preparation cannot reopen the microphone after focus loss', async () => {
  let resolvePermission;
  const { pool, devices } = fixture({ permission: () => new Promise(resolve => { resolvePermission = resolve; }) });
  const pending = pool.prewarm(); pool.clearIdle();
  resolvePermission({ state: 'granted' }); await pending;
  assert.equal(devices[0].acquired, 0); assert.equal(devices[0].stopped, true);
});

test('short-click cancellation and failed acquisition release devices and allow retry', async () => {
  let reject;
  const { pool, devices } = fixture({ acquire: () => new Promise((resolve, fail) => { reject = fail; }) });
  const lease = pool.take({ onPcm: () => {} });
  lease.cleanup(); reject(new Error('permission denied'));
  await assert.rejects(lease.acquire(), /permission denied/);
  assert.equal(pool.entry, null); assert.equal(devices[0].stopped, true);
  await pool.prepareAudio(); assert.equal(devices.length, 2); pool.clear();
});

test('ended devices are discarded rather than cached for the next recording', async () => {
  const { pool, devices } = fixture();
  const lease = pool.take({ onPcm: () => {}, onEnded: () => {} });
  await lease.acquire(); devices[0].callbacks.onEnded(); await lease.stop();
  assert.equal(pool.entry, null); assert.equal(devices[0].stopped, true);
});
