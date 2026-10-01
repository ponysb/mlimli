import path from 'node:path';
import { fileURLToPath } from 'node:url';
import clientEnvironment from './client-env.cjs';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
clientEnvironment.loadClientEnvironment({
  runtimeRoot,
  dataRoot: process.env.MLI_AGENT_DATA_DIR || runtimeRoot,
  packaged: process.env.MLI_CLIENT_PACKAGED === '1',
});
