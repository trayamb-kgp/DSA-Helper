/**
 * @vitest-environment jsdom
 *
 * The CodeChef adapter, against saved fixtures.
 *
 * The practice fixture ships the cached API response, so it proves the
 * embedded-JSON path — and specifically that the `body` field is used as the
 * markdown it already is, rather than run through a converter. The contest
 * fixture ships none, so the DOM fallback has to carry the whole extraction
 * from rendered HTML.
 */

import { describe, expect, it } from 'vitest';
import { codechef, parsePath } from './codechef';
import type { ExtractEnv } from './adapter';
import practiceHtml from './__fixtures__/codechef-practice.html?raw';
import contestHtml from './__fixtures__/codechef-contest.html?raw';

const PRACTICE_URL = 'https://www.codechef.com/problems/FLOW001';
const CONTEST_URL = 'https://www.codechef.com/START100/problems/SUBARR';

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

describe('parsePath', () => {
  it('reads a practice problem', () => {
    expect(parsePath(new URL(PRACTICE_URL))).toEqual({ code: 'FLOW001', contest: null });
  });

  it('reads a contest problem under its arbitrary first segment', () => {
    expect(parsePath(new URL(CONTEST_URL))).toEqual({ code: 'SUBARR', contest: 'START100' });
  });

  it('does not read /problems/CODE as a contest called "problems"', () => {
    // The practice form has to be tried first, or the contest pattern eats it.
    expect(parsePath(new URL(PRACTICE_URL))?.contest).toBeNull();
  });

  it('uppercases the code, since the URL accepts either case', () => {
    expect(parsePath(new URL('https://www.codechef.com/problems/flow001'))?.code).toBe('FLOW001');
  });

  it('refuses the site sections that look like contests', () => {
    expect(parsePath(new URL('https://www.codechef.com/ide'))).toBeNull();
    expect(parsePath(new URL('https://www.codechef.com/users/someone'))).toBeNull();
    expect(parsePath(new URL('https://www.codechef.com/'))).toBeNull();
  });

  it('collapses both forms to one identity (D024)', () => {
    expect(codechef.canonicalUrl(new URL(`${PRACTICE_URL}?tab=statement`))).toBe(PRACTICE_URL);
    expect(codechef.isContest(new URL(PRACTICE_URL))).toBe(false);
    expect(codechef.isContest(new URL(CONTEST_URL))).toBe(true);
  });
});

describe('practice problem — embedded JSON path', () => {
  it('reads its metadata from the cached API response', async () => {
    const env = envFor(practiceHtml, PRACTICE_URL);
    const meta = await codechef.extractMeta(env);

    expect(meta.slug).toBe('FLOW001');
    expect(meta.number).toBe('FLOW001');
    expect(meta.title).toBe('Add Two Numbers');
    expect(meta.difficulty).toBe('1000');
    // Three tags in the JSON, two in the DOM: proof the JSON path won.
    expect(meta.tags).toEqual(['basic-programming', 'implementation', 'beginner']);
    expect(env.diagnostics).toContain('meta: embedded problem JSON');
    expect(env.warnings).toEqual([]);
  });

  it('uses the body as the markdown it already is', async () => {
    const meta = await codechef.extractMeta(envFor(practiceHtml, PRACTICE_URL));

    // CodeChef authors in markdown and its API returns the source, so the
    // LaTeX in the constraints arrives untouched rather than re-derived from
    // rendered HTML.
    expect(meta.constraintsMd).toContain('$1 \\le T \\le 10^4$');
    expect(meta.constraintsMd).toContain('$-10^9 \\le A, B \\le 10^9$');
  });

  it('splits the statement on its headings', async () => {
    const meta = await codechef.extractMeta(envFor(practiceHtml, PRACTICE_URL));

    expect(meta.statementMd).toContain('two integers');
    expect(meta.statementMd).not.toContain('Example 1');
    expect(meta.examplesMd).toContain('Example 1');
    expect(meta.examplesMd).toContain('2 3');
    expect(meta.constraintsMd).not.toContain('Constraints');
  });

  it('is ready as soon as the statement container exists', () => {
    expect(codechef.isReady(envFor(practiceHtml, PRACTICE_URL))).toBe(true);
  });
});

describe('contest problem — DOM fallback path', () => {
  it('extracts with no cached response at all', async () => {
    const env = envFor(contestHtml, CONTEST_URL);
    const meta = await codechef.extractMeta(env);

    expect(meta.title).toBe('Chef and Subarrays');
    expect(meta.difficulty).toBe('2100');
    expect(env.diagnostics).toContain('meta: DOM fallback');
  });

  it('converts the rendered statement, keeping its exponents (D026)', async () => {
    const meta = await codechef.extractMeta(envFor(contestHtml, CONTEST_URL));

    expect(meta.statementMd).toContain('divisible');
    expect(meta.constraintsMd).toContain('10^5');
    expect(meta.constraintsMd).not.toContain('105');
  });

  it('records the fallback selectors it had to reach for', async () => {
    const env = envFor(contestHtml, CONTEST_URL);
    await codechef.extractMeta(env);
    // The hashed CSS-module class is a fallback, not a dependency.
    expect(env.diagnostics.some((d) => d.startsWith('statement: matched fallback #'))).toBe(true);
  });

  it('has no tags to report and does not invent any', async () => {
    const meta = await codechef.extractMeta(envFor(contestHtml, CONTEST_URL));
    expect(meta.tags).toEqual([]);
  });
});

describe('code capture', () => {
  it('scrapes the Ace editor when nothing better is available', async () => {
    const env = envFor(practiceHtml, PRACTICE_URL);
    const capture = await codechef.extractCode(env);

    expect(capture.source).toBe('domScrape');
    expect(capture.code).toContain('#include <iostream>');
    expect(env.warnings.join(' ')).toContain('only the visible lines were readable');
  });

  it('prefers a stored buffer to the visible lines', async () => {
    const env = envFor(practiceHtml, PRACTICE_URL, {
      storage: {
        length: 1,
        key: () => 'FLOW001_cpp',
        getItem: () => 'int main() { return 0; }',
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
      } as unknown as Storage,
    });
    const capture = await codechef.extractCode(env);

    expect(capture.source).toBe('siteStorage');
    expect(capture.language).toBe('C++');
  });
});
