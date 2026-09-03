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
  };

  const { promptTemplate, ...rest } = { ...DEFAULT_SETTINGS, ...settings };

  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      sync: {
        get: async () => ({ settings: rest, promptTemplate }),
        set: async () => undefined,
      },
    },
    tabs: {
      sendMessage: async () => {
        if (state.contextReply === null) throw new Error('no receiving end');
        return state.contextReply;
      },
      create: async (props: Record<string, unknown>) => {
        state.created.push(props);
        return props;
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
        return [];
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
    expect(toastTexts(fake).join(' ')).toContain('LeetCode problem pages');
  });

  it('falls back to the badge when the page refuses injection', async () => {
    fake.injectionThrows = true;
    const { runAction } = await load();
    await runAction('youtube', tab({ url: 'chrome://extensions', title: 'Extensions' }));

    // Nothing opened, but the toolbar still says something.
    expect(fake.created).toHaveLength(0);
    expect(fake.badges.some((b) => b.text === '!')).toBe(true);
  });

  it('says the other two actions are not built yet rather than ignoring them', async () => {
    const { runAction } = await load();
    await runAction('chatgpt', tab());
    await runAction('copyPrompt', tab());

    expect(toastTexts(fake)).toHaveLength(2);
    expect(toastTexts(fake).join(' ')).toContain('later phase');
    expect(fake.created).toHaveLength(0);
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

describe('the toast payload', () => {
  it('passes level and text as arguments, never as interpolated code', async () => {
    const { showToast } = await load();
    await showToast(7, 'warn', 'a message with </script> in it');

    expect(fake.injected[0]?.args).toEqual(['warn', 'a message with </script> in it']);
  });
});
