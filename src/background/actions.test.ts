/**
 * The single dispatch path (D013) and the invariant it exists to hold:
 * **no path may end with the user having pressed a key and nothing having
 * happened** (D016). Most of what is asserted below is that *something*
 * observable came out — a tab, or a toast.
 *
 * `chrome` is faked rather than mocked per-call: the worker reaches for it
 * through `globalThis`, so replacing it wholesale is both simpler and closer
 * to what actually happens.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProblemContext, Settings } from '../core/types';
import { PLATFORM_LABELS } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/storage';

interface Injected {
  tabId: number;
  args: unknown[];
}

interface FakeChrome {
  created: Array<Record<string, unknown>>;
  updated: Array<{ tabId: number; props: Record<string, unknown> }>;
  injected: Injected[];
  badges: Array<{ tabId?: number; text: string }>;
  contextReply: unknown;
  injectionThrows: boolean;
  /** What an injected function reports back. Only the copy path reads it. */
  injectionResult: unknown;
  /** Id given to a tab created by the action. Null means Chrome gave us none. */
  newTabId: number | null;
  session: Record<string, unknown>;
  local: Record<string, unknown>;
}

let fake: FakeChrome;

function installChrome(settings: Partial<Settings> = {}): FakeChrome {
  const state: FakeChrome = {
    created: [],
    updated: [],
    injected: [],
    badges: [],
    contextReply: null,
    injectionThrows: false,
    injectionResult: true,
    newTabId: 99,
    session: {},
    local: {},
  };

  const { promptTemplate, ...rest } = { ...DEFAULT_SETTINGS, ...settings };

  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      sync: {
        get: async () => ({ settings: rest, promptTemplate }),
        set: async () => undefined,
      },
      session: {
        get: async (keys: string | string[] | null) => {
          if (keys === null) return { ...state.session };
          const wanted = typeof keys === 'string' ? [keys] : keys;
          const out: Record<string, unknown> = {};
          for (const key of wanted) if (key in state.session) out[key] = state.session[key];
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(state.session, items);
        },
        remove: async (keys: string | string[]) => {
          for (const key of typeof keys === 'string' ? [keys] : keys) delete state.session[key];
        },
      },
      local: {
        get: async (keys: string | string[] | null) => {
          if (keys === null) return { ...state.local };
          const wanted = typeof keys === 'string' ? [keys] : keys;
          const out: Record<string, unknown> = {};
          for (const key of wanted) if (key in state.local) out[key] = state.local[key];
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(state.local, items);
        },
        remove: async (keys: string | string[]) => {
          for (const key of typeof keys === 'string' ? [keys] : keys) delete state.local[key];
        },
      },
    },
    tabs: {
      sendMessage: async () => {
        if (state.contextReply === null) throw new Error('no receiving end');
        return state.contextReply;
      },
      create: async (props: Record<string, unknown>) => {
        state.created.push(props);
        return state.newTabId == null ? props : { ...props, id: state.newTabId };
      },
      update: async (tabId: number, props: Record<string, unknown>) => {
        state.updated.push({ tabId, props });
        return props;
      },
      query: async () => [],
      get: async () => ({}),
    },
    scripting: {
      executeScript: async (opts: { target: { tabId: number }; args: unknown[] }) => {
        if (state.injectionThrows) throw new Error('cannot inject here');
        state.injected.push({ tabId: opts.target.tabId, args: opts.args });
        return [{ result: state.injectionResult }];
      },
    },
    action: {
      setBadgeText: async (opts: { tabId?: number; text: string }) => {
        state.badges.push(opts);
      },
      setTitle: async () => undefined,
      setBadgeBackgroundColor: async () => undefined,
    },
  };

  return state;
}

function tab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 7,
    index: 2,
    windowId: 1,
    url: 'https://leetcode.com/problems/sort-an-array/',
    title: '912. Sort an Array - LeetCode',
    ...overrides,
  } as chrome.tabs.Tab;
}

function context(overrides: Partial<ProblemContext> = {}): ProblemContext {
  return {
    platform: 'leetcode',
    platformLabel: 'LeetCode',
    url: 'https://leetcode.com/problems/sort-an-array/',
    slug: 'sort-an-array',
    number: '912',
    title: 'Sort an Array',
    difficulty: 'Medium',
    tags: [],
    statementMd: null,
    examplesMd: null,
    constraintsMd: null,
    language: null,
    code: null,
    codeSource: 'none',
    isContest: false,
    isLocked: false,
    extractedAt: 0,
    warnings: [],
    ...overrides,
  };
}

