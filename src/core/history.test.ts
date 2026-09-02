import { describe, expect, it } from 'vitest';
import {
  applyLimit,
  contextKey,
  entryFromContext,
  problemKey,
  recordVisit,
  removeEntry,
} from './history';
import type { HistoryEntry } from './types';

const OPTS = { historyLimit: 20, historyPaused: false };

function entry(key: string, visitedAt = 1, url = `https://x.test/${key}`): HistoryEntry {
  return {
    problemKey: key,
    platform: 'leetcode',
    title: key,
    url,
    number: null,
    visitedAt,
  };
}

describe('problemKey — D024', () => {
  it('joins platform and identifier', () => {
    expect(problemKey('leetcode', 'sort-an-array')).toBe('leetcode:sort-an-array');
    expect(problemKey('codeforces', '1352A')).toBe('codeforces:1352a');
  });

  it('normalises case and surrounding space so one problem stays one key', () => {
    expect(problemKey('codechef', ' FLOW001 ')).toBe(problemKey('codechef', 'flow001'));
  });

  it('never crosses platforms', () => {
    expect(problemKey('leetcode', 'two-sum')).not.toBe(
      problemKey('geeksforgeeks', 'two-sum'),
    );
  });

  it('derives the same key from a context', () => {
    expect(contextKey({ platform: 'codeforces', slug: '1352A' })).toBe('codeforces:1352a');
  });
});

describe('recordVisit', () => {
  it('adds a first visit', () => {
    const out = recordVisit([], entry('a'), OPTS);
    expect(out.map((e) => e.problemKey)).toEqual(['a']);
  });

  it('puts the most recent visit at the top', () => {
    let h = recordVisit([], entry('a'), OPTS);
    h = recordVisit(h, entry('b'), OPTS);
    expect(h.map((e) => e.problemKey)).toEqual(['b', 'a']);
  });

  it('holds one entry per problem, never a duplicate', () => {
    let h = recordVisit([], entry('a'), OPTS);
    h = recordVisit(h, entry('b'), OPTS);
    h = recordVisit(h, entry('a', 2), OPTS);
    expect(h.map((e) => e.problemKey)).toEqual(['a', 'b']);
    expect(h).toHaveLength(2);
  });

  it('bumps a revisited problem to the top', () => {
    let h = recordVisit([], entry('a'), OPTS);
    h = recordVisit(h, entry('b'), OPTS);
    h = recordVisit(h, entry('c'), OPTS);
    h = recordVisit(h, entry('a', 9), OPTS);
    expect(h.map((e) => e.problemKey)).toEqual(['a', 'c', 'b']);
  });

  it('updates url and visitedAt on a revisit', () => {
    const first = recordVisit([], entry('a', 1, 'https://x.test/a/description'), OPTS);
    const second = recordVisit(first, entry('a', 99, 'https://x.test/a/submissions'), OPTS);
    expect(second[0]!.url).toBe('https://x.test/a/submissions');
    expect(second[0]!.visitedAt).toBe(99);
  });

  it('caps the list at historyLimit, dropping the oldest', () => {
    let h: HistoryEntry[] = [];
    for (const k of ['a', 'b', 'c', 'd']) h = recordVisit(h, entry(k), { ...OPTS, historyLimit: 3 });
    expect(h.map((e) => e.problemKey)).toEqual(['d', 'c', 'b']);
  });

  it('records nothing while paused, leaving existing entries untouched', () => {
    const existing = [entry('a'), entry('b')];
    const out = recordVisit(existing, entry('c'), { ...OPTS, historyPaused: true });
    expect(out).toEqual(existing);
  });

  it('treats a limit of 0 as history disabled', () => {
    const out = recordVisit([entry('a')], entry('b'), { ...OPTS, historyLimit: 0 });
    expect(out).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const existing = [entry('a')];
    const before = [...existing];
    recordVisit(existing, entry('b'), OPTS);
    expect(existing).toEqual(before);
  });
});

describe('entryFromContext', () => {
  it('carries identity, title, url and number', () => {
    const e = entryFromContext(
      {
        platform: 'leetcode',
        slug: 'sort-an-array',
        title: 'Sort an Array',
        url: 'https://leetcode.com/problems/sort-an-array',
        number: '912',
      },
      1234,
    );
    expect(e).toEqual({
      problemKey: 'leetcode:sort-an-array',
      platform: 'leetcode',
      title: 'Sort an Array',
      url: 'https://leetcode.com/problems/sort-an-array',
      number: '912',
      visitedAt: 1234,
    });
  });

  it('never carries a statement or code field', () => {
    const e = entryFromContext(
      { platform: 'leetcode', slug: 's', title: 't', url: 'u', number: null },
      0,
    ) as unknown as Record<string, unknown>;
    expect(e['statementMd']).toBeUndefined();
    expect(e['code']).toBeUndefined();
  });
});

describe('removeEntry and applyLimit', () => {
  it('removes one problem', () => {
    expect(removeEntry([entry('a'), entry('b')], 'a').map((e) => e.problemKey)).toEqual([
      'b',
    ]);
  });

  it('is a no-op for an unknown key', () => {
    expect(removeEntry([entry('a')], 'zzz')).toHaveLength(1);
  });

  it('re-applies a lowered limit', () => {
    expect(applyLimit([entry('a'), entry('b'), entry('c')], 2).map((e) => e.problemKey)).toEqual(
      ['a', 'b'],
    );
  });

  it('clears history when the limit drops to 0', () => {
    expect(applyLimit([entry('a')], 0)).toEqual([]);
  });
});
