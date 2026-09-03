/**
 * Theme application for the two React surfaces (spec.md section 9.4).
 *
 * The CSS does the work through `prefers-color-scheme`; this only pins the
 * root to `light` or `dark` when the user has overridden the system. `system`
 * removes the attribute rather than setting it to a third value, so the media
 * query is back in charge with nothing to undo.
 *
 * Takes the element rather than reaching for `document`, so it stays testable
 * and so `core/` keeps its rule.
 */

import type { Settings } from './types';

export type Theme = Settings['theme'];

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    return;
  }
  root.setAttribute('data-theme', theme);
}
