/**
 * ChatGPT content script.
 *
 * Claims the prompt prepared for this tab, types it into the composer, shows
 * the review banner, and stops. It never submits: the human review step is a
 * security control, not a preference (D003).
 *
 * ---------------------------------------------------------------------------
 * NEVER SUBMIT.
 *
 * No `Enter` key event, no click on a send button, no `form.submit()` or
 * `requestSubmit()`, anywhere in this file. The prompt contains text scraped
 * from a page nobody controls, and a human reading it before sending is the
 * last line of defence against prompt injection (architecture.md section 9.2).
 * A future request to auto-send needs a decision entry that reckons with that,
 * not a patch here. `inject.test.ts` greps this file for those patterns.
 * ---------------------------------------------------------------------------
 *
 * Everything ChatGPT-specific lives here -- selector, timeout, insertion
 * strategies -- so a redesign is a single-file fix. When it does break, the
 * prompt goes to the clipboard rather than being lost (spec.md section 7.2).
 */

import type { Msg } from '../../core/types';
import { copyInPage } from '../platform/clipboard';
import { toastInPage } from '../platform/toast';

/**
 * The composer, preferred-first.
 *
 * Verified: 2026-09-03. ChatGPT's composer is a ProseMirror `contenteditable`,
 * not a `<textarea>` -- setting `textContent` on it does not update React's
 * state, which is why the insertion strategies below go through real events.
 * The `<textarea>` entry is last because older builds used one and some
 * accessibility modes still render one.
 */
const COMPOSER_SELECTORS = [
  '#prompt-textarea',
  'div[contenteditable="true"][data-virtualkeyboard="true"]',
  'form div[contenteditable="true"]',
  'main textarea',
] as const;

const COMPOSER_TIMEOUT_MS = 10_000;
const BANNER_ID = 'dsa-helper-banner';
const BANNER_VISIBLE_MS = 12_000;

const BANNER_TEXT = 'Prompt inserted by DSA Helper — review it, then press Enter.';
const CLIPBOARD_FALLBACK =
  "Couldn't fill the composer — the prompt is on your clipboard, press Ctrl+V.";
const TOTAL_FAILURE =
  "Couldn't fill the ChatGPT composer, and the clipboard is unavailable here.";

// --- claiming ---------------------------------------------------------------

/**
 * Ask the worker for this tab's prompt.
 *
 * Never reads `chrome.storage.session` directly: the claim has to be one-shot,
 * and only the worker can read-and-delete atomically enough to guarantee that
 * (D017). Returning null is the normal case -- most visits to ChatGPT are
 * ordinary ones, and this script must do nothing at all on those.
 */
async function claimPrompt(): Promise<string | null> {
  const request: Msg = { type: 'CLAIM_PENDING_PROMPT' };
  const reply: unknown = await chrome.runtime.sendMessage(request).catch(() => null);

  if (typeof reply !== 'object' || reply === null) return null;
  if ((reply as Msg).type !== 'PENDING_PROMPT') return null;

  const { prompt } = reply as Extract<Msg, { type: 'PENDING_PROMPT' }>;
  return typeof prompt === 'string' && prompt !== '' ? prompt : null;
}

// --- finding the composer ---------------------------------------------------

function findComposer(): HTMLElement | null {
  for (const selector of COMPOSER_SELECTORS) {
    try {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Wait for the composer to exist, up to the timeout.
 *
 * An observer rather than polling, but scoped to `document.body` with
 * `childList`/`subtree` and disconnected the moment it hits -- ChatGPT streams
 * tokens into the DOM, and an observer left running here would fire on every
 * one of them.
 */
function waitForComposer(timeoutMs = COMPOSER_TIMEOUT_MS): Promise<HTMLElement | null> {
  const immediate = findComposer();
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (el: HTMLElement | null): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(el);
    };

    const observer = new MutationObserver(() => {
      const el = findComposer();
      if (el) finish(el);
    });

    const timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    const root = document.body ?? document.documentElement;
    if (!root) {
      finish(null);
      return;
    }
    observer.observe(root, { childList: true, subtree: true });
  });
}

// --- inserting --------------------------------------------------------------

function isTextArea(el: HTMLElement): el is HTMLTextAreaElement {
  return el.tagName === 'TEXTAREA';
}

/** What the composer currently holds, however it is implemented. */
export function readComposer(el: HTMLElement): string {
  if (isTextArea(el)) return el.value;
  return el.innerText || el.textContent || '';
}

