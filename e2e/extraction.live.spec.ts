/**
 * Live extraction canaries — the drift detector the fixture suite structurally
 * cannot be (docs/TESTING.md §1.2, D047, docs/implementation-plan/implementation-plan-2.md).
 *
 * These open *real* problem pages in the built extension and run the extension's
 * own extraction against them (the exact call the popup makes), then assert the
 * problem number survives. The adapter unit tests assert the same thing against
 * *frozen* HTML fixtures, so they stay green while the live site changes shape —
 * textbook fixture rot. Only a test that touches the live page can catch that.
 *
 * This is the `live` Playwright project (`npm run test:e2e:live`), never the
 * offline gate. Rules that make it safe to have a network-dependent test at all:
 *
 *   - Run it HEADED. Extensions need a real window, and LeetCode sits behind a
 *     Cloudflare interstitial that a headless browser cannot clear. Running with
 *     `PW_HEADLESS=1` will be challenged; a challenged page never hydrates, and
 *     the loader below turns that into a `skip`, not a red run.
 *   - Unreachable ≠ broken. A page that never loads or never hydrates is skipped
 *     ("go look"), not failed. Only a page that DID load and whose extraction
 *     dropped the number is a real failure.
 *   - The LeetCode rows are `test.fail()` on purpose: they document a known bug
 *     (every LeetCode problem currently loses its number) *and* the requirement.
 *     When the extraction fix lands they will "unexpectedly pass" — that is the
 *     signal to delete the marker and let them stand as regression guards.
 */

import { test, expect, extractContext, type ExtractResult } from './fixtures';
import type { BrowserContext, Worker } from '@playwright/test';
import type { ProblemContext } from '../src/core/types';
import { buildQuery, varsFromContext } from '../src/core/youtube';
import { DEFAULT_YOUTUBE_TEMPLATE } from '../src/core/templates';

/** Tab titles the site shows while it is NOT the problem: the SPA shell or a bot check. */
const NOT_HYDRATED = ['', 'just a moment', 'attention required', 'checking your browser'];

/**
 * Open a problem page, wait for it to actually hydrate, and return the context
 * the extension extracts from it. Skips (never fails) when the page can't be
 * reached or never gets past its shell / a bot check — that is an outage or a
 * headless challenge, not an extraction regression.
 */
async function loadProblem(
  context: BrowserContext,
  worker: Worker,
  url: string,
  urlPart: string,
): Promise<ProblemContext> {
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (err) {
    test.skip(true, `could not reach ${url} (${String(err)}) — treated as an outage`);
  }

  // Poll until the tab shows a real problem title (past the shell / Cloudflare)
  // AND our extraction returns a context that carries a title. A non-empty title
  // is the proof the page really loaded, so anything asserted after this point
  // is a genuine signal rather than a screenshot of the challenge page.
  const deadline = Date.now() + 40_000;
  let last: ExtractResult = { ok: false, error: 'not attempted' };

  while (Date.now() < deadline) {
    const title = (await page.title()).trim().toLowerCase();
    const challenged = NOT_HYDRATED.some((t) => title === t || (t !== '' && title.includes(t)));

    if (!challenged) {
      last = await extractContext(worker, urlPart);
      if (last.ok && last.context && last.context.title.trim() !== '') {
        return last.context;
      }
    }
    await page.waitForTimeout(1_500);
  }

  const why = last.ok ? 'page loaded but never hydrated' : (last.error ?? 'unknown');
  test.skip(true, `${url} did not hydrate (${why}) — run headed / check the site`);
  throw new Error('unreachable: test.skip above stops the test'); // satisfies the return type
}

test.describe('Live extraction — problem number survives', () => {
  // Passing canary: Codeforces extraction is clean. This is also the full
  // happy path — number, title, and the YouTube query the user actually gets.
  test('Codeforces 1352A keeps its number', async ({ context, serviceWorker }) => {
    const ctx = await loadProblem(
      context,
      serviceWorker,
      'https://codeforces.com/problemset/problem/1352/A',
      '1352/A',
    );

    expect(ctx.number).toBe('1352A');
    expect(ctx.title.trim()).not.toBe('');

    // The downstream effect the user sees: the number must reach the query.
    const { query } = buildQuery(DEFAULT_YOUTUBE_TEMPLATE, varsFromContext(ctx), ctx.url);
    expect(query).toContain('1352A');
  });

  // Passing canary: CodeChef's number is correct (only its difficulty label is
  // wrong — a separate follow-up). Gives the canary set a third platform.
  test('CodeChef FLOW001 keeps its number', async ({ context, serviceWorker }) => {
    const ctx = await loadProblem(
      context,
      serviceWorker,
      'https://www.codechef.com/problems/FLOW001',
      'FLOW001',
    );

    expect(ctx.number).toBe('FLOW001');
    expect(ctx.title.trim()).not.toBe('');
  });

  // KNOWN BUG (test.fail): every LeetCode problem currently loses its number.
  // `looksLikeQuestion` latches onto a `titleSlug`-only page-state fragment that
  // has no `questionFrontendId`, so the number falls to document.title (which
  // carries none) and comes out null. See implementation-plan-2.md follow-up #1.
  // Remove `test.fail()` when the extraction fix lands and this starts passing.
  test('LeetCode two-sum keeps its number', async ({ context, serviceWorker }) => {
    test.fail();
    const ctx = await loadProblem(
      context,
      serviceWorker,
      'https://leetcode.com/problems/two-sum/',
      'two-sum',
    );

    expect(ctx.number).toBe('1');
  });

  // KNOWN BUG (test.fail): the exact URL shape the user reported —
  // `.../distinct-subsequences/description/` came out as a numberless YouTube
  // search. Same root cause as two-sum. See implementation-plan-2.md follow-up #1.
  test('LeetCode distinct-subsequences keeps its number', async ({ context, serviceWorker }) => {
    test.fail();
    const ctx = await loadProblem(
      context,
      serviceWorker,
      'https://leetcode.com/problems/distinct-subsequences/description/',
      'distinct-subsequences',
    );

    expect(ctx.number).toBe('115');
  });
});
