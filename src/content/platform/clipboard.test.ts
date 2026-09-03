/**
 * @vitest-environment jsdom
 *
 * The clipboard write (spec.md section 7.3).
 *
 * Two things are worth pinning: the `execCommand` fallback actually runs when
 * the modern API refuses — which is the common case, not the exotic one, since
 * the extension carries no `clipboardWrite` permission — and the function
 * survives being serialised into a page by `executeScript`, the same
 * constraint `toastInPage` is under.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyInPage } from './clipboard';

interface Harness {
  written: string[];
  execResults: boolean[];
  execCalls: number;
  selectedValue: () => string | null;
}

let harness: Harness;

function install(options: { writeTextThrows?: boolean; execSucceeds?: boolean } = {}): Harness {
  const state: Harness = {
    written: [],
    execResults: [],
    execCalls: 0,
    selectedValue: () => null,
  };

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        if (options.writeTextThrows) throw new Error('Document is not focused');
        state.written.push(text);
      },
    },
  });

  let lastSelected: string | null = null;
  HTMLTextAreaElement.prototype.select = function select(this: HTMLTextAreaElement) {
    lastSelected = this.value;
  };
  state.selectedValue = () => lastSelected;

  (document as Document & { execCommand: (c: string) => boolean }).execCommand = (
    command: string,
  ) => {
    if (command !== 'copy') return false;
    state.execCalls += 1;
    const ok = options.execSucceeds !== false;
    state.execResults.push(ok);
    return ok;
  };

  return state;
}

beforeEach(() => {
  document.body.innerHTML = '';
  harness = install();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the modern path', () => {
  it('writes through the clipboard API when it is allowed to', async () => {
    await expect(copyInPage('the prompt')).resolves.toBe(true);
    expect(harness.written).toEqual(['the prompt']);
    expect(harness.execCalls).toBe(0);
  });
});

describe('the execCommand fallback', () => {
  beforeEach(() => {
    harness = install({ writeTextThrows: true });
  });

  it('runs when the clipboard API refuses', async () => {
    await expect(copyInPage('the prompt')).resolves.toBe(true);
    expect(harness.execCalls).toBe(1);
    expect(harness.selectedValue()).toBe('the prompt');
  });

  it('leaves no textarea behind in the page', async () => {
    await copyInPage('the prompt');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('reports failure rather than claiming a copy that did not happen', async () => {
    harness = install({ writeTextThrows: true, execSucceeds: false });
    await expect(copyInPage('the prompt')).resolves.toBe(false);
  });

  it('copies a long, multi-line prompt intact', async () => {
    const prompt = `line one\n\n\`\`\`cpp\nint main() {}\n\`\`\`\n${'x'.repeat(5000)}`;
    await copyInPage(prompt);
    expect(harness.selectedValue()).toBe(prompt);
  });
});

describe('when there is no clipboard at all', () => {
  it('returns false instead of throwing', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    (document as Document & { execCommand: unknown }).execCommand = () => {
      throw new Error('not supported');
    };
    await expect(copyInPage('x')).resolves.toBe(false);
  });
});

describe('survives the trip through executeScript', () => {
  it('still works when rebuilt from its own source', async () => {
    harness = install({ writeTextThrows: true });
    // eslint-disable-next-line no-new-func -- this is the point of the test
    const rebuilt = new Function(`return (${copyInPage.toString()})`)() as (
      text: string,
    ) => Promise<boolean>;

    // A reference to anything outside the body would throw here rather than
    // failing silently inside a page nobody is watching.
    await expect(rebuilt('from the worker')).resolves.toBe(true);
    expect(harness.selectedValue()).toBe('from the worker');
  });

  it('references nothing but browser globals', () => {
    const source = copyInPage.toString();
    expect(source).not.toMatch(/\bimport\b/);
    expect(source).not.toMatch(/\brequire\(/);
  });
});
