/**
 * Outward-facing identifiers, in one place.
 *
 * ---------------------------------------------------------------------------
 * The two release values live here, and this is the only file that changes them:
 *
 *   1. SITE_URL       — the hosted site's origin. Set: the static site (landing
 *                       page + privacy policy) is deployed on Vercel (todo.md #4).
 *   2. CONTACT_EMAIL  — the dedicated alias for the store listing (todo.md #1).
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
 *
 * The privacy policy is hosted on its own static site (Vercel), not read out of
 * the GitHub repository, so the repository can stay private while the policy URL
 * the Web Store requires stays public. See D046 (revised) and D055/D056.
 * ---------------------------------------------------------------------------
 */

/**
 * The hosted site's origin, no trailing slash. The static site is deployed on
 * Vercel; this is the address it serves the landing page and `privacy.html` at.
 */
export const SITE_URL: string | null = 'https://dsa-helper-zeta.vercel.app';

/** The address published in the privacy policy and the store listing. */
export const CONTACT_EMAIL: string | null = 'support.dsahelper@gmail.com';

/** The subject both report links carry, so the mail is self-identifying. */
const REPORT_SUBJECT = 'DSA Helper — broken page report';

/**
 * Where a broken-page report is sent (D031, revised).
 *
 * Originally a deep link to a new GitHub issue. With the repository private
 * (D046 revised) that page 404s for users, so the report is routed to the
 * contact address instead: the user copies the report with the button beside
 * this link, and this opens a pre-addressed email to paste it into. Carries a
 * subject so the mail is self-identifying; the body is left to the paste.
 *
 * This is a `mailto:`, which the browser hands to the OS's registered mail
 * handler — and does nothing, silently, when there is none (a common state on
 * a fresh Windows profile). `gmailComposeUrl()` is the always-opens fallback
 * the options page offers beside it (D057).
 */
export function issueUrl(): string | null {
  if (!CONTACT_EMAIL) return null;
  const subject = encodeURIComponent(REPORT_SUBJECT);
  return `mailto:${CONTACT_EMAIL}?subject=${subject}`;
}

/**
 * A Gmail web-compose URL for the same report mail as `issueUrl()` (D057).
 *
 * The fallback beside the `mailto:` link: an `https:` compose window that
 * always opens in the browser, no OS mail handler required — which is the one
 * failure mode `issueUrl()` has. Gmail because the support alias is itself a
 * Gmail account; a non-Gmail sender still reaches it, and anyone who prefers
 * their own desktop mail app still has the `mailto:` link. Subject only; the
 * body is left to the paste, same as the mailto (a long report can overflow a
 * URL, and the copy button beside it already holds the text).
 */
export function gmailComposeUrl(): string | null {
  if (!CONTACT_EMAIL) return null;
  const to = encodeURIComponent(CONTACT_EMAIL);
  const su = encodeURIComponent(REPORT_SUBJECT);
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}`;
}

/**
 * The public copy of the privacy policy.
 *
 * The Chrome Web Store requires a URL, not a file in a package, so this has to
 * resolve before submission. It points at the hosted static site rather than a
 * file in the repository, which is what lets the repository be private while
 * the policy stays publicly reachable (D046 revised).
 */
export function privacyUrl(): string | null {
  return SITE_URL ? `${SITE_URL}/privacy.html` : null;
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
  if (!SITE_URL) pending.push('SITE_URL');
  if (!CONTACT_EMAIL) pending.push('CONTACT_EMAIL');
  return pending;
}
