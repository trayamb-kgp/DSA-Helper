import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    // Minified and without sourcemaps: the bundle budget is < 500 KB
    // (docs/architecture.md section 7), and there is no reason to ship the
    // full source to every user. `vite dev` has sourcemaps regardless.
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
