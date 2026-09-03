/**
 * The adapter contract and the per-field guards (spec.md section 6.2,
 * architecture.md section 6.2). The registry that knows the full set of
 * adapters is registry.ts, kept apart so this file has no cycle with them.
 *
 * The rule that shapes everything here: no field extraction is allowed to
 * throw. Every field is guarded on its own, so a redesigned difficulty chip
 * costs the user the word "Medium" and never the action (D015).
 *
 * Adapters receive an `ExtractEnv` rather than reaching for `document`,
 * `location` and `localStorage` themselves (D037). The page is still the only
 * thing they read; passing it in is what lets a fixture stand in for it.
 */

import type { CodeSource, Platform, ProblemContext } from '../../core/types';
import { PLATFORM_LABELS } from '../../core/types';

/** The metadata half of a `ProblemContext` -- everything but code and bookkeeping. */
export type MetaFields = Pick<
  ProblemContext,
  | 'slug'
  | 'number'
  | 'title'
  | 'difficulty'
  | 'tags'
  | 'statementMd'
  | 'examplesMd'
  | 'constraintsMd'
  | 'isLocked'
>;

/** The code half, with the provenance the popup and the prompt both surface. */
export interface CodeCapture {
  code: string | null;
  language: string | null;
  source: CodeSource;
}

/** What the MAIN-world bridge hands back. Every field is untrusted (D020). */
export interface EditorRead {
  code: string | null;
  /** The editor's own language id: 'cpp', 'ace/mode/python', ... */
  language: string | null;
  /** Which editor answered: 'monaco' | 'ace' | 'cm6' | 'cm5'. Diagnostics only. */
  editor: string | null;
  /** True when the bridge hit its length cap. */
  truncated: boolean;
}

/**
 * Everything an adapter is allowed to read, injected.
 *
 * `warnings` is the user-facing sink -- it ends up in the popup and, for gaps
 * that matter, in the prompt. `diagnostics` is the support-facing sink, for
 * "matched fallback #2" notes that predict a redesign before users report it
 * (architecture.md section 6.3).
 */
export interface ExtractEnv {
  url: URL;
  doc: Document;
  /** The page's own storage. Null when the page blocks it. */
  storage: Storage | null;
  /** Layer 2 of the code ladder. Absent in tests that don't exercise it. */
  readEditor?: () => Promise<EditorRead | null>;
  /** Layer 4 of the code ladder: the user's current text selection. */
  selection?: () => string | null;
  /** Injected clock, so `extractedAt` is deterministic under test. */
  now?: () => number;
  warnings: string[];
  diagnostics: string[];
}

export interface PlatformAdapter {
  platform: Platform;
  platformLabel: string;
  matches(url: URL): boolean;
  isContest(url: URL): boolean;
  /** Query, hash and sub-tab segments stripped. What history links back to. */
  canonicalUrl(url: URL): string;
  /** Are the anchors this adapter needs on the page yet? Drives the retry backoff. */
  isReady(env: ExtractEnv): boolean;
  extractMeta(env: ExtractEnv): Promise<MetaFields>;
  extractCode(env: ExtractEnv): Promise<CodeCapture>;
}

/**
 * Per-field guard (architecture.md section 6.2).
 *
 * An empty string and a nullish value are the same thing: a gap. Anything
 * thrown is a gap too -- the exception dies here rather than taking the whole
 * extraction with it.
 */
export function field<T>(
  name: string,
  fn: () => T | null | undefined,
  warnings: string[],
): T | null {
  try {
    const value = fn();
    if (value == null || value === '') {
      warnings.push(`Couldn't read ${name}`);
      return null;
    }
    return value;
  } catch {
    warnings.push(`Couldn't read ${name}`);
    return null;
  }
}

/** Same guard, for fields whose empty case is legitimate (tags, mostly). */
export function optionalField<T>(fn: () => T | null | undefined): T | null {
  try {
    return fn() ?? null;
  } catch {
    return null;
  }
}

