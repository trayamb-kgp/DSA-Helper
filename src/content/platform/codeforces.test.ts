/**
 * @vitest-environment jsdom
 *
 * The Codeforces adapter, against saved fixtures.
 *
 * Two fixtures, two jobs. The problemset one is maths- and figure-heavy,
 * because those are the two things D026 rules on. The contest one is in
 * Russian, because D026 also says statements pass through in whatever language
 * the page serves — and this adapter is the only place that rule can be
 * tested against a real statement.
 */

import { describe, expect, it } from 'vitest';
import { codeforces, isSubmitPage, parsePath } from './codeforces';
import type { ExtractEnv } from './adapter';
import problemsetHtml from './__fixtures__/codeforces-problemset.html?raw';
import contestHtml from './__fixtures__/codeforces-contest.html?raw';

const PROBLEMSET_URL = 'https://codeforces.com/problemset/problem/1352/A';
const CONTEST_URL = 'https://codeforces.com/contest/1352/problem/B';
const SUBMIT_URL = 'https://codeforces.com/problemset/submit/1352/A';

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
  it('reads all three problem forms', () => {
    expect(parsePath(new URL(PROBLEMSET_URL))).toEqual({
      contestId: '1352',
      index: 'A',
      kind: 'problemset',
    });
    expect(parsePath(new URL(CONTEST_URL))).toEqual({
      contestId: '1352',
      index: 'B',
      kind: 'contest',
    });
    expect(parsePath(new URL('https://codeforces.com/gym/104123/problem/B2'))).toEqual({
      contestId: '104123',
      index: 'B2',
      kind: 'gym',
    });
  });

  it('uppercases the index, since the URL accepts either case', () => {
    expect(parsePath(new URL('https://codeforces.com/contest/1352/problem/a'))?.index).toBe('A');
  });

  it('refuses a page that is not a problem', () => {
    expect(parsePath(new URL('https://codeforces.com/contest/1352'))).toBeNull();
    expect(parsePath(new URL('https://codeforces.com/problemset'))).toBeNull();
    expect(parsePath(new URL('https://example.com/contest/1/problem/A'))).toBeNull();
  });

  it('knows a submit page from a problem page', () => {
    expect(isSubmitPage(new URL(SUBMIT_URL))).toBe(true);
    expect(isSubmitPage(new URL(PROBLEMSET_URL))).toBe(false);
    expect(parsePath(new URL(SUBMIT_URL))).toBeNull();
  });
});

describe('identity (D024)', () => {
  it('collapses the two paths to one problem', () => {
    // The case D024 exists for: 1352A is reachable two ways and is one problem.
    const fromProblemset = codeforces.canonicalUrl(new URL(PROBLEMSET_URL));
    const fromContest = codeforces.canonicalUrl(
      new URL('https://codeforces.com/contest/1352/problem/A'),
    );
    expect(fromProblemset).toBe('https://codeforces.com/problemset/problem/1352/A');
    expect(fromContest).toBe('https://codeforces.com/contest/1352/problem/A');

    // The URLs differ, but the identity does not.
    expect(parsePath(new URL(fromProblemset))?.contestId).toBe(
      parsePath(new URL(fromContest))?.contestId,
    );
  });

  it('treats contest and gym as contest pages, problemset as practice', () => {
    expect(codeforces.isContest(new URL(PROBLEMSET_URL))).toBe(false);
    expect(codeforces.isContest(new URL(CONTEST_URL))).toBe(true);
    expect(codeforces.isContest(new URL('https://codeforces.com/gym/104123/problem/A'))).toBe(true);
  });
});

describe('a problemset problem', () => {
  it('reads the metadata off the server-rendered page', async () => {
    const env = envFor(problemsetHtml, PROBLEMSET_URL);
    const meta = await codeforces.extractMeta(env);

    expect(meta.slug).toBe('1352A');
    expect(meta.number).toBe('1352A');
    expect(meta.title).toBe('Sum of Round Numbers');
    expect(env.warnings).toEqual([]);
  });

  it('reads the rating as the difficulty, and keeps it out of the tags', () => {
    // Codeforces has no Easy/Medium/Hard; `*800` in the sidebar is the closest
    // equivalent, and it is not a topic.
    return codeforces.extractMeta(envFor(problemsetHtml, PROBLEMSET_URL)).then((meta) => {
      expect(meta.difficulty).toBe('800');
      expect(meta.tags).toEqual(['greedy', 'math']);
      expect(meta.tags).not.toContain('*800');
    });
  });

  it('splits on the structure Codeforces marks up, not on heading words', async () => {
    const meta = await codeforces.extractMeta(envFor(problemsetHtml, PROBLEMSET_URL));

    expect(meta.statementMd).toContain('round');
    expect(meta.statementMd).toContain('Input');
    expect(meta.examplesMd).toContain('5009');
    expect(meta.examplesMd).toContain('5000 9');
    // The limits are the constraints stated outside the prose.
    expect(meta.constraintsMd).toContain('1 second');
    expect(meta.constraintsMd).toContain('256 megabytes');
  });

  it('carries the LaTeX through verbatim (D026)', async () => {
    const meta = await codeforces.extractMeta(envFor(problemsetHtml, PROBLEMSET_URL));

    // Codeforces statements are dense with `$$$...$$$`, and the constraints
    // expressed in it are exactly what a review must not get wrong.
    expect(meta.statementMd).toContain('$$$1 \\le n \\le 10^4$$$');
    expect(meta.statementMd).toContain('$$$d00\\ldots0$$$');
    // Nothing escaped on the way through (D035).
    expect(meta.statementMd).not.toContain('\\_');
    expect(meta.statementMd).not.toContain('\\\\le');
  });

  it('names the figure rather than dropping it (D026)', async () => {
    const meta = await codeforces.extractMeta(envFor(problemsetHtml, PROBLEMSET_URL));

    expect(meta.statementMd).toContain('[Figure: A number split into its round summands');
    // The URL is not embedded: ChatGPT cannot fetch it, so a link reads as
    // breakage rather than as a figure.
    expect(meta.statementMd).not.toContain('/predownloaded/example.png');
  });

  it('is ready as soon as the statement exists', () => {
    expect(codeforces.isReady(envFor(problemsetHtml, PROBLEMSET_URL))).toBe(true);
  });
});

