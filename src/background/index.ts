/**
 * Service worker entry.
 *
 * MV3 kills this worker after ~30s idle and restarts it cold on the next
 * event, so: listeners are registered synchronously at top level, and no
 * mutable state lives in module scope. See docs/architecture.md section 5.1.
 */

import type { Msg } from '../core/types';
import { PLATFORM_LABELS } from '../core/types';
import { platformForUrl } from '../core/urls';
import { forgetTab, runAction } from './actions';
import { handleCommand } from './commands';
import { handleMenuClick, registerContextMenus } from './contextMenus';

const BADGE_COLOR = '#4f46e5';

/**
 * Badge and tooltip for one tab.
 *
 * Detection is a pure URL match run here rather than in the page, which is
 * what lets it cost nothing: no content-script observer, no history patching,
 * and it works on tabs whose content script has not loaded yet (D039).
 */
async function refreshBadge(tabId: number, url: string | undefined): Promise<void> {
  const platform = url ? platformForUrl(url) : null;
  try {
    await chrome.action.setBadgeText({ tabId, text: platform ? '•' : '' });
    await chrome.action.setTitle({
      tabId,
      title: platform
        ? `DSA Helper — ${PLATFORM_LABELS[platform]} problem detected`
        : 'DSA Helper',
    });
  } catch {
    // The tab closed between the event and this call. Nothing to update.
  }
}

function isRunAction(value: unknown): value is Extract<Msg, { type: 'RUN_ACTION' }> {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as { type?: unknown; action?: unknown };
  return (
    msg.type === 'RUN_ACTION' &&
    (msg.action === 'youtube' || msg.action === 'chatgpt' || msg.action === 'copyPrompt')
  );
}

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
  void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
});

// The worker is restarted cold on every wake, so the badge colour has to be
// re-applied here as well as on install.
chrome.runtime.onStartup.addListener(() => {
  void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
});

chrome.commands.onCommand.addListener((command, tab) => {
  void handleCommand(command, tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleMenuClick(info, tab);
});

// SPA navigation shows up here as an ordinary update with a new `url`, which
// is why no page-side detection is needed (D039).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url == null && changeInfo.status == null) return;
  void refreshBadge(tabId, changeInfo.url ?? tab.url);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then(
    (tab) => refreshBadge(tabId, tab.url),
    () => undefined,
  );
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTab(tabId);
});

/**
 * The popup's dispatch route. Every inbound message is validated first: any
 * page that knows the extension id can call sendMessage (architecture.md
 * section 9.1).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isRunAction(message)) return false;

  const resolveTab = async (): Promise<chrome.tabs.Tab | undefined> => {
    if (message.tabId != null) return chrome.tabs.get(message.tabId).catch(() => undefined);
    if (sender.tab) return sender.tab;
    return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  };

  // A message with no `sender.tab` came from an extension page -- the popup.
  // That surface writes the clipboard itself, because the page is not the
  // focused document while the popup is open (D040).
  const returnPrompt = message.action === 'copyPrompt' && sender.tab === undefined;

  void resolveTab()
    .then((tab) => runAction(message.action, tab, { returnPrompt }))
    .then((prompt) => {
      const reply: Msg | { ok: true } = returnPrompt
        ? { type: 'PROMPT_RESULT', prompt }
        : { ok: true };
      sendResponse(reply);
    })
    .catch(() => {
      sendResponse(returnPrompt ? { type: 'PROMPT_RESULT', prompt: null } : { ok: false });
    });

  return true; // the response is asynchronous
});
