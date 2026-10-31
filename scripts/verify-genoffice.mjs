import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { probeSheetsNative } from './genoffice-native.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { assertGenOfficePackage } = createRequire(import.meta.url)('../electron/genoffice-package.cjs');
const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;
const report = assertGenOfficePackage(path.join(root, 'resources/genoffice'), { platform, arch });
if (platform === process.platform && arch === process.arch) probeSheetsNative(report.root);
console.log(`GenOffice ${platform}-${arch} 组件包完整：${Object.keys(report.status).join(', ')}`);
