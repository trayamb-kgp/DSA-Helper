/**
 * Right-click menu (spec.md section 9.3): a parent item with the three
 * actions under it, shown only on the platforms we support.
 *
 * `documentUrlPatterns` comes from the same list the manifest uses for its
 * content-script matches, so the menu cannot appear somewhere the extension
 * has no business being.
 */

import type { ActionId } from '../core/types';
import { PROBLEM_PAGE_PATTERNS } from '../core/urls';
import { runAction } from './actions';

const PARENT_ID = 'dsa-helper';

interface MenuItem {
  id: ActionId;
  title: string;
}

const ITEMS: readonly MenuItem[] = [
  { id: 'youtube', title: 'Search YouTube for this problem' },
  { id: 'chatgpt', title: 'Ask ChatGPT to review my solution' },
  { id: 'copyPrompt', title: 'Copy the review prompt' },
];

const MENU_IDS: Readonly<Record<string, ActionId>> = Object.freeze(
  Object.fromEntries(ITEMS.map((item) => [`${PARENT_ID}:${item.id}`, item.id])),
);

export function actionForMenuId(menuItemId: string | number): ActionId | null {
  return MENU_IDS[String(menuItemId)] ?? null;
}

/**
 * Rebuild the menu from scratch.
 *
 * `removeAll` first because `onInstalled` fires on update as well as install,
 * and creating an id that already exists is an error that would leave the
 * remaining items unregistered.
 */
export function registerContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    const documentUrlPatterns = [...PROBLEM_PAGE_PATTERNS];

    chrome.contextMenus.create({
      id: PARENT_ID,
      title: 'DSA Helper',
      contexts: ['page', 'selection'],
      documentUrlPatterns,
    });

    for (const item of ITEMS) {
      chrome.contextMenus.create({
        id: `${PARENT_ID}:${item.id}`,
        parentId: PARENT_ID,
        title: item.title,
        contexts: ['page', 'selection'],
        documentUrlPatterns,
      });
    }
  });
}

export async function handleMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  const action = actionForMenuId(info.menuItemId);
  if (!action) return;
  await runAction(action, tab);
}
