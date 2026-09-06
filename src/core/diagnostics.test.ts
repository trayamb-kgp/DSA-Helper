/**
 * Diagnostics and the broken-page report (D031).
 *
 * The first block is the one that matters. A user pastes this blob into a
 * public issue tracker and will not read it first, so "never the statement
 * text and never the user's code" (architecture.md §10.4) has to be enforced
 * by something that fails loudly rather than by everyone remembering.
 */

import { describe, expect, it } from 'vitest';
import type { ProblemContext } from './types';
import { buildReport, chromeVersion, fieldReports, looksBroken, urlPattern } from './diagnostics';

/** Distinctive enough that a substring check cannot miss them. */
const SECRET_STATEMENT = 'ZZSTATEMENTZZ given an array of integers';
const SECRET_CODE = 'ZZCODEZZ class Solution { void secret() {} }';
const SECRET_EXAMPLES = 'ZZEXAMPLESZZ Input: [1,2,3]';
const SECRET_CONSTRAINTS = 'ZZCONSTRAINTSZZ 1 <= n <= 100';

function context(overrides: Partial<ProblemContext> = {}): ProblemContext {
  return {
    platform: 'leetcode',
    platformLabel: 'LeetCode',
    url: 'https://leetcode.com/problems/two-sum/',
    slug: 'two-sum',
    number: '1',
    title: 'Two Sum',
    difficulty: 'Easy',
    tags: ['Array', 'Hash Table'],
    statementMd: SECRET_STATEMENT,
    examplesMd: SECRET_EXAMPLES,
    constraintsMd: SECRET_CONSTRAINTS,
    language: 'C++',
    code: SECRET_CODE,
    codeSource: 'editorApi',
    isContest: false,
    isLocked: false,
    extractedAt: 1_700_000_000_000,
    warnings: [],
    ...overrides,
  };
}

const BASE = {
  diagnostics: ['meta: embedded question JSON', 'title: matched fallback #2 (.old)'],
  extensionVersion: '0.1.0',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  at: 1_700_000_000_000,
};

describe('the redaction rule (architecture §10.4)', () => {
  it('never emits the statement, the examples, the constraints or the code', () => {
    const report = buildReport({ ...BASE, context: context() });

    expect(report).not.toContain(SECRET_STATEMENT);
    expect(report).not.toContain(SECRET_CODE);
    expect(report).not.toContain(SECRET_EXAMPLES);
    expect(report).not.toContain(SECRET_CONSTRAINTS);
    // Not even a fragment: no truncation, no first line, no summary.
    expect(report).not.toContain('ZZ');
  });

  it('reports their sizes instead, which is what a maintainer needs', () => {
    const report = buildReport({ ...BASE, context: context() });

    expect(report).toContain(`${SECRET_STATEMENT.length} chars`);
    expect(report).toContain(`${SECRET_CODE.length} chars`);
  });

  it('keeps the query string out of the URL', () => {
    // Study-plan ids and whatever else a platform hangs off a link.
    const report = buildReport({
      ...BASE,
      context: context({
        url: 'https://leetcode.com/problems/two-sum/?envType=study-plan-v2&envId=top-100',
      }),
    });

    expect(report).not.toContain('envType');
    expect(report).not.toContain('top-100');
  });

  it('says plainly that nothing sensitive is in it', () => {
    // The user should be able to see for themselves, not take it on trust.
    expect(buildReport({ ...BASE, context: context() })).toContain(
      'No statement text and no code is included',
    );
  });
});

describe('urlPattern', () => {
  it('replaces the problem identifier with a placeholder', () => {
    expect(urlPattern('https://leetcode.com/problems/two-sum/', 'two-sum')).toBe(
      'https://leetcode.com/problems/<slug>/',
    );
  });

  it('replaces bare numbers, which are submission and page ids', () => {
    expect(
      urlPattern('https://www.geeksforgeeks.org/problems/some-slug/1', 'some-slug'),
    ).toBe('https://www.geeksforgeeks.org/problems/<slug>/<n>');
    expect(urlPattern('https://codeforces.com/problemset/problem/1352/A', null)).toBe(
      'https://codeforces.com/problemset/problem/<n>/A',
    );
  });

  it('drops the query and the hash', () => {
    expect(urlPattern('https://leetcode.com/problems/two-sum/?a=b#c', 'two-sum')).toBe(
      'https://leetcode.com/problems/<slug>/',
    );
  });

  it('does not throw on nonsense', () => {
    expect(urlPattern('not a url', null)).toBe('(unparseable)');
  });
});

