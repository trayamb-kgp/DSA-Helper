import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A tiny, standalone Vite app whose only job is to render the extension's real
// popup/options React components (with mocked chrome.* + fixture data) so we can
// screenshot them at exact Chrome Web Store dimensions. Deliberately does NOT
// use the crxjs plugin — this is a plain web page, not the extension.
export default defineConfig({
  root: 'shots',
  plugins: [react()],
  server: { port: 5174, strictPort: true },
});
