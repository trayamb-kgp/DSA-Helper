/**
 * GeeksforGeeks (Practice) adapter (spec.md sections 3, 6.3).
 *
 * The other SPA, and the one with the least to hold on to:
 *
 *   - **No problem number.** The slug is the identifier (D024), which is why
 *     `number` is null here and the YouTube template collapses that variable
 *     away rather than rendering a gap.
 *   - **Hashed CSS-module class names** -- `problems_problem_content__aB3xY`.
 *     The hash changes on every build, so these are matched by **prefix only**,
 *     never exactly (architecture.md section 6.3). An exact match here is a
 *     bug with a delayed fuse: it works until GfG next deploys.
 *
 * GfG *article* pages are out of scope; only `/problems/` is claimed.
 */

import {
  field,
  optionalField,
  queryAll,
  queryFirst,
  noteFallback,
  type CodeCapture,
  type ExtractEnv,
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
 * Verified: 2026-09-03. Every CSS-module selector below uses `[class*=...]`
 * with the stable prefix and stops before the hash. Read the file header
 * before "tidying" any of these into an exact class name.
 */
export const SELECTORS = {
  statement: [
    '[class^="problems_problem_content__"]',
    '[class*="problems_problem_content__"]',
    '[class*="problem_content"]',
    '.problem-statement',
  ],
  title: [
    '[class*="problems_header_content__title"]',
    '[class*="problem_header"] h3',
    'h1',
  ],
  difficulty: [
    '[class*="problems_header_description__"]',
    '[class*="difficulty"]',
  ],
  tags: ['[class*="problems_tag__"] a', 'a[href*="/tag/"]'],
} as const;

const DIFFICULTIES = ['Basic', 'Easy', 'Medium', 'Hard'] as const;

/**
 * `/problems/<slug>/1`, `/problems/<slug>`, and the same under the practice
 * host. The trailing segment is GfG's own numeric page id and is not part of
 * the problem's identity.
 */
const PROBLEM_PATH = /^\/problems\/([^/]+)(?:\/.*)?$/;

const HOSTS = new Set([
  'www.geeksforgeeks.org',
  'geeksforgeeks.org',
  'practice.geeksforgeeks.org',
]);

export interface GfgPath {
  slug: string;
}

export function parsePath(url: URL): GfgPath | null {
  if (!HOSTS.has(url.hostname)) return null;
  const slug = PROBLEM_PATH.exec(url.pathname)?.[1];
  return slug ? { slug } : null;
}

// --- embedded problem JSON --------------------------------------------------

interface ProblemJson {
  problem_name?: unknown;
  problem_question?: unknown;
  problem_difficulty?: unknown;
  tags?: unknown;
  slug?: unknown;
}

function looksLikeProblem(value: Record<string, unknown>, slug: string): boolean {
  if (typeof value['slug'] === 'string' && value['slug'] === slug) return true;
  return 'problem_name' in value && 'problem_question' in value;
}

const MAX_SCRIPT_CHARS = 4 * 1024 * 1024;

function findProblem(root: unknown, slug: string): ProblemJson | null {
  const queue: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
  let budget = 20000;

  while (queue.length > 0 && budget > 0) {
    const next = queue.shift();
    if (!next) break;
    budget -= 1;
    const { node, depth } = next;
    if (depth > 12 || !isRecord(node)) continue;

    if (!Array.isArray(node) && looksLikeProblem(node, slug)) return node as ProblemJson;
    for (const value of Object.values(node)) {
      if (isRecord(value)) queue.push({ node: value, depth: depth + 1 });
    }
  }
  return null;
}

export function findProblemJson(doc: Document, slug: string): ProblemJson | null {
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const source = script.textContent;
    if (!source || source.length > MAX_SCRIPT_CHARS) continue;
    if (!source.includes('problem_question') && !source.includes('problem_name')) continue;

    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end <= start) continue;

    const parsed = tryParse(source.slice(start, end + 1));
    if (parsed === undefined) continue;

    const problem = findProblem(parsed, slug);
    if (problem) return problem;
  }
  return null;
}

