/**
 * CodeChef adapter (spec.md sections 3, 6.3).
 *
 * An SPA, so the fragile pair with GeeksforGeeks. Embedded problem JSON first
 * where the page caches its API response, `#problem-statement` after.
 *
 * The statement arrives as **markdown already**, not HTML: CodeChef authors in
 * markdown and its API returns the source. That is a gift -- there is nothing
 * to convert and nothing to lose -- but it means the JSON path and the DOM
 * path produce text by different routes, so both are tested.
 */

import {
  field,
  optionalField,
  queryAll,
  queryFirst,
  noteFallback,
  type CodeCapture,
  type MetaFields,
  type PlatformAdapter,
} from './adapter';
import {
  isRecord,
  runCodeLadder,
  splitStatement,
  text,
  titleFromDocumentTitle,
  toMarkdown,
  tryParse,
} from './shared';

/**
 * Selectors, ordered preferred-first.
 *
 * Verified: 2026-09-03. CodeChef's SPA rebuilt its problem page more than once,
 * so the id selector leads and class-prefix matches follow it.
 */
export const SELECTORS = {
  statement: [
    '#problem-statement',
    '[class*="problem-statement"]',
    '[class*="_problemStatement"]',
    '.problem-statement',
  ],
  title: ['#problem-code', 'h1[class*="problem"]', '.problem-name', 'h1'],
  difficulty: ['[class*="difficulty"]', '[class*="_rating"]'],
  tags: ['a[href*="/tags/problems/"]', '[class*="problem-tag"] a'],
} as const;

const PRACTICE_PATH = /^\/problems\/([A-Za-z0-9_]+)(?:\/.*)?$/;
const CONTEST_PATH = /^\/([A-Za-z0-9_-]+)\/problems\/([A-Za-z0-9_]+)(?:\/.*)?$/;

/** Paths that look like a contest but are the site's own sections. */
const NOT_CONTESTS = new Set(['api', 'users', 'submit', 'ide', 'ranking', 'certification']);

export interface CodeChefPath {
  /** The problem code: 'FLOW001'. Uppercased -- the URL accepts either case. */
  code: string;
  /** Contest slug, or null for a practice problem. */
  contest: string | null;
}

function isCodeChefHost(url: URL): boolean {
  return url.hostname === 'www.codechef.com' || url.hostname === 'codechef.com';
}

/**
 * Contest problems live under an arbitrary first segment, so the practice form
 * has to be tried first or `/problems/FLOW001` would read as a contest called
 * "problems" (D024 -- both forms are one identity anyway).
 */
export function parsePath(url: URL): CodeChefPath | null {
  if (!isCodeChefHost(url)) return null;

  const practice = PRACTICE_PATH.exec(url.pathname);
  const practiceCode = practice?.[1];
  if (practiceCode) return { code: practiceCode.toUpperCase(), contest: null };

  const contest = CONTEST_PATH.exec(url.pathname);
  const contestSlug = contest?.[1];
  const contestCode = contest?.[2];
  if (contestSlug && contestCode && !NOT_CONTESTS.has(contestSlug.toLowerCase())) {
    return { code: contestCode.toUpperCase(), contest: contestSlug };
  }
  return null;
}

// --- embedded problem JSON --------------------------------------------------

interface ProblemJson {
  problem_name?: unknown;
  problem_code?: unknown;
  body?: unknown;
  problem_author?: unknown;
  difficulty_rating?: unknown;
  tags?: unknown;
}

function looksLikeProblem(value: Record<string, unknown>, code: string): boolean {
  const stored = value['problem_code'];
  if (typeof stored === 'string' && stored.toUpperCase() === code) return true;
  return 'problem_name' in value && 'body' in value;
}

/**
 * CodeChef's difficulty chip renders its own label: the live DOM reads
 * `Difficulty:242`, label glued to the rating. The label is UI chrome, the
 * rating is the value, so strip a leading "Difficulty" (with an optional colon
 * and surrounding space) and let the number stand alone. Text that carries no
 * such label -- the JSON rating, or an older DOM shape -- passes through as is.
 */
function stripDifficultyLabel(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.replace(/^\s*difficulty\s*:?\s*/i, '').trim();
  return value === '' ? null : value;
}

const MAX_SCRIPT_CHARS = 4 * 1024 * 1024;

/**
 * Depth- and budget-capped walk, the same shape the LeetCode adapter uses and
 * deliberately not shared with it: what counts as "the problem object" is the
 * one thing that is genuinely per-platform.
 */
