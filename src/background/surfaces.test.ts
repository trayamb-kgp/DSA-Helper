/**
 * The three trigger surfaces map onto the same three action ids (D002, D013).
 *
 * Small tests, but they are what stops a renamed command or a mistyped menu id
 * turning into a shortcut that silently does nothing — the exact failure D016
 * forbids, and one that no amount of testing `runAction` would catch.
 */

import { describe, expect, it } from 'vitest';
import type { ActionId } from '../core/types';
import { actionForCommand } from './commands';
import { actionForMenuId } from './contextMenus';

/** Every action the extension has. If this grows, both surfaces must too. */
const ALL_ACTIONS: ActionId[] = ['youtube', 'chatgpt', 'copyPrompt'];

describe('keyboard commands', () => {
  it('maps the manifest command names, exactly as spelled there', () => {
    expect(actionForCommand('search-youtube')).toBe('youtube');
    expect(actionForCommand('ask-chatgpt')).toBe('chatgpt');
    expect(actionForCommand('copy-prompt')).toBe('copyPrompt');
  });

  it('covers every action', () => {
    const covered = ['search-youtube', 'ask-chatgpt', 'copy-prompt'].map(actionForCommand);
    expect(covered.sort()).toEqual([...ALL_ACTIONS].sort());
  });

  it('ignores a command it does not know', () => {
    expect(actionForCommand('_execute_action')).toBeNull();
    expect(actionForCommand('')).toBeNull();
  });
});

describe('context menu', () => {
  it('maps its own item ids', () => {
    expect(actionForMenuId('dsa-helper:youtube')).toBe('youtube');
    expect(actionForMenuId('dsa-helper:chatgpt')).toBe('chatgpt');
    expect(actionForMenuId('dsa-helper:copyPrompt')).toBe('copyPrompt');
  });

  it('covers every action', () => {
    const covered = ALL_ACTIONS.map((id) => actionForMenuId(`dsa-helper:${id}`));
    expect(covered).toEqual(ALL_ACTIONS);
  });

  it('ignores the parent item and anything unrecognised', () => {
    expect(actionForMenuId('dsa-helper')).toBeNull();
    expect(actionForMenuId('some-other-extension:youtube')).toBeNull();
    expect(actionForMenuId(42)).toBeNull();
  });
});

describe('the surfaces agree', () => {
  it('reaches the same action ids by both routes', () => {
    for (const [command, menuId] of [
      ['search-youtube', 'dsa-helper:youtube'],
      ['ask-chatgpt', 'dsa-helper:chatgpt'],
      ['copy-prompt', 'dsa-helper:copyPrompt'],
    ] as const) {
      expect(actionForCommand(command)).toBe(actionForMenuId(menuId));
    }
  });
});
