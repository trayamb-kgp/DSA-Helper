/**
 * Keyboard command handlers (spec.md section 9.1).
 *
 * Thin by design: the command name maps to an action id and everything else
 * happens in runAction, so the shortcut cannot behave differently from the
 * menu or the popup (D013).
 */

import type { ActionId } from '../core/types';
import { runAction } from './actions';

const COMMAND_ACTIONS: Readonly<Record<string, ActionId>> = Object.freeze({
  'search-youtube': 'youtube',
  'ask-chatgpt': 'chatgpt',
  'copy-prompt': 'copyPrompt',
});

export function actionForCommand(command: string): ActionId | null {
  return COMMAND_ACTIONS[command] ?? null;
}

/**
 * `chrome.commands` passes the active tab, but only on some Chrome versions
 * and never for a command fired while the popup has focus, so it is queried
 * when absent rather than trusted to be there.
 */
export async function handleCommand(
  command: string,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  const action = actionForCommand(command);
  if (!action) return;

  const target =
    tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  await runAction(action, target);
}
