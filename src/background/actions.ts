/**
 * runAction(actionId, tab) -- the single dispatch path every trigger surface
 * converges on, so the three surfaces cannot drift apart (D013).
 *
 * The invariant this file exists to hold: **no path may end with the user
 * having pressed a key and nothing having happened** (D016). Every early
 * return below either opens a tab or says something.
 */

import type { ActionId, Msg, ProblemContext, Settings, ToastLevel } from '../core/types';
import { getSettings } from '../core/storage';
import { platformForUrl } from '../core/urls';
import { buildQuery, searchUrl, varsFromContext, varsFromTab } from '../core/youtube';
import { buildPrompt, describeResult } from '../core/prompt';
import { copyInPage } from '../content/platform/clipboard';
import { toastInPage } from '../content/platform/toast';

/**
 * Per-(tab, action) debounce (D017).
 *
 * Module-scope mutable state, which the service worker otherwise forbids
 * (architecture.md section 5.1) -- deliberately, and only because losing it is
 * harmless. The window is 750 ms and MV3 only kills an idle worker after ~30 s,
 * so a restart can never drop a debounce that was still doing anything. The
 * rule exists to stop *durable* state living here; this is the opposite.
 */
const DEBOUNCE_MS = 750;
const lastFired = new Map<string, number>();

export function shouldRun(tabId: number, action: ActionId, now = Date.now()): boolean {
  const key = `${tabId}:${action}`;
  const previous = lastFired.get(key);
  if (previous != null && now - previous < DEBOUNCE_MS) return false;
  lastFired.set(key, now);

  // The map is the only thing here that can grow without bound, so entries
  // older than the window are swept on the way past.
  for (const [entry, at] of lastFired) {
    if (now - at > DEBOUNCE_MS * 10) lastFired.delete(entry);
  }
  return true;
}

/** Forgets a tab's debounce state when the tab goes away. */
export function forgetTab(tabId: number): void {
  for (const key of lastFired.keys()) {
    if (key.startsWith(`${tabId}:`)) lastFired.delete(key);
  }
}

const UNSUPPORTED =
  'DSA Helper works on LeetCode problem pages. Open one and try again.';

const NOT_YET: Partial<Record<ActionId, string>> = {
  chatgpt: 'Ask ChatGPT is not wired up yet — it arrives in a later phase.',
};

const NO_CONTEXT =
  "Couldn't read this problem, so there's nothing to build a prompt from.";

/**
 * Show a toast on any tab, including one with no content script.
 *
 * An unsupported page is exactly where the user most needs to be told
 * something, and that is the one place no content script is running -- so the
 * toast is injected rather than messaged. `activeTab` covers this: a keyboard
 * command, a context-menu click and a popup click all grant it.
 */
export async function showToast(
  tabId: number,
  level: ToastLevel,
  text: string,
): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: toastInPage,
      args: [level, text],
    });
    return;
  } catch {
    // Injection is refused on chrome:// pages, the Web Store, and PDFs.
  }

  // Last rung: the toolbar itself. Cleared by the next badge refresh, and by
  // the timer below if this worker lives that long.
  try {
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setTitle({ tabId, title: `DSA Helper — ${text}` });
    setTimeout(() => {
      void chrome.action.setBadgeText({ tabId, text: '' });
    }, 4000);
  } catch {
    // Nothing left to try. The tab is gone.
  }
}

/** Ask the page for a context. Absent content script or a throw both mean null. */
async function requestContext(tabId: number): Promise<ProblemContext | null> {
  const request: Msg = { type: 'EXTRACT_CONTEXT' };
  const reply: unknown = await chrome.tabs.sendMessage(tabId, request).catch(() => null);
  if (
    typeof reply === 'object' &&
    reply !== null &&
    (reply as Msg).type === 'CONTEXT_RESULT'
  ) {
    return (reply as Extract<Msg, { type: 'CONTEXT_RESULT' }>).context;
  }
  return null;
}