function findProblem(root: unknown, code: string): ProblemJson | null {
  const queue: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
  let budget = 20000;

  while (queue.length > 0 && budget > 0) {
    const next = queue.shift();
    if (!next) break;
    budget -= 1;
    const { node, depth } = next;
    if (depth > 12 || !isRecord(node)) continue;

    if (!Array.isArray(node) && looksLikeProblem(node, code)) return node as ProblemJson;
    for (const value of Object.values(node)) {
      if (isRecord(value)) queue.push({ node: value, depth: depth + 1 });
    }
  }
  return null;
}

export function findProblemJson(doc: Document, code: string): ProblemJson | null {
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const source = script.textContent;
    if (!source || source.length > MAX_SCRIPT_CHARS) continue;
    if (!source.includes('problem_code') && !source.includes('problem_name')) continue;

    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end <= start) continue;

    const parsed = tryParse(source.slice(start, end + 1));
    if (parsed === undefined) continue;

    const problem = findProblem(parsed, code);
    if (problem) return problem;
  }
  return null;
}

// --- the adapter ------------------------------------------------------------

export const codechef: PlatformAdapter = {
  platform: 'codechef',
  platformLabel: 'CodeChef',

  matches(url) {
    return parsePath(url) !== null;
  },

  isContest(url) {
    return parsePath(url)?.contest != null;
  },

  canonicalUrl(url) {
    const parts = parsePath(url);
    if (!parts) return `${url.origin}${url.pathname}`;
    return parts.contest
      ? `${url.origin}/${parts.contest}/problems/${parts.code}`
      : `${url.origin}/problems/${parts.code}`;
  },

  isReady(env) {
    if (queryFirst(env.doc, SELECTORS.statement)) return true;
    return titleFromDocumentTitle(env.doc, 'CodeChef') !== null;
  },

  extractMeta(env) {
    const code = parsePath(env.url)?.code ?? '';
    const problem = optionalField(() => findProblemJson(env.doc, code));
    env.diagnostics.push(problem ? 'meta: embedded problem JSON' : 'meta: DOM fallback');

    const title = field(
      'the title',
      () => {
        const name = problem?.problem_name;
        if (typeof name === 'string' && name.trim() !== '') return name.trim();
        const hit = queryFirst(env.doc, SELECTORS.title);
        noteFallback(env.diagnostics, 'title', hit);
        return text(hit?.el) ?? titleFromDocumentTitle(env.doc, 'CodeChef');
      },
      env.warnings,
    );

    const difficulty = optionalField(() => {
      const rating = problem?.difficulty_rating;
      if (typeof rating === 'number' && Number.isFinite(rating)) return String(rating);
      if (typeof rating === 'string' && rating.trim() !== '') return rating.trim();
      const hit = queryFirst(env.doc, SELECTORS.difficulty);
      return stripDifficultyLabel(text(hit?.el));
    });

    const tags =
      optionalField(() => {
        const listed = problem?.tags;
        if (Array.isArray(listed)) {
          const names = listed
            .map((tag) =>
              typeof tag === 'string'
                ? tag
                : isRecord(tag) && typeof tag['tag_name'] === 'string'
                  ? tag['tag_name']
                  : null,
            )
            .filter((name): name is string => name !== null && name.trim() !== '');
          if (names.length > 0) return names;
        }
        const fromDom = queryAll(env.doc, SELECTORS.tags)
          .map((el) => text(el))
          .filter((name): name is string => name !== null);
        return fromDom.length > 0 ? Array.from(new Set(fromDom)) : null;
      }) ?? [];

    const markdown = field(
      'the statement',
      () => {
        // The JSON body is already markdown -- CodeChef authors in it and its
        // API returns the source, so converting would only lose fidelity.
        const body = problem?.body;
        if (typeof body === 'string' && body.trim() !== '') return body.trim();

        const hit = queryFirst(env.doc, SELECTORS.statement);
        noteFallback(env.diagnostics, 'statement', hit);
        return toMarkdown(env.doc, hit?.el.innerHTML);
      },
      env.warnings,
    );

    return Promise.resolve<MetaFields>({
      slug: code,
      // CodeChef's identifier is its code; there is no separate number.
      number: code === '' ? null : code,
      title: title ?? '',
      difficulty,
      tags,
      ...splitStatement(markdown),
      isLocked: false,
    });
  },

  extractCode(env): Promise<CodeCapture> {
    const code = parsePath(env.url)?.code ?? '';
    return runCodeLadder(env, { slug: code, number: null });
  },
};
