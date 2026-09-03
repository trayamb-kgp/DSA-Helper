/**
 * The YouTube query and the ladder it descends (spec.md section 7.1, D016).
 *
 * The interesting cases are all failures: what the query looks like when the
 * adapter returned nothing, when the page has a useless title, and when the
 * user has emptied their own template.
 */

import { describe, expect, it } from 'vitest';
import type { ProblemContext } from './types';
import { DEFAULT_YOUTUBE_TEMPLATE } from './templates';
import { buildQuery, searchUrl, splitPageTitle, varsFromContext, varsFromTab } from './youtube';

const TEMPLATE = DEFAULT_YOUTUBE_TEMPLATE;

function context(overrides: Partial<ProblemContext> = {}): ProblemContext {
  return {
    platform: 'leetcode',
    platformLabel: 'LeetCode',
    url: 'https://leetcode.com/problems/sort-an-array/',
    slug: 'sort-an-array',
    number: '912',
    title: 'Sort an Array',
    difficulty: 'Medium',
    tags: ['Array'],
    statementMd: 'Given an array…',
    examplesMd: null,
    constraintsMd: null,
    language: 'C++',
    code: 'int main() {}',
    codeSource: 'editorApi',
    isContest: false,
    isLocked: false,
    extractedAt: 0,
    warnings: [],
    ...overrides,
  };
}

describe('the happy path', () => {
  it('renders the documented example', () => {
    const result = buildQuery(TEMPLATE, varsFromContext(context()), 'https://leetcode.com/');
    expect(result.query).toBe('LeetCode 912 Sort an Array solution');
    expect(result.rung).toBe('context');
  });

  it('collapses an empty variable rather than leaving a double space', () => {
    const result = buildQuery(
      TEMPLATE,
      varsFromContext(context({ number: null })),
      'https://leetcode.com/',
    );
    expect(result.query).toBe('LeetCode Sort an Array solution');
  });

  it('exposes every documented variable', () => {
    const vars = varsFromContext(context());
    expect(Object.keys(vars).sort()).toEqual([
      'difficulty',
      'language',
      'number',
      'platform',
      'slug',
      'title',
      'url',
    ]);
  });
});

describe('splitPageTitle', () => {
  it('strips the site suffix and lifts the leading number out', () => {
    expect(splitPageTitle('912. Sort an Array - LeetCode', 'LeetCode')).toEqual({
      number: '912',
      title: 'Sort an Array',
    });
  });

  it('handles a title with no number', () => {
    expect(splitPageTitle('Find the Maximum Achievable Number - LeetCode', 'LeetCode')).toEqual({
      number: '',
      title: 'Find the Maximum Achievable Number',
    });
  });

  it('leaves a title that never mentions the site alone', () => {
    expect(splitPageTitle('Some Problem', 'LeetCode')).toEqual({
      number: '',
      title: 'Some Problem',
    });
  });

  it('does not choke on a platform label with regex characters in it', () => {
    expect(splitPageTitle('Thing - C++ Judge', 'C++ Judge')).toEqual({
      number: '',
      title: 'Thing',
    });
  });

  it('treats an absent title as absent', () => {
    expect(splitPageTitle(null, 'LeetCode')).toEqual({ number: '', title: '' });
    expect(splitPageTitle('   ', 'LeetCode')).toEqual({ number: '', title: '' });
  });

  it('treats a title that is only the site name as a gap', () => {
    // What these SPAs show before the route resolves. Reporting it as a title
    // would send the user to a YouTube search for the word "LeetCode".
    expect(splitPageTitle('LeetCode', 'LeetCode')).toEqual({ number: '', title: '' });
    expect(splitPageTitle('  leetcode  ', 'LeetCode')).toEqual({ number: '', title: '' });
  });
});

describe('the degradation ladder (D016)', () => {
  it('rung 3 — no context, so the page title carries the query', () => {
    const vars = varsFromTab(
      'leetcode',
      '912. Sort an Array - LeetCode',
      'https://leetcode.com/problems/sort-an-array/description/',
    );
    const result = buildQuery(TEMPLATE, vars, 'https://leetcode.com/', 'pageTitle');

    expect(result.query).toBe('LeetCode 912 Sort an Array solution');
    expect(result.rung).toBe('pageTitle');
  });

  it('rung 4 — no usable title either, so the URL slug does', () => {
    const vars = varsFromTab(
      'leetcode',
      'LeetCode',
      'https://leetcode.com/problems/sort-an-array/',
    );
    const result = buildQuery(TEMPLATE, vars, 'https://leetcode.com/', 'pageTitle');
    expect(result.query).toBe('LeetCode sort an array solution');
  });

  it('recovers from a user template that renders to nothing', () => {
    const result = buildQuery(
      '{nonexistent_variable_removed_by_user}',
      varsFromContext(context()),
      'https://leetcode.com/problems/sort-an-array/',
    );
    // The placeholder survives verbatim because it names nothing, which is
    // still a useful search; what matters is that it is never empty.
    expect(result.query).not.toBe('');
  });

  it('falls back to the URL slug when the template is genuinely empty', () => {
    const result = buildQuery(
      '   ',
      varsFromContext(context()),
      'https://leetcode.com/problems/sort-an-array/',
    );
    expect(result.query).toBe('LeetCode 912 Sort an Array');
    expect(result.rung).toBe('pageTitle');
  });

  it('ends at the URL itself rather than at nothing', () => {
    const result = buildQuery(
      '',
      { platform: '', number: '', title: '', slug: '', difficulty: '', url: '', language: '' },
      'https://leetcode.com/',
    );
    expect(result.query).toBe('https://leetcode.com/');
    expect(result.rung).toBe('urlSlug');
  });

  it('never returns an empty query, whatever it is given', () => {
    for (const template of ['', '   ', '{}', '{unknown}']) {
      const result = buildQuery(template, varsFromContext(context()), 'https://leetcode.com/');
      expect(result.query.trim()).not.toBe('');
    }
  });
});

describe('searchUrl', () => {
  it('builds the documented search URL', () => {
    expect(searchUrl('LeetCode 912 Sort an Array solution')).toBe(
      'https://www.youtube.com/results?search_query=LeetCode+912+Sort+an+Array+solution',
    );
  });

  it('encodes characters that would otherwise break the query string', () => {
    const url = searchUrl('a&b=c #1 100% ?x');
    expect(url).toContain('search_query=');
    expect(url).not.toMatch(/[?&]b=/);
    expect(new URL(url).searchParams.get('search_query')).toBe('a&b=c #1 100% ?x');
  });

  it('round-trips a non-ASCII query', () => {
    const query = 'Задача 1352A решение';
    expect(new URL(searchUrl(query)).searchParams.get('search_query')).toBe(query);
  });
});