async function openResult(
  tab: chrome.tabs.Tab,
  url: string,
  settings: Settings,
): Promise<void> {
  if (!settings.openInNewTab) {
    if (tab.id != null) await chrome.tabs.update(tab.id, { url });
    return;
  }
  await chrome.tabs.create({
    url,
    active: settings.focusNewTab,
    // Beside the problem, not at the far end of the tab strip.
    index: typeof tab.index === 'number' ? tab.index + 1 : undefined,
    windowId: tab.windowId,
  });
}

/** The YouTube action, spec.md section 7.1. */
async function runYouTube(tab: chrome.tabs.Tab, tabId: number, url: string): Promise<void> {
  const settings = await getSettings();
  const context = await requestContext(tabId);
  const platform = platformForUrl(url);

  const result = context
    ? buildQuery(settings.youtubeTemplate, varsFromContext(context), url, 'context')
    : buildQuery(
        settings.youtubeTemplate,
        // platform is non-null here: runAction checked before dispatching.
        varsFromTab(platform ?? 'leetcode', tab.title, url),
        url,
        'pageTitle',
      );

  await openResult(tab, searchUrl(result.query), settings);

  // Say so when the search was built from less than a real extraction --
  // otherwise a vague result looks like YouTube's fault rather than ours.
  if (result.rung !== 'context') {
    await showToast(
      tabId,
      'warn',
      "Couldn't read the problem, so the search used the page title instead.",
    );
  }
}

/**
 * Build the prompt for a tab, or explain why it couldn't be.
 *
 * Shared by both copy routes so they cannot produce different prompts, which
 * is the whole point of the single dispatch path (D013).
 */
async function preparePrompt(tabId: number): Promise<{ prompt: string; note: string } | null> {
  const [settings, context] = await Promise.all([getSettings(), requestContext(tabId)]);
  // Unlike the YouTube search, there is no useful prompt to build from a page
  // title alone: a review request with no statement and no code is noise.
  if (!context) return null;

  const result = buildPrompt(context, settings);
  return { prompt: result.prompt, note: describeResult(result) };
}

/** The clipboard action, spec.md section 7.3. */
async function runCopyPrompt(tabId: number): Promise<void> {
  const built = await preparePrompt(tabId);
  if (!built) {
    await showToast(tabId, 'warn', NO_CONTEXT);
    return;
  }

  // The page is the focused document for the command and menu routes, so the
  // write happens there (D040). The popup route never reaches this function.
  const [outcome] = await chrome.scripting.executeScript({
    target: { tabId },
    func: copyInPage,
    args: [built.prompt],
  });

  if (outcome?.result === true) {
    await showToast(tabId, 'info', built.note);
    return;
  }
  await showToast(tabId, 'error', "Couldn't reach the clipboard on this page.");
}

export interface RunOptions {
  /**
   * Return the prompt instead of writing it from the page.
   *
   * Set by the popup, which has to do its own clipboard write: while it is
   * open the page is not the focused document and `writeText` refuses there
   * (D040). Everything before delivery is the same code either way.
   */
  returnPrompt?: boolean;
}

/**
 * Returns the built prompt when `returnPrompt` was asked for and there was one
 * to build; null in every other case, including every non-clipboard action.
 */
export async function runAction(
  action: ActionId,
  tab: chrome.tabs.Tab | undefined,
  options: RunOptions = {},
): Promise<string | null> {
  const tabId = tab?.id;
  const url = tab?.url;
  if (tabId == null || !url) return null; // nothing addressable; nothing to say it to

  if (!shouldRun(tabId, action)) return null;

  if (!platformForUrl(url)) {
    await showToast(tabId, 'info', UNSUPPORTED);
    return null;
  }

  const pending = NOT_YET[action];
  if (pending) {
    await showToast(tabId, 'info', pending);
    return null;
  }

  try {
    if (action === 'copyPrompt') {
      if (options.returnPrompt) {
        const built = await preparePrompt(tabId);
        if (!built) {
          await showToast(tabId, 'warn', NO_CONTEXT);
          return null;
        }
        return built.prompt;
      }
      await runCopyPrompt(tabId);
      return null;
    }

    await runYouTube(tab, tabId, url);
    return null;
  } catch {
    await showToast(
      tabId,
      'error',
      action === 'copyPrompt'
        ? 'DSA Helper hit an error building the prompt.'
        : 'DSA Helper hit an error opening the search.',
    );
    return null;
  }
}
