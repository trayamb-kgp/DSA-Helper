/**
 * @vitest-environment jsdom
 *
 * The LeetCode adapter, against saved fixtures.
 *
 * Three pages, three jobs: the practice fixture proves the embedded-JSON path,
 * the contest fixture proves the DOM fallback carries an extraction on its own,
 * and the Premium fixture proves a paywall reads as a condition rather than as
 * breakage (D027).
 */

import { describe, expect, it } from 'vitest';
import {
  fromSiteStorage,
  languageLabel,
  leetcode,
  parsePath,
  probeLanguage,
  splitStatement,
} from './leetcode';
import type { ExtractEnv } from './adapter';
import practiceHtml from './__fixtures__/leetcode-practice.html?raw';
import contestHtml from './__fixtures__/leetcode-contest.html?raw';
import premiumHtml from './__fixtures__/leetcode-premium.html?raw';

const FIXTURES: Readonly<Record<string, string>> = {
  'leetcode-practice': practiceHtml,
  'leetcode-contest': contestHtml,
  'leetcode-premium': premiumHtml,
};

/** A fresh, inert document per test -- no fixture can leak into the next one. */
function fixture(name: keyof typeof FIXTURES): Document {
  const html = FIXTURES[name];
  if (!html) throw new Error(`no fixture named ${String(name)}`);
  return new DOMParser().parseFromString(html, 'text/html');
}

function fakeStorage(entries: Record<string, string>): Storage {
  const keys = Object.keys(entries);
  return {
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => entries[k] ?? null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  } as unknown as Storage;
}

function envFor(doc: Document, url: string, overrides: Partial<ExtractEnv> = {}): ExtractEnv {
  return {
    url: new URL(url),
    doc,
    storage: null,
    warnings: [],
    diagnostics: [],
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

const PRACTICE_URL = 'https://leetcode.com/problems/sort-an-array/description/';
const CONTEST_URL =
  'https://leetcode.com/contest/weekly-contest-400/problems/find-the-maximum-achievable-number/';
const PREMIUM_URL = 'https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree-iii/';

describe('parsePath', () => {
  it('reads the slug out of every practice variant', () => {
    expect(parsePath(new URL(PRACTICE_URL))).toEqual({ slug: 'sort-an-array', contest: null });
  });

  it('reads both the contest and the slug out of a contest URL', () => {
    expect(parsePath(new URL(CONTEST_URL))).toEqual({
      slug: 'find-the-maximum-achievable-number',
      contest: 'weekly-contest-400',
    });
  });

  it('refuses a host that is not leetcode.com', () => {
    expect(parsePath(new URL('https://leetcode.cn/problems/two-sum/'))).toBeNull();
  });
});

describe('practice problem — embedded JSON path', () => {
  it('reads every metadata field from the question JSON', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL);
    const meta = await leetcode.extractMeta(env);

    expect(meta.slug).toBe('sort-an-array');
    expect(meta.number).toBe('912');
    expect(meta.title).toBe('Sort an Array');
    expect(meta.difficulty).toBe('Medium');
    // Three tags in the JSON, two in the DOM: proof the JSON path won.
    expect(meta.tags).toEqual(['Array', 'Divide and Conquer', 'Sorting']);
    expect(meta.isLocked).toBe(false);
    expect(env.diagnostics).toContain('meta: embedded question JSON');
  });

  it('leaves no gaps to warn about', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL);
    await leetcode.extractMeta(env);
    expect(env.warnings).toEqual([]);
  });

  it('splits the statement into its three prompt sections', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL);
    const meta = await leetcode.extractMeta(env);

    expect(meta.statementMd).toContain('ascending order');
    expect(meta.statementMd).not.toContain('Example 1');
    expect(meta.statementMd).not.toContain('Constraints');

    expect(meta.examplesMd).toContain('Example 1');
    expect(meta.examplesMd).toContain('Example 2');
    expect(meta.examplesMd).toContain('nums = [5,2,3,1]');
    expect(meta.examplesMd).not.toContain('Constraints');

    expect(meta.constraintsMd).toContain('nums.length');
    // The template supplies its own heading, so the source one is dropped.
    expect(meta.constraintsMd?.startsWith('Constraints')).toBe(false);
  });

  it('keeps the maths in the constraints intact (D026)', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL);
    const meta = await leetcode.extractMeta(env);

    // LeetCode writes every bound with <sup>. Losing the markup would turn
    // `5 * 10^4` into `5 * 104` -- a different constraint, in the one place a
    // review must not be wrong.
    expect(meta.constraintsMd).toContain('5 * 10^4');
    expect(meta.constraintsMd).not.toContain('5 * 104');
    // And nothing is escaped on the way through (D035).
    expect(meta.constraintsMd).not.toContain('\\_');
  });

  it('is ready to extract as soon as the description panel exists', () => {
    expect(leetcode.isReady(envFor(fixture('leetcode-practice'), PRACTICE_URL))).toBe(true);
  });
});

