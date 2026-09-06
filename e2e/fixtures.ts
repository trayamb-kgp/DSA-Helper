/**
 * The e2e harness: launch the built extension in a persistent Chromium context
 * and hand tests the extension id, its service worker, and a way to seed
 * storage (D047).
 *
 * Why a custom `context` fixture instead of Playwright's default browser: an
 * MV3 extension is only loaded when Chrome is started with `--load-extension`
 * against a *persistent* profile. The default headless shell cannot load one
 * either.
 *
 * Browser channel defaults to Microsoft Edge, because it is the Chromium that
 * actually loads an unpacked extension on this setup. Two other channels don't:
 *   - Google Chrome stable (137+) removed the `--load-extension` command-line
 *     switch as an anti-malware measure, so it launches but ignores us.
 *   - Playwright's bundled Chromium fails to start on this Windows box (a
 *     side-by-side/VC++ runtime mismatch).
 * Edge is Chromium and serves `chrome-extension://` pages identically, so for
 * exercising the extension's own surfaces it is a faithful target. Override
 * with `PW_CHANNEL` — e.g. `PW_CHANNEL=chromium` on CI, where the bundled build
 * runs and loads extensions in the new headless mode.
 *
 * Default is headed; `PW_HEADLESS=1` runs without a window. Each test gets a
 * fresh throwaway profile, so storage never bleeds between tests and every run
 * starts from stock defaults.
 */

/** Chromium channel to drive. Edge by default; override for CI or portability. */
const CHANNEL = process.env.PW_CHANNEL ?? 'msedge';

import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import type { ProblemContext } from '../src/core/types';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
/** The unpacked build Chrome loads. Kept in sync with the manifest, not source. */
export const DIST = path.resolve(ROOT, '..', 'dist');

function requireBuild(): void {
  if (!existsSync(path.join(DIST, 'manifest.json'))) {
    throw new Error(
      "e2e needs a build: dist/manifest.json is missing. Run `npm run build` first " +
        '(this layer reads what Chrome actually loads, like check:build).',
    );
  }
}

/** The page Chrome opens for `options_page`. */
export function optionsUrl(extensionId: string): string {
  return `chrome-extension://${extensionId}/src/options/index.html`;
}

/** The toolbar popup, addressed directly for rendering checks. */
export function popupUrl(extensionId: string): string {
  return `chrome-extension://${extensionId}/src/popup/index.html`;
}

interface SeedAreas {
  sync?: Record<string, unknown>;
  local?: Record<string, unknown>;
  session?: Record<string, unknown>;
}

/**
 * Write directly into the extension's storage from the service worker, so a
 * test can put the page into a known state (a last extraction for the
 * diagnostics panel, a non-default setting) without clicking through the UI.
 */
export async function seedStorage(worker: Worker, areas: SeedAreas): Promise<void> {
  await worker.evaluate(async (data: SeedAreas) => {
    if (data.sync) await chrome.storage.sync.set(data.sync);
    if (data.local) await chrome.storage.local.set(data.local);
    if (data.session) await chrome.storage.session.set(data.session);
  }, areas);
}

/**
 * What the live lane gets back from an extraction attempt: the same
 * `CONTEXT_RESULT` the popup would receive, or a shaped reason it could not.
 * `ok: false` distinguishes "no such tab / no adapter / the page threw" from a
 * real context, so a spec can skip on an outage instead of asserting on junk.
 */
export interface ExtractResult {
  ok: boolean;
  /** Present when `ok` is false: why extraction did not produce a context. */
  error?: string;
  context?: ProblemContext;
  diagnostics?: string[];
}

/**
 * Run the extension's own extraction against a *live* tab, exactly as the popup
 * does: find the open tab whose URL contains `urlPart`, send it EXTRACT_CONTEXT,
 * and return its CONTEXT_RESULT.
 *
 * This runs inside the service worker because a Playwright `Page` carries no
 * Chrome tab id, and only the extension can address a content script by tab.
 * A page no adapter claims replies `null` (not a failure) — reported here as
 * `ok: false` so the caller decides whether that is a skip or a bug.
 */
export async function extractContext(worker: Worker, urlPart: string): Promise<ExtractResult> {
  return worker.evaluate(async (part: string): Promise<ExtractResult> => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => typeof t.url === 'string' && t.url.includes(part));
    if (!tab || tab.id == null) return { ok: false, error: `no open tab matching "${part}"` };
    try {
      const reply = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTEXT' });
      if (!reply) return { ok: false, error: 'no adapter claimed the page (null reply)' };
      return { ok: true, context: reply.context, diagnostics: reply.diagnostics };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }, urlPart);
}

export const test = base.extend<{
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
}>({
  context: async ({}, use) => {
    requireBuild();
    const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'dsa-e2e-'));

    // Extensions do not load under Chrome's *old* headless mode, which is what
    // `headless: true` selects. So we never use it: keep `headless: false` and,
    // when a windowless run is asked for, switch on the *new* headless mode by
    // flag instead — it loads MV3 extensions like a headed browser does.
    const wantHeadless = process.env.PW_HEADLESS === '1';
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: CHANNEL,
      headless: false,
      args: [
        ...(wantHeadless ? ['--headless=new'] : []),
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
      ],
    });
    try {
      await use(context);
    } finally {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  serviceWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    // chrome-extension://<id>/... — the host is the id.
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
