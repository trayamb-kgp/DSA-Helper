/**
 * Recently visited problems (D024, spec.md §5.1).
 *
 * Identity is platform + the platform's own identifier, never the URL: the
 * same problem is reachable at several URLs and all of them are one entry.
 * A revisit bumps the entry to the top and updates the URL, so re-triggering
 * from history returns the user where they last were.
 *
 * Never holds statements or code -- only enough to find the problem again.
 * Pure functions over a list; persistence lives in storage.ts.
 */

import type { HistoryEntry, Platform, ProblemContext } from './types';

/** `'<platform>:<identifier>'` -- the identity and de-duplication key. */
export function problemKey(platform: Platform, identifier: string): string {
  return `${platform}:${identifier.trim().toLowerCase()}`;
}

/** The identity of the problem a context describes. */
export function contextKey(context: Pick<ProblemContext, 'platform' | 'slug'>): string {
  return problemKey(context.platform, context.slug);
}

export interface HistoryOptions {
  historyLimit: number;
  historyPaused: boolean;
}

/** Build the entry a visit would record. Strips query and hash from the URL. */
export function entryFromContext(
  context: Pick<ProblemContext, 'platform' | 'slug' | 'title' | 'url' | 'number'>,
  visitedAt: number,
): HistoryEntry {
  return {
    problemKey: contextKey(context),
    platform: context.platform,
    title: context.title,
    url: context.url,
    number: context.number,
    visitedAt,
  };
}

/**
 * Record a visit.
 *
 * - Paused: the list is returned untouched, existing entries preserved.
 * - Limit 0: history is off, so the list is emptied.
 * - Otherwise: any entry for the same problem is replaced, the new one goes
 *   to the front, and the list is capped at `historyLimit`.
 */
export function recordVisit(
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
  options: HistoryOptions,
): HistoryEntry[] {
  if (options.historyPaused) return [...history];
  if (options.historyLimit <= 0) return [];

  const others = history.filter((e) => e.problemKey !== entry.problemKey);
  return [entry, ...others].slice(0, options.historyLimit);
}

/** Drop a single problem from history. */
export function removeEntry(
  history: readonly HistoryEntry[],
  key: string,
): HistoryEntry[] {
  return history.filter((e) => e.problemKey !== key);
}

/**
 * Re-apply a limit to a stored list, for when the user lowers it in options.
 * A limit of 0 clears history, matching `recordVisit`.
 */
export function applyLimit(
  history: readonly HistoryEntry[],
  historyLimit: number,
): HistoryEntry[] {
  if (historyLimit <= 0) return [];
  return history.slice(0, historyLimit);
}
