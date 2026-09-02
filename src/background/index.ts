/**
 * Service worker entry.
 *
 * MV3 kills this worker after ~30s idle and restarts it cold on the next
 * event, so: listeners are registered synchronously at top level, and no
 * mutable state lives in module scope. See docs/architecture.md section 5.1.
 */

chrome.runtime.onInstalled.addListener(() => {
  // Phase 3 registers context menus here.
});

chrome.commands.onCommand.addListener(() => {
  // Phase 3 dispatches through runAction().
});
