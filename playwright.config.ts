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
 *
 * Two projects split the suite by filename (D047):
 *   - `e2e`  runs everything *except* `*.live.spec.ts` — hermetic, offline,
 *            deterministic. This is the gate; `npm run test:e2e` runs it.
 *   - `live` runs only `*.live.spec.ts` — the drift canaries that open real
 *            problem pages. Opt-in (`npm run test:e2e:live`), never a required
 *            check: a red run means "the site moved", not "the build broke".
 * The offline lane must never depend on the network, so the split is by file,
 * discoverable in this config, rather than an env flag hidden inside a spec.
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

  projects: [
    // Offline lane: every `*.spec.ts` that is not `*.live.spec.ts`.
    { name: 'e2e', testMatch: /(?<!\.live)\.spec\.ts$/ },
    // Live lane: only `*.live.spec.ts`. A moved site or a slow network is a
    // retry-then-look situation, not a build failure — hence its own budget.
    { name: 'live', testMatch: /\.live\.spec\.ts$/, retries: 2, timeout: 90_000 },
  ],
});