describe('contest problem — DOM fallback path', () => {
  it('extracts without any embedded JSON at all', async () => {
    const env = envFor(fixture('leetcode-contest'), CONTEST_URL);
    const meta = await leetcode.extractMeta(env);

    expect(meta.slug).toBe('find-the-maximum-achievable-number');
    expect(meta.title).toBe('Find the Maximum Achievable Number');
    expect(meta.difficulty).toBe('Easy');
    expect(meta.isLocked).toBe(false);
    expect(env.diagnostics).toContain('meta: DOM fallback');
  });

  it('still splits the statement it scraped', async () => {
    const env = envFor(fixture('leetcode-contest'), CONTEST_URL);
    const meta = await leetcode.extractMeta(env);

    expect(meta.statementMd).toContain('achievable');
    expect(meta.examplesMd).toContain('num = 4, t = 1');
    expect(meta.constraintsMd).toContain('1 <= num, t <= 50');
  });

  it('records the fallback selectors it had to reach for', async () => {
    const env = envFor(fixture('leetcode-contest'), CONTEST_URL);
    await leetcode.extractMeta(env);
    // An early warning that the preferred anchors have moved -- not a failure.
    expect(env.diagnostics.some((d) => d.startsWith('statement: matched fallback #'))).toBe(true);
    expect(env.diagnostics.some((d) => d.startsWith('title: matched fallback #'))).toBe(true);
  });

  it('has no frontend id to report and does not invent one', async () => {
    const env = envFor(fixture('leetcode-contest'), CONTEST_URL);
    const meta = await leetcode.extractMeta(env);
    expect(meta.number).toBeNull();
  });
});

describe('premium problem — locked, not broken (D027)', () => {
  it('names the locked state', async () => {
    const env = envFor(fixture('leetcode-premium'), PREMIUM_URL);
    const meta = await leetcode.extractMeta(env);
    expect(meta.isLocked).toBe(true);
  });

  it('still reports the metadata a locked page does show', async () => {
    const env = envFor(fixture('leetcode-premium'), PREMIUM_URL);
    const meta = await leetcode.extractMeta(env);

    expect(meta.number).toBe('1650');
    expect(meta.title).toBe('Lowest Common Ancestor of a Binary Tree III');
    expect(meta.difficulty).toBe('Medium');
    expect(meta.tags).toContain('Binary Tree');
  });

  it('reports no statement without calling it a failure', async () => {
    const env = envFor(fixture('leetcode-premium'), PREMIUM_URL);
    const meta = await leetcode.extractMeta(env);

    expect(meta.statementMd).toBeNull();
    expect(meta.examplesMd).toBeNull();
    expect(env.warnings).not.toContain("Couldn't read the statement");
  });

  it('does not wait out the backoff for a statement that will never come', () => {
    expect(leetcode.isReady(envFor(fixture('leetcode-premium'), PREMIUM_URL))).toBe(true);
  });

  it('does not fire on an ordinary problem page', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL);
    const meta = await leetcode.extractMeta(env);
    expect(meta.isLocked).toBe(false);
  });
});

