import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests that drive the *built* extension in a real Chromium
 * (docs/TESTING.md §1.2, D047).
 *
 * There is no `projects`/browser here on purpose: an MV3 extension only loads
 * in a persistent context, so each test launches its own context with the
 * extension attached. That lives in `e2e/fixtures.ts`, which also refuses to
 * run when `dist/` is missing — this layer, like `check:build`, reads what
 * Chrome actually loads, so it needs a current `npm run build` first.
 *
 * Screenshots are captured as report attachments, not committed pixel
 * baselines: font rendering differs between machines, so a pixel diff would be
 * a cross-OS maintenance tax for no correctness signal. The assertions carry
 * the regression coverage; the images are for a human to eyeball (D047).
 */
export default defineConfig({
  testDir: './e2e',
  // Everything Playwright writes stays under one gitignored folder.
  outputDir: './e2e/output/test-results',

  // Persistent contexts + headed Chromium windows are calmer one at a time,
  // and the suite is small enough that serial costs nothing.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  timeout: 30_000,
  expect: { timeout: 7_000 },

  reporter: [['list'], ['html', { outputFolder: 'e2e/output/report', open: 'never' }]],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
