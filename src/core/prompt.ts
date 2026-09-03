/**
 * Assembling the review prompt (spec.md section 8).
 *
 * Pure: the service worker builds prompts with this, the options page will
 * preview them with it in phase 7, and neither needs a browser to do it.
 *
 * Three rules shape what comes out:
 *
 *   - **An absence is stated, never rendered blank** (spec.md section 8). A
 *     model told a section is missing says so; one left to assume the section
 *     was empty reasons confidently without it.
 *   - **Quoted problem text is delimited and labelled** as reference material
 *     rather than instructions (architecture.md section 9.2, D040).
 *   - **The user's code is never truncated** (D022). If the budget cannot be
 *     met without cutting it, the prompt comes back over budget instead.
 */

import type { ProblemContext, Settings } from './types';
import {
  MISSING_SECTION_NOTE,
  languageSlug,
  numberSuffix,
  render,
  type TemplateVars,
} from './templates';
import { fitSections, type PromptSections, type TruncatableField } from './truncate';

/**
 * Delimiters for text quoted off the problem page.
 *
 * Tags rather than a markdown fence, deliberately: a fenced statement renders
 * its LaTeX, lists and headings as literal text, which is the lossy plain-text
 * approximation D026 exists to forbid -- and statements contain their own
 * fenced example blocks, which would close ours. Tags survive nested markdown
 * untouched and are the boundary convention models are trained to read as
 * data (D040).
 */
export const QUOTE_TAGS = Object.freeze({
  statement: 'problem_statement',
  examples: 'examples',
  constraints: 'constraints',
});

/** Stated in place of the statement for a paywalled problem (D027). */
export const LOCKED_NOTE =
  "_(Premium problem — the statement isn't visible to me, so it isn't included here. The link above is the problem.)_";

/** spec.md section 6.4: a placeholder, never an empty fence. */
export const NO_CODE_PLACEHOLDER = "(no code captured — I'll paste it below)";

/** `includeCode: false` is a deliberate choice, and reads differently to a gap. */
export const CODE_OMITTED_PLACEHOLDER = '(code intentionally not included)';

const NO_DIFFICULTY = 'difficulty not captured';
const NO_TAGS = '(none captured)';
// Reads inside the heading's parentheses: '## My solution (unknown language)'.
const NO_LANGUAGE = 'unknown language';

/**
 * Stop quoted text from closing its own wrapper.
 *
 * A statement containing a literal `</problem_statement>` would otherwise end
 * the quoted region early and everything after it would read as ours. The
 * angle bracket is entity-escaped, so it still displays as the text the page
 * had -- nothing is deleted, which matters because a statement about XML is a
 * perfectly ordinary problem.
 */
function neutraliseClosingTags(value: string): string {
  const tags = Object.values(QUOTE_TAGS).join('|');
  return value.replace(new RegExp(`</\\s*(${tags})\\s*>`, 'gi'), '&lt;/$1&gt;');
}

/** Wrap real extracted text; hand back the explicit note when there is none. */
function quoted(tag: string, value: string | null | undefined): string {
  const body = value?.trim();
  if (!body) return MISSING_SECTION_NOTE;
  return `<${tag}>\n${neutraliseClosingTags(body)}\n</${tag}>`;
}

function codeValue(code: string | null, includeCode: boolean): string {
  if (!includeCode) return CODE_OMITTED_PLACEHOLDER;
  const body = code?.trim();
  return body ? body : NO_CODE_PLACEHOLDER;
}

/**
 * Every variable spec.md section 8 offers, filled from one context.
 *
 * `sections` is passed separately from `context` because truncation works on
 * the sections alone and this has to be renderable against a shortened set.
 */
export function promptVars(
  context: ProblemContext,
  settings: Settings,
  sections: PromptSections,
): TemplateVars {
  const includeCode = settings.includeCode;

  return {
    platform: context.platformLabel,
    title: context.title,
    number: context.number ?? '',
    number_suffix: numberSuffix(context.number),
    difficulty: context.difficulty ?? NO_DIFFICULTY,
    tags: context.tags.length > 0 ? context.tags.join(', ') : NO_TAGS,
    url: context.url,
    // A locked problem is a named condition, not a capture gap, so it gets its
    // own sentence rather than the generic note (D027).
    statement: context.isLocked
      ? LOCKED_NOTE
      : quoted(QUOTE_TAGS.statement, sections.statement),
    examples: quoted(QUOTE_TAGS.examples, sections.examples),
    constraints: quoted(QUOTE_TAGS.constraints, sections.constraints),
    language: context.language ?? NO_LANGUAGE,
    language_slug: languageSlug(context.language),
    code: codeValue(sections.code, includeCode),
  };
}

export interface PromptResult {
  prompt: string;
  /** Which sections had to be shortened, in the order they were cut (D022). */
  truncated: TruncatableField[];
  /** True when the cap could not be met without cutting code, so it wasn't. */
  overBudget: boolean;
  /** False when the prompt carries a placeholder instead of the user's code. */
  hasCode: boolean;
  isLocked: boolean;
}

export function buildPrompt(context: ProblemContext, settings: Settings): PromptResult {
  const hasCode = settings.includeCode && (context.code?.trim() ?? '') !== '';

  const sections: PromptSections = {
    // A locked problem has no statement to shorten, and its note is ours
    // rather than quoted, so it stays out of the truncation budget entirely.
    statement: context.isLocked ? null : context.statementMd,
    examples: context.examplesMd,
    constraints: context.constraintsMd,
    code: hasCode ? context.code : null,
  };

  const renderWith = (candidate: PromptSections): string =>
    render(settings.promptTemplate, promptVars(context, settings, candidate));

  const fitted = fitSections(sections, settings.maxPromptChars, (candidate) =>
    renderWith(candidate).length,
  );

  return {
    prompt: renderWith(fitted.sections),
    truncated: fitted.truncated,
    overBudget: fitted.overBudget,
    hasCode,
    isLocked: context.isLocked,
  };
}

/**
 * One line telling the user what they just got, for the confirmation toast.
 *
 * Silence here would be the wrong default: a prompt missing the user's code is
 * still worth copying, but only if they know to paste it themselves.
 */
export function describeResult(result: PromptResult): string {
  const notes: string[] = [];
  if (!result.hasCode) notes.push('no code was captured — paste yours in');
  if (result.isLocked) notes.push('the statement is Premium-locked');
  if (result.truncated.length > 0) notes.push(`the ${result.truncated.join(' and ')} was shortened`);
  if (result.overBudget) notes.push('it is over your size cap, since your code is never cut');

  return notes.length === 0
    ? 'Prompt copied to the clipboard.'
    : `Prompt copied — ${notes.join('; ')}.`;
}
