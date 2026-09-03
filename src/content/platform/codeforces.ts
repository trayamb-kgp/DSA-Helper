/**
 * Codeforces adapter (spec.md sections 3, 6.3).
 *
 * The reassuring one: server-rendered, stable class names, statement present
 * in the markup on first paint. No embedded JSON to prefer, because there is
 * nothing to prefer it over -- the DOM *is* the source here.
 *
 * Two things make it different from the others:
 *
 *   - **Problem pages have no editor at all.** `codeSource: 'none'` is the
 *     expected outcome and correct behaviour, not a failure (D014). Code is
 *     only capturable on a submit page.
 *   - **The statement is split structurally, not by heading text.** Codeforces
 *     marks its sections in the DOM, and its statements are frequently in
 *     Russian, so matching on the words "Example" and "Constraints" would work
 *     on roughly half the site (D026 keeps the language untouched).
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
import { runCodeLadder, text, titleFromDocumentTitle, toMarkdown } from './shared';

/**
 * Selectors, ordered preferred-first.
 *
 * Verified: 2026-09-03. Codeforces' markup has been stable for years, which is
 * why these are plain class names rather than the prefix-matching the SPA
 * platforms need.
 */
export const SELECTORS = {
  statement: ['.problem-statement'],
  /** Contains "A. Problem Name". */
  title: ['.problem-statement .title', '.header .title'],
  timeLimit: ['.problem-statement .time-limit'],
  memoryLimit: ['.problem-statement .memory-limit'],
  /** The prose, before the input/output specifications. */
  legend: ['.problem-statement > div:not([class])', '.problem-statement .legend'],
  inputSpec: ['.problem-statement .input-specification'],
  outputSpec: ['.problem-statement .output-specification'],
  samples: ['.problem-statement .sample-tests'],
  note: ['.problem-statement .note'],
  tags: ['.tag-box', '.roundbox .tag-box'],
} as const;

/** `*1200` in the sidebar is the rating, not a topic. */
const RATING_TAG = /^\*(\d{3,4})$/;

const PROBLEMSET_PATH = /^\/problemset\/problem\/(\d+)\/([A-Za-z]\d?)(?:\/.*)?$/;
const CONTEST_PATH = /^\/contest\/(\d+)\/problem\/([A-Za-z]\d?)(?:\/.*)?$/;
const GYM_PATH = /^\/gym\/(\d+)\/problem\/([A-Za-z]\d?)(?:\/.*)?$/;
/** Submit pages carry an editor but no statement (spec.md section 3). */
const SUBMIT_PATH = /^\/(?:problemset\/submit|contest\/\d+\/submit|gym\/\d+\/submit)(?:\/.*)?$/;

export interface CodeforcesPath {
  /** Contest or gym id: '1352', '104123'. */
  contestId: string;
  /** Problem index: 'A', 'B2'. Uppercased, since the URL accepts either. */
  index: string;
  kind: 'problemset' | 'contest' | 'gym';
}

function isCodeforcesHost(url: URL): boolean {
  return url.hostname === 'codeforces.com' || url.hostname === 'www.codeforces.com';
}

/**
 * All three problem forms collapse to one identity (D024): `1352A` is the same
 * problem whether it is reached through `/problemset/` or through `/contest/`.
 * A gym id cannot collide with a contest id, so no extra qualifier is needed.
 */
export function parsePath(url: URL): CodeforcesPath | null {
  if (!isCodeforcesHost(url)) return null;

  const forms = [
    [PROBLEMSET_PATH, 'problemset'],
    [CONTEST_PATH, 'contest'],
    [GYM_PATH, 'gym'],
  ] as const;

  for (const [pattern, kind] of forms) {
    const match = pattern.exec(url.pathname);
    const contestId = match?.[1];
    const index = match?.[2];
    if (contestId && index) return { contestId, index: index.toUpperCase(), kind };
  }
  return null;
}

/** Submit pages are matched for code capture only; they carry no statement. */
export function isSubmitPage(url: URL): boolean {
  return isCodeforcesHost(url) && SUBMIT_PATH.test(url.pathname);
}

/** `1352` + `A` -> `1352A`. The number and the identifier are the same thing here. */
function problemId(parts: CodeforcesPath): string {
  return `${parts.contestId}${parts.index}`;
}

// --- metadata ---------------------------------------------------------------

/** `'A. Sum of Round Numbers'` -> `'Sum of Round Numbers'`. */
function stripIndex(title: string): string {
  return title.replace(/^[A-Za-z]\d?\.\s*/, '').trim();
}

function readTitle(env: ExtractEnv): string | null {
  const hit = queryFirst(env.doc, SELECTORS.title);
  noteFallback(env.diagnostics, 'title', hit);
  const raw = text(hit?.el);
  if (raw) return stripIndex(raw);
  return titleFromDocumentTitle(env.doc, 'Codeforces');
}

/**
 * Rating, from the `*NNNN` tag in the sidebar.
 *
 * Codeforces has no Easy/Medium/Hard; the rating is the closest equivalent and
 * spec.md section 5 allows it as the difficulty. It is absent on gym problems
 * and on very new ones, which is a gap rather than a failure.
 */
