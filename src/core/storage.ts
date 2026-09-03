/**
 * Typed storage wrappers (architecture.md §6, D018).
 *
 * Three areas, three jobs:
 *   - `sync`   Settings. Templates are worth carrying between machines.
 *   - `local`  History, schema version, last-seen context. Per-device and
 *              disposable; syncing it would burn the write quota.
 *   - `session` Pending prompts. A prompt contains the user's code and must
 *              never be written to disk.
 *
 * `chrome` is read off `globalThis` at call time rather than imported, so the
 * pure parts of this module (size guard, debounce, defaults, merging) test in
 * plain Node against a stub.
 */

import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSION_KEY, migrate } from './migrations';
import { DEFAULT_PROMPT, DEFAULT_YOUTUBE_TEMPLATE } from './templates';
import type { HistoryEntry, ProblemContext, Settings } from './types';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  youtubeTemplate: DEFAULT_YOUTUBE_TEMPLATE,
  promptTemplate: DEFAULT_PROMPT,
  maxPromptChars: 12_000,
  openInNewTab: true,
  focusNewTab: true,
  includeCode: true,
  autoInjectChatGpt: true,
  historyLimit: 20,
  historyPaused: false,
  theme: 'system',
});

/**
 * `promptTemplate` is stored on its own key, never bundled with the rest of
 * Settings: sync allows 8 KB per item and a long template can approach that
 * alone (architecture.md §6).
 */
export const KEYS = Object.freeze({
  settings: 'settings',
  promptTemplate: 'promptTemplate',
  history: 'history',
  lastExtraction: 'lastExtraction',
  schemaVersion: SCHEMA_VERSION_KEY,
});

/** chrome.storage.sync QUOTA_BYTES_PER_ITEM. A write past this throws. */
export const SYNC_ITEM_LIMIT_BYTES = 8192;

/** Warn in the options UI from here on, while there is still headroom. */
export const SYNC_ITEM_WARN_BYTES = 7168;

/** Coalescing window for writes, so a dragged slider cannot trip the
 *  120-writes-per-minute sync quota. */
export const WRITE_DEBOUNCE_MS = 500;

type AreaName = 'sync' | 'local' | 'session';

function area(name: AreaName): chrome.storage.StorageArea {
  const api = (globalThis as { chrome?: typeof chrome }).chrome;
  const storageArea = api?.storage?.[name];
  if (!storageArea) throw new Error(`chrome.storage.${name} is unavailable`);
  return storageArea;
}

// --- size guard ------------------------------------------------------------

export type SizeLevel = 'ok' | 'warn' | 'over';

export interface SizeCheck {
  bytes: number;
  level: SizeLevel;
}

const encoder = new TextEncoder();

/**
 * Chrome charges a sync item for its key plus its JSON-serialized value, in
 * UTF-8 bytes -- so a statement full of multi-byte characters costs more than
 * its length suggests.
 */
export function measureItem(key: string, value: unknown): number {
  return encoder.encode(key + JSON.stringify(value)).length;
}

export function checkItemSize(key: string, value: unknown): SizeCheck {
  const bytes = measureItem(key, value);
  if (bytes > SYNC_ITEM_LIMIT_BYTES) return { bytes, level: 'over' };
  if (bytes >= SYNC_ITEM_WARN_BYTES) return { bytes, level: 'warn' };
  return { bytes, level: 'ok' };
}

/** Size check for the one item that can realistically approach the cap. */
export function checkPromptTemplateSize(template: string): SizeCheck {
  return checkItemSize(KEYS.promptTemplate, template);
}

// --- debounced writer ------------------------------------------------------

/**
 * Coalesces writes to one area. Repeated `set` calls for the same key collapse
 * to a single write once the window closes; `flush` forces it early.
 */
export class DebouncedWriter {
  private pending: Record<string, unknown> = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly areaName: AreaName,
    private readonly delayMs: number = WRITE_DEBOUNCE_MS,
  ) {}

  set(items: Record<string, unknown>): void {
    Object.assign(this.pending, items);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.delayMs);
  }

  /** Write anything queued now, and resolve once it has landed. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const items = this.pending;
    this.pending = {};
    if (Object.keys(items).length === 0) return this.inFlight;

    this.inFlight = area(this.areaName).set(items);
    return this.inFlight;
  }

  get hasPending(): boolean {
    return Object.keys(this.pending).length > 0;
  }

  /**
   * The queued value for a key, if any.
   *
   * A read-modify-write has to see writes that are buffered but not yet
   * flushed, or a second change inside the debounce window overwrites the
   * first with a value read from before it.
   */
  peek(key: string): unknown {
    return this.pending[key];
  }
}

const syncWriter = new DebouncedWriter('sync');
const localWriter = new DebouncedWriter('local');

/** Force every queued write out. Call before a context is torn down. */
export async function flushWrites(): Promise<void> {
  await Promise.all([syncWriter.flush(), localWriter.flush()]);
}

// --- settings --------------------------------------------------------------

