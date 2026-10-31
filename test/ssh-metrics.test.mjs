import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ssh2 from 'ssh2';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-metrics-'));
process.env.MLI_AGENT_DATA_DIR = directory;
const store = await import('../core/ssh-connection-store.mjs');
const runtime = await import('../core/ssh-runtime.mjs');
const provider = await import('../core/ssh-workspace-provider.mjs');
test('SSH metric command parses tagged CPU deltas and disk capacity without converting missing values to zero', async t => {
  const key = ssh2.utils.generateKeyPairSync('ed25519');
  let sample = 0, malformed = false; const commands = [];
  const server = new ssh2.Server({ hostKeys: [key.private] }, client => {
    client.on('error', () => {});
    client.on('authentication', auth => auth.method === 'password' ? auth.accept() : auth.reject(['password']));
    client.on('ready', () => client.on('session', accept => {
      const session = accept();
      session.on('exec', (accept, _reject, info) => {
        commands.push(info.command);
        const stream = accept(); sample++;
        stream.write(`MLI_CPU:cpu ${sample * 50} 0 0 ${sample * 50} 0 0 0 0 0 0\nMLI_CPU:cpu0 1 0 0 1\nMLI_MEM:MemTotal: 1000 kB\nMLI_MEM:MemAvailable: 250 kB\nMLI_LOAD:0.1 0.2 0.3 1/100 42\nMLI_UPTIME:300\n${malformed ? 'MLI_DISK:::\n' : 'MLI_DISK:10000:2000:8000:20%\n'}`);
        stream.exit(0); stream.end();
      });
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { runtime.shutdownSshRuntime(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  const c = store.saveSshConnection({ name: 'metrics', host: '127.0.0.1', port: server.address().port, username: 'tester', authMode: 'password' });
  const host = await runtime.inspectSshHost(c.id); store.confirmSshHostKey(c.id, host.fingerprint, host.fingerprint);
  await runtime.connectSsh(c.id, { password: 'test-only' });
  const m = await provider.readSshServerMetrics(c.id);
  assert.equal(m.cpu.utilizationPercent, 50); assert.equal(m.cpu.cores, 1);
  assert.equal(m.memory.usedPercent, 75); assert.equal(m.disk.usedPercent, 20);
  assert.equal(m.disk.totalBytes, 10240000); assert.equal(m.disk.path, '/');
  assert.ok(commands[0].includes("df -Pk '/'"));
  malformed = true;
  assert.equal((await provider.readSshServerMetrics(c.id)).disk, null);
});