describe('a Russian contest problem (D026)', () => {
  it('passes the statement through untouched', async () => {
    const meta = await codeforces.extractMeta(envFor(contestHtml, CONTEST_URL));

    // No detection, no translation, no warning about the language.
    expect(meta.title).toBe('Совершенные числа');
    expect(meta.statementMd).toContain('Вам задано целое число');
    expect(meta.statementMd).toContain('Входные данные');
    expect(meta.examplesMd).toContain('YES');
    // The Cyrillic arrives byte-for-byte, not transliterated or escaped.
    expect(meta.statementMd).toContain('$$$a_1 + a_2 + \\ldots + a_k = n$$$');
  });

  it('adds no warning about the language', async () => {
    const env = envFor(contestHtml, CONTEST_URL);
    await codeforces.extractMeta(env);
    expect(env.warnings.join(' ')).not.toMatch(/language|translat/i);
  });

  it('still splits, even though the headings are not English', async () => {
    // The shared heading-based splitter would fail here; this adapter uses the
    // DOM structure instead, which has no language in it.
    const meta = await codeforces.extractMeta(envFor(contestHtml, CONTEST_URL));
    expect(meta.examplesMd).not.toBeNull();
    expect(meta.statementMd).not.toContain('YES\n4 2 4');
  });

  it('reports a missing rating as a gap, not a failure', async () => {
    const meta = await codeforces.extractMeta(envFor(contestHtml, CONTEST_URL));
    // Live contest problems have no rating yet. That is normal.
    expect(meta.difficulty).toBeNull();
    expect(meta.tags).toContain('math');
  });
});

describe('code capture', () => {
  it('comes back empty on a problem page, and says that is expected (D014)', async () => {
    const env = envFor(problemsetHtml, PROBLEMSET_URL);
    const capture = await codeforces.extractCode(env);

    expect(capture).toEqual({ code: null, language: null, source: 'none' });
    // Not a warning: there is no editor on a Codeforces problem page, so an
    // empty capture is correct behaviour rather than something to report.
    expect(env.warnings).toEqual([]);
    expect(env.diagnostics.join(' ')).toContain('this page has no editor');
  });

  it('still takes a user selection on a problem page', async () => {
    const env = envFor(problemsetHtml, PROBLEMSET_URL, {
      selection: () => 'int main() { return 0; }',
    });
    const capture = await codeforces.extractCode(env);

    expect(capture.source).toBe('selection');
    expect(env.warnings).toEqual([]);
  });

  it('warns on a submit page, where an editor was expected', async () => {
    const env = envFor('<html><body></body></html>', SUBMIT_URL);
    await codeforces.extractCode(env);
    expect(env.warnings.join(' ')).toContain("Couldn't read your code");
  });

  it('reads the editor through the bridge on a submit page', async () => {
    const env = envFor('<html><body></body></html>', SUBMIT_URL, {
      readEditor: () =>
        Promise.resolve({
          code: 'int main() {}',
          language: 'ace/mode/c_cpp',
          editor: 'ace',
          truncated: false,
        }),
    });
    const capture = await codeforces.extractCode(env);

    expect(capture.source).toBe('editorApi');
    expect(capture.language).toBe('C++');
  });
});

describe('a submit page carries no problem', () => {
  it('extracts nothing and complains about nothing', async () => {
    const env = envFor('<html><body></body></html>', SUBMIT_URL);
    const meta = await codeforces.extractMeta(env);

    expect(meta.title).toBe('');
    expect(meta.statementMd).toBeNull();
    // There is genuinely no statement on a submit page, so warning about one
    // would be reporting a failure that did not happen.
    expect(env.warnings).toEqual([]);
  });

  it('is ready immediately rather than waiting out the backoff', () => {
    expect(codeforces.isReady(envFor('<html><body></body></html>', SUBMIT_URL))).toBe(true);
  });
});
