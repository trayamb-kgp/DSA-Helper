/**
 * Platform content script (ISOLATED world).
 *
 * Cheap until asked: page load costs a listener registration and nothing else.
 * Extraction runs only on an EXTRACT_CONTEXT message. See docs/architecture.md
 * section 7 for the load-time budget this protects.
 */

chrome.runtime.onMessage.addListener(() => {
  // Phase 2 resolves the adapter and replies with a ProblemContext.
  return false;
});
