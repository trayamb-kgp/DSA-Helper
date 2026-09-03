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

import { html2md } from '../../core/html2md';
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
 * Editor and storage language ids -> the label that goes in the prompt.
 * Covers Monaco ids, Ace mode ids and LeetCode's own storage tokens, which
 * disagree with each other often enough to be worth one shared table.
 */
const LANGUAGE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  c_cpp: 'C++',
  csharp: 'C#',
  'c#': 'C#',
  java: 'Java',
  python: 'Python3',
  python3: 'Python3',
  pythondata: 'Python3',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  dart: 'Dart',
  golang: 'Go',
  go: 'Go',
  ruby: 'Ruby',
  scala: 'Scala',
  rust: 'Rust',
  racket: 'Racket',
  erlang: 'Erlang',
  elixir: 'Elixir',
  objectivec: 'Objective-C',
  mysql: 'MySQL',
  mssql: 'MS SQL Server',
  oraclesql: 'Oracle SQL',
  postgresql: 'PostgreSQL',
});

/** Normalise an editor or storage language token to its prompt label. */
export function languageLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const token = raw.trim().toLowerCase().replace(/^ace\/mode\//, '').replace(/^text\/x-/, '');
  if (token === '') return null;
  return LANGUAGE_LABELS[token] ?? raw.trim();
}

const PRACTICE_PATH = /^\/problems\/([^/]+)(?:\/.*)?$/;
const CONTEST_PATH = /^\/contest\/([^/]+)\/problems\/([^/]+)(?:\/.*)?$/;

/** leetcode.cn is explicitly out of scope for v1 (spec.md section 3). */
function isLeetCodeHost(url: URL): boolean {
  return url.hostname === 'leetcode.com' || url.hostname === 'www.leetcode.com';
}

interface PathParts {
  slug: string;
  contest: string | null;
}

/**
 * Tolerant of every suffix LeetCode hangs off a problem: /description/,
 * /submissions/, /solutions/1234/title/, ?envType=..., #anchor (D024).
 */
export function parsePath(url: URL): PathParts | null {
  if (!isLeetCodeHost(url)) return null;

  const contest = CONTEST_PATH.exec(url.pathname);
  if (contest) {
    const [, contestSlug, slug] = contest;
    if (contestSlug && slug) return { slug, contest: contestSlug };
    return null;
  }

  const practice = PRACTICE_PATH.exec(url.pathname);
  if (practice) {
    const [, slug] = practice;
    if (slug) return { slug, contest: null };
  }
  return null;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
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
// Statement splitting
// ---------------------------------------------------------------------------

const EXAMPLE_HEADING = /^\s*[*_#\s]*example\s*\d*\s*[:.]?[*_\s]*$/i;
const CONSTRAINTS_HEADING = /^\s*[*_#\s]*constraints\s*[:.]?[*_\s]*$/i;

function trimBlock(lines: string[]): string | null {
  const text = lines.join('\n').trim();
  return text === '' ? null : text;
}

/**
 * Split a LeetCode statement into its three prompt sections.
 *
 * Done on the markdown rather than the DOM so it works identically whether the
 * HTML came from the embedded JSON or from the page. A statement with no
 * example and no constraints heading is returned whole -- splitting is an
 * improvement to the prompt, never a precondition for one.
 *
 * A "Follow up:" block, when present, stays in the constraints section. It is
 * genuinely part of the problem and truncation never cuts constraints (D022),
 * so leaving it there is the option that cannot lose it.
 */
export function splitStatement(markdown: string | null): {
  statementMd: string | null;
  examplesMd: string | null;
  constraintsMd: string | null;
} {
  if (!markdown || markdown.trim() === '') {
    return { statementMd: null, examplesMd: null, constraintsMd: null };
  }

  const lines = markdown.split('\n');
  let firstExample = -1;
  let constraints = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (firstExample < 0 && EXAMPLE_HEADING.test(line)) firstExample = i;
    if (constraints < 0 && CONSTRAINTS_HEADING.test(line)) constraints = i;
  }

  // A "Constraints:" that precedes the first example means the headings are
  // not in the order this split assumes; leave the statement intact.
  if (constraints >= 0 && firstExample >= 0 && constraints < firstExample) {
    firstExample = -1;
  }

  const statementEnd =
    firstExample >= 0 ? firstExample : constraints >= 0 ? constraints : lines.length;
  const examplesEnd = constraints >= 0 ? constraints : lines.length;

  return {
    statementMd: trimBlock(lines.slice(0, statementEnd)),
    examplesMd: firstExample >= 0 ? trimBlock(lines.slice(firstExample, examplesEnd)) : null,
    // The heading itself is dropped: the prompt template supplies its own.
    constraintsMd: constraints >= 0 ? trimBlock(lines.slice(constraints + 1)) : null,
  };
}

// ---------------------------------------------------------------------------
// DOM readers
// ---------------------------------------------------------------------------

function text(el: Element | null | undefined): string | null {
  const value = el?.textContent?.replace(/ /g, ' ').trim();
  return value ? value : null;
}

/** '912. Sort an Array - LeetCode' -> 'Sort an Array'. The last-resort title. */
function titleFromDocumentTitle(doc: Document): string | null {
  const raw = doc.title?.trim();
  if (!raw) return null;
  const withoutSuffix = raw.replace(/\s*[-|]\s*LeetCode\s*$/i, '').trim();
  const withoutNumber = withoutSuffix.replace(/^\d+\.\s*/, '').trim();
  return withoutNumber === '' ? null : withoutNumber;
}

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
// Code ladder (spec.md section 6.4)
// ---------------------------------------------------------------------------

const KNOWN_LANGUAGE_TOKENS = new Set(Object.keys(LANGUAGE_LABELS));

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const parsed = tryParse(trimmed);
    if (typeof parsed === 'string') return parsed;
  }
  return trimmed;
}

