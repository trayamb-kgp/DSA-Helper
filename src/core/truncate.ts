/**
 * Prompt truncation (D022).
 *
 * Order is fixed and load-bearing: statement first, then examples, and
 * **never** the user's code. The code is the one thing the model cannot get
 * from the link, and reviewing half a function produces confidently wrong
 * feedback. Constraints are left alone too -- they are short, and they are
 * what a complexity answer hangs on.
 *
 * Measurement is injected rather than assumed: this module never renders a
 * template, so it stays pure and the caller decides what "size" means.
 */

/** Appended wherever text was cut, so the model knows something is missing. */
export const TRUNCATION_MARKER = '…[truncated]';

/** Fields that may be trimmed, in the order they are sacrificed. */
export const TRUNCATION_ORDER = ['statement', 'examples'] as const;

export type TruncatableField = (typeof TRUNCATION_ORDER)[number];

export interface PromptSections {
  statement: string | null;
  examples: string | null;
  constraints: string | null;
  code: string | null;
}

export interface TruncationResult {
  sections: PromptSections;
  /** Which fields were cut, in the order they were cut. */
  truncated: TruncatableField[];
  /**
   * True when the budget could not be met without cutting code. The prompt is
   * returned over budget rather than shortened further -- D022 makes code
   * inviolable, so exceeding the cap is the lesser failure.
   */
  overBudget: boolean;
}

/** How far back to look for a word boundary rather than cutting mid-word. */
const BOUNDARY_WINDOW = 80;

function stripMarker(value: string): string {
  return value.endsWith(TRUNCATION_MARKER)
    ? value.slice(0, -TRUNCATION_MARKER.length).trimEnd()
    : value;
}

/** Cut `value` to roughly `keep` characters, preferring a word boundary. */
function shorten(value: string, keep: number): string {
  const body = stripMarker(value);
  if (keep <= 0) return TRUNCATION_MARKER;

  const sliced = body.slice(0, keep);
  const boundary = Math.max(sliced.lastIndexOf(' '), sliced.lastIndexOf('\n'));
  const cut = boundary > keep - BOUNDARY_WINDOW && boundary > 0 ? sliced.slice(0, boundary) : sliced;
  const trimmed = cut.trimEnd();
  return trimmed ? `${trimmed} ${TRUNCATION_MARKER}` : TRUNCATION_MARKER;
}

/**
 * Shrink `sections` until `measure` reports at most `maxChars`.
 *
 * `measure` receives a candidate set of sections and returns the size of the
 * prompt they would produce, so template overhead is accounted for without
 * this module knowing anything about templates.
 */
export function fitSections(
  sections: PromptSections,
  maxChars: number,
  measure: (candidate: PromptSections) => number,
): TruncationResult {
  let current: PromptSections = { ...sections };
  const truncated: TruncatableField[] = [];

  for (const field of TRUNCATION_ORDER) {
    if (measure(current) <= maxChars) break;
    if (!current[field]) continue;

    truncated.push(field);
    // Converges in one or two passes; the loop exists because a word-boundary
    // cut removes slightly more than asked and the marker adds a little back.
    for (let pass = 0; pass < 8; pass += 1) {
      const excess = measure(current) - maxChars;
      if (excess <= 0) break;

      const value = current[field];
      if (value === null || value === TRUNCATION_MARKER) break;

      const body = stripMarker(value);
      const markerCost = value.endsWith(TRUNCATION_MARKER) ? 0 : TRUNCATION_MARKER.length + 1;
      current = { ...current, [field]: shorten(value, body.length - excess - markerCost) };
    }
  }

  return { sections: current, truncated, overBudget: measure(current) > maxChars };
}