function readDifficulty(env: ExtractEnv): string | null {
  for (const el of queryAll(env.doc, SELECTORS.tags)) {
    const value = text(el);
    const match = value ? RATING_TAG.exec(value) : null;
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Every tag except the rating, which is reported as the difficulty instead. */
function readTags(env: ExtractEnv): string[] {
  const names = queryAll(env.doc, SELECTORS.tags)
    .map((el) => text(el))
    .filter((value): value is string => value !== null && !RATING_TAG.test(value));
  return Array.from(new Set(names));
}

/**
 * The statement, split on the structure Codeforces actually marks up.
 *
 * `.problem-statement` holds, in order: a header, the unnamed legend div, the
 * input and output specifications, the sample tests, and an optional note. The
 * limits go with the constraints because that is what they are -- and on this
 * site they are usually the only constraints stated outside the prose.
 */
function readSections(env: ExtractEnv): {
  statementMd: string | null;
  examplesMd: string | null;
  constraintsMd: string | null;
} {
  const root = queryFirst(env.doc, SELECTORS.statement);
  noteFallback(env.diagnostics, 'statement', root);
  if (!root) return { statementMd: null, examplesMd: null, constraintsMd: null };

  const html = (selectors: readonly string[]): string | null =>
    queryFirst(root.el, selectors)?.el.innerHTML ?? null;

  const legend = html(SELECTORS.legend);
  const inputSpec = html(SELECTORS.inputSpec);
  const outputSpec = html(SELECTORS.outputSpec);
  const note = html(SELECTORS.note);

  const statement = [legend, inputSpec, outputSpec, note]
    .map((part) => toMarkdown(env.doc, part))
    .filter((part): part is string => part !== null)
    .join('\n\n');

  const limits = [
    text(queryFirst(root.el, SELECTORS.timeLimit)?.el),
    text(queryFirst(root.el, SELECTORS.memoryLimit)?.el),
  ].filter((value): value is string => value !== null);

  return {
    statementMd: statement === '' ? null : statement,
    examplesMd: toMarkdown(env.doc, html(SELECTORS.samples)),
    constraintsMd: limits.length > 0 ? limits.map((line) => `- ${line}`).join('\n') : null,
  };
}

// --- the adapter ------------------------------------------------------------

export const codeforces: PlatformAdapter = {
  platform: 'codeforces',
  platformLabel: 'Codeforces',

  matches(url) {
    return parsePath(url) !== null || isSubmitPage(url);
  },

  isContest(url) {
    const kind = parsePath(url)?.kind;
    return kind === 'contest' || kind === 'gym';
  },

  canonicalUrl(url) {
    const parts = parsePath(url);
    if (!parts) return `${url.origin}${url.pathname}`;
    return parts.kind === 'problemset'
      ? `${url.origin}/problemset/problem/${parts.contestId}/${parts.index}`
      : `${url.origin}/${parts.kind}/${parts.contestId}/problem/${parts.index}`;
  },

  isReady(env) {
    // A submit page never has a statement, so waiting for one would spend the
    // whole backoff on a page that is already as complete as it gets.
    if (isSubmitPage(env.url)) return true;
    if (queryFirst(env.doc, SELECTORS.statement)) return true;
    return titleFromDocumentTitle(env.doc, 'Codeforces') !== null;
  },

  extractMeta(env) {
    const parts = parsePath(env.url);
    const id = parts ? problemId(parts) : '';
    env.diagnostics.push('meta: DOM (Codeforces ships no embedded problem JSON)');

    // A submit page carries the editor but not the problem, so there is
    // nothing here to read and nothing to warn about.
    if (!parts) {
      return Promise.resolve<MetaFields>({
        slug: '',
        number: null,
        title: '',
        difficulty: null,
        tags: [],
        statementMd: null,
        examplesMd: null,
        constraintsMd: null,
        isLocked: false,
      });
    }

    const title = field('the title', () => readTitle(env), env.warnings);
    const difficulty = optionalField(() => readDifficulty(env));
    const tags = optionalField(() => readTags(env)) ?? [];
    const sections = optionalField(() => readSections(env)) ?? {
      statementMd: null,
      examplesMd: null,
      constraintsMd: null,
    };

    if (!sections.statementMd) env.warnings.push("Couldn't read the statement");

    return Promise.resolve<MetaFields>({
      slug: id,
      // The identifier *is* the number here -- `1352A` is what a solver calls
      // this problem, and what a YouTube search for it uses.
      number: id,
      title: title ?? '',
      difficulty,
      tags,
      ...sections,
      isLocked: false,
    });
  },

  extractCode(env): Promise<CodeCapture> {
    const parts = parsePath(env.url);
    // Expected to come back empty on a problem page: there is no editor there
    // (D014). Flagged as such so it reads as normal rather than as breakage.
    return runCodeLadder(env, {
      slug: parts ? problemId(parts) : '',
      number: parts?.contestId ?? null,
      editorless: !isSubmitPage(env.url),
    });
  },
};
