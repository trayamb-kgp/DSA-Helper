/**
 * ChatGPT content script.
 *
 * Claims the prompt prepared for this tab and types it into the composer. By
 * default it then shows the review banner and stops -- the human review step is
 * a prompt-injection safeguard (D003). Only if the user has turned on the
 * auto-submit opt-in does it submit, and only after verifying the insertion
 * landed (D050).
 *
 * ---------------------------------------------------------------------------
 * SUBMIT ONLY WITH CONSENT, AND ONLY WHAT WAS VERIFIED.
 *
 * The prompt carries text scraped from a page nobody controls, so a human
 * reading it before it is sent is the last line of defence against prompt
 * injection (architecture.md section 9.2). That default does not change: the
 * extension submits nothing unless the user has explicitly opted in (D050,
 * which reverses the never-submit default of D003), and even then only:
 *   - after read-back verification of the insertion has passed, and
 *   - by clicking ChatGPT's own send button once -- never a synthetic `Enter`
 *     key event, never `form.submit()` / `requestSubmit()`, and
 *   - never on the clipboard-fallback path.
 * `inject.test.ts` locks this down: no key-event or form submission may appear
 * in this file, the submit gate is a single tested predicate, and the send
 * button is only clicked when it is actually enabled.
 * ---------------------------------------------------------------------------
 *
 * Everything ChatGPT-specific lives here -- selector, timeout, insertion
 * strategies, send button -- so a redesign is a single-file fix. When it does
 * break, the prompt goes to the clipboard rather than being lost (spec.md
 * section 7.2).
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
const SUBMITTED_TEXT = 'Prompt submitted by DSA Helper.';
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
async function claimPrompt(): Promise<{
  prompt: string;
  autoSubmit: boolean;
  showBanner: boolean;
} | null> {
  const request: Msg = { type: 'CLAIM_PENDING_PROMPT' };
  const reply: unknown = await chrome.runtime.sendMessage(request).catch(() => null);

  if (typeof reply !== 'object' || reply === null) return null;
  if ((reply as Msg).type !== 'PENDING_PROMPT') return null;

  const { prompt, autoSubmit, showBanner } = reply as Extract<Msg, { type: 'PENDING_PROMPT' }>;
  if (typeof prompt !== 'string' || prompt === '') return null;
  return { prompt, autoSubmit: autoSubmit === true, showBanner: showBanner !== false };
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

// --- submitting (opt-in only, D050) -----------------------------------------

/**
 * ChatGPT's send button, preferred-first.
 *
 * Verified: 2026-09-06, derived from documented markup rather than a live page
 * -- the same caveat as `COMPOSER_SELECTORS`, and the value most likely to need
 * updating after a redesign. Deliberately no `type="submit"` selector: the
 * only sanctioned submit is a click on this button, never a form submission.
 */
const SEND_BUTTON_SELECTORS = [
  'button[data-testid="send-button"]',
  '#composer-submit-button',
  'button[aria-label="Send prompt"]',
] as const;

const SEND_ENABLE_TIMEOUT_MS = 3000;
const SEND_POLL_MS = 100;

function findSendButton(): HTMLButtonElement | null {
  for (const selector of SEND_BUTTON_SELECTORS) {
    try {
      const el = document.querySelector<HTMLButtonElement>(selector);
      if (el) return el;
    } catch {
      continue;
    }
  }
  return null;
}

function isEnabled(button: HTMLButtonElement): boolean {
  return !button.disabled && button.getAttribute('aria-disabled') !== 'true';
}

/**
 * The submit gate, as one predicate so it is trivially testable: submit only
 * when the insertion verified *and* the user opted in (D050). Anything less
 * and the extension leaves the prompt for the user, exactly as D003 wants.
 */
export function shouldSubmit(inserted: boolean, autoSubmit: boolean): boolean {
  return inserted && autoSubmit;
}

/**
 * Wait briefly for the send button to be present and enabled, then click it
 * once. Returns whether it was clicked.
 *
 * The wait matters: ChatGPT enables the button a beat after the composer
 * registers input, so a single synchronous check would usually find it
 * disabled. If it never becomes ready, this returns false and the caller falls
 * back to the manual review path -- it never fires into a disabled composer,
 * and never dispatches a key event to force the issue.
 */
export async function submitComposer(timeoutMs = SEND_ENABLE_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const button = findSendButton();
    if (button && isEnabled(button)) {
      button.click();
      return true;
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, SEND_POLL_MS));
  }
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
  const claim = await claimPrompt();
  // No prompt for this tab is the ordinary case: someone opened ChatGPT
  // themselves. Do nothing, silently.
  if (!claim) return;
  const { prompt, autoSubmit, showBanner: bannerEnabled } = claim;

  const composer = await waitForComposer();
  if (!composer) {
    await fallbackToClipboard(prompt);
    return;
  }

  const inserted = insertPrompt(composer, prompt);
  if (!inserted) {
    // The clipboard fallback never auto-submits: a prompt that could not be
    // verifiably inserted must not be sent (D050).
    await fallbackToClipboard(prompt);
    return;
  }

  // Opt-in only, and only after the insertion verified (D050). If the send
  // button never becomes ready, fall through to the review banner rather than
  // firing into a disabled composer -- the prompt is inserted and waiting.
  if (shouldSubmit(inserted, autoSubmit) && (await submitComposer())) {
    toastInPage('info', SUBMITTED_TEXT);
    return;
  }

  // The banner is the visible half of the review step. It is on by default but
  // the user can turn it off ([D051]); when off, the composer just fills
  // silently. It still shows when an opted-in auto-submit could not send, since
  // the prompt is then inserted and waiting for a manual Enter.
  if (bannerEnabled) showBanner();
}

// Guarded so the module can be imported by its tests without firing. In the
// page this is always true; `chrome.runtime.id` is undefined once the
// extension is reloaded, which is also exactly when doing nothing is right.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) void run();
