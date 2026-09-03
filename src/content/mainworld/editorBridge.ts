/**
 * MAIN-world editor bridge.
 *
 * Runs in the page's own JavaScript world, which means the page can see it and
 * forge its replies. Rules (D020):
 *   - read-only: it never evaluates anything it receives
 *   - per-page-load nonce, origin and event.source checks on both ends
 *   - responses length-capped and treated as untrusted strings
 *   - no access to chrome.* at all
 *
 * Everything below is a read. There is no branch in this file that calls,
 * constructs, or evaluates anything derived from an incoming message -- the
 * only thing taken from a request is its nonce and id, which are echoed back
 * as strings. That is what makes the channel safe to expose to a hostile page.
 *
 * Why four editors: LeetCode is Monaco today, CodeChef and GfG have shipped
 * Ace and CodeMirror at various points, and reading the model is the only way
 * to get the *whole* buffer out of a virtualised editor (D014).
 */

import {
  MAX_CODE_CHARS,
  RESPONSE_KIND,
  isBridgeRequest,
  type BridgeResponse,
} from './protocol';

interface Reading {
  code: string;
  language: string | null;
  editor: string;
}

/** Every reader is best-effort: a throw means "not this editor", never a failure. */
function attempt(read: () => Reading | null): Reading | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

type Unknowable = Record<string, unknown>;

function readMonaco(): Reading | null {
  const monaco = (globalThis as Unknowable)['monaco'] as
    | {
        editor?: {
          getEditors?: () => Array<{ getModel?: () => unknown }>;
          getModels?: () => unknown[];
        };
      }
    | undefined;
  const api = monaco?.editor;
  if (!api) return null;

  // getEditors() is ordered by the visible editors, so its first entry is the
  // buffer on screen -- which is the one D025 says is the solution attempt.
  // getModels() includes models for panes the user isn't looking at.
  const models: unknown[] = [];
  const editors = api.getEditors?.() ?? [];
  for (const editor of editors) {
    const model = editor?.getModel?.();
    if (model) models.push(model);
  }
  for (const model of api.getModels?.() ?? []) {
    if (model && !models.includes(model)) models.push(model);
  }

  for (const candidate of models) {
    const model = candidate as {
      getValue?: () => unknown;
      getLanguageId?: () => unknown;
      isDisposed?: () => unknown;
    };
    if (model.isDisposed?.() === true) continue;
    const value = model.getValue?.();
    if (!nonEmpty(value)) continue;
    const language = model.getLanguageId?.();
    return {
      code: value,
      language: typeof language === 'string' ? language : null,
      editor: 'monaco',
    };
  }
  return null;
}

function readAce(): Reading | null {
  const ace = (globalThis as Unknowable)['ace'] as
    | { edit?: (el: Element) => unknown }
    | undefined;
  if (!ace?.edit) return null;

  for (const el of Array.from(document.querySelectorAll('.ace_editor'))) {
    // ace.edit() on an already-initialised element returns the existing
    // editor rather than creating one, so this stays a read.
    const editor = ace.edit(el) as
      | {
          getValue?: () => unknown;
          session?: { getMode?: () => { $id?: unknown } | undefined };
        }
      | undefined;
    const value = editor?.getValue?.();
    if (!nonEmpty(value)) continue;
    const mode = editor?.session?.getMode?.()?.$id;
    return {
      code: value,
      language: typeof mode === 'string' ? mode : null,
      editor: 'ace',
    };
  }
  return null;
}

function readCodeMirror6(): Reading | null {
  for (const el of Array.from(document.querySelectorAll('.cm-content, .cm-editor'))) {
    const view = (el as Element & { cmView?: { view?: unknown } }).cmView?.view as
      | { state?: { doc?: { toString?: () => unknown } } }
      | undefined;
    const value = view?.state?.doc?.toString?.();
    if (!nonEmpty(value)) continue;
    // CodeMirror 6 keeps the language in a compartment with no public id, so
    // the language is left to the adapter's other signals.
    return { code: value, language: null, editor: 'cm6' };
  }
  return null;
}

function readCodeMirror5(): Reading | null {
  for (const el of Array.from(document.querySelectorAll('.CodeMirror'))) {
    const instance = (el as Element & { CodeMirror?: unknown }).CodeMirror as
      | { getValue?: () => unknown; getOption?: (name: string) => unknown }
      | undefined;
    const value = instance?.getValue?.();
    if (!nonEmpty(value)) continue;
    const mode = instance?.getOption?.('mode');
    return {
      code: value,
      language: typeof mode === 'string' ? mode : null,
      editor: 'cm5',
    };
  }
  return null;
}

const READERS = [readMonaco, readAce, readCodeMirror6, readCodeMirror5] as const;

function readEditor(): Reading | null {
  for (const reader of READERS) {
    const reading = attempt(reader);
    if (reading) return reading;
  }
  return null;
}

window.addEventListener('message', (event: MessageEvent) => {
  // Only this window, only this origin. A frame or an extension on another
  // origin gets no answer at all.
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const request = event.data;
  if (!isBridgeRequest(request)) return;

  const reading = readEditor();
  const code = reading?.code ?? null;
  const truncated = code != null && code.length > MAX_CODE_CHARS;

  const response: BridgeResponse = {
    kind: RESPONSE_KIND,
    // Echoed verbatim as strings. Nothing from the request is ever executed.
    nonce: request.nonce,
    id: request.id,
    code: truncated && code ? code.slice(0, MAX_CODE_CHARS) : code,
    language: reading?.language ?? null,
    editor: reading?.editor ?? null,
    truncated,
  };

  window.postMessage(response, window.location.origin);
});