/**
 * Compare loosely: ProseMirror splits the text into paragraph nodes, so what
 * comes back differs from what went in by whitespace alone. Anything more than
 * that means the insertion did not land.
 */
function matches(actual: string, expected: string): boolean {
  const squeeze = (value: string): string => value.replace(/\s+/g, ' ').trim();
  return squeeze(actual) === squeeze(expected);
}

function selectAll(el: HTMLElement): void {
  el.focus();
  if (isTextArea(el)) {
    el.setSelectionRange(0, el.value.length);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Attempt 1 — `execCommand('insertText')`.
 *
 * Deprecated, and still the best option here: it produces the real
 * `beforeinput`/`input` pair ProseMirror listens for, which is exactly what
 * setting a property does not.
 */
function insertViaExecCommand(el: HTMLElement, prompt: string): void {
  selectAll(el);
  document.execCommand('insertText', false, prompt);
}

/** Attempt 2 — a synthetic paste, which ProseMirror handles explicitly. */
function insertViaPaste(el: HTMLElement, prompt: string): void {
  selectAll(el);
  const data = new DataTransfer();
  data.setData('text/plain', prompt);
  el.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  );
}

/** Attempt 3 — write the DOM and announce it. Last resort; often ignored. */
function insertViaDom(el: HTMLElement, prompt: string): void {
  if (isTextArea(el)) {
    el.value = prompt;
  } else {
    // textContent, not innerHTML: the prompt carries page-derived text.
    el.textContent = prompt;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const STRATEGIES: ReadonlyArray<{
  name: string;
  run: (el: HTMLElement, prompt: string) => void;
}> = [
  { name: 'insertText', run: insertViaExecCommand },
  { name: 'paste', run: insertViaPaste },
  { name: 'dom', run: insertViaDom },
];

/**
 * Try each strategy and verify by reading the composer back.
 *
 * Verification is the point: a strategy that appears to work but leaves React's
 * state untouched produces a composer that looks filled and submits nothing,
 * which is worse than an honest failure.
 */
export function insertPrompt(el: HTMLElement, prompt: string): boolean {
  for (const strategy of STRATEGIES) {
    try {
      strategy.run(el, prompt);
    } catch {
      continue;
    }
    if (matches(readComposer(el), prompt)) return true;
  }
  return false;
}

// --- telling the user -------------------------------------------------------

/**
 * The review banner.
 *
 * Its own shadow root rather than the shared toast: this one has to outlast a
 * 4-second toast, because it is asking the user to do something.
 */
function showBanner(): void {
  try {
    document.getElementById(BANNER_ID)?.remove();

    const host = document.createElement('div');
    host.id = BANNER_ID;
    host.style.cssText =
      'all:initial;position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%)';

    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent =
      '.banner{display:flex;gap:12px;align-items:center;' +
      'font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'color:#fff;background:#4f46e5;padding:10px 14px;border-radius:8px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.28)}' +
      'button{all:unset;cursor:pointer;opacity:.75;font-size:16px;line-height:1}' +
      'button:hover{opacity:1}';

    const bar = document.createElement('div');
    bar.className = 'banner';
    bar.setAttribute('role', 'status');

    const text = document.createElement('span');
    text.textContent = BANNER_TEXT;

    const close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', () => {
      host.remove();
    });

    bar.append(text, close);
    root.append(style, bar);
    document.documentElement.append(host);

    setTimeout(() => {
      host.remove();
    }, BANNER_VISIBLE_MS);
  } catch {
    // A banner that cannot render is not worth failing the insertion over.
  }
}

/** The prompt is never lost: if the composer refuses, the clipboard gets it. */
async function fallbackToClipboard(prompt: string): Promise<void> {
  const copied = await copyInPage(prompt);
  toastInPage(copied ? 'warn' : 'error', copied ? CLIPBOARD_FALLBACK : TOTAL_FAILURE);
}

// --- entry ------------------------------------------------------------------

export async function run(): Promise<void> {
  const prompt = await claimPrompt();
  // No prompt for this tab is the ordinary case: someone opened ChatGPT
  // themselves. Do nothing, silently.
  if (!prompt) return;

  const composer = await waitForComposer();
  if (!composer) {
    await fallbackToClipboard(prompt);
    return;
  }

  if (!insertPrompt(composer, prompt)) {
    await fallbackToClipboard(prompt);
    return;
  }

  showBanner();
}

// Guarded so the module can be imported by its tests without firing. In the
// page this is always true; `chrome.runtime.id` is undefined once the
// extension is reloaded, which is also exactly when doing nothing is right.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) void run();
