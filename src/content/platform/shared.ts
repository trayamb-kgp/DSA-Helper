/**
 * What every adapter needs and none of them should own.
 *
 * Phase 6's exit criterion is that no adapter imports from another, and the
 * four-layer code ladder plus the language table are the same everywhere. They
 * live here so a fix reaches all four platforms, and so a Codeforces bug can
 * never be caused by editing LeetCode.
 *
 * Nothing platform-specific belongs in this file. Selectors, JSON shapes and
 * paywall markers stay in the adapter that knows about them.
 */

import { html2md } from '../../core/html2md';
import {
  optionalField,
  queryAll,
  type CodeCapture,
  type ExtractEnv,
} from './adapter';

// --- small helpers ----------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const REGEX_META = /[\\^$.*+?()[\]{}|]/g;

export function escapeRegExp(value: string): string {
  return value.replace(REGEX_META, '\\$&');
}

/** Trimmed text with non-breaking spaces normalised, or null when empty. */
export function text(el: Element | null | undefined): string | null {
  const value = el?.textContent?.replace(/\u00a0/g, ' ').trim();
  return value ? value : null;
}

/**
 * Parse extracted HTML into markdown without touching the live document.
 *
 * An inert document, not a detached `<div>`: a document with no browsing
 * context neither runs scripts nor fetches the images in a statement. A
 * detached div in the live document would still hit the network, which is a
 * thing this extension never does (D010).
 */
export function toMarkdown(doc: Document, html: string | null | undefined): string | null {
  if (!html || html.trim() === '') return null;
  const inert = doc.implementation.createHTMLDocument('');
  inert.body.innerHTML = html;
  const md = html2md(inert.body);
  return md.trim() === '' ? null : md;
}

/** `'912. Sort an Array - LeetCode'` -> `'Sort an Array'`. Last-resort title. */
export function titleFromDocumentTitle(doc: Document, siteName: string): string | null {
  const raw = doc.title?.trim();
  if (!raw) return null;

  const suffix = new RegExp(`\\s*[-|–]\\s*${escapeRegExp(siteName)}\\s*$`, 'i');
  const withoutSuffix = raw.replace(suffix, '').trim();
  if (withoutSuffix === '' || withoutSuffix.toLowerCase() === siteName.toLowerCase()) {
    return null;
  }
  return withoutSuffix.replace(/^\d+\.\s*/, '').trim() || null;
}

// --- languages --------------------------------------------------------------

/**
 * Editor, storage and site language tokens -> the label that goes in the
 * prompt. Covers Monaco ids, Ace mode ids, and the tokens LeetCode, CodeChef
 * and GfG each use in their own storage, which disagree often enough to be
 * worth one shared table rather than four.
 */
const LANGUAGE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  'c++17': 'C++',
  'c++14': 'C++',
  c_cpp: 'C++',
  csharp: 'C#',
  'c#': 'C#',
  java: 'Java',
  python: 'Python3',
  python3: 'Python3',
  py3: 'Python3',
  pypy3: 'Python3',
  pythondata: 'Python3',
  javascript: 'JavaScript',
  nodejs: 'JavaScript',
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
  pascal: 'Pascal',
  haskell: 'Haskell',
  perl: 'Perl',
  mysql: 'MySQL',
  mssql: 'MS SQL Server',
  oraclesql: 'Oracle SQL',
  postgresql: 'PostgreSQL',
});

const KNOWN_LANGUAGE_TOKENS = new Set(Object.keys(LANGUAGE_LABELS));

/** Normalise an editor or storage language token to its prompt label. */
export function languageLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const token = raw.trim().toLowerCase().replace(/^ace\/mode\//, '').replace(/^text\/x-/, '');
  if (token === '') return null;
  return LANGUAGE_LABELS[token] ?? raw.trim();
}

// --- statement splitting ----------------------------------------------------

const EXAMPLE_HEADING = /^\s*[*_#\s]*example\s*\d*\s*[:.]?[*_\s]*$/i;
const CONSTRAINTS_HEADING = /^\s*[*_#\s]*constraints\s*[:.]?[*_\s]*$/i;

function trimBlock(lines: string[]): string | null {
  const value = lines.join('\n').trim();
  return value === '' ? null : value;
}

/**
 * Split a statement into its three prompt sections on its own headings.
 *
 * Works on the markdown rather than the DOM, so one implementation serves both
 * the embedded-JSON path and the DOM path on every site that writes English
 * "Example"/"Constraints" headings -- LeetCode, CodeChef and GfG.
 *
 * Codeforces does **not** use this: its statements are structured in the DOM
 * (`.sample-tests`, section titles) and are frequently in Russian, so heading
 * text is the wrong thing to match on there.
 *
 * A statement with neither heading comes back whole. Splitting improves a
 * prompt; it is never a precondition for one.
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

  // Constraints before the first example means the headings are not in the
  // order this split assumes; leave the statement intact rather than guess.
  if (constraints >= 0 && firstExample >= 0 && constraints < firstExample) {
    firstExample = -1;
  }

  const statementEnd =
    firstExample >= 0 ? firstExample : constraints >= 0 ? constraints : lines.length;
  const examplesEnd = constraints >= 0 ? constraints : lines.length;

  return {
    statementMd: trimBlock(lines.slice(0, statementEnd)),
    examplesMd: firstExample >= 0 ? trimBlock(lines.slice(firstExample, examplesEnd)) : null,
    // The heading is dropped: the prompt template supplies its own.
    constraintsMd: constraints >= 0 ? trimBlock(lines.slice(constraints + 1)) : null,
  };
}

// --- the code ladder (spec.md section 6.4) ----------------------------------

/** Rendered-line selectors, by editor. Tried in this order. */
export const EDITOR_LINE_SELECTORS: ReadonlyArray<readonly string[]> = [
  ['.view-line'], // Monaco
  ['.ace_line'], // Ace
  ['.cm-line'], // CodeMirror 6
];

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const parsed = tryParse(trimmed);
    if (typeof parsed === 'string') return parsed;
  }
  return trimmed;
}