/**
 * The language currently selected in the editor, as LeetCode remembers it.
 *
 * LeetCode keeps this in a global key whose name has changed more than once,
 * so it is probed the same way the buffers are: any key that mentions a
 * language and holds a token we recognise.
 */
export function probeLanguage(storage: Storage | null): string | null {
  if (!storage) return null;
  const matches: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key || !/lang/i.test(key)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    const token = unquote(raw).toLowerCase();
    if (KNOWN_LANGUAGE_TOKENS.has(token)) matches.push(token);
  }
  if (matches.length === 0) return null;
  // Deterministic when several keys disagree; they normally don't.
  matches.sort();
  return matches[0] ?? null;
}

interface StorageCandidate {
  key: string;
  code: string;
  language: string | null;
}

/** A stored value is code if we can find a non-blank string in it. */
function plausibleCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
    const parsed = tryParse(trimmed);
    if (typeof parsed === 'string') return parsed.trim() === '' ? null : parsed;
    if (isRecord(parsed) && !Array.isArray(parsed)) {
      const code = parsed['code'] ?? parsed['value'] ?? parsed['text'];
      if (typeof code === 'string' && code.trim() !== '') return code;
    }
    return null; // structured, but not a shape we understand -- don't guess
  }
  return trimmed;
}

function languageFromKey(key: string): string | null {
  const parts = key.toLowerCase().split(/[^a-z0-9+#]+/);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part && KNOWN_LANGUAGE_TOKENS.has(part)) return part;
  }
  return null;
}

const REGEX_META = /[\\^$.*+?()[\]{}|]/g;

function escapeRegExp(value: string): string {
  return value.replace(REGEX_META, '\\$&');
}

/** A bare id has to be delimited or '1' matches half the keys in storage. */
function delimitedId(id: string): RegExp {
  return new RegExp('(?:^|[^0-9])' + escapeRegExp(id) + '(?:[^0-9]|$)');
}

/**
 * Layer 1 -- site storage.
 *
 * Keys are never hard-coded: LeetCode's key shape is version-dependent and has
 * changed before. Every key that mentions the slug (or, failing that, the
 * frontend id) is a candidate, and the open language decides between them.
 *
 * Note on "most recent": spec.md section 6.4 asks for the most recently
 * written value, but the Storage API exposes no write time and LeetCode stores
 * none, so recency is not knowable here. Selecting by the open editor's
 * language is both available and a better answer -- it is what D025 says the
 * solution attempt is (D038).
 */
export function fromSiteStorage(env: ExtractEnv, slug: string, number: string | null): CodeCapture {
  const storage = env.storage;
  if (!storage) return { code: null, language: null, source: 'none' };

  const openLanguage = probeLanguage(storage);
  const bySlug: StorageCandidate[] = [];
  const byNumber: StorageCandidate[] = [];
  const idPattern = number ? delimitedId(number) : null;

  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    const lower = key.toLowerCase();
    const mentionsSlug = lower.includes(slug.toLowerCase());
    const mentionsNumber = idPattern != null && idPattern.test(lower);
    if (!mentionsSlug && !mentionsNumber) continue;

    const raw = storage.getItem(key);
    if (!raw) continue;
    const code = plausibleCode(raw);
    if (!code) continue;

    const candidate: StorageCandidate = { key, code, language: languageFromKey(key) };
    if (mentionsSlug) bySlug.push(candidate);
    else byNumber.push(candidate);
  }

  // The slug is a far stronger signal than a bare number; only fall back to
  // number matches when nothing named the slug.
  const candidates = bySlug.length > 0 ? bySlug : byNumber;
  if (candidates.length === 0) return { code: null, language: null, source: 'none' };

  let chosen: StorageCandidate | undefined;
  if (openLanguage) {
    chosen = candidates.find((c) => c.language === openLanguage);
  }
  if (!chosen) {
    if (candidates.length > 1) {
      env.warnings.push(
        "Couldn't tell which language buffer is open — used the longest saved one",
      );
    }
    // Deterministic tiebreak: the longest buffer, then the key name. Stable
    // across runs, which matters more than being clever.
    chosen = [...candidates].sort(
      (a, b) => b.code.length - a.code.length || a.key.localeCompare(b.key),
    )[0];
  }
  if (!chosen) return { code: null, language: null, source: 'none' };

  env.diagnostics.push(`code: site storage key ${chosen.key}`);
  return {
    code: chosen.code,
    language: languageLabel(chosen.language ?? openLanguage),
    source: 'siteStorage',
  };
}

