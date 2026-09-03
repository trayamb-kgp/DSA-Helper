/**
 * Registry resolution over real URLs.
 *
 * Pure functions over a URL, so this file runs in plain Node with no DOM at
 * all -- which is the reason the registry was kept separate from anything that
 * touches a page.
 */

import { describe, expect, it } from 'vitest';
import { ADAPTERS, resolveAdapter } from './registry';
import { codechef } from './codechef';
import { codeforces } from './codeforces';
import { geeksforgeeks } from './geeksforgeeks';
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
  // Right hosts, wrong pages.
  'https://codeforces.com/',
  'https://codeforces.com/problemset',
  'https://codeforces.com/contest/1352',
  'https://www.codechef.com/',
  'https://www.codechef.com/ide',
  'https://www.geeksforgeeks.org/',
  // A GfG article, which is out of scope (spec.md section 3).
  'https://www.geeksforgeeks.org/binary-search-algorithm/',
  // Not ours at all.
  'https://example.com/problems/two-sum/',
];

/** One entry per platform, so a missing adapter shows up as a bad claim. */
const CLAIMED: ReadonlyArray<readonly [string, unknown]> = [
  ['https://codeforces.com/problemset/problem/1352/A', codeforces],
  ['https://codeforces.com/contest/1352/problem/A', codeforces],
  ['https://codeforces.com/gym/104123/problem/B', codeforces],
  ['https://codeforces.com/problemset/submit/1352/A', codeforces],
  ['https://www.codechef.com/problems/FLOW001', codechef],
  ['https://www.codechef.com/START100/problems/FLOW001', codechef],
  ['https://www.geeksforgeeks.org/problems/some-slug/1', geeksforgeeks],
  ['https://practice.geeksforgeeks.org/problems/some-slug/1', geeksforgeeks],
];

describe('resolveAdapter', () => {
  it.each(SUPPORTED)('claims %s', (url) => {
    expect(resolveAdapter(url)).toBe(leetcode);
  });

  it.each(UNSUPPORTED)('leaves %s unclaimed', (url) => {
    expect(resolveAdapter(url)).toBeNull();
  });

  it.each(CLAIMED)('gives %s to the right adapter', (url, adapter) => {
    expect(resolveAdapter(url as string)).toBe(adapter);
  });

  it('has an adapter for every platform (D001)', () => {
    expect(ADAPTERS.map((a) => a.platform).sort()).toEqual([
      'codechef',
      'codeforces',
      'geeksforgeeks',
      'leetcode',
    ]);
  });

  it('never lets two adapters claim the same URL', () => {
    for (const [url] of CLAIMED) {
      const claimants = ADAPTERS.filter((a) => a.matches(new URL(url as string)));
      expect(claimants).toHaveLength(1);
    }
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
