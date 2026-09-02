import { defineConfig } from 'vitest/config';

/**
 * Deliberately separate from vite.config.ts: the CRXJS plugin has no business
 * running during unit tests. core/ is pure and tests in plain Node; adapter
 * tests opt into jsdom per-file with an @vitest-environment docblock.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
