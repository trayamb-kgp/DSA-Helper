/**
 * What the project knows about problem URLs, as pure functions.
 *
 * This exists so the service worker can answer "is this a problem page?" and
 * "which platform?" without importing an adapter -- and an adapter drags in
 * `html2md` with it. The worker wakes on every tab update and has a 20 ms
 * budget (architecture.md section 7); a markdown converter has no business
 * being in that path.
 *
 * `manifest.config.ts` reads the patterns from here too, so the content-script
 * match list and the context-menu list cannot drift apart.
 *
 * No `document`, no `chrome.*` -- this is `core/`.
 */

import type { Platform } from './types';

/**
 * Pages we attach to. Deliberately narrow: see spec.md section 3.
 * CodeChef contest problems live under an arbitrary first segment
 * (/<CONTEST>/problems/<CODE>), hence the two patterns.
 */
export const PROBLEM_PAGE_PATTERNS: readonly string[] = Object.freeze([
  'https://leetcode.com/problems/*',
  'https://leetcode.com/contest/*',
  'https://codeforces.com/problemset/*',
  'https://codeforces.com/contest/*',
  'https://codeforces.com/gym/*',
  'https://www.codechef.com/problems/*',
  'https://www.codechef.com/*/problems/*',
  'https://www.geeksforgeeks.org/problems/*',
  'https://practice.geeksforgeeks.org/problems/*',
]);

export function parseUrl(url: URL | string): URL | null {
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- LeetCode ---------------------------------------------------------------

const LEETCODE_PRACTICE = /^\/problems\/([^/]+)(?:\/.*)?$/;
const LEETCODE_CONTEST = /^\/contest\/([^/]+)\/problems\/([^/]+)(?:\/.*)?$/;

export interface LeetCodePath {
  slug: string;
  /** The contest slug, or null for a practice problem. */
  contest: string | null;
}

/** leetcode.cn is explicitly out of scope for v1 (spec.md section 3). */
function isLeetCodeHost(url: URL): boolean {
  return url.hostname === 'leetcode.com' || url.hostname === 'www.leetcode.com';
}

/**
 * Tolerant of every suffix LeetCode hangs off a problem: /description/,
 * /submissions/, /solutions/1234/title/, ?envType=..., #anchor (D024).
 */
export function parseLeetCodePath(url: URL): LeetCodePath | null {
  if (!isLeetCodeHost(url)) return null;

  const contest = LEETCODE_CONTEST.exec(url.pathname);
  if (contest) {
    const [, contestSlug, slug] = contest;
    return contestSlug && slug ? { slug, contest: contestSlug } : null;
  }

  const practice = LEETCODE_PRACTICE.exec(url.pathname);
  const slug = practice?.[1];
  return slug ? { slug, contest: null } : null;
}

// --- Cross-platform ---------------------------------------------------------

/**
 * Which platform owns this URL, if any.
 *
 * Phase 6 adds the other three. Until then their URLs answer null, which every
 * caller already treats as "unsupported page".
 */
export function platformForUrl(url: URL | string): Platform | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  if (parseLeetCodePath(parsed)) return 'leetcode';
  return null;
}

/**
 * The bottom rung of the YouTube degradation ladder (D016): the last
 * meaningful path segment, hyphens turned back into spaces.
 *
 * `.../problems/sort-an-array/description/` -> `sort an array`. Sub-tab
 * segments are skipped so the rung lands on the slug rather than on the word
 * "description".
 */
const URL_SLUG_NOISE = new Set([
  'description',
  'submissions',
  'solutions',
  'editorial',
  'discussion',
  'problems',
  'problem',
  'contest',
]);

export function slugWordsFromUrl(url: URL | string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (!segment) continue;
    const lower = segment.toLowerCase();
    if (URL_SLUG_NOISE.has(lower)) continue;
    // A bare number is a submission or solution id, not a problem name.
    if (/^\d+$/.test(segment) && i > 0) continue;
    const words = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim();
    if (words) return words;
  }
  return null;
}