// --- DOM readers ------------------------------------------------------------

/**
 * The difficulty chip.
 *
 * GfG puts it in a header block alongside other text, so the word is looked for
 * rather than the element's whole content being trusted. "Basic" is GfG's own
 * fourth level and is not a typo for "Easy".
 */
function readDifficulty(env: ExtractEnv): string | null {
  for (const el of queryAll(env.doc, SELECTORS.difficulty)) {
    const content = text(el);
    if (!content) continue;
    for (const level of DIFFICULTIES) {
      if (new RegExp(`\\b${level}\\b`, 'i').test(content)) return level;
    }
  }
  return null;
}

/** `'subarray-with-given-sum-1587115621'` -> `'Subarray With Given Sum'`. */
function titleFromSlug(slug: string): string | null {
  const words = slug
    .replace(/-\d{6,}$/, '') // GfG appends a numeric id to most slugs
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : null;
}

// --- the adapter ------------------------------------------------------------

export const geeksforgeeks: PlatformAdapter = {
  platform: 'geeksforgeeks',
  platformLabel: 'GeeksforGeeks',

  matches(url) {
    return parsePath(url) !== null;
  },

  /** GfG Practice has no contest problems in scope for v1. */
  isContest() {
    return false;
  },

  canonicalUrl(url) {
    const parts = parsePath(url);
    if (!parts) return `${url.origin}${url.pathname}`;
    return `${url.origin}/problems/${parts.slug}/1`;
  },

  isReady(env) {
    if (queryFirst(env.doc, SELECTORS.statement)) return true;
    return titleFromDocumentTitle(env.doc, 'GeeksforGeeks') !== null;
  },

  extractMeta(env) {
    const slug = parsePath(env.url)?.slug ?? '';
    const problem = optionalField(() => findProblemJson(env.doc, slug));
    env.diagnostics.push(problem ? 'meta: embedded problem JSON' : 'meta: DOM fallback');

    const title = field(
      'the title',
      () => {
        const name = problem?.problem_name;
        if (typeof name === 'string' && name.trim() !== '') return name.trim();

        const hit = queryFirst(env.doc, SELECTORS.title);
        noteFallback(env.diagnostics, 'title', hit);
        return (
          text(hit?.el) ??
          titleFromDocumentTitle(env.doc, 'GeeksforGeeks') ??
          // The slug is the identifier here, so it is also the last thing left
          // to make a title out of.
          titleFromSlug(slug)
        );
      },
      env.warnings,
    );

    const difficulty = optionalField(() => {
      const level = problem?.problem_difficulty;
      if (typeof level === 'string' && level.trim() !== '') return level.trim();
      return readDifficulty(env);
    });

    const tags =
      optionalField(() => {
        const listed = problem?.tags;
        if (Array.isArray(listed)) {
          const names = listed
            .map((tag) =>
              typeof tag === 'string'
                ? tag
                : isRecord(tag) && typeof tag['name'] === 'string'
                  ? tag['name']
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
        const question = problem?.problem_question;
        if (typeof question === 'string' && question.trim() !== '') {
          return toMarkdown(env.doc, question);
        }
        const hit = queryFirst(env.doc, SELECTORS.statement);
        noteFallback(env.diagnostics, 'statement', hit);
        return toMarkdown(env.doc, hit?.el.innerHTML);
      },
      env.warnings,
    );

    return Promise.resolve<MetaFields>({
      slug,
      // GfG has no problem number at all; the slug carries the identity (D024).
      number: null,
      title: title ?? '',
      difficulty,
      tags,
      ...splitStatement(markdown),
      isLocked: false,
    });
  },

  extractCode(env): Promise<CodeCapture> {
    const slug = parsePath(env.url)?.slug ?? '';
    return runCodeLadder(env, { slug, number: null });
  },
};
