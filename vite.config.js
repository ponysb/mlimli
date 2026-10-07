import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

function whiteboardAssets() {
  const require = createRequire(import.meta.url);
  const fonts = path.join(path.dirname(require.resolve('@excalidraw/excalidraw')), 'fonts');
  return {
    name: 'local-whiteboard-fonts',
    configureServer(server) {
      server.middlewares.use('/whiteboard-assets/fonts/', (req, res, next) => {
        let name;
        try { name = decodeURIComponent((req.url || '').split('?')[0]); }
        catch { res.statusCode = 400; return res.end(); }
        const file = path.resolve(fonts, '.' + name);
        if (!file.startsWith(fonts + path.sep) || !file.endsWith('.woff2') || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'font/woff2');
        fs.createReadStream(file).on('error', () => { res.destroy(); }).pipe(res);
      });
    },
    generateBundle() {
      const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) visit(file);
          else if (entry.name.endsWith('.woff2')) this.emitFile({ type: 'asset', fileName: 'whiteboard-assets/fonts/' + path.relative(fonts, file).replaceAll(path.sep, '/'), source: fs.readFileSync(file) });
        }
      };
      visit(fonts);
    },
  };
}

export default defineConfig(({ mode }) => ({ base: './', plugins: [react(), whiteboardAssets()], root: 'react', define: { __MLI_LEGACY_WINDOWS__: JSON.stringify(mode === 'legacy') }, build: { outDir: mode === 'legacy' ? '../dist-legacy' : '../dist', emptyOutDir: true, rollupOptions: { input: { main: path.resolve('react/index.html'), document: path.resolve('react/document-renderer.html') } }, ...(mode === 'legacy' ? { target: 'chrome108' } : {}) } }));
