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
 * Registered from phase 0 so CRXJS's world:'MAIN' support is proven early.
 * Implemented in phase 2.
 */
export {};
