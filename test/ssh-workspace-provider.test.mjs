import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCpuStat,
  parseLoadAverage,
  parseMemInfo,
  normalizeSshHostPath,
  mutateSshHostFile,
  listSshHostDirectory,
  readSshHostTextFile,
  writeSshHostTextFile,
  setHostFileSftpFactoryForTest,
  protectedRemotePath,
  safeRemoteRelativePath,
  validateGitRemoteUrl,
} from '../core/ssh-workspace-provider.mjs';
test('host-level absolute paths normalize safely and reject traversal or ambiguous forms', () => {
  assert.equal(normalizeSshHostPath('/etc/'), '/etc');
  assert.equal(normalizeSshHostPath('/'), '/');
  assert.throws(() => normalizeSshHostPath('/etc/../root'), /格式无效/);
  assert.throws(() => normalizeSshHostPath('/etc\\passwd'), /绝对 POSIX/);
  assert.throws(() => normalizeSshHostPath('relative/path'), /绝对 POSIX/);
});

test('host-level listing and editor respect no-symlink and size boundaries over SFTP', async () => {
  const files = new Map([['/', { type: 'directory' }], ['/etc', { type: 'directory' }], ['/etc/app.conf', { type: 'file', content: 'before' }], ['/etc/linked', { type: 'symlink', content: '' }]]);
  const attrs = node => ({ mode: node.type === 'directory' ? 0o040755 : node.type === 'symlink' ? 0o120777 : 0o100644, size: Buffer.byteLength(node.content ?? ''), mtime: 10, isDirectory: () => node.type === 'directory', isFile: () => node.type === 'file', isSymbolicLink: () => node.type === 'symlink' });
  const sftp = {
    lstat(target, callback) { const node = files.get(target); callback(node ? null : Object.assign(new Error('missing'), { code: 2 }), node ? attrs(node) : undefined); },
    readdir(target, callback) { callback(null, [...files].filter(([name]) => name.startsWith(`${target}/`) && !name.slice(target.length + 1).includes('/')).map(([name, node]) => ({ filename: name.slice(target.length + 1), attrs: attrs(node) }))); },
    readFile(target, callback) { callback(null, Buffer.from(files.get(target).content)); },
    writeFile(target, content, options, callback) { if (typeof options === 'function') callback = options; files.set(target, { type: 'file', mode: options.mode, content: Buffer.from(content).toString() }); callback(null); },
    ext_openssh_rename(from, to, callback) { const value = files.get(from); files.delete(from); files.set(to, value); callback(null); },
    mkdir(target, options, callback) { if (files.has(target)) return callback(new Error('exists')); files.set(target, { type: 'directory' }); callback(null); },
    rename(from, to, callback) { files.set(to, files.get(from)); files.delete(from); callback(null); },
    unlink(target, callback) { files.delete(target); callback(null); },
  };
  setHostFileSftpFactoryForTest(() => Promise.resolve(sftp));
  try {
    assert.deepEqual((await listSshHostDirectory('ssh-id', '/etc')).entries.map(entry => entry.name), ['app.conf']);
    assert.equal((await readSshHostTextFile('ssh-id', '/etc/app.conf')).content, 'before');
    await writeSshHostTextFile('ssh-id', '/etc/app.conf', 'after');
    assert.equal(files.get('/etc/app.conf').content, 'after');
    assert.equal(files.get('/etc/app.conf').mode, 0o644);
    await assert.rejects(mutateSshHostFile('ssh-id', { action: 'upload', path: '/etc/app.conf', content: '' }), /已存在/);
    await mutateSshHostFile('ssh-id', { action: 'mkdir', path: '/etc/folder' });
    assert.equal(files.get('/etc/folder').type, 'directory');
    await mutateSshHostFile('ssh-id', { action: 'upload', path: '/etc/new.txt', content: Buffer.from('hello').toString('base64') });
    assert.equal(files.get('/etc/new.txt').content, 'hello');
    await assert.rejects(mutateSshHostFile('ssh-id', { action: 'rename', path: '/etc/new.txt', name: '../escape' }), /有效/);
    await mutateSshHostFile('ssh-id', { action: 'rename', path: '/etc/new.txt', name: 'renamed.txt' });
    const trashed = await mutateSshHostFile('ssh-id', { action: 'trash', path: '/etc/renamed.txt' });
    assert.equal(files.has('/etc/renamed.txt'), false);
    await assert.rejects(mutateSshHostFile('ssh-id', { action: 'restore', path: trashed.path, destination: '/root/escape.txt' }), /原目录/);
    await mutateSshHostFile('ssh-id', { action: 'restore', path: trashed.path, destination: trashed.originalPath });
    assert.equal(files.get('/etc/renamed.txt').content, 'hello');
    await assert.rejects(mutateSshHostFile('ssh-id', { action: 'trash', path: '/' }), /根目录/);
    await assert.rejects(readSshHostTextFile('ssh-id', '/etc/linked'), /符号链接/);
    await assert.rejects(listSshHostDirectory('ssh-id', '/etc/../root'), /格式无效/);
  } finally { setHostFileSftpFactoryForTest(null); }
});

