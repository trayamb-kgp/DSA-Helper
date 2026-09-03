/**
 * Registry resolution over real URLs.
 *
 * Pure functions over a URL, so this file runs in plain Node with no DOM at
 * all -- which is the reason the registry was kept separate from anything that
 * touches a page.
 */

import { describe, expect, it } from 'vitest';
import { resolveAdapter } from './registry';
import { leetcode } from './leetcode';

const SUPPORTED = [
  'https://leetcode.com/problems/two-sum/',
  'https://leetcode.com/problems/two-sum',
  'https://leetcode.com/problems/two-sum/description/',
  'https://leetcode.com/problems/two-sum/submissions/',
  'https://leetcode.com/problems/two-sum/editorial/',
  'https://leetcode.com/problems/two-sum/solutions/1234567/a-solution-title/',
  'https://leetcode.com/problems/two-sum/?envType=study-plan-v2&envId=top-100-liked',
  'https://leetcode.com/problems/two-sum/#comments',
  'https://www.leetcode.com/problems/two-sum/',
  'https://leetcode.com/contest/weekly-contest-400/problems/find-the-maximum-achievable-number/',
  'https://leetcode.com/contest/biweekly-contest-99/problems/some-slug/description/',
];

const UNSUPPORTED = [
  'https://leetcode.com/',
  'https://leetcode.com/problems/',
  'https://leetcode.com/problemset/all/',
  'https://leetcode.com/contest/weekly-contest-400/',
  'https://leetcode.com/discuss/interview-question/',
  // Out of scope for v1 (spec.md section 3).
  'https://leetcode.cn/problems/two-sum/',
  // Phase 6 platforms -- unclaimed until their adapters land.
  'https://codeforces.com/problemset/problem/1352/A',
  'https://www.codechef.com/problems/FLOW001',
  'https://www.geeksforgeeks.org/problems/some-slug/1',
  // Not ours at all.
  'https://example.com/problems/two-sum/',
];

describe('resolveAdapter', () => {
  it.each(SUPPORTED)('claims %s', (url) => {
    expect(resolveAdapter(url)).toBe(leetcode);
  });

  it.each(UNSUPPORTED)('leaves %s unclaimed', (url) => {
    expect(resolveAdapter(url)).toBeNull();
  });

  it('accepts a URL object as readily as a string', () => {
    expect(resolveAdapter(new URL('https://leetcode.com/problems/two-sum/'))).toBe(leetcode);
  });

  it('returns null rather than throwing on an unparseable URL', () => {
    expect(resolveAdapter('not a url')).toBeNull();
    expect(resolveAdapter('')).toBeNull();
  });

  it('ignores non-http schemes', () => {
    expect(resolveAdapter('javascript:alert(1)')).toBeNull();
    expect(resolveAdapter('file:///problems/two-sum/')).toBeNull();
  });
});

describe('leetcode identity (D024)', () => {
  const canonical = (url: string): string => leetcode.canonicalUrl(new URL(url));

  it('collapses every practice variant onto one URL', () => {
    const expected = 'https://leetcode.com/problems/two-sum/';
    expect(canonical('https://leetcode.com/problems/two-sum')).toBe(expected);
    expect(canonical('https://leetcode.com/problems/two-sum/description/')).toBe(expected);
    expect(canonical('https://leetcode.com/problems/two-sum/submissions/')).toBe(expected);
    expect(canonical('https://leetcode.com/problems/two-sum/?envType=study-plan-v2')).toBe(expected);
    expect(canonical('https://leetcode.com/problems/two-sum/#anchor')).toBe(expected);
  });

  it('keeps a contest problem inside its contest', () => {
    expect(canonical('https://leetcode.com/contest/weekly-contest-400/problems/foo/description/')).toBe(
      'https://leetcode.com/contest/weekly-contest-400/problems/foo/',
    );
  });

  it('knows a contest problem from a practice one', () => {
    expect(leetcode.isContest(new URL('https://leetcode.com/problems/two-sum/'))).toBe(false);
    expect(
      leetcode.isContest(new URL('https://leetcode.com/contest/weekly-contest-400/problems/foo/')),
    ).toBe(true);
  });
});
