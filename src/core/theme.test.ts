/**
 * @vitest-environment jsdom
 *
 * Theme application (spec.md §9.4).
 *
 * Small, and worth pinning: the "system" case has to *remove* the attribute
 * rather than set a third value, or the CSS media query has something to
 * override and a user who switches back to system stays stuck.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { THEMES, applyTheme, isTheme } from './theme';

let root: HTMLElement;

beforeEach(() => {
  root = document.documentElement;
  root.removeAttribute('data-theme');
});

describe('applyTheme', () => {
  it('pins an explicit choice', () => {
    applyTheme(root, 'dark');
    expect(root.getAttribute('data-theme')).toBe('dark');

    applyTheme(root, 'light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('removes the attribute for "system" rather than setting a third value', () => {
    applyTheme(root, 'dark');
    applyTheme(root, 'system');
    // The CSS media query is back in charge, with nothing to override.
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('is safe to apply repeatedly', () => {
    applyTheme(root, 'dark');
    applyTheme(root, 'dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });
});

describe('isTheme', () => {
  it('accepts exactly the three themes', () => {
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
    expect(THEMES).toHaveLength(3);
  });

  it('rejects anything else, including stored rubbish', () => {
    expect(isTheme('midnight')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(1)).toBe(false);
  });
});
