/**
 * Building the YouTube search (spec.md section 7.1) and the ladder it descends
 * when extraction gives us less than we hoped for (D016).
 *
 * Pure: the service worker runs this to open a tab, and the popup runs the
 * same functions to show the read-only preview (D006). One implementation
 * means the preview cannot promise something the action doesn't do.
 */

import type { Platform, ProblemContext } from './types';
import { PLATFORM_LABELS } from './types';
import { renderQuery, type TemplateVars } from './templates';
import { slugWordsFromUrl } from './urls';

export const YOUTUBE_SEARCH = 'https://www.youtube.com/results';

/** How much of the problem the query was built from -- surfaced in diagnostics. */
export type QueryRung = 'context' | 'pageTitle' | 'urlSlug';

export interface QueryResult {
  query: string;
  rung: QueryRung;
}

/** Rung 1 and 2: a real extraction, however many of its fields came back null. */
export function varsFromContext(context: ProblemContext): TemplateVars {
  return {
    platform: context.platformLabel,
    number: context.number ?? '',
    title: context.title,
    slug: context.slug,
    difficulty: context.difficulty ?? '',
    url: context.url,
    language: context.language ?? '',
  };
}

/**
 * `'912. Sort an Array - LeetCode'` -> `{ number: '912', title: 'Sort an Array' }`.
 *
 * The site suffix and the leading number are the two things every platform
 * puts in a tab title, and both are noise in a search query -- the number
 * because the template places it itself.
 */
export function splitPageTitle(
  pageTitle: string | null | undefined,
  platformLabel: string,
): { title: string; number: string } {
  const raw = pageTitle?.trim() ?? '';
  if (!raw) return { title: '', number: '' };

  const escaped = platformLabel.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const withoutSuffix = raw.replace(new RegExp('\\s*[-|\u2013]\\s*' + escaped + '\\s*$', 'i'), '').trim();

  // A title that is nothing but the site's own name -- what these SPAs show
  // before the route resolves -- carries no problem in it, so it is a gap and
  // not a title. Reporting it as one would send the user to a search for the
  // word "LeetCode".
  if (withoutSuffix === '' || withoutSuffix.toLowerCase() === platformLabel.toLowerCase()) {
    return { title: '', number: '' };
  }

  const numbered = /^(\d+)\.\s+(.*)$/.exec(withoutSuffix);
  if (numbered?.[1] && numbered[2]) {
    return { number: numbered[1], title: numbered[2].trim() };
  }
  return { number: '', title: withoutSuffix };
}

/** Rung 3 and 4: no context at all, so the tab's own title and URL stand in. */
export function varsFromTab(
  platform: Platform,
  pageTitle: string | null | undefined,
  url: string,
): TemplateVars {
  const platformLabel = PLATFORM_LABELS[platform];
  const { title, number } = splitPageTitle(pageTitle, platformLabel);
  const fromUrl = slugWordsFromUrl(url) ?? '';

  return {
    platform: platformLabel,
    number,
    // Rung 4: a page that never set a usable title still has its own URL.
    title: title || fromUrl,
    slug: fromUrl,
    difficulty: '',
    url,
    language: '',
  };
}

function isUseful(query: string): boolean {
  // A query of nothing but the platform name searches for the platform, which
  // is not what the user asked for and looks exactly like a bug.
  return query.replace(/[^\p{L}\p{N}]+/gu, '').length > 0;
}

/**
 * Render the query, descending the ladder until something useful comes out.
 *
 * The last rung is the URL itself: pasting a problem URL into YouTube is a
 * poor search, but it is a search, and it tells the user what went wrong far
 * better than an empty results page would.
 */
export function buildQuery(
  template: string,
  vars: TemplateVars,
  fallbackUrl: string,
  from: QueryRung = 'context',
): QueryResult {
  const rendered = renderQuery(template, vars);
  if (isUseful(rendered)) return { query: rendered, rung: from };

  // The template itself can be the problem -- a user who deletes every
  // placeholder gets an empty string out of a perfectly good extraction.
  const bare = [vars['platform'], vars['number'], vars['title']]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' ');
  if (isUseful(bare)) return { query: bare, rung: 'pageTitle' };

  const words = slugWordsFromUrl(fallbackUrl);
  if (words && isUseful(words)) return { query: words, rung: 'urlSlug' };

  return { query: fallbackUrl, rung: 'urlSlug' };
}

/** `encodeURIComponent` via URLSearchParams, so spaces become `+` as YouTube expects. */
export function searchUrl(query: string): string {
  const params = new URLSearchParams({ search_query: query });
  return `${YOUTUBE_SEARCH}?${params.toString()}`;
}
