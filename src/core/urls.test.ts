/**
 * URL knowledge, in plain Node.
 *
 * This is what the service worker uses to decide whether a tab is a problem
 * page, so it runs on every tab update in the browser. It had better be right
 * and it had better not need a DOM.
 */

import { describe, expect, it } from 'vitest';
import {
  PROBLEM_PAGE_PATTERNS,
  parseLeetCodePath,
  parseUrl,
  platformForUrl,
  slugWordsFromUrl,
} from './urls';

describe('parseUrl', () => {
  it('accepts http and https', () => {
    expect(parseUrl('https://leetcode.com/')?.hostname).toBe('leetcode.com');
    expect(parseUrl('http://leetcode.com/')?.hostname).toBe('leetcode.com');
  });

  it('refuses anything else, and anything unparseable', () => {
    expect(parseUrl('javascript:alert(1)')).toBeNull();
    expect(parseUrl('chrome://extensions')).toBeNull();
    expect(parseUrl('file:///tmp/x.html')).toBeNull();
    expect(parseUrl('not a url')).toBeNull();
    expect(parseUrl('')).toBeNull();
  });
});

describe('platformForUrl', () => {
  it.each([
    'https://leetcode.com/problems/two-sum/',
    'https://leetcode.com/problems/two-sum/description/',
    'https://leetcode.com/problems/two-sum/solutions/1234/title/',
    'https://leetcode.com/problems/two-sum/?envType=study-plan-v2',
    'https://www.leetcode.com/problems/two-sum/',
    'https://leetcode.com/contest/weekly-contest-400/problems/foo/',
  ])('recognises %s', (url) => {
    expect(platformForUrl(url)).toBe('leetcode');
  });

  it.each([
    'https://leetcode.com/',
    'https://leetcode.com/problems/',
    'https://leetcode.com/problemset/all/',
    'https://leetcode.com/contest/weekly-contest-400/',
    'https://leetcode.cn/problems/two-sum/',
    'https://example.com/problems/two-sum/',
    'chrome://extensions',
  ])('does not claim %s', (url) => {
    expect(platformForUrl(url)).toBeNull();
  });

  it('leaves the phase-6 platforms unclaimed for now', () => {
    expect(platformForUrl('https://codeforces.com/problemset/problem/1352/A')).toBeNull();
    expect(platformForUrl('https://www.codechef.com/problems/FLOW001')).toBeNull();
    expect(platformForUrl('https://www.geeksforgeeks.org/problems/x/1')).toBeNull();
  });
});

describe('parseLeetCodePath', () => {
  it('separates a contest problem from a practice one', () => {
    expect(parseLeetCodePath(new URL('https://leetcode.com/problems/two-sum/'))).toEqual({
      slug: 'two-sum',
      contest: null,
    });
    expect(
      parseLeetCodePath(new URL('https://leetcode.com/contest/weekly-contest-400/problems/foo/')),
    ).toEqual({ slug: 'foo', contest: 'weekly-contest-400' });
  });
});

describe('slugWordsFromUrl', () => {
  it('turns the problem slug into words', () => {
    expect(slugWordsFromUrl('https://leetcode.com/problems/sort-an-array/')).toBe('sort an array');
  });

  it('skips the sub-tab segment rather than reading it as the problem', () => {
    expect(slugWordsFromUrl('https://leetcode.com/problems/sort-an-array/description/')).toBe(
      'sort an array',
    );
    expect(slugWordsFromUrl('https://leetcode.com/problems/sort-an-array/submissions/')).toBe(
      'sort an array',
    );
  });

  it('skips a submission id', () => {
    expect(
      slugWordsFromUrl('https://leetcode.com/problems/sort-an-array/solutions/998877/'),
    ).toBe('sort an array');
  });

  it('reads a contest problem slug, not the contest', () => {
    expect(
      slugWordsFromUrl('https://leetcode.com/contest/weekly-contest-400/problems/max-achievable/'),
    ).toBe('max achievable');
  });

  it('decodes percent-encoding', () => {
    expect(slugWordsFromUrl('https://example.com/problems/a%20b')).toBe('a b');
  });

  it('has nothing to say about a bare origin', () => {
    expect(slugWordsFromUrl('https://leetcode.com/')).toBeNull();
    expect(slugWordsFromUrl('not a url')).toBeNull();
  });
});

describe('PROBLEM_PAGE_PATTERNS', () => {
  it('covers all four platforms and nothing wider', () => {
    expect(PROBLEM_PAGE_PATTERNS).toHaveLength(9);
    // The one thing that must never appear here (spec.md section 10).
    expect(PROBLEM_PAGE_PATTERNS.some((p) => p.includes('<all_urls>'))).toBe(false);
    expect(PROBLEM_PAGE_PATTERNS.every((p) => p.startsWith('https://'))).toBe(true);
  });

  it('is frozen, because the manifest and the menus both read it', () => {
    expect(Object.isFrozen(PROBLEM_PAGE_PATTERNS)).toBe(true);
  });
});