export interface SelectorHit<T extends Element> {
  el: T;
  selector: string;
  /** 0 is the preferred selector; anything higher is a fallback that hit. */
  index: number;
}

/**
 * First selector that hits, and which one it was.
 *
 * Every selector list is ordered preferred-first, so a non-zero index is an
 * early warning that the site has moved underneath us.
 */
export function queryFirst<T extends Element>(
  root: ParentNode,
  selectors: readonly string[],
): SelectorHit<T> | null {
  for (let index = 0; index < selectors.length; index += 1) {
    const selector = selectors[index];
    if (!selector) continue;
    let el: T | null = null;
    try {
      el = root.querySelector<T>(selector);
    } catch {
      continue; // a selector the browser won't parse is a broken fallback, not a crash
    }
    if (el) return { el, selector, index };
  }
  return null;
}

/** Record a fallback hit for the diagnostics panel. Preferred hits are silent. */
export function noteFallback(
  diagnostics: string[],
  name: string,
  hit: SelectorHit<Element> | null,
): void {
  if (!hit) {
    diagnostics.push(`${name}: no selector matched`);
    return;
  }
  if (hit.index > 0) {
    diagnostics.push(`${name}: matched fallback #${hit.index} (${hit.selector})`);
  }
}

export function queryAll<T extends Element>(
  root: ParentNode,
  selectors: readonly string[],
): T[] {
  for (const selector of selectors) {
    try {
      const found = Array.from(root.querySelectorAll<T>(selector));
      if (found.length > 0) return found;
    } catch {
      continue;
    }
  }
  return [];
}

/** spec.md section 6.1 -- un-hydrated SPA pages get four more chances. */
export const RETRY_DELAYS = [100, 300, 700, 1500] as const;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Poll `check` immediately, then once after each delay. Returns as soon as it
 * passes; false means it never did.
 */
export async function waitFor(
  check: () => boolean,
  delays: readonly number[] = RETRY_DELAYS,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<boolean> {
  if (check()) return true;
  for (const delay of delays) {
    await sleep(delay);
    if (check()) return true;
  }
  return false;
}

/**
 * Run both halves of an adapter and assemble the context.
 *
 * Neither half can throw past its own guards, but they are awaited defensively
 * anyway: an adapter is the most site-coupled code in the project and this is
 * the last place a surprise can be contained (D016).
 */
export async function buildContext(
  adapter: PlatformAdapter,
  env: ExtractEnv,
): Promise<ProblemContext> {
  const meta = await adapter.extractMeta(env).catch((): MetaFields => {
    env.warnings.push("Couldn't read the problem details");
    return {
      slug: '',
      number: null,
      title: '',
      difficulty: null,
      tags: [],
      statementMd: null,
      examplesMd: null,
      constraintsMd: null,
      isLocked: false,
    };
  });

  const capture = await adapter.extractCode(env).catch((): CodeCapture => {
    env.warnings.push("Couldn't read your code");
    return { code: null, language: null, source: 'none' };
  });

  const url = adapter.canonicalUrl(env.url);

  return {
    platform: adapter.platform,
    platformLabel: PLATFORM_LABELS[adapter.platform],
    url,
    slug: meta.slug,
    number: meta.number,
    // Only the platform and the link are guaranteed (D015). A missing title
    // still has to render, so it degrades to the slug and then to the URL.
    title: meta.title || meta.slug || url,
    difficulty: meta.difficulty,
    tags: meta.tags,
    statementMd: meta.statementMd,
    examplesMd: meta.examplesMd,
    constraintsMd: meta.constraintsMd,
    language: capture.language,
    code: capture.code,
    codeSource: capture.source,
    isContest: adapter.isContest(env.url),
    isLocked: meta.isLocked,
    extractedAt: env.now?.() ?? Date.now(),
    warnings: env.warnings,
  };
}
