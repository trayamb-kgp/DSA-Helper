import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPT,
  DEFAULT_YOUTUBE_TEMPLATE,
  MISSING_SECTION_NOTE,
  PROMPT_VARIABLES,
  YOUTUBE_VARIABLES,
  languageSlug,
  numberSuffix,
  render,
  renderQuery,
  sectionOrNote,
} from './templates';

describe('render', () => {
  it('substitutes known variables', () => {
    expect(render('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
  });

  it('treats null and undefined values as empty', () => {
    expect(render('[{a}]', { a: null })).toBe('[]');
    expect(render('[{a}]', { a: undefined })).toBe('[]');
  });

  it('leaves unknown placeholders in place so a typo stays visible', () => {
    expect(render('{title} {typo}', { title: 'Sort' })).toBe('Sort {typo}');
  });

  it('does not re-substitute a value that itself looks like a placeholder', () => {
    expect(render('{a}', { a: '{b}', b: 'nope' })).toBe('{b}');
  });

  it('preserves prompt whitespace by default', () => {
    expect(render('a\n\n{x}\n\nb', { x: '' })).toBe('a\n\n\n\nb');
  });
});

describe('renderQuery — empty variables collapse', () => {
  it('renders a full LeetCode query', () => {
    expect(
      renderQuery(DEFAULT_YOUTUBE_TEMPLATE, {
        platform: 'LeetCode',
        number: '912',
        title: 'Sort an Array',
      }),
    ).toBe('LeetCode 912 Sort an Array solution');
  });

  it('squeezes the gap left by a platform with no separate number', () => {
    expect(
      renderQuery(DEFAULT_YOUTUBE_TEMPLATE, {
        platform: 'GeeksforGeeks',
        number: null,
        title: 'Kadane Algorithm',
      }),
    ).toBe('GeeksforGeeks Kadane Algorithm solution');
  });

  it('renders sanely with every variable absent', () => {
    const vars = Object.fromEntries(YOUTUBE_VARIABLES.map((v) => [v, null]));
    expect(renderQuery(DEFAULT_YOUTUBE_TEMPLATE, vars)).toBe('solution');
  });

  it('trims leading and trailing whitespace', () => {
    expect(renderQuery('  {a}  {b}  ', { a: null, b: 'x' })).toBe('x');
  });

  it('flattens newlines into single spaces', () => {
    expect(renderQuery('{a}\n{b}', { a: 'one', b: 'two' })).toBe('one two');
  });
});

describe('numberSuffix', () => {
  it('renders a hash-prefixed suffix', () => {
    expect(numberSuffix('912')).toBe(' #912');
  });

  it('is empty for a missing or blank number', () => {
    expect(numberSuffix(null)).toBe('');
    expect(numberSuffix('   ')).toBe('');
  });
});

describe('languageSlug', () => {
  it('maps the names the spec calls out', () => {
    expect(languageSlug('C++')).toBe('cpp');
    expect(languageSlug('Python3')).toBe('python');
  });

  it('matches case-insensitively and ignores surrounding space', () => {
    expect(languageSlug('  java  ')).toBe('java');
    expect(languageSlug('TypeScript')).toBe('typescript');
  });

  it('maps the SQL dialects onto one fence tag', () => {
    expect(languageSlug('MySQL')).toBe('sql');
    expect(languageSlug('MS SQL Server')).toBe('sql');
  });

  it('returns an empty tag rather than guessing at an unknown language', () => {
    expect(languageSlug('Brainfuck')).toBe('');
    expect(languageSlug(null)).toBe('');
  });
});

describe('sectionOrNote', () => {
  it('passes a captured section through, trimmed', () => {
    expect(sectionOrNote('  content  ')).toBe('content');
  });

  it('substitutes an explicit note for an absent section', () => {
    expect(sectionOrNote(null)).toBe(MISSING_SECTION_NOTE);
    expect(sectionOrNote('   ')).toBe(MISSING_SECTION_NOTE);
  });
});

describe('DEFAULT_PROMPT', () => {
  it('references only documented variables', () => {
    const used = [...DEFAULT_PROMPT.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map(
      (m) => m[1] as string,
    );
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) {
      expect(PROMPT_VARIABLES).toContain(name);
    }
  });

  it('fences the user code so the review has an unambiguous block', () => {
    expect(DEFAULT_PROMPT).toContain('```{language_slug}\n{code}\n```');
  });

  it('leaves no stray placeholder when every variable is absent', () => {
    const vars = Object.fromEntries(PROMPT_VARIABLES.map((v) => [v, null]));
    const out = render(DEFAULT_PROMPT, vars);
    expect(out).not.toMatch(/\{[a-zA-Z_]/);
    expect(out).toContain('## What I need from you');
  });

  it('still asks the five review questions when nothing was captured', () => {
    const vars = Object.fromEntries(PROMPT_VARIABLES.map((v) => [v, null]));
    const out = render(DEFAULT_PROMPT, vars);
    for (const heading of ['Correctness', 'Complexity', 'Optimality', 'Code quality']) {
      expect(out).toContain(heading);
    }
  });
});