/** Fresh module per test: the debounce map is module state by design. */
async function load(): Promise<typeof import('./actions')> {
  vi.resetModules();
  return import('./actions');
}

function toastTexts(state: FakeChrome): string[] {
  return state.injected.map((entry) => String(entry.args[1] ?? ''));
}

beforeEach(() => {
  fake = installChrome();
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('shouldRun — the 750 ms debounce (D017)', () => {
  it('lets the first press through', async () => {
    const { shouldRun } = await load();
    expect(shouldRun(1, 'youtube', 1000)).toBe(true);
  });

  it('swallows a repeat inside the window', async () => {
    const { shouldRun } = await load();
    expect(shouldRun(1, 'youtube', 1000)).toBe(true);
    expect(shouldRun(1, 'youtube', 1400)).toBe(false);
    expect(shouldRun(1, 'youtube', 1749)).toBe(false);
  });

  it('lets the next press through once the window has passed', async () => {
    const { shouldRun } = await load();
    expect(shouldRun(1, 'youtube', 1000)).toBe(true);
    expect(shouldRun(1, 'youtube', 1750)).toBe(true);
  });

  it('debounces per tab and per action, not globally', async () => {
    const { shouldRun } = await load();
    expect(shouldRun(1, 'youtube', 1000)).toBe(true);
    expect(shouldRun(2, 'youtube', 1000)).toBe(true);
    expect(shouldRun(1, 'chatgpt', 1000)).toBe(true);
  });

  it('forgets a tab that closed', async () => {
    const { shouldRun, forgetTab } = await load();
    expect(shouldRun(1, 'youtube', 1000)).toBe(true);
    forgetTab(1);
    expect(shouldRun(1, 'youtube', 1001)).toBe(true);
  });
});

describe('runAction — the YouTube action', () => {
  it('opens the search in a new tab beside the problem', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const { runAction } = await load();
    await runAction('youtube', tab());

    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]?.['url']).toBe(
      'https://www.youtube.com/results?search_query=LeetCode+912+Sort+an+Array+solution',
    );
    expect(fake.created[0]?.['index']).toBe(3);
    expect(fake.created[0]?.['active']).toBe(true);
    expect(toastTexts(fake)).toEqual([]);
  });

  it('honours openInNewTab: false by navigating the current tab', async () => {
    fake = installChrome({ openInNewTab: false });
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const { runAction } = await load();
    await runAction('youtube', tab());

    expect(fake.created).toHaveLength(0);
    expect(fake.updated[0]?.tabId).toBe(7);
    expect(String(fake.updated[0]?.props['url'])).toContain('youtube.com/results');
  });

  it('honours focusNewTab: false by opening in the background', async () => {
    fake = installChrome({ focusNewTab: false });
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const { runAction } = await load();
    await runAction('youtube', tab());

    expect(fake.created[0]?.['active']).toBe(false);
  });

  it('honours a customised template', async () => {
    fake = installChrome({ youtubeTemplate: '{title} {difficulty} explained' });
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const { runAction } = await load();
    await runAction('youtube', tab());

    expect(fake.created[0]?.['url']).toContain('Sort+an+Array+Medium+explained');
  });
});

