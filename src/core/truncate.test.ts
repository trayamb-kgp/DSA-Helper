import { describe, expect, it } from 'vitest';
import {
  TRUNCATION_MARKER,
  type PromptSections,
  fitSections,
} from './truncate';

/** Stand-in for the phase-4 renderer: sections plus a fixed template cost. */
const OVERHEAD = 50;
const measure = (s: PromptSections): number =>
  OVERHEAD +
  (s.statement?.length ?? 0) +
  (s.examples?.length ?? 0) +
  (s.constraints?.length ?? 0) +
  (s.code?.length ?? 0);

const sections = (over: Partial<PromptSections> = {}): PromptSections => ({
  statement: 'S'.repeat(1000),
  examples: 'E'.repeat(500),
  constraints: 'C'.repeat(100),
  code: 'X'.repeat(300),
  ...over,
});

describe('fitSections', () => {
  it('leaves everything alone when already within budget', () => {
    const input = sections();
    const result = fitSections(input, 10_000, measure);
    expect(result.sections).toEqual(input);
    expect(result.truncated).toEqual([]);
    expect(result.overBudget).toBe(false);
  });

  it('brings the prompt within budget', () => {
    const result = fitSections(sections(), 1200, measure);
    expect(measure(result.sections)).toBeLessThanOrEqual(1200);
    expect(result.overBudget).toBe(false);
  });

  it('cuts the statement first and leaves the examples whole', () => {
    const input = sections();
    const result = fitSections(input, 1200, measure);
    expect(result.truncated).toEqual(['statement']);
    expect(result.sections.statement!.length).toBeLessThan(input.statement!.length);
    expect(result.sections.examples).toBe(input.examples);
  });

  it('cuts the examples only after the statement is exhausted', () => {
    const result = fitSections(sections(), 600, measure);
    expect(result.truncated).toEqual(['statement', 'examples']);
    expect(measure(result.sections)).toBeLessThanOrEqual(600);
  });

  it('marks every cut point', () => {
    const result = fitSections(sections(), 600, measure);
    expect(result.sections.statement).toContain(TRUNCATION_MARKER);
    expect(result.sections.examples).toContain(TRUNCATION_MARKER);
  });

  it('D022 — never touches the code', () => {
    const input = sections();
    for (const budget of [1200, 600, 400, 100, 1]) {
      const result = fitSections(input, budget, measure);
      expect(result.sections.code).toBe(input.code);
    }
  });

  it('D022 — never touches the constraints', () => {
    const input = sections();
    const result = fitSections(input, 400, measure);
    expect(result.sections.constraints).toBe(input.constraints);
  });

  it('keeps a pathologically long solution whole, collapsing the statement', () => {
    // Code alone blows the entire budget -- the case D022 names explicitly.
    const input = sections({ code: 'X'.repeat(20_000) });
    const result = fitSections(input, 5000, measure);

    expect(result.sections.code).toBe(input.code);
    expect(result.sections.statement).toBe(TRUNCATION_MARKER);
    expect(result.sections.examples).toBe(TRUNCATION_MARKER);
    expect(result.overBudget).toBe(true);
  });

  it('reports overBudget rather than silently exceeding the cap', () => {
    const within = fitSections(sections(), 1200, measure);
    expect(within.overBudget).toBe(false);
    const impossible = fitSections(sections({ code: 'X'.repeat(9000) }), 1000, measure);
    expect(impossible.overBudget).toBe(true);
  });

  it('skips a section that is absent rather than inventing a marker', () => {
    const input = sections({ statement: null });
    const result = fitSections(input, 700, measure);
    expect(result.sections.statement).toBeNull();
    expect(result.truncated).toEqual(['examples']);
  });

  it('does not mutate the input', () => {
    const input = sections();
    const before = { ...input };
    fitSections(input, 500, measure);
    expect(input).toEqual(before);
  });

  it('prefers a word boundary over cutting mid-word', () => {
    const prose = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet '.repeat(20);
    const result = fitSections(
      { statement: prose, examples: null, constraints: null, code: null },
      400,
      measure,
    );
    const body = result.sections.statement!.replace(TRUNCATION_MARKER, '').trimEnd();
    expect(prose.startsWith(body)).toBe(true);
    expect(body.endsWith(' ')).toBe(false);
  });

  it('does not stack markers when it cuts a field more than once', () => {
    const result = fitSections(sections(), 300, measure);
    const markers = result.sections.statement!.split(TRUNCATION_MARKER).length - 1;
    expect(markers).toBe(1);
  });
});
