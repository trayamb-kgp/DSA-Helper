/**
 * @vitest-environment jsdom
 *
 * The ChatGPT insertion (spec.md section 7.2) — the most fragile code in the
 * project, and the only place a security control is enforced by *absence*.
 *
 * The first block is the important one: it reads this module's own source and
 * fails if anything that could submit the prompt has appeared in it. A test
 * that asserts behaviour cannot catch a submit added to a path it does not
 * exercise; a test that reads the file can (D003).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { insertPrompt, readComposer, shouldSubmit, submitComposer } from './inject';
import injectSource from './inject.ts?raw';

const PROMPT = "I'm solving a DSA problem on LeetCode.\n\n```cpp\nint main() {}\n```";

/** Strips comments, so the prose explaining the rule cannot satisfy the check. */
const code = injectSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('submit is gated, never a key event or form submit (D003, D050)', () => {
  it('dispatches no key events to submit', () => {
    // Submitting via a synthetic Enter risks inserting a newline into the
    // multi-line composer and side-steps the send button's enabled state.
    expect(code).not.toMatch(/KeyboardEvent/);
    expect(code).not.toMatch(/['"`]key(down|up|press)['"`]/);
    expect(code).not.toMatch(/['"`]Enter['"`]/);
  });

  it('submits no form directly — the send button is the only mechanism', () => {
    expect(code).not.toMatch(/requestSubmit/);
    expect(code).not.toMatch(/\.submit\(/);
    expect(code).not.toMatch(/type=["']submit["']/);
  });

  it('still says why, in the file itself', () => {
    // The rule is worth nothing if the next person cannot see it is a rule.
    expect(injectSource).toContain('SUBMIT ONLY WITH CONSENT');
    expect(injectSource).toContain('D003');
    expect(injectSource).toContain('D050');
  });
});

describe('shouldSubmit (D050)', () => {
  it('submits only when the insertion verified AND the user opted in', () => {
    expect(shouldSubmit(true, true)).toBe(true);
    expect(shouldSubmit(true, false)).toBe(false);
    expect(shouldSubmit(false, true)).toBe(false);
    expect(shouldSubmit(false, false)).toBe(false);
  });
});

describe('submitComposer (D050)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('clicks the send button when it is present and enabled', async () => {
    const button = document.createElement('button');
    button.setAttribute('data-testid', 'send-button');
    let clicks = 0;
    button.addEventListener('click', () => {
      clicks += 1;
    });
    document.body.append(button);

    expect(await submitComposer(0)).toBe(true);
    expect(clicks).toBe(1);
  });

  it('does not click a disabled send button', async () => {
    const button = document.createElement('button');
    button.setAttribute('data-testid', 'send-button');
    button.disabled = true;
    let clicks = 0;
    button.addEventListener('click', () => {
      clicks += 1;
    });
    document.body.append(button);

    expect(await submitComposer(0)).toBe(false);
    expect(clicks).toBe(0);
  });

  it('does not click an aria-disabled send button', async () => {
    const button = document.createElement('button');
    button.setAttribute('data-testid', 'send-button');
    button.setAttribute('aria-disabled', 'true');
    let clicks = 0;
    button.addEventListener('click', () => {
      clicks += 1;
    });
    document.body.append(button);

    expect(await submitComposer(0)).toBe(false);
    expect(clicks).toBe(0);
  });

  it('reports failure when there is no send button', async () => {
    expect(await submitComposer(0)).toBe(false);
  });
});

describe('readComposer', () => {
  it('reads a textarea by value', () => {
    const el = document.createElement('textarea');
    el.value = 'typed';
    expect(readComposer(el)).toBe('typed');
  });

  it('reads a contenteditable by text', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.textContent = 'typed';
    expect(readComposer(el)).toBe('typed');
  });
});

describe('insertPrompt', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function composer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'prompt-textarea';
    el.contentEditable = 'true';
    document.body.append(el);
    return el;
  }

  it('fills a textarea and announces the change', () => {
    const el = document.createElement('textarea');
    document.body.append(el);
    let inputs = 0;
    el.addEventListener('input', () => {
      inputs += 1;
    });

    expect(insertPrompt(el, PROMPT)).toBe(true);
    expect(el.value).toBe(PROMPT);
    // React only notices state it was told about.
    expect(inputs).toBeGreaterThan(0);
  });

  it('falls through its strategies until one verifies', () => {
    const el = composer();
    // jsdom implements neither execCommand nor a useful paste, so reaching a
    // filled composer at all means the ladder descended to the DOM strategy.
    expect(insertPrompt(el, PROMPT)).toBe(true);
    expect(readComposer(el)).toContain('int main()');
  });

  it('reports failure when nothing lands, rather than claiming success', () => {
    const el = composer();
    // A composer that discards whatever is written to it, which is exactly what
    // a React-controlled field does when its state was never updated.
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      get: () => '',
      set: () => undefined,
    });

    expect(insertPrompt(el, PROMPT)).toBe(false);
  });

  it('does not report success for a partial insertion', () => {
    const el = composer();
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      get: () => PROMPT.slice(0, 20),
      set: () => undefined,
    });

    // Half a prompt produces a confidently wrong review, so it counts as a
    // failure and the clipboard fallback takes over.
    expect(insertPrompt(el, PROMPT)).toBe(false);
  });

  it('tolerates the whitespace a rich-text editor introduces', () => {
    const el = composer();
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      // ProseMirror splits the text into paragraph nodes; what comes back
      // differs by whitespace alone, which is not a failure.
      get: () => PROMPT.replace(/\n/g, '\n\n  '),
      set: () => undefined,
    });

    expect(insertPrompt(el, PROMPT)).toBe(true);
  });

  it('writes text, never markup', () => {
    const el = composer();
    insertPrompt(el, '<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(readComposer(el)).toContain('<img src=x');
  });
});
