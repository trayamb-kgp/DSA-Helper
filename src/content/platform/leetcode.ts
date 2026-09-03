/**
 * LeetCode adapter (spec.md sections 3, 6.3, 6.4).
 *
 * Metadata comes from the question JSON the page embeds when it can, and from
 * the DOM when it can't -- JSON survives visual redesigns, CSS classes do not.
 * Code comes off a four-layer ladder, most trustworthy first.
 *
 * Every selector this file uses lives in SELECTORS below, each list ordered
 * preferred-first. When LeetCode moves, this is the one object to repair.
 */

import { parseLeetCodePath } from '../../core/urls';
import {
  field,
  optionalField,
  queryAll,
  queryFirst,
  noteFallback,
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
 * Verified: 2026-09-03, against leetcode.com's React description panel.
 * `elfjS` is a hashed class and will change -- it sits behind the stable
 * data-attribute deliberately, as a fallback rather than a dependency.
 */
export const SELECTORS = {
  statement: [
    '[data-track-load="description_content"]',
    'div[class*="elfjS"]',
    '.question-content',
    '.content__u3I1',
  ],
  title: [
    'a[href^="/problems/"][class*="text-title"]',
    'div[data-cy="question-title"]',
    '[data-track-load="description_content"] ~ * a[href^="/problems/"]',
    'a[href^="/problems/"]',
  ],
  difficulty: [
    'div[class*="text-difficulty-"]',
    '[data-difficulty]',
    'div[class*="difficulty"]',
  ],
  tags: ['a[href^="/tag/"]'],
  /** Scoped to the description region: LeetCode's own nav says "Premium" on every page. */
  lock: ['a[href*="/subscribe"]', '[data-icon="lock"]', 'svg[data-icon="lock"]'],
  monacoLine: ['.view-line'],
  aceLine: ['.ace_line'],
  cmLine: ['.cm-line'],
} as const;

/** LeetCode's paywall copy. Specific enough to not fire on an ordinary page. */
const LOCK_PHRASES = ['subscribe to unlock', 'premium problem'] as const;

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

/**
 * Re-exported so the adapter and its tests keep one name for this, while the
 * regexes themselves live in core/urls.ts -- the service worker needs them
 * too, and must not import an adapter to get them.
 */
export const parsePath = parseLeetCodePath;

// ---------------------------------------------------------------------------
// Embedded question JSON
// ---------------------------------------------------------------------------

interface QuestionJson {
  title?: unknown;
  titleSlug?: unknown;
  questionFrontendId?: unknown;
  difficulty?: unknown;
  topicTags?: unknown;
  content?: unknown;
  isPaidOnly?: unknown;
}

/** A question object is one that names itself. Either marker alone is enough. */
function looksLikeQuestion(value: Record<string, unknown>, slug: string): boolean {
  if (typeof value['titleSlug'] === 'string' && value['titleSlug'] === slug) return true;
  return 'questionFrontendId' in value && 'title' in value;
}

/**
 * Depth- and budget-capped walk. LeetCode's embedded state is large and its
 * shape is not ours to rely on, so the search is for the object rather than
 * for a path to it.
 */
function findQuestion(root: unknown, slug: string): QuestionJson | null {
  const queue: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
  let budget = 20000;

  while (queue.length > 0 && budget > 0) {
    const next = queue.shift();
    if (!next) break;
    budget -= 1;
    const { node, depth } = next;
    if (depth > 12 || !isRecord(node)) continue;

    if (!Array.isArray(node) && looksLikeQuestion(node, slug)) return node as QuestionJson;

    for (const value of Object.values(node)) {
      if (isRecord(value)) queue.push({ node: value, depth: depth + 1 });
      else if (typeof value === 'string' && value.length < 4096) {
        // Some state blobs hold their payload as an escaped JSON string.
        if (value.includes('"questionFrontendId"') || value.includes('"titleSlug"')) {
          const nested = tryParse(value);
          if (nested !== undefined) queue.push({ node: nested, depth: depth + 1 });
        }
      }
    }
  }
  return null;
}

/** Pull the JSON body out of a `window.__X = {...};` assignment. */
function jsonBody(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  return tryParse(text.slice(start, end + 1));
}

const MAX_SCRIPT_CHARS = 4 * 1024 * 1024;

/**
 * Question JSON from page scripts, if the page ships any.
 *
 * Deliberately not keyed on a container name: LeetCode has shipped Next.js
 * data, an Apollo cache and neither, and the container is the part most likely
 * to change. What is searched for is a script that mentions a question at all.
 */
export function findQuestionJson(doc: Document, slug: string): QuestionJson | null {
  const scripts = Array.from(doc.querySelectorAll('script'));
  for (const script of scripts) {
    const text = script.textContent;
    if (!text || text.length > MAX_SCRIPT_CHARS) continue;
    if (!text.includes('"questionFrontendId"') && !text.includes('"titleSlug"')) continue;

    const type = script.getAttribute('type') ?? '';
    const parsed = type.includes('json') ? tryParse(text) ?? jsonBody(text) : jsonBody(text);
    if (parsed === undefined) continue;

    const question = findQuestion(parsed, slug);
    if (question) return question;
  }
  return null;
}

// ---------------------------------------------------------------------------
// DOM readers
// ---------------------------------------------------------------------------

function numberFromDocumentTitle(doc: Document): string | null {
  const match = /^(\d+)\.\s/.exec(doc.title?.trim() ?? '');
  return match?.[1] ?? null;
}

function readDifficulty(env: ExtractEnv): string | null {
  const hit = queryFirst(env.doc, SELECTORS.difficulty);
  noteFallback(env.diagnostics, 'difficulty', hit);
  const direct = text(hit?.el);
  if (direct && (DIFFICULTIES as readonly string[]).includes(direct)) return direct;

  // The chip is a hashed class away from being unreadable, so fall back to
  // finding the word itself in a difficulty-ish container.
  try {
    for (const el of Array.from(env.doc.querySelectorAll('[class*="difficulty" i]'))) {
      const value = text(el);
      if (value && (DIFFICULTIES as readonly string[]).includes(value)) return value;
    }
  } catch {
    // Case-insensitive attribute matching is not universally supported.
  }
  return direct;
}

function readTags(env: ExtractEnv): string[] {
  const anchors = queryAll(env.doc, SELECTORS.tags);
  const names = anchors.map((a) => text(a)).filter((t): t is string => t !== null);
  return Array.from(new Set(names));
}

/**
 * Locked detection (D027, spec.md section 6.6).
 *
 * The marker has to be positive evidence of a paywall, never "the statement is
 * missing" -- otherwise a broken selector and a Premium problem look identical,
 * which is the exact confusion this decision exists to remove.
 */
function readLocked(env: ExtractEnv, question: QuestionJson | null): boolean {
  if (question && question.isPaidOnly === true) {
    const content = typeof question.content === 'string' ? question.content.trim() : '';
    // Paid-only with the content present means the user has Premium.
    if (content === '') return true;
  }

  const region = queryFirst(env.doc, SELECTORS.statement)?.el ?? env.doc.body;
  if (!region) return false;

  if (queryFirst(region, SELECTORS.lock)) return true;

  const haystack = (region.textContent ?? '').toLowerCase();
  return LOCK_PHRASES.some((phrase) => haystack.includes(phrase));
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export const leetcode: PlatformAdapter = {
  platform: 'leetcode',
  platformLabel: 'LeetCode',

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
      ? `${url.origin}/contest/${parts.contest}/problems/${parts.slug}/`
      : `${url.origin}/problems/${parts.slug}/`;
  },

  isReady(env) {
    if (queryFirst(env.doc, SELECTORS.statement)) return true;
    // A locked problem never renders a statement; waiting for one would spend
    // the whole backoff on a page that is already as complete as it gets.
    if (queryFirst(env.doc, SELECTORS.lock)) return true;
    return titleFromDocumentTitle(env.doc, 'LeetCode') !== null;
  },

  extractMeta(env) {
    const parts = parsePath(env.url);
    const slug = parts?.slug ?? '';
    const question = optionalField(() => findQuestionJson(env.doc, slug));
    if (question) env.diagnostics.push('meta: embedded question JSON');
    else env.diagnostics.push('meta: DOM fallback');

    const title = field(
      'the title',
      () => {
        if (typeof question?.title === 'string' && question.title.trim() !== '') {
          return question.title.trim();
        }
        const hit = queryFirst(env.doc, SELECTORS.title);
        noteFallback(env.diagnostics, 'title', hit);
        return text(hit?.el) ?? titleFromDocumentTitle(env.doc, 'LeetCode');
      },
      env.warnings,
    );

    const number = optionalField(() => {
      const id = question?.questionFrontendId;
      if (typeof id === 'string' && id.trim() !== '') return id.trim();
      if (typeof id === 'number') return String(id);
      return numberFromDocumentTitle(env.doc);
    });

    const difficulty = optionalField(() => {
      const fromJson = question?.difficulty;
      if (typeof fromJson === 'string' && fromJson.trim() !== '') return fromJson.trim();
      return readDifficulty(env);
    });

    const tags =
      optionalField(() => {
        const topicTags = question?.topicTags;
        if (Array.isArray(topicTags)) {
          const names = topicTags
            .map((tag) => (isRecord(tag) && typeof tag['name'] === 'string' ? tag['name'] : null))
            .filter((name): name is string => name !== null && name.trim() !== '');
          if (names.length > 0) return names;
        }
        const fromDom = readTags(env);
        return fromDom.length > 0 ? fromDom : null;
      }) ?? [];

    const isLocked = optionalField(() => readLocked(env, question)) ?? false;

    // Locked problems have no statement to read; that is the condition, not a
    // gap, so it must not also produce "Couldn't read the statement" (D027).
    const statementHtml = isLocked
      ? null
      : field(
          'the statement',
          () => {
            const content = question?.content;
            if (typeof content === 'string' && content.trim() !== '') return content;
            const hit = queryFirst(env.doc, SELECTORS.statement);
            noteFallback(env.diagnostics, 'statement', hit);
            return hit?.el.innerHTML ?? null;
          },
          env.warnings,
        );

    const sections = splitStatement(optionalField(() => toMarkdown(env.doc, statementHtml)));

    return Promise.resolve<MetaFields>({
      slug,
      number,
      title: title ?? '',
      difficulty,
      tags,
      ...sections,
      isLocked,
    });
  },

  async extractCode(env) {
    const parts = parsePath(env.url);
    const slug = parts?.slug ?? '';

    // Only used as a weaker fallback for storage-key matching, so the page
    // title is signal enough -- re-walking every embedded script here would
    // spend the extraction budget twice for a value that rarely decides anything.
    const number = optionalField(() => numberFromDocumentTitle(env.doc));

    return runCodeLadder(env, { slug, number });
  },
};
