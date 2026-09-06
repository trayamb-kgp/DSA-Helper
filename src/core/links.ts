/**
 * Outward-facing identifiers, in one place.
 *
 * ---------------------------------------------------------------------------
 * TWO VALUES ARE STILL PENDING. Both are one-line edits, and this is the only
 * file that has to change:
 *
 *   1. REPO_SLUG      — set once the GitHub repository exists (todo.md #4)
 *   2. CONTACT_EMAIL  — the dedicated alias for the store listing (todo.md #1)
 *
 * The rest of the codebase asks for these through the functions below, never
 * by hardcoding a URL, so nothing goes stale and nothing has to be hunted for
 * on release day. Every consumer degrades to "no link" while a value is null:
 * the diagnostics report is still built and still copyable, the About section
 * still renders. A link is a convenience on top of a feature that works
 * without it, which is what makes shipping before these are set acceptable.
 *
 * These are compile-time constants, not settings. They describe the project,
 * not the user, so they are deliberately not in `chrome.storage` (D046).
 * ---------------------------------------------------------------------------
 */

/** `owner/repo` on GitHub. Null until the repository is public. */
export const REPO_SLUG: string | null = null;

/** The address published in the privacy policy and the store listing. */
export const CONTACT_EMAIL: string | null = 'support.dsahelper@gmail.com';

/** The branch the published docs are read from. */
const DEFAULT_BRANCH = 'main';

export function repoUrl(): string | null {
  return REPO_SLUG ? `https://github.com/${REPO_SLUG}` : null;
}

/**
 * Where a broken-page report is filed (D031).
 *
 * Deep-links to a new issue rather than the tracker's front page: someone who
 * has just copied a report is one paste away from finishing, and an extra
 * navigation is where that intent gets lost.
 */
export function issueUrl(): string | null {
  const repo = repoUrl();
  return repo ? `${repo}/issues/new` : null;
}

/**
 * The public copy of the privacy policy.
 *
 * The Chrome Web Store requires a URL, not a file in a package, so this has to
 * resolve before submission. It points at the repository copy rather than a
 * hosted page: there is no site to host it on, and a policy that lives beside
 * the code it describes cannot silently diverge from it.
 */
export function privacyUrl(): string | null {
  const repo = repoUrl();
  return repo ? `${repo}/blob/${DEFAULT_BRANCH}/docs/PRIVACY.md` : null;
}

/** `mailto:` for the published address, or null while there isn't one. */
export function contactUrl(): string | null {
  return CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : null;
}

/**
 * What is still unset. Used by the release checklist and by the build check,
 * so "we forgot to fill these in" is a thing a command can tell you rather
 * than something you have to remember.
 */
export function pendingReleaseValues(): string[] {
  const pending: string[] = [];
  if (!REPO_SLUG) pending.push('REPO_SLUG');
  if (!CONTACT_EMAIL) pending.push('CONTACT_EMAIL');
  return pending;
}