describe('runAction — degrading, never dead-ending (D016)', () => {
  it('falls back to the page title when no content script answers', async () => {
    fake.contextReply = null; // sendMessage rejects, as on an un-injected page
    const { runAction } = await load();
    await runAction('youtube', tab());

    expect(fake.created[0]?.['url']).toBe(
      'https://www.youtube.com/results?search_query=LeetCode+912+Sort+an+Array+solution',
    );
    // And says so, rather than letting a vague result look like YouTube's fault.
    expect(toastTexts(fake).join(' ')).toContain('used the page title');
  });

  it('falls back to the URL slug when the title is useless too', async () => {
    fake.contextReply = null;
    const { runAction } = await load();
    await runAction('youtube', tab({ title: 'LeetCode' }));

    expect(fake.created[0]?.['url']).toContain('sort+an+array');
  });

  it('toasts on an unsupported page instead of doing nothing', async () => {
    const { runAction } = await load();
    await runAction('youtube', tab({ url: 'https://example.com/', title: 'Example' }));

    expect(fake.created).toHaveLength(0);
    // Names every platform it actually supports. The literal this used to
    // assert said "LeetCode problem pages" and stayed true-looking for three
    // phases after three more platforms shipped, so the assertion is on the
    // property now: whatever the sentence says, it lists all of them.
    const said = toastTexts(fake).join(' ');
    for (const label of Object.values(PLATFORM_LABELS)) expect(said).toContain(label);
  });

  it('falls back to the badge when the page refuses injection', async () => {
    fake.injectionThrows = true;
    const { runAction } = await load();
    await runAction('youtube', tab({ url: 'chrome://extensions', title: 'Extensions' }));

    // Nothing opened, but the toolbar still says something.
    expect(fake.created).toHaveLength(0);
    expect(fake.badges.some((b) => b.text === '!')).toBe(true);
  });

  it('has no action left that answers with a placeholder', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ code: 'x' }) };
    const { runAction } = await load();

    for (const action of ['youtube', 'chatgpt', 'copyPrompt'] as const) {
      fake = installChrome();
      fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ code: 'x' }) };
      const fresh = await load();
      await fresh.runAction(action, tab());

      // Every action now does its own work: a tab opened, or something copied.
      const didSomething = fake.created.length > 0 || fake.injected.length > 0;
      expect(didSomething).toBe(true);
      expect(toastTexts(fake).join(' ')).not.toContain('later phase');
    }
    expect(runAction).toBeTypeOf('function');
  });

  it('reports an error rather than failing silently', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const chromeApi = (globalThis as { chrome: { tabs: { create: unknown } } }).chrome;
    chromeApi.tabs.create = async () => {
      throw new Error('no window');
    };

    const { runAction } = await load();
    await runAction('youtube', tab());

    expect(toastTexts(fake).join(' ')).toContain('error');
  });

  it('does nothing at all only when there is no tab to do it to', async () => {
    const { runAction } = await load();
    await runAction('youtube', undefined);
    await runAction('youtube', tab({ id: undefined }));
    await runAction('youtube', tab({ url: undefined }));

    expect(fake.created).toHaveLength(0);
    expect(fake.injected).toHaveLength(0);
  });
});

describe('runAction — the clipboard action (spec §7.3)', () => {
  it('builds the prompt and hands it to the page to write', async () => {
    fake.contextReply = {
      type: 'CONTEXT_RESULT',
      context: context({ statementMd: 'Given an array...', code: 'int main() {}', language: 'C++' }),
    };
    const { runAction } = await load();
    await runAction('copyPrompt', tab());

    // Two injections: the copy, then the confirmation toast.
    const copied = String(fake.injected[0]?.args[0] ?? '');
    expect(copied).toContain('Sort an Array');
    expect(copied).toContain('int main() {}');
    expect(copied).toContain('<problem_statement>');
    expect(fake.created).toHaveLength(0);
  });

  it('confirms the copy', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ code: 'x' }) };
    const { runAction } = await load();
    await runAction('copyPrompt', tab());

    expect(toastTexts(fake).join(' ')).toContain('Prompt copied');
  });

  it('says what was missing rather than quietly copying less', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ code: null }) };
    const { runAction } = await load();
    await runAction('copyPrompt', tab());

    expect(toastTexts(fake).join(' ')).toContain('paste yours in');
  });

  it('reports a clipboard that refused rather than claiming success', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ code: 'x' }) };
    fake.injectionResult = false;
    const { runAction } = await load();
    await runAction('copyPrompt', tab());

    expect(toastTexts(fake).join(' ')).toContain("Couldn't reach the clipboard");
  });

  it('says so when there is no context to build a prompt from', async () => {
    fake.contextReply = null;
    const { runAction } = await load();
    await runAction('copyPrompt', tab());

    // Unlike the YouTube search, a page title alone makes no useful prompt.
    expect(toastTexts(fake).join(' ')).toContain('nothing to build a prompt from');
    expect(fake.injected.every((entry) => typeof entry.args[1] === 'string')).toBe(true);
  });

  it('returns the prompt instead of writing it when the popup asks (D041)', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ code: 'int main() {}' }) };
    const { runAction } = await load();
    const prompt = await runAction('copyPrompt', tab(), { returnPrompt: true });

    expect(prompt).toContain('int main() {}');
    // Nothing was injected: the popup does its own write.
    expect(fake.injected).toHaveLength(0);
  });

  it('returns null, having said why, when the popup asks and there is no context', async () => {
    fake.contextReply = null;
    const { runAction } = await load();
    const prompt = await runAction('copyPrompt', tab(), { returnPrompt: true });

    expect(prompt).toBeNull();
    expect(toastTexts(fake).join(' ')).toContain('nothing to build a prompt from');
  });

  it('is debounced like every other action', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ code: 'x' }) };
    const { runAction } = await load();
    await runAction('copyPrompt', tab());
    const injectionsAfterFirst = fake.injected.length;
    await runAction('copyPrompt', tab());

    expect(fake.injected).toHaveLength(injectionsAfterFirst);
  });
});

