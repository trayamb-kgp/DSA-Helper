/**
 * The adapter registry (architecture.md section 6.1).
 *
 * Kept apart from adapter.ts so the dependency graph stays a line rather than
 * a cycle: adapter.ts defines the contract, each adapter imports it, and this
 * file is the only thing that knows the full set.
 *
 * Lookup is a pure function over a URL, so it is testable across dozens of
 * real URLs with no browser at all.
 */

import type { PlatformAdapter } from './adapter';
import { leetcode } from './leetcode';

/**
 * Phase 6 adds Codeforces, CodeChef and GeeksforGeeks. Until then their URLs
 * resolve to null, which the content script reports as an unsupported page.
 */
export const ADAPTERS: readonly PlatformAdapter[] = [leetcode];

export function resolveAdapter(url: URL | string): PlatformAdapter | null {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  for (const adapter of ADAPTERS) {
    try {
      if (adapter.matches(parsed)) return adapter;
    } catch {
      continue; // a broken adapter must not hide the ones after it
    }
  }
  return null;
}
