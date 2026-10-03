require('../electron/compat.cjs').installCompatibility();
if (process.env.MLI_RUNTIME_MANAGED === '1') {
  try { globalThis.mliRuntimeHost = require('./runtime-host.cjs').claimRuntime(process.env.MLI_AGENT_DATA_DIR); }
  catch (error) { console.error(error.message); process.exit(1); }
}
import('../server.mjs').catch(error => { console.error(error); process.exitCode = 1; });
