import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({ plugins: [react()], root: 'react', define: { __MLI_LEGACY_WINDOWS__: JSON.stringify(mode === 'legacy') }, build: { outDir: mode === 'legacy' ? '../dist-legacy' : '../dist', emptyOutDir: true, ...(mode === 'legacy' ? { target: 'chrome108' } : {}) } }));
