#!/usr/bin/env node
require('../electron/compat.cjs').installCompatibility();
import('./main.mjs').then(module => module.main()).catch(error => { console.error(error.message); process.exitCode = 1; });