/**
 * The language currently selected in the editor, as the site remembers it.
 *
 * Probed rather than addressed: every site keeps this in a differently-named
 * global key, and the names change between versions.
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
  matches.sort(); // deterministic when several keys disagree; they rarely do
  return matches[0] ?? null;
}

interface StorageCandidate {
  key: string;
  code: string;
  language: string | null;
}

/** A stored value is code if a non-blank string can be found in it. */
function plausibleCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
    const parsed = tryParse(trimmed);
    if (typeof parsed === 'string') return parsed.trim() === '' ? null : parsed;
    if (isRecord(parsed) && !Array.isArray(parsed)) {
      const code = parsed['code'] ?? parsed['value'] ?? parsed['text'] ?? parsed['source'];
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

/** A bare id has to be delimited or '1' matches half the keys in storage. */
function delimitedId(id: string): RegExp {
  return new RegExp('(?:^|[^0-9])' + escapeRegExp(id) + '(?:[^0-9]|$)');
}

/**
 * Layer 1 -- site storage.
 *
 * Keys are never hard-coded: every site's key shape is version-dependent.
 * Candidates are keys mentioning the slug (or, failing that, the id), and the
 * buffer whose language matches the open editor wins.
 *
 * On "most recent": spec.md section 6.4 asks for the most recently written
 * value, but the Storage API exposes no write time. Selecting by the open
 * language is both available and the better answer -- it is what D025 says the
 * solution attempt is (D038).
 */
export function fromSiteStorage(
  env: ExtractEnv,
  slug: string,
  number: string | null,
): CodeCapture {
  const storage = env.storage;
  if (!storage || slug === '') return empty();

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
  if (candidates.length === 0) return empty();

  let chosen: StorageCandidate | undefined;
  if (openLanguage) chosen = candidates.find((c) => c.language === openLanguage);

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
  if (!chosen) return empty();

  env.diagnostics.push(`code: site storage key ${chosen.key}`);
  return {
    code: chosen.code,
    language: languageLabel(chosen.language ?? openLanguage),
    source: 'siteStorage',
  };
}

/** Layer 2 -- the editor's own model, through the MAIN-world bridge (D020). */
export async function fromEditorApi(env: ExtractEnv): Promise<CodeCapture> {
  if (!env.readEditor) return empty();

  const reading = await env.readEditor().catch(() => null);
  if (!reading?.code || reading.code.trim() === '') return empty();

  if (reading.truncated) env.warnings.push('Code was very long and has been truncated');
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
    .map((el) => (el.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\s+$/, ''))
    .join('\n');
}

/**
 * Layer 3 -- scrape the rendered lines.
 *
 * Always flagged. A virtualised editor only renders what is on screen, so this
 * is the layer most likely to hand back a confident-looking half of a file.
 */
export function fromDomScrape(env: ExtractEnv): CodeCapture {
  for (const selectors of EDITOR_LINE_SELECTORS) {
    const lines = queryAll(env.doc, selectors);
    if (lines.length === 0) continue;

    const code = joinLines(lines);
    if (code.trim() === '') continue;

    env.warnings.push('Code may be incomplete — only the visible lines were readable');
    env.diagnostics.push(`code: DOM scrape, ${lines.length} lines`);
    return { code, language: languageLabel(probeLanguage(env.storage)), source: 'domScrape' };
  }
  return empty();
}

/** Layer 4 -- whatever the user has selected on the page. */
export function fromSelection(env: ExtractEnv): CodeCapture {
  const selected = optionalField(() => env.selection?.());
  if (!selected || selected.trim() === '') return empty();

  env.diagnostics.push('code: user selection');
  return {
    code: selected,
    language: languageLabel(probeLanguage(env.storage)),
    source: 'selection',
  };
}

export function empty(): CodeCapture {
  return { code: null, language: null, source: 'none' };
}

export interface LadderOptions {
  /** Identifier used to match site-storage keys. */
  slug: string;
  /** Weaker fallback for storage-key matching, where the site has one. */
  number?: string | null;
  /**
   * Say so when a platform is known to have no editor on this page, so the
   * absence of code reads as expected rather than as a failure (D014). The
   * ladder still runs -- a user selection is still worth having.
   */
  editorless?: boolean;
}

/**
 * The four layers, in order, first success wins.
 *
 * On Codeforces problem pages the expected outcome is no code at all, which is
 * correct behaviour and must not be reported as an error (D014).
 */
export async function runCodeLadder(
  env: ExtractEnv,
  options: LadderOptions,
): Promise<CodeCapture> {
  const layers: Array<() => CodeCapture | Promise<CodeCapture>> = [
    () => optionalField(() => fromSiteStorage(env, options.slug, options.number ?? null)) ?? empty(),
    () => fromEditorApi(env),
    () => optionalField(() => fromDomScrape(env)) ?? empty(),
    () => fromSelection(env),
  ];

  for (const layer of layers) {
    const capture = await Promise.resolve(layer()).catch(() => empty());
    if (capture.code && capture.code.trim() !== '') return capture;
  }

  if (options.editorless) {
    env.diagnostics.push('code: none, and this page has no editor');
  } else {
    env.warnings.push("Couldn't read your code from this page");
  }
  return empty();
}
