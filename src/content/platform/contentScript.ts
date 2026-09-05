/**
 * Platform content script (ISOLATED world).
 *
 * Cheap until asked: page load costs a listener registration and nothing else.
 * Extraction runs only on an EXTRACT_CONTEXT message. See docs/architecture.md
 * section 7 for the load-time budget this protects.
 *
 * Nothing here trusts its input. Any page that knows the extension id can call
 * chrome.runtime.sendMessage, so the message shape is checked before use
 * (architecture.md section 9.1).
 */

import type { Msg, ProblemContext } from '../../core/types';
import { buildContext, waitFor, type ExtractEnv } from './adapter';
import { readEditorViaBridge } from './bridgeClient';
import { resolveAdapter } from './registry';

function isExtractRequest(value: unknown): value is Extract<Msg, { type: 'EXTRACT_CONTEXT' }> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'EXTRACT_CONTEXT'
  );
}

/** localStorage throws outright when the page's storage is blocked. */
function pageStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function currentSelection(): string | null {
  try {
    return window.getSelection()?.toString() ?? null;
  } catch {
    return null;
  }
}

function makeEnv(): ExtractEnv {
  return {
    url: new URL(window.location.href),
    doc: document,
    storage: pageStorage(),
    readEditor: () => readEditorViaBridge(),
    selection: currentSelection,
    warnings: [],
    diagnostics: [],
  };
}

/**
 * Resolve the adapter, wait for the page to hydrate, extract.
 *
 * Returns null for a page no adapter claims. That is not a failure and not a
 * `Msg` -- it is the caller's cue to show the unsupported-page state.
 */
async function extract(): Promise<{ context: ProblemContext; diagnostics: string[] } | null> {
  const env = makeEnv();
  const adapter = resolveAdapter(env.url);
  if (!adapter) return null;

  // spec.md section 6.1: an SPA route may not have rendered yet.
  const ready = await waitFor(() => adapter.isReady(env));
  if (!ready) {
    env.warnings.push("The page hadn't finished loading — some details may be missing");
  }

  const context = await buildContext(adapter, env);
  // Which selector matched, which fallback. Support-facing, and the only
  // signal a breakage produces when there is no telemetry (D031).
  return { context, diagnostics: env.diagnostics };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtractRequest(message)) return false;

  void extract()
    .then((result) => {
      const reply: Msg | null = result
        ? { type: 'CONTEXT_RESULT', context: result.context, diagnostics: result.diagnostics }
        : null;
      sendResponse(reply);
    })
    .catch(() => {
      sendResponse(null);
    });

  return true; // the response is asynchronous
});