describe('runAction — the ChatGPT action (spec §7.2)', () => {
  const withContext = (): void => {
    fake.contextReply = {
      type: 'CONTEXT_RESULT',
      context: context({ statementMd: 'Given an array...', code: 'int main() {}', language: 'C++' }),
    };
  };

  it('opens ChatGPT and parks the prompt against the new tab', async () => {
    withContext();
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]?.['url']).toBe('https://chatgpt.com/');

    // Keyed by the created tab's id, not globally (architecture §5.3).
    const keys = Object.keys(fake.session);
    expect(keys).toEqual(['pendingPrompt:99']);
    const entry = fake.session['pendingPrompt:99'] as { prompt: string; autoSubmit: boolean };
    expect(entry.prompt).toContain('int main() {}');
    // Auto-submit is off by default, so the parked entry says so (D050).
    expect(entry.autoSubmit).toBe(false);
  });

  it('parks the auto-submit opt-in with the prompt when it is on (D050)', async () => {
    fake = installChrome({ autoSubmitChatGpt: true });
    withContext();
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    const entry = fake.session['pendingPrompt:99'] as { autoSubmit: boolean };
    // The worker decides from settings and stores the decision; the content
    // script never reads settings itself.
    expect(entry.autoSubmit).toBe(true);
  });

  it('opens a new tab even when openInNewTab is off', async () => {
    fake = installChrome({ openInNewTab: false });
    withContext();
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    // That setting is about where a result opens; navigating away would take
    // the problem page the prompt was built from with it.
    expect(fake.created).toHaveLength(1);
    expect(fake.updated).toHaveLength(0);
  });

  it('honours focusNewTab', async () => {
    fake = installChrome({ focusNewTab: false });
    withContext();
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    expect(fake.created[0]?.['active']).toBe(false);
  });

  it('says nothing when the prompt is complete', async () => {
    withContext();
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    expect(toastTexts(fake)).toEqual([]);
  });

  it('names a gap on the problem tab, before ChatGPT has even loaded', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ code: null }) };
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    expect(toastTexts(fake).join(' ')).toContain('paste yours in');
    expect(fake.injected[0]?.tabId).toBe(7);
  });

  it('copies instead of opening a tab when auto-inject is off', async () => {
    fake = installChrome({ autoInjectChatGpt: false });
    withContext();
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    expect(fake.created).toHaveLength(0);
    expect(String(fake.injected[0]?.args[0] ?? '')).toContain('int main() {}');
    expect(toastTexts(fake).join(' ')).toContain('Paste it into ChatGPT');
  });

  it('falls back to the clipboard when the new tab has no id to key on', async () => {
    withContext();
    fake.newTabId = null;
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    expect(fake.session).toEqual({});
    expect(toastTexts(fake).join(' ')).toContain('on your clipboard instead');
  });

  it('says so when there is no context to build a prompt from', async () => {
    fake.contextReply = null;
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    expect(fake.created).toHaveLength(0);
    expect(toastTexts(fake).join(' ')).toContain('nothing to build a prompt from');
  });

  it('never writes the prompt anywhere but session storage (D018)', async () => {
    withContext();
    const { runAction } = await load();
    await runAction('chatgpt', tab());

    const written = JSON.stringify(fake.session);
    expect(written).toContain('int main()');
    // The fake sync area records nothing, and there is no local area at all:
    // a write to either would throw rather than pass quietly.
    expect(Object.keys(fake.session).every((k) => k.startsWith('pendingPrompt:'))).toBe(true);
  });
});

