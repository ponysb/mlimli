import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { assertGenOfficePackage } = createRequire(import.meta.url)('../electron/genoffice-package.cjs');
const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;
const report = assertGenOfficePackage(path.join(root, 'resources/genoffice'), { platform, arch });
console.log(`GenOffice ${platform}-${arch} 组件包完整：${Object.keys(report.status).join(', ')}`);
