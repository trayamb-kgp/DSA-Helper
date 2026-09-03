/**
 * Self-service support, with no telemetry behind it (D031).
 *
 * Two jobs: a field-by-field account of what the last extraction managed, and
 * a redacted blob a user can paste into an issue. Between them they are the
 * whole support strategy — there is no analytics, no backend, and no aggregate
 * view of which adapters are failing, so a report a user sends by hand is the
 * only signal a breakage produces.
 *
 * ---------------------------------------------------------------------------
 * THE REDACTION RULE IS ABSOLUTE.
 *
 * A report carries **never the statement text and never the user's code**
 * (architecture.md §10.4). Not truncated, not summarised, not "just the first
 * line" — lengths and presence only. The user is pasting this into a public
 * issue tracker, and they will not read it first.
 *
 * `diagnostics.test.ts` builds a report from a context stuffed with sentinel
 * strings and asserts none of them survive. Add a field here and add it there.
 * ---------------------------------------------------------------------------
 */

import type { Platform, ProblemContext } from './types';

export type FieldStatus =
  /** Read successfully. */
  | 'ok'
  /** Absent, and that is a gap worth reporting. */
  | 'missing'
  /** Absent, and that is correct for this page — not a fault. */
  | 'expected';

export interface FieldReport {
  field: string;
  status: FieldStatus;
  /** Presence and size only. Never the value, for statement or code. */
  detail: string;
}

function sized(value: string | null, label: string): FieldReport {
  return value
    ? { field: label, status: 'ok', detail: `${value.length} chars` }
    : { field: label, status: 'missing', detail: 'not captured' };
}

/**
 * What each field of an extraction came back as.
 *
 * The distinction that matters is `missing` against `expected`: a Codeforces
 * problem page has no editor, and a Premium problem has no statement, and
 * reporting either as a fault would send someone chasing a bug that is not
 * there (D014, D027).
 */
export function fieldReports(context: ProblemContext): FieldReport[] {
  const codeExpectedAbsent = context.isLocked;

  return [
    context.title
      ? { field: 'title', status: 'ok', detail: context.title }
      : { field: 'title', status: 'missing', detail: 'not captured' },
    context.number
      ? { field: 'number', status: 'ok', detail: context.number }
      : { field: 'number', status: 'expected', detail: 'this platform may have none' },
    context.difficulty
      ? { field: 'difficulty', status: 'ok', detail: context.difficulty }
      : { field: 'difficulty', status: 'missing', detail: 'not captured' },
    context.tags.length > 0
      ? { field: 'tags', status: 'ok', detail: `${context.tags.length}` }
      : { field: 'tags', status: 'expected', detail: 'often hidden until revealed' },
    context.isLocked
      ? { field: 'statement', status: 'expected', detail: 'locked — Premium problem' }
      : sized(context.statementMd, 'statement'),
    sized(context.examplesMd, 'examples'),
    sized(context.constraintsMd, 'constraints'),
    context.code
      ? { field: 'code', status: 'ok', detail: `${context.code.length} chars` }
      : {
          field: 'code',
          status: codeExpectedAbsent ? 'expected' : 'missing',
          detail: 'not captured',
        },
    { field: 'codeSource', status: 'ok', detail: context.codeSource },
    context.language
      ? { field: 'language', status: 'ok', detail: context.language }
      : { field: 'language', status: 'missing', detail: 'not captured' },
  ];
}

/**
 * The shape of a URL, with the problem's own identifier taken out.
 *
 * `https://leetcode.com/problems/two-sum/?envType=x` -> `/problems/<slug>/`.
 * The query string is the reason this exists: it carries study-plan ids and
 * whatever else a platform decides to hang off a link, none of which belongs
 * in a public issue. The platform and identifier are reported as their own
 * fields, so a maintainer can still reach the exact problem.
 */
export function urlPattern(url: string, slug: string | null): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '(unparseable)';
  }

  const path = parsed.pathname
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      if (slug && segment.toLowerCase() === slug.toLowerCase()) return '<slug>';
      if (/^\d+$/.test(segment)) return '<n>';
      return segment;
    })
    .join('/');

  return `${parsed.origin}${path}`;
}

/** `Chrome/141.0.0.0` out of a user-agent string. */
export function chromeVersion(userAgent: string): string {
  return /Chrome\/([\d.]+)/.exec(userAgent)?.[1] ?? 'unknown';
}

export interface ReportInput {
  context: ProblemContext | null;
  diagnostics: readonly string[];
  extensionVersion: string;
  userAgent: string;
  /** When the extraction ran. */
  at: number | null;
  /** Present when no adapter claimed the page at all. */
  unsupportedUrl?: string;
}

function statusMark(status: FieldStatus): string {
  if (status === 'ok') return 'ok';
  return status === 'expected' ? 'absent (expected)' : 'MISSING';
}

/**
 * The blob the "report a broken page" button puts on the clipboard.
 *
 * Markdown, because it is going into an issue tracker. Deliberately readable:
 * a user who does glance at it should be able to see for themselves that their
 * code is not in here.
 */
export function buildReport(input: ReportInput): string {
  const { context } = input;
  const lines: string[] = [
    '### DSA Helper — broken page report',
    '',
    `- Extension: ${input.extensionVersion}`,
    `- Chrome: ${chromeVersion(input.userAgent)}`,
    `- Captured: ${input.at ? new Date(input.at).toISOString() : 'unknown'}`,
  ];

  if (!context) {
    lines.push(
      `- Platform: none — no adapter claimed this page`,
      `- URL pattern: ${input.unsupportedUrl ? urlPattern(input.unsupportedUrl, null) : 'unknown'}`,
      '',
      'No extraction ran, so there are no field results.',
    );
    return lines.join('\n');
  }

  lines.push(
    `- Platform: ${context.platform}`,
    `- Problem: ${context.slug || '(none)'}${context.isContest ? ' (contest page)' : ''}`,
    `- URL pattern: ${urlPattern(context.url, context.slug || null)}`,
    `- Locked: ${context.isLocked ? 'yes' : 'no'}`,
    '',
    '| Field | Result | Detail |',
    '|---|---|---|',
  );

  for (const report of fieldReports(context)) {
    lines.push(`| ${report.field} | ${statusMark(report.status)} | ${report.detail} |`);
  }

  if (input.diagnostics.length > 0) {
    lines.push('', '**Selectors**', '');
    for (const note of input.diagnostics) lines.push(`- ${note}`);
  }

  if (context.warnings.length > 0) {
    lines.push('', '**Warnings shown to the user**', '');
    for (const warning of context.warnings) lines.push(`- ${warning}`);
  }

  lines.push(
    '',
    '_No statement text and no code is included in this report._',
  );
  return lines.join('\n');
}

/** True when an extraction failed so completely it is worth reporting. */
export function looksBroken(context: ProblemContext | null): boolean {
  if (!context) return false;
  if (context.isLocked) return false; // a named condition, not a fault (D027)

  const gaps = fieldReports(context).filter((report) => report.status === 'missing');
  // One missing field is ordinary (D015). Most of them missing at once is a
  // redesign, and that is what the popup's known-breakage line is for.
  return gaps.length >= 4;
}

/** Platforms, for the report's "which adapter" line. Kept here so the UI needn't know. */
export const PLATFORM_ADAPTER_FILES: Readonly<Record<Platform, string>> = Object.freeze({
  leetcode: 'src/content/platform/leetcode.ts',
  codeforces: 'src/content/platform/codeforces.ts',
  codechef: 'src/content/platform/codechef.ts',
  geeksforgeeks: 'src/content/platform/geeksforgeeks.ts',
});