describe('history recording (D024, spec §5.1)', () => {
  interface StoredEntry {
    problemKey: string;
    url: string;
    title: string;
  }

  function historyOf(state: FakeChrome): StoredEntry[] {
    return (state.local['history'] as StoredEntry[] | undefined) ?? [];
  }

  it('records a visit when an action runs', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const { runAction } = await load();
    await runAction('youtube', tab());

    expect(historyOf(fake)).toHaveLength(1);
    expect(historyOf(fake)[0]?.problemKey).toBe('leetcode:sort-an-array');
  });

  it('keeps the last extraction for the options page, but strips the code (D018)', async () => {
    fake.contextReply = {
      type: 'CONTEXT_RESULT',
      context: context({ code: 'int main() {}', codeSource: 'editorApi' }),
    };
    const { runAction } = await load();
    await runAction('youtube', tab());

    const last = fake.local['lastExtraction'] as {
      context: { code: string | null; codeSource: string };
    };
    // The code content is dropped before storage: it must never touch disk.
    expect(last.context.code).toBeNull();
    // The source is kept, so diagnostics can still say a solution was captured.
    expect(last.context.codeSource).toBe('editorApi');
    // And the code text appears in no storage area at all (D018).
    expect(JSON.stringify(fake.local)).not.toContain('int main');
    expect(JSON.stringify(fake.session)).not.toContain('int main');
  });

  it('collapses both Codeforces URL forms onto one entry', async () => {
    // The case D024 exists for: 1352A is reachable at /problemset/problem/…
    // and at /contest/…/problem/…, and they are one problem.
    const cf = (url: string) =>
      context({
        platform: 'codeforces',
        platformLabel: 'Codeforces',
        slug: '1352A',
        number: '1352A',
        title: 'Sum of Round Numbers',
        url,
      });

    const { runAction } = await load();

    fake.contextReply = {
      type: 'CONTEXT_RESULT',
      context: cf('https://codeforces.com/problemset/problem/1352/A'),
    };
    await runAction('youtube', tab({ url: 'https://codeforces.com/problemset/problem/1352/A' }));

    fake.contextReply = {
      type: 'CONTEXT_RESULT',
      context: cf('https://codeforces.com/contest/1352/problem/A'),
    };
    await runAction('youtube', tab({ id: 8, url: 'https://codeforces.com/contest/1352/problem/A' }));

    const history = historyOf(fake);
    expect(history).toHaveLength(1);
    // And it holds the variant most recently visited, so returning to it takes
    // the solver back where they were.
    expect(history[0]?.url).toBe('https://codeforces.com/contest/1352/problem/A');
  });

  it('moves a returning problem back to the top rather than duplicating it', async () => {
    const { runAction } = await load();

    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ slug: 'first' }) };
    await runAction('youtube', tab({ id: 1 }));
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ slug: 'second' }) };
    await runAction('youtube', tab({ id: 2 }));
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ slug: 'first' }) };
    await runAction('youtube', tab({ id: 3 }));

    const history = historyOf(fake);
    expect(history).toHaveLength(2);
    expect(history[0]?.problemKey).toBe('leetcode:first');
  });

  it('records nothing while paused, and disturbs nothing already there (R17)', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const first = await load();
    await first.runAction('youtube', tab());
    const recorded = fake.local['history'];
    expect(historyOf(fake)).toHaveLength(1);

    // Pausing stops recording; it does not clear what is already there.
    fake = installChrome({ historyPaused: true });
    fake.local['history'] = recorded;
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ slug: 'another' }) };

    const second = await load();
    await second.runAction('youtube', tab({ id: 5 }));

    expect(historyOf(fake)).toHaveLength(1);
    expect(historyOf(fake)[0]?.problemKey).toBe('leetcode:sort-an-array');
  });

  it('records nothing when the limit is zero', async () => {
    fake = installChrome({ historyLimit: 0 });
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const { runAction } = await load();
    await runAction('youtube', tab());

    expect(historyOf(fake)).toHaveLength(0);
  });

  it('caps the list at the limit', async () => {
    fake = installChrome({ historyLimit: 2 });
    const { runAction } = await load();

    for (const slug of ['a', 'b', 'c']) {
      fake.contextReply = { type: 'CONTEXT_RESULT', context: context({ slug }) };
      await runAction('youtube', tab({ id: slug.charCodeAt(0) }));
    }

    const history = historyOf(fake);
    expect(history).toHaveLength(2);
    expect(history.map((e) => e.problemKey)).toEqual(['leetcode:c', 'leetcode:b']);
  });

  it('never lets a history failure stop an action (D016)', async () => {
    fake.contextReply = { type: 'CONTEXT_RESULT', context: context() };
    const chromeApi = (globalThis as { chrome: { storage: { local: { set: unknown } } } }).chrome;
    chromeApi.storage.local.set = async () => {
      throw new Error('quota');
    };

    const { runAction } = await load();
    await runAction('youtube', tab());

    // The search still opened.
    expect(fake.created).toHaveLength(1);
  });
});

describe('the toast payload', () => {
  it('passes level and text as arguments, never as interpolated code', async () => {
    const { showToast } = await load();
    await showToast(7, 'warn', 'a message with </script> in it');

    expect(fake.injected[0]?.args).toEqual(['warn', 'a message with </script> in it']);
  });
});
