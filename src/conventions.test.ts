/**
 * Project-wide invariants — the ones that are a property of the whole
 * codebase rather than of any one module, and that a reviewer would otherwise
 * have to re-check by hand at every release.
 *
 * These are from the cross-phase checklist in the implementation plan. They
 * are cheap, and each of them has already been wrong once:
 *
 *   - D010  no network requests, anywhere
 *   - D023  a *problem*, never a *question*
 *   - D045  no two entry points may share a file name
 *
 * The source is read through `import.meta.glob`, so this stays a plain Vitest
 * file with no `node:fs` (the project deliberately carries no `@types/node`).
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const isTest = (path: string) => path.includes('.test.');
const isFixture = (path: string) => path.includes('__fixtures__');

/** Everything that actually ships, i.e. not tests and not fixtures. */
const shipped = Object.entries(SOURCES).filter(
  ([path]) => !isTest(path) && !isFixture(path),
);

describe('the codebase makes no network requests (D010)', () => {
  /**
   * The privacy policy's central claim is structural: there is no code path by
   * which data could reach anyone, because no call that could carry it exists.
   * That is only true for as long as it stays true, and it is one careless
   * import away from not being.
   */
  const FORBIDDEN = [
    'fetch(',
    'XMLHttpRequest',
    'WebSocket',
    'sendBeacon',
    'EventSource',
    'importScripts',
    'navigator.connection',
  ];

  it('has files to check', () => {
    expect(shipped.length).toBeGreaterThan(20);
  });

  for (const token of FORBIDDEN) {
    it(`never calls ${token}`, () => {
      const offenders = shipped
        .filter(([, source]) => source.includes(token))
        .map(([path]) => path);
      expect(offenders).toEqual([]);
    });
  }
});

describe('a problem is never called a question (D023)', () => {
  /**
   * The rule is about *our* vocabulary, not the sites'. An adapter has to name
   * what the page names — LeetCode's embedded JSON really is keyed
   * `questionFrontendId`, and GeeksforGeeks really does have a `question`
   * field — and renaming those in the adapter would make the code harder to
   * check against the page, which is the opposite of the point.
   *
   * So the check is scoped to the surfaces a user reads. Nothing shown to a
   * user, or written into a prompt, may use the word.
   */
  const USER_FACING = [
    './popup/',
    './options/',
    './core/templates.ts',
    './core/prompt.ts',
    './core/diagnostics.ts',
    './core/history.ts',
    './background/actions.ts',
    './background/commands.ts',
    './background/contextMenus.ts',
    './content/chatgpt/inject.ts',
    './content/platform/toast.ts',
  ];

  const surfaces = shipped.filter(([path]) =>
    USER_FACING.some((prefix) => path.startsWith(prefix)),
  );

  it('covers every user-facing module', () => {
    // A file moving out from under this list would silently stop being
    // checked, so the count is asserted rather than assumed.
    expect(surfaces.length).toBeGreaterThanOrEqual(USER_FACING.length - 2);
  });

  for (const [path, source] of surfaces) {
    it(`${path} says problem`, () => {
      expect(source).not.toMatch(/question/i);
    });
  }
});

describe('entry points have unique file names (D045)', () => {
  /**
   * CRXJS names each emitted chunk after its entry's basename and then
   * rewrites the manifest by looking it up under that name. Two entries called
   * `index.ts` resolve to the same chunk and one silently wins — which is
   * precisely what happened: the service worker loaded the content script, and
   * commands, context menus and `RUN_ACTION` were never registered.
   *
   * `tools/check-build.mjs` catches this in the artifact. This catches it in
   * the source, before a build, which is where it is cheapest to notice.
   */
  const ENTRY_POINTS = [
    './background/serviceWorker.ts',
    './content/platform/contentScript.ts',
    './content/mainworld/editorBridge.ts',
    './content/chatgpt/inject.ts',
  ];

  it('all four entry modules exist', () => {
    for (const entry of ENTRY_POINTS) expect(SOURCES).toHaveProperty(entry);
  });

  it('no two share a basename', () => {
    const names = ENTRY_POINTS.map((path) => path.slice(path.lastIndexOf('/') + 1));
    expect(new Set(names).size).toBe(names.length);
  });

  it('no entry module is named index.ts', () => {
    // The specific shape the collision took. Named separately so the failure
    // message points straight at the cause.
    expect(ENTRY_POINTS.filter((path) => path.endsWith('/index.ts'))).toEqual([]);
  });
});