describe('splitStatement', () => {
  it('returns a statement with no headings whole', () => {
    expect(splitStatement('Just a paragraph.')).toEqual({
      statementMd: 'Just a paragraph.',
      examplesMd: null,
      constraintsMd: null,
    });
  });

  it('handles a statement with constraints but no examples', () => {
    const result = splitStatement('Do the thing.\n\n**Constraints:**\n\n- `n <= 10`');
    expect(result.statementMd).toBe('Do the thing.');
    expect(result.examplesMd).toBeNull();
    expect(result.constraintsMd).toBe('- `n <= 10`');
  });

  it('leaves a follow-up inside the constraints rather than dropping it', () => {
    const result = splitStatement(
      '**Example 1:**\n\nin\n\n**Constraints:**\n\n- `n <= 10`\n\n**Follow up:** can you do it in O(1) space?',
    );
    expect(result.constraintsMd).toContain('Follow up');
  });

  it('leaves the statement intact when the headings arrive out of order', () => {
    const odd = '**Constraints:**\n\n- `n <= 10`\n\n**Example 1:**\n\nin';
    expect(splitStatement(odd).examplesMd).toBeNull();
  });

  it('treats nothing as nothing', () => {
    expect(splitStatement(null).statementMd).toBeNull();
    expect(splitStatement('   ').statementMd).toBeNull();
  });
});

describe('languageLabel', () => {
  it('normalises editor and storage tokens to one prompt label', () => {
    expect(languageLabel('cpp')).toBe('C++');
    expect(languageLabel('c_cpp')).toBe('C++');
    expect(languageLabel('ace/mode/python')).toBe('Python3');
    expect(languageLabel('golang')).toBe('Go');
    expect(languageLabel('CSHARP')).toBe('C#');
  });

  it('passes an unrecognised token through rather than losing it', () => {
    expect(languageLabel('brainfuck')).toBe('brainfuck');
    expect(languageLabel(null)).toBeNull();
    expect(languageLabel('  ')).toBeNull();
  });
});

describe('code layer 1 — site storage', () => {
  const doc = () => fixture('leetcode-practice');

  it('finds the buffer by probing, never by a hard-coded key', () => {
    const env = envFor(doc(), PRACTICE_URL, {
      storage: fakeStorage({
        'unrelated-key': 'nope',
        '912_sort-an-array_python3': 'class Solution:\n    pass',
      }),
    });
    const capture = fromSiteStorage(env, 'sort-an-array', '912');

    expect(capture.source).toBe('siteStorage');
    expect(capture.code).toContain('class Solution');
    expect(capture.language).toBe('Python3');
  });

  it('picks the buffer whose language is open in the editor (D025)', () => {
    const env = envFor(doc(), PRACTICE_URL, {
      storage: fakeStorage({
        global_lang: '"cpp"',
        '912_sort-an-array_python3': 'def f(): pass',
        '912_sort-an-array_cpp': 'int main() { return 0; }',
        '912_sort-an-array_java': 'class Main {}',
      }),
    });
    const capture = fromSiteStorage(env, 'sort-an-array', '912');

    expect(capture.code).toContain('int main');
    expect(capture.language).toBe('C++');
    expect(env.warnings).toEqual([]);
  });

  it('says so when it cannot tell which buffer is open', () => {
    const env = envFor(doc(), PRACTICE_URL, {
      storage: fakeStorage({
        '912_sort-an-array_python3': 'short',
        '912_sort-an-array_cpp': 'a much longer buffer than the other one',
      }),
    });
    const capture = fromSiteStorage(env, 'sort-an-array', '912');

    expect(capture.code).toBe('a much longer buffer than the other one');
    expect(env.warnings.join(' ')).toContain("Couldn't tell which language buffer is open");
  });

  it('unwraps a JSON-wrapped value and ignores a shape it does not understand', () => {
    const wrapped = envFor(doc(), PRACTICE_URL, {
      storage: fakeStorage({ 'sort-an-array-draft': '{"lang":"cpp","code":"int x;"}' }),
    });
    expect(fromSiteStorage(wrapped, 'sort-an-array', '912').code).toBe('int x;');

    const opaque = envFor(doc(), PRACTICE_URL, {
      storage: fakeStorage({ 'sort-an-array-meta': '{"lastViewed":1699999999}' }),
    });
    expect(fromSiteStorage(opaque, 'sort-an-array', '912').code).toBeNull();
  });

  it('prefers a slug match over a bare frontend-id match', () => {
    const env = envFor(doc(), PRACTICE_URL, {
      storage: fakeStorage({
        'cache_912_thing': 'from the id match',
        'sort-an-array_cpp': 'from the slug match',
      }),
    });
    expect(fromSiteStorage(env, 'sort-an-array', '912').code).toBe('from the slug match');
  });

  it('reports nothing rather than guessing when the page stores nothing', () => {
    const env = envFor(doc(), PRACTICE_URL, { storage: fakeStorage({ other: 'x' }) });
    expect(fromSiteStorage(env, 'sort-an-array', '912')).toEqual({
      code: null,
      language: null,
      source: 'none',
    });
  });
});

