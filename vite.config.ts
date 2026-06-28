import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The SPA is built to ./dist and served by the Cloudflare Worker (via the ASSETS
// binding) and by the Cloudflare Pages project. During local UI development the
// dev server proxies the API / WebSocket to a locally-running `wrangler dev`.
export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
