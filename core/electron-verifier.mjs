import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);

// Packaged Electron ignores a script argument and enters its own main module.
// Dispatch only these fixed verifier entry points, before the desktop instance lock.
export function electronVerifierLaunch(kind, requestFile) {
  if (!['document', 'browser'].includes(kind)) throw new Error('未知验收组件');
  const executable = process.versions.electron ? process.execPath : require('electron');
  const args = process.env.MLI_CLIENT_PACKAGED === '1'
    ? [`--mli-verifier=${kind}`, `--mli-verifier-request=${requestFile}`]
    : [fileURLToPath(new URL(`./${kind}-verifier.cjs`, import.meta.url)), requestFile];
  return { executable, args };
}