test('remote workspace paths reject traversal, absolute paths, and application or credential files', () => {
  assert.equal(safeRemoteRelativePath('src/main.mjs'), 'src/main.mjs');
  assert.equal(safeRemoteRelativePath(''), '');
  assert.throws(() => safeRemoteRelativePath('../outside'), /超出工作区/);
  assert.throws(() => safeRemoteRelativePath('/etc/passwd'), /相对 POSIX 路径/);
  assert.throws(() => safeRemoteRelativePath('src\\..\\outside'), /相对 POSIX 路径/);
  assert.equal(protectedRemotePath('.ssh/id_ed25519'), true);
  assert.equal(protectedRemotePath('.env.local'), true);
  assert.equal(protectedRemotePath('src/main.mjs'), false);
});

test('Linux metric parsers calculate CPU, memory, and load without inventing missing data', () => {
  const before = parseCpuStat('cpu  100 10 50 800 20 5 10 5 7 2\ncpu0 50 5 25 400 10 2 5 2');
  const after = parseCpuStat('cpu  130 12 62 880 26 6 13 6 9 2\ncpu0 65 6 31 440 13 3 6 3');
  assert.equal(before.cores, 1);
  assert.equal(Math.round(after.utilizationSince(before)), 36);
  assert.deepEqual(parseMemInfo('MemTotal: 1000 kB\nMemAvailable: 250 kB\n'), { totalBytes: 1024000, availableBytes: 256000, usedBytes: 768000, usedPercent: 75 });
  assert.deepEqual(parseLoadAverage('1.25 0.50 0.25 2/100 321'), { one: 1.25, five: 0.5, fifteen: 0.25, runnable: 2, processes: 100 });
  assert.equal(parseMemInfo('MemTotal: 10 kB\n'), null);
  assert.equal(parseCpuStat('not proc stat'), null);
});

test('Git remotes accept provider and self-hosted SSH/HTTPS URLs without embedded credentials', () => {
  for (const remote of [
    'https://github.com/org/repo.git',
    'https://gitlab.example:8443/group/repo.git',
    'https://gitee.com/org/repo.git',
    'ssh://git@code.example:2222/group/repo.git',
    'git@code.example:group/repo.git',
  ]) assert.equal(validateGitRemoteUrl(remote), remote);
  for (const remote of [
    'https://user:token@git.example/group/repo.git',
    'https://token@git.example/group/repo.git',
    'https://git.example/group/repo.git?token=secret',
    'file:///tmp/repo.git',
    'https://git.example/repo.git;touch /tmp/pwned',
    '-u',
  ]) assert.throws(() => validateGitRemoteUrl(remote), /Git 地址/);
});

 test('CPU samples accept tagged SSH output and exclude guest time counted by user time', () => {
  const before = parseCpuStat('MLI_CPU:cpu 100 0 0 100 0 0 0 0 20 0\nMLI_CPU:cpu0 1 0 0 1');
  const after = parseCpuStat('MLI_MEM:MemTotal: 1000 kB\nMLI_CPU:cpu 150 0 0 150 0 0 0 0 40 0\nMLI_CPU:cpu0 1 0 0 1');
  assert.equal(after.cores, 1);
  assert.equal(after.utilizationSince(before), 50);
  assert.equal(after.utilizationSince(after), null);
});
