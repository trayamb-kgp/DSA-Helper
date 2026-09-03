/**
 * @vitest-environment jsdom
 *
 * The GeeksforGeeks adapter, against a saved fixture.
 *
 * The rule this file exists to protect: **hashed CSS-module classes are
 * matched by prefix, never exactly** (architecture.md §6.3). The fixture's
 * hashes are deliberately not the real ones, so an exact-match selector fails
 * here rather than silently, in a user's browser, the day after GfG deploys.
 */

import { describe, expect, it } from 'vitest';
import { SELECTORS, geeksforgeeks, parsePath } from './geeksforgeeks';
import type { ExtractEnv } from './adapter';
import practiceHtml from './__fixtures__/geeksforgeeks-practice.html?raw';

const SLUG = 'subarray-with-given-sum-1587115621';
const PRACTICE_URL = `https://www.geeksforgeeks.org/problems/${SLUG}/1`;

function envFor(html: string, url: string, overrides: Partial<ExtractEnv> = {}): ExtractEnv {
  return {
    url: new URL(url),
    doc: new DOMParser().parseFromString(html, 'text/html'),
    storage: null,
    warnings: [],
    diagnostics: [],
    now: () => 0,
    ...overrides,
  };
}

describe('hashed class names (architecture §6.3)', () => {
  it('never matches a CSS-module class exactly', () => {
    // A selector ending in a literal hash works until the next GfG deploy,
    // which is the worst kind of bug: it passes review and fails in the field.
    const moduleSelectors = Object.values(SELECTORS)
      .flat()
      .filter((selector) => selector.includes('problems_'));

    expect(moduleSelectors.length).toBeGreaterThan(0);
    for (const selector of moduleSelectors) {
      expect(selector).toMatch(/\[class[\^*]=/);
      // `.problems_problem_content__aB3xY` — an exact class — is the mistake.
      expect(selector).not.toMatch(/^\.problems_\w+__\w+$/);
    }
  });

  it('still matches the fixture, whose hashes are not the real ones', async () => {
    const meta = await geeksforgeeks.extractMeta(envFor(practiceHtml, PRACTICE_URL));
    expect(meta.statementMd).toContain('non-negative integers');
  });
});

describe('parsePath', () => {
  it('reads the slug on both hosts', () => {
    expect(parsePath(new URL(PRACTICE_URL))).toEqual({ slug: SLUG });
    expect(
      parsePath(new URL(`https://practice.geeksforgeeks.org/problems/${SLUG}/1`)),
    ).toEqual({ slug: SLUG });
  });

  it('refuses an article page', () => {
    // GfG articles share the domain and are out of scope for v1.
    expect(parsePath(new URL('https://www.geeksforgeeks.org/binary-search-algorithm/'))).toBeNull();
    expect(parsePath(new URL('https://www.geeksforgeeks.org/'))).toBeNull();
  });

  it('collapses the trailing page id, which is not part of the identity', () => {
    expect(geeksforgeeks.canonicalUrl(new URL(`https://www.geeksforgeeks.org/problems/${SLUG}`)))
      .toBe(`https://www.geeksforgeeks.org/problems/${SLUG}/1`);
    expect(geeksforgeeks.canonicalUrl(new URL(`${PRACTICE_URL}?page=2`))).toBe(
      `https://www.geeksforgeeks.org/problems/${SLUG}/1`,
    );
  });

  it('has no contest problems in scope', () => {
    expect(geeksforgeeks.isContest(new URL(PRACTICE_URL))).toBe(false);
  });
});

describe('metadata', () => {
  it('reads the title, difficulty and tags from the DOM', async () => {
    const env = envFor(practiceHtml, PRACTICE_URL);
    const meta = await geeksforgeeks.extractMeta(env);

    expect(meta.title).toBe('Subarray with given sum');
    expect(meta.difficulty).toBe('Easy');
    expect(meta.tags).toEqual(['Hash', 'two-pointer-algorithm']);
    expect(env.warnings).toEqual([]);
  });

  it('reports no number, because GfG has none (D024)', async () => {
    const meta = await geeksforgeeks.extractMeta(envFor(practiceHtml, PRACTICE_URL));

    // The slug carries the identity here. Inventing a number from the URL's
    // trailing segment would make two problems look like one.
    expect(meta.number).toBeNull();
    expect(meta.slug).toBe(SLUG);
  });

  it('finds the difficulty word inside a header that says other things too', async () => {
    const meta = await geeksforgeeks.extractMeta(envFor(practiceHtml, PRACTICE_URL));
    // The chip reads "Difficulty: Easy" beside "Accuracy: 32.5%".
    expect(meta.difficulty).toBe('Easy');
  });

  it('splits the statement and keeps its exponents and indices (D026)', async () => {
    const meta = await geeksforgeeks.extractMeta(envFor(practiceHtml, PRACTICE_URL));

    expect(meta.statementMd).toContain('continuous subarray');
    expect(meta.statementMd).not.toContain('Example 1');
    expect(meta.examplesMd).toContain('N = 5, S = 12');
    expect(meta.constraintsMd).toContain('10^5');
    expect(meta.constraintsMd).toContain('A_i');
  });

  it('is ready as soon as the statement container exists', () => {
    expect(geeksforgeeks.isReady(envFor(practiceHtml, PRACTICE_URL))).toBe(true);
  });
});

describe('degrading', () => {
  it('falls back to the slug for a title when the page gives none', async () => {
    const env = envFor('<html><head><title>GeeksforGeeks</title></head><body></body></html>', PRACTICE_URL);
    const meta = await geeksforgeeks.extractMeta(env);

    // The slug is the identifier, so it is also the last thing left to make a
    // title out of — and GfG's numeric suffix is not part of the name.
    expect(meta.title).toBe('Subarray With Given Sum');
    expect(env.warnings.join(' ')).toContain("Couldn't read the statement");
  });

  it('records a total selector miss for the diagnostics panel', async () => {
    const env = envFor('<html><body></body></html>', PRACTICE_URL);
    await geeksforgeeks.extractMeta(env);
    expect(env.diagnostics).toContain('statement: no selector matched');
  });
});

describe('code capture', () => {
  it('scrapes the Ace editor', async () => {
    const env = envFor(practiceHtml, PRACTICE_URL);
    const capture = await geeksforgeeks.extractCode(env);

    expect(capture.source).toBe('domScrape');
    expect(capture.code).toContain('def subArraySum');
  });

  it('prefers the editor model to the visible lines', async () => {
    const env = envFor(practiceHtml, PRACTICE_URL, {
      readEditor: () =>
        Promise.resolve({
          code: 'the whole buffer',
          language: 'python',
          editor: 'ace',
          truncated: false,
        }),
    });
    const capture = await geeksforgeeks.extractCode(env);

    expect(capture.source).toBe('editorApi');
    expect(capture.language).toBe('Python3');
  });
});
