import fs from 'node:fs';
import path from 'node:path';
import { DATA_ROOT } from './paths.mjs';

const file = path.join(DATA_ROOT, 'ui-preferences.json');
export function uiPreferences() {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      defaultPermissionMode: saved.defaultPermissionMode === 'auto-all' ? 'auto-all' : 'default',
      // Desktop access is opt-out by default; preserve an explicit false.
      desktopEnabled: saved.desktopEnabled !== false,
    };
  } catch { return { defaultPermissionMode: 'default', desktopEnabled: true }; }
}
export function updateUiPreferences({ defaultPermissionMode, desktopEnabled } = {}) {
  const previous = uiPreferences();
  const mode = defaultPermissionMode ?? previous.defaultPermissionMode;
  const desktop = desktopEnabled ?? previous.desktopEnabled;
  if (!['default', 'auto-all'].includes(mode)) throw new Error('无效权限模式');
  const value = { defaultPermissionMode: mode, desktopEnabled: desktop === true };
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value));
  fs.renameSync(file + '.tmp', file);
  return value;
}