describe('probeLanguage', () => {
  it('recognises the open language whatever the key is called', () => {
    expect(probeLanguage(fakeStorage({ global_lang: '"cpp"' }))).toBe('cpp');
    expect(probeLanguage(fakeStorage({ 'daily-question-lang': 'python3' }))).toBe('python3');
  });

  it('ignores keys that merely mention a language', () => {
    expect(probeLanguage(fakeStorage({ lang_history: 'a list of things' }))).toBeNull();
    expect(probeLanguage(null)).toBeNull();
  });
});

describe('the code ladder', () => {
  it('prefers site storage to every layer below it', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL, {
      storage: fakeStorage({ '912_sort-an-array_cpp': 'from storage' }),
      readEditor: () =>
        Promise.resolve({ code: 'from the editor', language: 'cpp', editor: 'monaco', truncated: false }),
      selection: () => 'from the selection',
    });
    const capture = await leetcode.extractCode(env);
    expect(capture.source).toBe('siteStorage');
  });

  it('falls to the editor model when nothing is stored', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL, {
      readEditor: () =>
        Promise.resolve({ code: 'from the editor', language: 'cpp', editor: 'monaco', truncated: false }),
    });
    const capture = await leetcode.extractCode(env);

    expect(capture.source).toBe('editorApi');
    expect(capture.language).toBe('C++');
    expect(env.diagnostics).toContain('code: monaco model');
  });

  it('warns when the bridge had to truncate', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL, {
      readEditor: () =>
        Promise.resolve({ code: 'a very long buffer', language: null, editor: 'monaco', truncated: true }),
    });
    await leetcode.extractCode(env);
    expect(env.warnings.join(' ')).toContain('truncated');
  });

  it('falls to a DOM scrape, in visual order, and flags it as incomplete', async () => {
    const env = envFor(fixture('leetcode-practice'), PRACTICE_URL);
    const capture = await leetcode.extractCode(env);

    expect(capture.source).toBe('domScrape');
    // The fixture's .view-line elements are in the wrong document order on
    // purpose; a scrape that trusts DOM order produces nonsense here.
    expect(capture.code).toBe(
      'class Solution:\n    def sortArray(self, nums):\n        return sorted(nums)',
    );
    expect(env.warnings.join(' ')).toContain('only the visible lines were readable');
  });

  it('falls all the way to the user selection', async () => {
    const env = envFor(fixture('leetcode-premium'), PREMIUM_URL, {
      selection: () => 'int main() {}',
    });
    const capture = await leetcode.extractCode(env);

    expect(capture.source).toBe('selection');
    expect(capture.code).toBe('int main() {}');
  });

  it('reports no code as its own outcome, with a warning', async () => {
    const env = envFor(fixture('leetcode-premium'), PREMIUM_URL);
    const capture = await leetcode.extractCode(env);

    expect(capture).toEqual({ code: null, language: null, source: 'none' });
    expect(env.warnings.join(' ')).toContain("Couldn't read your code");
  });

  it('survives a bridge that rejects', async () => {
    const env = envFor(fixture('leetcode-premium'), PREMIUM_URL, {
      readEditor: () => Promise.reject(new Error('page is hostile')),
      selection: () => 'still works',
    });
    const capture = await leetcode.extractCode(env);
    expect(capture.code).toBe('still works');
  });
});
