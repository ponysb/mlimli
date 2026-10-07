import fs from 'node:fs';
import path from 'node:path';
import { DATA_ROOT } from './paths.mjs';

const file = path.join(DATA_ROOT, 'ui-preferences.json');
export function uiPreferences() {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { defaultPermissionMode: saved.defaultPermissionMode === 'auto-all' ? 'auto-all' : 'default' };
  } catch { return { defaultPermissionMode: 'default' }; }
}
export function updateUiPreferences({ defaultPermissionMode }) {
  if (!['default', 'auto-all'].includes(defaultPermissionMode)) throw new Error('无效权限模式');
  const value = { defaultPermissionMode };
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value));
  fs.renameSync(file + '.tmp', file);
  return value;
}
