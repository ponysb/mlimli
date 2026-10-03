const os = require('node:os');
const path = require('node:path');

function userDataRoot({ platform = process.platform, env = process.env, home = os.homedir(), legacy = false } = {}) {
  if (env.MLI_AGENT_DATA_DIR) return path.resolve(env.MLI_AGENT_DATA_DIR);
  const name = legacy ? 'MoliCreationLegacy' : 'MoliCreation';
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), name);
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', name);
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), name);
}

module.exports = { userDataRoot };
