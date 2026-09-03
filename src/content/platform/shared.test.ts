/**
 * @vitest-environment jsdom
 *
 * The pieces every adapter shares: the language table, the statement splitter
 * and the four-layer code ladder.
 *
 * These moved out of the LeetCode adapter in phase 6, when three more
 * platforms needed them. Phase 6's exit criterion is that no adapter imports
 * from another, so this file is where "common" is allowed to live -- and
 * testing it here rather than through one platform's fixtures is what keeps it
 * honest about being platform-neutral.
 */

import { describe, expect, it } from 'vitest';
import type { ExtractEnv } from './adapter';
import { fromSiteStorage, languageLabel, probeLanguage, splitStatement } from './shared';

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

function envWith(storage: Storage | null): ExtractEnv {
  return {
    url: new URL('https://leetcode.com/problems/sort-an-array/'),
    doc: document,
    storage,
    warnings: [],
    diagnostics: [],
  };
}

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
  it('finds the buffer by probing, never by a hard-coded key', () => {
    const env = envWith(
      fakeStorage({
        'unrelated-key': 'nope',
        '912_sort-an-array_python3': 'class Solution:\n    pass',
      }),
    );
    const capture = fromSiteStorage(env, 'sort-an-array', '912');

    expect(capture.source).toBe('siteStorage');
    expect(capture.code).toContain('class Solution');
    expect(capture.language).toBe('Python3');
  });

  it('picks the buffer whose language is open in the editor (D025)', () => {
    const env = envWith(
      fakeStorage({
        global_lang: '"cpp"',
        '912_sort-an-array_python3': 'def f(): pass',
        '912_sort-an-array_cpp': 'int main() { return 0; }',
        '912_sort-an-array_java': 'class Main {}',
      }),
    );
    const capture = fromSiteStorage(env, 'sort-an-array', '912');

    expect(capture.code).toContain('int main');
    expect(capture.language).toBe('C++');
    expect(env.warnings).toEqual([]);
  });

  it('says so when it cannot tell which buffer is open', () => {
    const env = envWith(
      fakeStorage({
        '912_sort-an-array_python3': 'short',
        '912_sort-an-array_cpp': 'a much longer buffer than the other one',
      }),
    );
    const capture = fromSiteStorage(env, 'sort-an-array', '912');

    expect(capture.code).toBe('a much longer buffer than the other one');
    expect(env.warnings.join(' ')).toContain("Couldn't tell which language buffer is open");
  });

  it('unwraps a JSON-wrapped value and ignores a shape it does not understand', () => {
    const wrapped = envWith(fakeStorage({ 'sort-an-array-draft': '{"lang":"cpp","code":"int x;"}' }));
    expect(fromSiteStorage(wrapped, 'sort-an-array', '912').code).toBe('int x;');

    const opaque = envWith(fakeStorage({ 'sort-an-array-meta': '{"lastViewed":1699999999}' }));
    expect(fromSiteStorage(opaque, 'sort-an-array', '912').code).toBeNull();
  });

  it('prefers a slug match over a bare frontend-id match', () => {
    const env = envWith(
      fakeStorage({
        'cache_912_thing': 'from the id match',
        'sort-an-array_cpp': 'from the slug match',
      }),
    );
    expect(fromSiteStorage(env, 'sort-an-array', '912').code).toBe('from the slug match');
  });

  it('reports nothing rather than guessing when the page stores nothing', () => {
    const env = envWith(fakeStorage({ other: 'x' }));
    expect(fromSiteStorage(env, 'sort-an-array', '912')).toEqual({
      code: null,
      language: null,
      source: 'none',
    });
  });

  it('has nothing to match on when the platform has no slug', () => {
    // Codeforces problem pages: no stored buffer, and an empty slug must not
    // turn every key in storage into a candidate.
    const env = envWith(fakeStorage({ anything: 'int main() {}' }));
    expect(fromSiteStorage(env, '', null).code).toBeNull();
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