describe('fieldReports', () => {
  it('accounts for every field of a full capture', () => {
    const reports = fieldReports(context());
    expect(reports.every((r) => r.status === 'ok')).toBe(true);
    expect(reports.map((r) => r.field)).toContain('codeSource');
  });

  it('separates a gap from an absence that is correct for the page', () => {
    // A Codeforces problem page has no editor and GfG has no number: reporting
    // either as a fault sends someone chasing a bug that is not there.
    const reports = fieldReports(context({ number: null, tags: [] }));
    const byField = Object.fromEntries(reports.map((r) => [r.field, r.status]));

    expect(byField['number']).toBe('expected');
    expect(byField['tags']).toBe('expected');
  });

  it('reports a locked statement as expected, not as missing (D027)', () => {
    const reports = fieldReports(
      context({ isLocked: true, statementMd: null, code: null, codeSource: 'none' }),
    );
    const byField = Object.fromEntries(reports.map((r) => [r.field, r.status]));

    expect(byField['statement']).toBe('expected');
    expect(byField['code']).toBe('expected');
  });

  it('reports a genuinely missing statement as missing', () => {
    const reports = fieldReports(context({ statementMd: null }));
    expect(reports.find((r) => r.field === 'statement')?.status).toBe('missing');
  });

  it('reports code stripped-for-storage as captured, not missing (D018)', () => {
    // The stored extraction drops the code text but keeps its source, so a
    // report on it must not read as "no solution was captured".
    const report = fieldReports(context({ code: null, codeSource: 'editorApi' })).find(
      (r) => r.field === 'code',
    );
    expect(report?.status).toBe('ok');
    expect(report?.detail).toContain('not stored');
  });
});

describe('buildReport', () => {
  it('carries the versions and the selector notes', () => {
    const report = buildReport({ ...BASE, context: context() });

    expect(report).toContain('Extension: 0.1.0');
    expect(report).toContain('Chrome: 141.0.0.0');
    expect(report).toContain('title: matched fallback #2 (.old)');
  });

  it('carries the warnings the user was shown', () => {
    const report = buildReport({
      ...BASE,
      context: context({ warnings: ["Couldn't read the difficulty"] }),
    });
    expect(report).toContain("Couldn't read the difficulty");
  });

  it('handles a page no adapter claimed', () => {
    const report = buildReport({
      ...BASE,
      context: null,
      unsupportedUrl: 'https://example.com/problems/x?token=secret',
    });

    expect(report).toContain('no adapter claimed this page');
    expect(report).not.toContain('secret');
  });
});

describe('chromeVersion', () => {
  it('finds the version, or admits it did not', () => {
    expect(chromeVersion(BASE.userAgent)).toBe('141.0.0.0');
    expect(chromeVersion('Mozilla/5.0 Firefox/1.0')).toBe('unknown');
  });
});

describe('looksBroken', () => {
  it('is quiet about one missing field, which is ordinary (D015)', () => {
    expect(looksBroken(context({ difficulty: null }))).toBe(false);
  });

  it('fires when most of the page failed at once, which is a redesign', () => {
    expect(
      looksBroken(
        context({
          title: '',
          difficulty: null,
          statementMd: null,
          examplesMd: null,
          constraintsMd: null,
          code: null,
          language: null,
        }),
      ),
    ).toBe(true);
  });

  it('never fires on a locked problem (D027)', () => {
    expect(
      looksBroken(
        context({
          isLocked: true,
          statementMd: null,
          examplesMd: null,
          constraintsMd: null,
          code: null,
          language: null,
          difficulty: null,
        }),
      ),
    ).toBe(false);
  });

  it('has nothing to say without a context', () => {
    expect(looksBroken(null)).toBe(false);
  });
});
