/**
 * @vitest-environment jsdom
 *
 * The guards and helpers every adapter is built from. These are the pieces
 * that decide whether a site redesign costs one field or the whole action
 * (D015), so they are tested harder than the adapters that use them.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildContext,
  field,
  noteFallback,
  optionalField,
  queryAll,
  queryFirst,
  waitFor,
  type CodeCapture,
  type ExtractEnv,
  type MetaFields,
  type PlatformAdapter,
} from './adapter';

function makeEnv(overrides: Partial<ExtractEnv> = {}): ExtractEnv {
  return {
    url: new URL('https://leetcode.com/problems/two-sum/'),
    doc: document,
    storage: null,
    warnings: [],
    diagnostics: [],
    ...overrides,
  };
}

describe('field', () => {
  it('returns the value and records nothing when extraction works', () => {
    const warnings: string[] = [];
    expect(field('the title', () => 'Two Sum', warnings)).toBe('Two Sum');
    expect(warnings).toEqual([]);
  });

  it('treats null, undefined and the empty string alike as a gap', () => {
    const warnings: string[] = [];
    expect(field('a', () => null, warnings)).toBeNull();
    expect(field('b', () => undefined, warnings)).toBeNull();
    expect(field('c', () => '', warnings)).toBeNull();
    expect(warnings).toEqual(["Couldn't read a", "Couldn't read b", "Couldn't read c"]);
  });

  it('swallows a throw into a warning rather than letting it out', () => {
    const warnings: string[] = [];
    expect(
      field(
        'the difficulty',
        () => {
          throw new Error('selector gone');
        },
        warnings,
      ),
    ).toBeNull();
    expect(warnings).toEqual(["Couldn't read the difficulty"]);
  });

  it('keeps 0 and false, which are values and not gaps', () => {
    const warnings: string[] = [];
    expect(field('n', () => 0, warnings)).toBe(0);
    expect(field('b', () => false, warnings)).toBe(false);
    expect(warnings).toEqual([]);
  });
});

describe('optionalField', () => {
  it('reports an absent value without a user-facing warning', () => {
    expect(optionalField(() => null)).toBeNull();
    expect(
      optionalField(() => {
        throw new Error('nope');
      }),
    ).toBeNull();
  });
});

describe('queryFirst / queryAll', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="fallback">second choice</div>
      <span class="item">a</span><span class="item">b</span>
    `;
  });

  it('reports which selector in the list actually hit', () => {
    const hit = queryFirst(document, ['.preferred', '.fallback']);
    expect(hit?.index).toBe(1);
    expect(hit?.selector).toBe('.fallback');
    expect(hit?.el.textContent).toBe('second choice');
  });

  it('returns null when nothing matches', () => {
    expect(queryFirst(document, ['.nope', '.also-nope'])).toBeNull();
  });

  it('skips a selector the browser will not parse instead of throwing', () => {
    const hit = queryFirst(document, ['[[[bad', '.fallback']);
    expect(hit?.selector).toBe('.fallback');
  });

  it('falls through selector lists until one yields elements', () => {
    expect(queryAll(document, ['.nothing', '.item'])).toHaveLength(2);
    expect(queryAll(document, ['.nothing'])).toEqual([]);
  });
});

describe('noteFallback', () => {
  it('stays quiet when the preferred selector hit', () => {
    const diagnostics: string[] = [];
    noteFallback(diagnostics, 'title', { el: document.body, selector: 'body', index: 0 });
    expect(diagnostics).toEqual([]);
  });

  it('records a fallback hit as an early warning of a redesign', () => {
    const diagnostics: string[] = [];
    noteFallback(diagnostics, 'title', { el: document.body, selector: '.old', index: 2 });
    expect(diagnostics).toEqual(['title: matched fallback #2 (.old)']);
  });

  it('records a total miss', () => {
    const diagnostics: string[] = [];
    noteFallback(diagnostics, 'statement', null);
    expect(diagnostics).toEqual(['statement: no selector matched']);
  });
});

describe('waitFor', () => {
  it('does not sleep at all when the page is already ready', async () => {
    const slept: number[] = [];
    const ok = await waitFor(() => true, [100, 300], async (ms) => {
      slept.push(ms);
    });
    expect(ok).toBe(true);
    expect(slept).toEqual([]);
  });

  it('retries on the given backoff until the check passes', async () => {
    const slept: number[] = [];
    let attempts = 0;
    const ok = await waitFor(
      () => {
        attempts += 1;
        return attempts > 2;
      },
      [100, 300, 700, 1500],
      async (ms) => {
        slept.push(ms);
      },
    );
    expect(ok).toBe(true);
    expect(slept).toEqual([100, 300]);
  });

  it('gives up after the last delay', async () => {
    const slept: number[] = [];
    const ok = await waitFor(() => false, [100, 300], async (ms) => {
      slept.push(ms);
    });
    expect(ok).toBe(false);
    expect(slept).toEqual([100, 300]);
  });
});

const EMPTY_META: MetaFields = {
  slug: 'two-sum',
  number: '1',
  title: 'Two Sum',
  difficulty: 'Easy',
  tags: ['Array'],
  statementMd: 'Given an array…',
  examplesMd: null,
  constraintsMd: null,
  isLocked: false,
};

function stubAdapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    platform: 'leetcode',
    platformLabel: 'LeetCode',
    matches: () => true,
    isContest: () => false,
    canonicalUrl: (url) => `${url.origin}${url.pathname}`,
    isReady: () => true,
    extractMeta: () => Promise.resolve(EMPTY_META),
    extractCode: (): Promise<CodeCapture> =>
      Promise.resolve({ code: 'print(1)', language: 'Python3', source: 'editorApi' }),
    ...overrides,
  };
}

describe('buildContext', () => {
  it('assembles a full context', async () => {
    const env = makeEnv({ now: () => 1_700_000_000_000 });
    const context = await buildContext(stubAdapter(), env);

    expect(context.platform).toBe('leetcode');
    expect(context.platformLabel).toBe('LeetCode');
    expect(context.url).toBe('https://leetcode.com/problems/two-sum/');
    expect(context.title).toBe('Two Sum');
    expect(context.codeSource).toBe('editorApi');
    expect(context.extractedAt).toBe(1_700_000_000_000);
    expect(context.warnings).toBe(env.warnings);
  });

  it('still produces a context when metadata extraction rejects outright', async () => {
    const env = makeEnv();
    const context = await buildContext(
      stubAdapter({ extractMeta: () => Promise.reject(new Error('boom')) }),
      env,
    );

    expect(context.warnings).toContain("Couldn't read the problem details");
    // Only the platform and the link are guaranteed (D015).
    expect(context.url).toBe('https://leetcode.com/problems/two-sum/');
    expect(context.title).toBe('https://leetcode.com/problems/two-sum/');
    expect(context.code).toBe('print(1)');
  });

  it('still produces a context when code extraction rejects outright', async () => {
    const env = makeEnv();
    const context = await buildContext(
      stubAdapter({ extractCode: () => Promise.reject(new Error('boom')) }),
      env,
    );

    expect(context.warnings).toContain("Couldn't read your code");
    expect(context.codeSource).toBe('none');
    expect(context.title).toBe('Two Sum');
  });

  it('degrades a missing title to the slug before the URL', async () => {
    const context = await buildContext(
      stubAdapter({ extractMeta: () => Promise.resolve({ ...EMPTY_META, title: '' }) }),
      makeEnv(),
    );
    expect(context.title).toBe('two-sum');
  });
});
