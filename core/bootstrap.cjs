require('../electron/compat.cjs').installCompatibility();
import('../server.mjs').catch(error => { console.error(error); process.exitCode = 1; });
