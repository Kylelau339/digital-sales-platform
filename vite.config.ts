import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function fixtureMedia(enabled: boolean): Plugin {
  return { name: 'generated-fixture-media', configureServer(server) {
    if (!enabled) return;
    server.middlewares.use('/assets/stock', (req, res, next) => {
      const filename = (req.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
      if (!/^tpl-[a-z]+\.jpg$/.test(filename) && !/^mock-[a-z]+\.svg$/.test(filename)) return next();
      res.setHeader('Content-Type', filename.endsWith('.svg') ? 'image/svg+xml' : 'image/svg+xml');
      const label = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#20252b"/><rect x="56" y="56" width="1088" height="563" fill="#c6f24e" opacity=".18"/><text x="600" y="350" fill="#f2f1ec" font-family="sans-serif" font-size="42" text-anchor="middle">${label}</text></svg>`);
    });
  } };
}
export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), 'USE_FIXTURES');
  const value = process.env.USE_FIXTURES ?? values.USE_FIXTURES ?? 'false';
  if (!['true', 'false'].includes(value)) throw new Error('USE_FIXTURES must be true or false.');
  const useFixtures = value === 'true';
  if (useFixtures && (!['development', 'test'].includes(mode) || process.env.NODE_ENV === 'production')) throw new Error('Fixtures are restricted to local development/test.');
  return {
    root: 'apps/web', publicDir: false, plugins: [react(), fixtureMedia(useFixtures)],
    server: { port: 5173, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } } },
    build: { outDir: '../../dist/web', emptyOutDir: true, manifest: true },
    define: { __USE_FIXTURES__: JSON.stringify(useFixtures) }
  };
});
