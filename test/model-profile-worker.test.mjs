import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSessionView, disposeSessionReader } from '../core/session-view-service.mjs';

test('session worker initializes model profiles without a paths import cycle', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-worker-'));
  try {
    assert.equal(await readSessionView('missing-session', 'snapshot', {}, directory), null);
  } finally { await disposeSessionReader(); fs.rmSync(directory, { recursive: true, force: true }); }
});
