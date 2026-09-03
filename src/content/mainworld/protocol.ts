/**
 * The wire format between the ISOLATED content script and the MAIN-world
 * editor bridge. Shared by both ends; no side effects, no chrome.*, no DOM.
 *
 * The trust model is worth stating plainly (D020, architecture.md section 6.4):
 * the bridge runs in the page's own world, so the page can read these messages
 * and forge replies. The nonce does not make the channel secret -- nothing can,
 * on that side of the boundary. What it buys is that unrelated postMessage
 * traffic and stale replies from a previous page load can't be mistaken for an
 * answer. Everything that comes back is still validated and still treated as
 * an untrusted string.
 */

export const CHANNEL = 'dsa-helper/editor-bridge';
export const REQUEST_KIND = `${CHANNEL}#request` as const;
export const RESPONSE_KIND = `${CHANNEL}#response` as const;

/**
 * Length cap on a returned buffer (architecture.md section 6.4 says 256 KB).
 * Counted in UTF-16 code units: source code is effectively ASCII, so this is
 * the same number in practice and it is one cheap `.length` check.
 */
export const MAX_CODE_CHARS = 256 * 1024;

/** Silence falls through to the next capture layer rather than hanging. */
export const BRIDGE_TIMEOUT_MS = 1500;

export interface BridgeRequest {
  kind: typeof REQUEST_KIND;
  nonce: string;
  id: string;
}

export interface BridgeResponse {
  kind: typeof RESPONSE_KIND;
  nonce: string;
  id: string;
  code: string | null;
  language: string | null;
  editor: string | null;
  truncated: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function isBridgeRequest(value: unknown): value is BridgeRequest {
  return (
    isRecord(value) &&
    value['kind'] === REQUEST_KIND &&
    typeof value['nonce'] === 'string' &&
    typeof value['id'] === 'string'
  );
}

/**
 * Validate a reply against the nonce we issued.
 *
 * Returns null for anything that isn't a well-formed response to *our* request
 * -- wrong shape, wrong nonce, wrong id. `code` is truncated here as well as at
 * the bridge, because the bridge's copy of that check runs in hostile territory.
 */
export function parseBridgeResponse(
  value: unknown,
  nonce: string,
  id: string,
): BridgeResponse | null {
  if (!isRecord(value)) return null;
  if (value['kind'] !== RESPONSE_KIND) return null;
  if (value['nonce'] !== nonce || value['id'] !== id) return null;

  const rawCode = optionalString(value['code']);
  const capped = rawCode != null && rawCode.length > MAX_CODE_CHARS;

  return {
    kind: RESPONSE_KIND,
    nonce,
    id,
    code: capped ? rawCode.slice(0, MAX_CODE_CHARS) : rawCode,
    language: optionalString(value['language']),
    editor: optionalString(value['editor']),
    truncated: value['truncated'] === true || capped,
  };
}
