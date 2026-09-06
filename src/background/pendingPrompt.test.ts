/**
 * The prompt handoff (D017, D018).
 *
 * What is being tested is mostly deletion. The prompt holds the user's code,
 * so the interesting properties are that it is claimed exactly once, that it
 * expires, and that nothing writes it anywhere but `chrome.storage.session`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PROMPT_TTL_MS,
  claimPendingPrompt,
  dropPendingPrompt,
  putPendingPrompt,
  sweepExpired,
} from './pendingPrompt';

interface FakeAreas {
  session: Record<string, unknown>;
  local: Record<string, unknown>;
  sync: Record<string, unknown>;
}

let areas: FakeAreas;

function makeArea(store: Record<string, unknown>): chrome.storage.StorageArea {
  return {
    get: async (keys: string | string[] | null) => {
      if (keys === null) return { ...store };
      const wanted = typeof keys === 'string' ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const key of wanted) {
        if (key in store) out[key] = store[key];
      }
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    },
    remove: async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete store[key];
    },
  } as unknown as chrome.storage.StorageArea;
}

beforeEach(() => {
  areas = { session: {}, local: {}, sync: {} };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      session: makeArea(areas.session),
      local: makeArea(areas.local),
      sync: makeArea(areas.sync),
    },
  };
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('storage area (D018)', () => {
  it('writes the prompt to session and nowhere else', async () => {
    await putPendingPrompt(42, 'the prompt', false);

    expect(Object.keys(areas.session)).toHaveLength(1);
    // The user's code never touches disk.
    expect(areas.local).toEqual({});
    expect(areas.sync).toEqual({});
  });

  it('keys the entry by tab id', async () => {
    await putPendingPrompt(42, 'a', false);
    expect(Object.keys(areas.session)[0]).toContain('42');
  });
});

describe('claiming is one-shot', () => {
  it('returns the prompt the first time', async () => {
    await putPendingPrompt(42, 'the prompt', false);
    await expect(claimPendingPrompt(42)).resolves.toEqual({
      prompt: 'the prompt',
      autoSubmit: false,
    });
  });

  it('carries the auto-submit decision back with the prompt (D050)', async () => {
    await putPendingPrompt(42, 'the prompt', true);
    await expect(claimPendingPrompt(42)).resolves.toEqual({
      prompt: 'the prompt',
      autoSubmit: true,
    });
  });

  it('returns null the second time, and leaves nothing behind', async () => {
    await putPendingPrompt(42, 'the prompt', false);
    await claimPendingPrompt(42);

    await expect(claimPendingPrompt(42)).resolves.toBeNull();
    expect(areas.session).toEqual({});
  });

  it('deletes an expired entry rather than leaving it to be claimed later', async () => {
    await putPendingPrompt(42, 'stale', false, 0);
    await expect(claimPendingPrompt(42, PROMPT_TTL_MS + 1)).resolves.toBeNull();
    expect(areas.session).toEqual({});
  });

  it('still serves a prompt right up to the TTL', async () => {
    await putPendingPrompt(42, 'fresh', false, 0);
    await expect(claimPendingPrompt(42, PROMPT_TTL_MS)).resolves.toEqual({
      prompt: 'fresh',
      autoSubmit: false,
    });
  });

  it('has nothing to say about a tab that was never given one', async () => {
    await expect(claimPendingPrompt(99)).resolves.toBeNull();
  });
});

describe('isolation between tabs (architecture §5.3)', () => {
  it('keeps two prompts apart rather than letting one overwrite the other', async () => {
    await putPendingPrompt(1, 'first problem', false);
    await putPendingPrompt(2, 'second problem', false);

    // The case this exists for: firing the action from two problem tabs in
    // quick succession. A global slot would hand both tabs the same prompt.
    await expect(claimPendingPrompt(2)).resolves.toEqual({
      prompt: 'second problem',
      autoSubmit: false,
    });
    await expect(claimPendingPrompt(1)).resolves.toEqual({
      prompt: 'first problem',
      autoSubmit: false,
    });
  });

  it('claiming one does not disturb the other', async () => {
    await putPendingPrompt(1, 'first', false);
    await putPendingPrompt(2, 'second', false);
    await claimPendingPrompt(1);

    expect(Object.keys(areas.session)).toHaveLength(1);
    await expect(claimPendingPrompt(2)).resolves.toEqual({ prompt: 'second', autoSubmit: false });
  });
});

describe('dropPendingPrompt', () => {
  it('removes a prompt when its tab closes', async () => {
    await putPendingPrompt(42, 'the prompt', false);
    await dropPendingPrompt(42);
    expect(areas.session).toEqual({});
  });

  it('does not throw when there is nothing to drop', async () => {
    await expect(dropPendingPrompt(99)).resolves.toBeUndefined();
  });

  it('does not throw when the session area is gone with the worker', async () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    await expect(dropPendingPrompt(42)).resolves.toBeUndefined();
  });
});

describe('sweepExpired', () => {
  it('removes only the entries past their TTL', async () => {
    await putPendingPrompt(1, 'old', false, 0);
    await putPendingPrompt(2, 'new', false, PROMPT_TTL_MS);

    await expect(sweepExpired(PROMPT_TTL_MS + 1)).resolves.toBe(1);
    await expect(claimPendingPrompt(2, PROMPT_TTL_MS + 1)).resolves.toEqual({
      prompt: 'new',
      autoSubmit: false,
    });
  });

  it('removes an entry it cannot read, since nothing can ever claim it', async () => {
    areas.session['pendingPrompt:7'] = { garbage: true };
    await expect(sweepExpired()).resolves.toBe(1);
    expect(areas.session).toEqual({});
  });

  it('leaves keys that are not ours alone', async () => {
    areas.session['someoneElse'] = 'value';
    await putPendingPrompt(1, 'old', false, 0);

    await sweepExpired(PROMPT_TTL_MS + 1);
    expect(areas.session).toEqual({ someoneElse: 'value' });
  });

  it('does nothing when there is nothing stale', async () => {
    await putPendingPrompt(1, 'fresh', false, 1000);
    await expect(sweepExpired(1000)).resolves.toBe(0);
  });
});
