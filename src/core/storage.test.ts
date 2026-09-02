import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DebouncedWriter,
  KEYS,
  SYNC_ITEM_LIMIT_BYTES,
  WRITE_DEBOUNCE_MS,
  checkItemSize,
  checkPromptTemplateSize,
  ensureMigrated,
  getHistory,
  getSettings,
  measureItem,
  mergeSettings,
  saveSettings,
  setSettings,
} from './storage';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSION_KEY } from './migrations';
import { DEFAULT_PROMPT } from './templates';

/** Minimal in-memory stand-in for one chrome.storage area. */
function fakeArea() {
  const data: Record<string, unknown> = {};
  return {
    data,
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }),
    get: vi.fn(async (keys: string | string[]) => {
      const wanted = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of wanted) if (k in data) out[k] = data[k];
      return out;
    }),
  };
}

let sync: ReturnType<typeof fakeArea>;
let local: ReturnType<typeof fakeArea>;

beforeEach(() => {
  sync = fakeArea();
  local = fakeArea();
  (globalThis as Record<string, unknown>)['chrome'] = {
    storage: { sync, local, session: fakeArea() },
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['chrome'];
  vi.useRealTimers();
});

describe('size guard', () => {
  it('charges for the key as well as the value', () => {
    expect(measureItem('ab', 'x')).toBe(measureItem('a', 'x') + 1);
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(measureItem('k', '—')).toBeGreaterThan(measureItem('k', '-'));
  });

  it('reports ok well under the cap', () => {
    expect(checkItemSize('k', 'short').level).toBe('ok');
  });

  it('warns while there is still headroom', () => {
    expect(checkPromptTemplateSize('x'.repeat(7200)).level).toBe('warn');
  });

  it('reports over past the per-item quota', () => {
    const check = checkPromptTemplateSize('x'.repeat(SYNC_ITEM_LIMIT_BYTES + 10));
    expect(check.level).toBe('over');
    expect(check.bytes).toBeGreaterThan(SYNC_ITEM_LIMIT_BYTES);
  });

  it('clears the default template comfortably', () => {
    expect(checkPromptTemplateSize(DEFAULT_PROMPT).level).toBe('ok');
  });
});

describe('mergeSettings', () => {
  it('returns the defaults for empty storage', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('overlays stored values', () => {
    expect(mergeSettings({ historyLimit: 5, focusNewTab: false })).toMatchObject({
      historyLimit: 5,
      focusNewTab: false,
      openInNewTab: true,
    });
  });

  it('discards a value of the wrong type', () => {
    const merged = mergeSettings({ historyLimit: 'lots' as unknown as number });
    expect(merged.historyLimit).toBe(DEFAULT_SETTINGS.historyLimit);
  });

  it('falls back to system for an unknown theme', () => {
    expect(mergeSettings({ theme: 'neon' as never }).theme).toBe('system');
  });

  it('rejects a nonsensical maxPromptChars', () => {
    expect(mergeSettings({ maxPromptChars: 0 }).maxPromptChars).toBe(12_000);
    expect(mergeSettings({ maxPromptChars: -5 }).maxPromptChars).toBe(12_000);
  });

  it('keeps a historyLimit of 0, which means history off', () => {
    expect(mergeSettings({ historyLimit: 0 }).historyLimit).toBe(0);
  });
});

describe('getSettings', () => {
  it('returns defaults on a fresh install', async () => {
    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('reads the prompt template from its own key', async () => {
    sync.data[KEYS.settings] = { historyLimit: 3 };
    sync.data[KEYS.promptTemplate] = 'custom template';
    const settings = await getSettings();
    expect(settings.promptTemplate).toBe('custom template');
    expect(settings.historyLimit).toBe(3);
  });

  it('falls back to the default template when the key is absent', async () => {
    sync.data[KEYS.settings] = { historyLimit: 3 };
    await expect(getSettings()).resolves.toMatchObject({ promptTemplate: DEFAULT_PROMPT });
  });
});

describe('writes', () => {
  it('splits the prompt template onto its own key', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, promptTemplate: 'mine' });
    expect(sync.data[KEYS.promptTemplate]).toBe('mine');
    expect(sync.data[KEYS.settings]).not.toHaveProperty('promptTemplate');
  });

  it('coalesces a burst of updates into one write', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 20; i += 1) setSettings({ maxPromptChars: 1000 + i });
    expect(sync.set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);
    expect(sync.set).toHaveBeenCalledTimes(1);
    expect((sync.data[KEYS.settings] as Record<string, unknown>)['maxPromptChars']).toBe(1019);
  });

  it('does not write before the debounce window closes', async () => {
    vi.useFakeTimers();
    setSettings({ historyLimit: 4 });
    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS - 50);
    expect(sync.set).not.toHaveBeenCalled();
  });
});

describe('DebouncedWriter', () => {
  it('merges queued keys and flushes once', async () => {
    vi.useFakeTimers();
    const writer = new DebouncedWriter('local', 100);
    writer.set({ a: 1 });
    writer.set({ b: 2 });
    expect(writer.hasPending).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(local.set).toHaveBeenCalledTimes(1);
    expect(local.data).toEqual({ a: 1, b: 2 });
  });

  it('flush writes immediately and clears the queue', async () => {
    const writer = new DebouncedWriter('local', 10_000);
    writer.set({ a: 1 });
    await writer.flush();
    expect(local.data['a']).toBe(1);
    expect(writer.hasPending).toBe(false);
  });

  it('flush is a no-op with nothing queued', async () => {
    await new DebouncedWriter('local').flush();
    expect(local.set).not.toHaveBeenCalled();
  });
});

describe('getHistory', () => {
  it('returns an empty list when nothing is stored', async () => {
    await expect(getHistory()).resolves.toEqual([]);
  });

  it('ignores a corrupted value rather than throwing', async () => {
    local.data[KEYS.history] = 'not an array';
    await expect(getHistory()).resolves.toEqual([]);
  });
});

describe('ensureMigrated', () => {
  it('stamps the version on a fresh install', async () => {
    sync.data[KEYS.settings] = { historyLimit: 5 };
    await ensureMigrated();
    expect(local.data[SCHEMA_VERSION_KEY]).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('does not write the version stamp into the sync area', async () => {
    await ensureMigrated();
    expect(sync.data).not.toHaveProperty(SCHEMA_VERSION_KEY);
  });

  it('is a no-op when already current', async () => {
    local.data[SCHEMA_VERSION_KEY] = CURRENT_SCHEMA_VERSION;
    await ensureMigrated();
    expect(sync.set).not.toHaveBeenCalled();
    expect(local.set).not.toHaveBeenCalled();
  });

  it('leaves settings written by a newer build alone', async () => {
    local.data[SCHEMA_VERSION_KEY] = CURRENT_SCHEMA_VERSION + 1;
    sync.data[KEYS.settings] = { fromTheFuture: true };
    await ensureMigrated();
    expect(sync.set).not.toHaveBeenCalled();
    expect(sync.data[KEYS.settings]).toEqual({ fromTheFuture: true });
  });
});