/** Merge stored values over the defaults, discarding anything mistyped. */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS };
  if (!stored) return merged;

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = stored[key];
    if (value === undefined || value === null) continue;
    // The typeof check is the field-by-field guarantee; Object.assign is how
    // that gets expressed without widening `merged`.
    if (typeof value === typeof DEFAULT_SETTINGS[key]) Object.assign(merged, { [key]: value });
  }
  if (merged.theme !== 'light' && merged.theme !== 'dark') merged.theme = 'system';
  if (!Number.isFinite(merged.maxPromptChars) || merged.maxPromptChars <= 0) {
    merged.maxPromptChars = DEFAULT_SETTINGS.maxPromptChars;
  }
  if (!Number.isFinite(merged.historyLimit) || merged.historyLimit < 0) {
    merged.historyLimit = DEFAULT_SETTINGS.historyLimit;
  }
  return merged;
}

export async function getSettings(): Promise<Settings> {
  const stored = await area('sync').get([KEYS.settings, KEYS.promptTemplate]);
  const bag = (stored[KEYS.settings] ?? {}) as Partial<Settings>;
  const promptTemplate = stored[KEYS.promptTemplate] as string | undefined;
  return mergeSettings({
    ...bag,
    ...(typeof promptTemplate === 'string' ? { promptTemplate } : {}),
  });
}

/**
 * Persist a partial settings update. Writes are debounced; `promptTemplate`
 * is split onto its own key.
 *
 * The patch is **merged** over what is already stored. Writing only the changed
 * field would replace the whole object, and every setting the caller did not
 * mention would silently revert to its default the next time it was read —
 * changing the theme would reset both templates.
 *
 * The merge reads the queued value first and storage only when nothing is
 * queued, so two changes inside one debounce window do not overwrite each
 * other.
 */
export async function setSettings(patch: Partial<Settings>): Promise<void> {
  const { promptTemplate, ...rest } = patch;

  if (promptTemplate !== undefined) {
    syncWriter.set({ [KEYS.promptTemplate]: promptTemplate });
  }
  if (Object.keys(rest).length === 0) return;

  const queued = syncWriter.peek(KEYS.settings) as Partial<Settings> | undefined;
  const current =
    queued ??
    ((await area('sync').get(KEYS.settings))[KEYS.settings] as Partial<Settings> | undefined);

  syncWriter.set({ [KEYS.settings]: { ...(current ?? {}), ...rest } });
}

/**
 * Write a full settings object, merging the non-template fields over what is
 * already stored so a partial bag is never clobbered.
 */
export async function saveSettings(settings: Settings): Promise<void> {
  const { promptTemplate, ...rest } = settings;
  syncWriter.set({ [KEYS.settings]: rest, [KEYS.promptTemplate]: promptTemplate });
  await syncWriter.flush();
}

// --- history and last-seen context ----------------------------------------

export async function getHistory(): Promise<HistoryEntry[]> {
  const stored = await area('local').get(KEYS.history);
  const value = stored[KEYS.history];
  return Array.isArray(value) ? (value as HistoryEntry[]) : [];
}

export function setHistory(history: readonly HistoryEntry[]): void {
  localWriter.set({ [KEYS.history]: history });
}

/**
 * The most recent extraction, kept for the options page.
 *
 * It backs two things: the live template preview, and the diagnostics panel,
 * which reports the *last* extraction rather than a live one because an
 * options page has no meaningful "current tab" (D044).
 *
 * Local, never sync: it holds a `ProblemContext`, and that carries the user's
 * code (D018). It is overwritten on every action, so it is one problem's worth
 * at a time rather than an accumulating record.
 */
export interface LastExtraction {
  context: ProblemContext;
  /** Which selector matched, which fallback -- support-facing (D031). */
  diagnostics: string[];
  /** Epoch ms. */
  at: number;
}

export async function getLastExtraction(): Promise<LastExtraction | null> {
  const stored = await area('local').get(KEYS.lastExtraction);
  const value = stored[KEYS.lastExtraction] as LastExtraction | undefined;
  return value?.context ? value : null;
}

export function setLastExtraction(extraction: LastExtraction): void {
  localWriter.set({ [KEYS.lastExtraction]: extraction });
}

/** Forget the last extraction. Called when history is cleared. */
export async function clearLastExtraction(): Promise<void> {
  await area('local').remove(KEYS.lastExtraction);
}

// --- migrations ------------------------------------------------------------

/**
 * Run the migration chain over stored settings. Data written by a newer build
 * is left alone -- see migrations.ts.
 */
export async function ensureMigrated(): Promise<void> {
  const local = await area('local').get(KEYS.schemaVersion);
  const sync = await area('sync').get([KEYS.settings, KEYS.promptTemplate]);

  const result = migrate({
    ...sync,
    [SCHEMA_VERSION_KEY]: local[KEYS.schemaVersion] ?? 0,
  });
  if (result.fromFuture || !result.changed) return;

  const { [SCHEMA_VERSION_KEY]: _version, ...migrated } = result.data;
  await area('sync').set(migrated);
  await area('local').set({ [KEYS.schemaVersion]: CURRENT_SCHEMA_VERSION });
}
