import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Some source archives lose executable mode bits on the bundled POSIX helper.
export function spawnPty(file, args, options) {
  if (process.platform !== 'win32') {
    const root = path.dirname(require.resolve('node-pty/package.json'));
    for (const directory of ['build/Release', 'build/Debug', `prebuilds/${process.platform}-${process.arch}`]) {
      const helper = path.join(root, directory, 'spawn-helper').replace('app.asar/', 'app.asar.unpacked/');
      if (!fs.existsSync(helper)) continue;
      const stat = fs.lstatSync(helper);
      if (!stat.isSymbolicLink() && stat.isFile() && !(stat.mode & 0o100)) fs.chmodSync(helper, stat.mode | 0o100);
    }
  }
  return require('node-pty').spawn(file, args, options);
}
