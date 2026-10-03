const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function claimRuntime(dataRoot) {
  fs.mkdirSync(dataRoot, { recursive: true });
  const file = path.join(dataRoot, 'runtime-lock.json');
  const recordFile = path.join(dataRoot, 'runtime.json');
  const identity = { pid: process.pid, instance: crypto.randomUUID() };
  try { fs.writeFileSync(file, JSON.stringify(identity), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let previous;
    try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('另一个运行时正在启动，请稍后重试'); }
    if (alive(previous.pid)) throw new Error('此用户数据目录已由另一个运行时占用');
    fs.unlinkSync(file);
    fs.writeFileSync(file, JSON.stringify(identity), { flag: 'wx', mode: 0o600 });
  }
  function release() {
    for (const target of [recordFile, file]) {
      try {
        if (JSON.parse(fs.readFileSync(target, 'utf8')).instance === identity.instance) fs.unlinkSync(target);
      } catch {}
    }
  }
  process.once('exit', release);
  return {
    ...identity,
    publish(url) {
      const temporary = `${recordFile}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ ...identity, url }), { mode: 0o600 });
      fs.renameSync(temporary, recordFile);
    },
    release,
  };
}

module.exports = { claimRuntime, alive };
