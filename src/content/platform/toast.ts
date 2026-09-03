/**
 * Shadow-DOM toast. Built with textContent only, never innerHTML, so page CSS
 * cannot break it and page content cannot inject through it.
 *
 * The reason this exists at all is D016: no code path may end with the user
 * having pressed a key and nothing having happened. It is the last rung of
 * every ladder in the project.
 *
 * ---------------------------------------------------------------------------
 * `toastInPage` MUST STAY SELF-CONTAINED.
 *
 * The service worker shows toasts on pages that have no content script -- an
 * unsupported page is exactly where the user most needs to be told something
 * -- by passing this function to `chrome.scripting.executeScript({ func })`,
 * which serialises it with `Function.prototype.toString()`. Only the function
 * body survives that trip. A reference to anything declared outside it --
 * an import, a module constant, another helper -- becomes a ReferenceError in
 * the page, and the failure is silent because it happens in the injected
 * world. Everything it needs is therefore declared inside it, including the
 * durations and the element id, which look like they want hoisting and do not.
 * ---------------------------------------------------------------------------
 */

import type { ToastLevel } from '../../core/types';

export function toastInPage(level: ToastLevel, text: string): void {
  const HOST_ID = 'dsa-helper-toast';
  const VISIBLE_MS = 4000;
  const FADE_MS = 200;

  const COLORS: Record<string, string> = {
    info: '#4f46e5',
    warn: '#b45309',
    error: '#b91c1c',
  };

  try {
    // One toast at a time: a held-down shortcut should replace the message,
    // not stack a column of them down the page.
    document.getElementById(HOST_ID)?.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    // The host carries no visual styling of its own, so a page stylesheet has
    // nothing to target; everything visible lives inside the shadow root.
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;bottom:16px;right:16px';

    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = [
      '.toast{',
      'font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;',
      'color:#fff;background:' + (COLORS[level] ?? COLORS['info']) + ';',
      'padding:10px 14px;border-radius:8px;max-width:320px;',
      'box-shadow:0 4px 16px rgba(0,0,0,.28);',
      'opacity:0;transition:opacity ' + FADE_MS + 'ms ease}',
      '.toast.in{opacity:1}',
    ].join('');

    const bubble = document.createElement('div');
    bubble.className = 'toast';
    // textContent, never innerHTML: the text can carry a problem title, which
    // is page-controlled content (architecture.md section 9.2).
    bubble.textContent = text;
    bubble.setAttribute('role', level === 'error' ? 'alert' : 'status');

    root.append(style, bubble);
    document.documentElement.append(host);

    requestAnimationFrame(() => {
      bubble.classList.add('in');
    });

    setTimeout(() => {
      bubble.classList.remove('in');
      setTimeout(() => {
        host.remove();
      }, FADE_MS);
    }, VISIBLE_MS);
  } catch {
    // A page with a hostile CSP or a detached document is not worth throwing
    // over -- the toast is itself a fallback.
  }
}