/** Layer 2 -- the editor's own model, through the MAIN-world bridge. */
async function fromEditorApi(env: ExtractEnv): Promise<CodeCapture> {
  if (!env.readEditor) return { code: null, language: null, source: 'none' };

  const reading = await env.readEditor().catch(() => null);
  if (!reading?.code || reading.code.trim() === '') {
    return { code: null, language: null, source: 'none' };
  }
  if (reading.truncated) {
    env.warnings.push('Code was very long and has been truncated');
  }
  if (reading.editor) env.diagnostics.push(`code: ${reading.editor} model`);

  return {
    code: reading.code,
    language: languageLabel(reading.language) ?? languageLabel(probeLanguage(env.storage)),
    source: 'editorApi',
  };
}

/** Monaco positions its lines absolutely, so DOM order is not reading order. */
function lineTop(el: Element): number {
  const style = (el as HTMLElement).style?.top ?? '';
  const value = Number.parseFloat(style);
  return Number.isFinite(value) ? value : Number.NaN;
}

function joinLines(elements: Element[]): string {
  const tops = elements.map(lineTop);
  const ordered = tops.every((t) => Number.isFinite(t))
    ? elements
        .map((el, i) => ({ el, top: tops[i] ?? 0 }))
        .sort((a, b) => a.top - b.top)
        .map((entry) => entry.el)
    : elements;

  return ordered
    .map((el) => (el.textContent ?? '').replace(/ /g, ' ').replace(/\s+$/, ''))
    .join('\n');
}

/**
 * Layer 3 -- scrape the rendered lines.
 *
 * Always flagged. A virtualised editor only renders what is on screen, so this
 * is the layer most likely to hand back a confident-looking half of a file.
 */
function fromDomScrape(env: ExtractEnv): CodeCapture {
  for (const selectors of [SELECTORS.monacoLine, SELECTORS.aceLine, SELECTORS.cmLine]) {
    const lines = queryAll(env.doc, selectors);
    if (lines.length === 0) continue;
    const code = joinLines(lines);
    if (code.trim() === '') continue;
    env.warnings.push('Code may be incomplete — only the visible lines were readable');
    env.diagnostics.push(`code: DOM scrape, ${lines.length} lines`);
    return { code, language: languageLabel(probeLanguage(env.storage)), source: 'domScrape' };
  }
  return { code: null, language: null, source: 'none' };
}

/** Layer 4 -- whatever the user has selected on the page. */
function fromSelection(env: ExtractEnv): CodeCapture {
  const selected = optionalField(() => env.selection?.());
  if (!selected || selected.trim() === '') return { code: null, language: null, source: 'none' };
  env.diagnostics.push('code: user selection');
  return {
    code: selected,
    language: languageLabel(probeLanguage(env.storage)),
    source: 'selection',
  };
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
    return titleFromDocumentTitle(env.doc) !== null;
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
        return text(hit?.el) ?? titleFromDocumentTitle(env.doc);
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

    const markdown = optionalField(() => {
      if (!statementHtml) return null;
      // An inert document, not a detached element: a document with no browsing
      // context neither runs scripts nor fetches the images in the statement.
      // A detached <div> in the live document would still hit the network,
      // which is a thing this extension never does (D010).
      const inert = env.doc.implementation.createHTMLDocument('');
      inert.body.innerHTML = statementHtml;
      return html2md(inert.body);
    });

    const sections = splitStatement(markdown);

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

    const layers: Array<() => CodeCapture | Promise<CodeCapture>> = [
      () => optionalField(() => fromSiteStorage(env, slug, number)) ?? empty(),
      () => fromEditorApi(env),
      () => optionalField(() => fromDomScrape(env)) ?? empty(),
      () => fromSelection(env),
    ];

    for (const layer of layers) {
      const capture = await Promise.resolve(layer()).catch(() => empty());
      if (capture.code && capture.code.trim() !== '') return capture;
    }

    env.warnings.push("Couldn't read your code from this page");
    return empty();
  },
};

function empty(): CodeCapture {
  return { code: null, language: null, source: 'none' };
}
