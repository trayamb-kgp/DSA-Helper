/**
 * ISOLATED-world half of the editor bridge (D020).
 *
 * Posts a nonce-tagged request into the page and waits, briefly, for a reply
 * that matches it. Anything else on the channel is ignored; a reply that never
 * comes is not an error, it is layer 2 declining to answer, and the caller
 * falls through to layer 3.
 */

import {
  BRIDGE_TIMEOUT_MS,
  REQUEST_KIND,
  parseBridgeResponse,
  type BridgeRequest,
} from '../mainworld/protocol';
import type { EditorRead } from './adapter';

/**
 * One nonce per page load, generated on our side of the boundary.
 *
 * `crypto.randomUUID` is present in every browser that runs MV3; the fallback
 * exists so a test environment without it doesn't have to stub crypto.
 */
function makeNonce(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const PAGE_NONCE = makeNonce();

let requestCounter = 0;

export interface BridgeOptions {
  /** Injected in tests; defaults to the real page window. */
  target?: Window;
  timeoutMs?: number;
  nonce?: string;
}

/**
 * Ask the page's editor for its buffer.
 *
 * Resolves to null on timeout, on a malformed reply, or when no editor
 * answered -- all of which mean the same thing to the caller.
 */
export function readEditorViaBridge(options: BridgeOptions = {}): Promise<EditorRead | null> {
  const target = options.target ?? window;
  const timeoutMs = options.timeoutMs ?? BRIDGE_TIMEOUT_MS;
  const nonce = options.nonce ?? PAGE_NONCE;

  requestCounter += 1;
  const id = `${nonce}:${requestCounter}`;

  return new Promise<EditorRead | null>((resolve) => {
    let settled = false;

    const finish = (result: EditorRead | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      target.removeEventListener('message', onMessage);
      resolve(result);
    };

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== target) return;
      if (event.origin !== target.location.origin) return;
      const response = parseBridgeResponse(event.data, nonce, id);
      if (!response) return;
      finish({
        code: response.code,
        language: response.language,
        editor: response.editor,
        truncated: response.truncated,
      });
    };

    const timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    target.addEventListener('message', onMessage);

    const request: BridgeRequest = { kind: REQUEST_KIND, nonce, id };
    try {
      target.postMessage(request, target.location.origin);
    } catch {
      finish(null);
    }
  });
}
