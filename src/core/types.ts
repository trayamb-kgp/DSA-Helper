/**
 * The shared vocabulary. Everything else in the project imports from here.
 *
 * Mirrors spec.md 4.1 (message contract) and 5 (data model). No runtime
 * dependencies on `document` or `chrome.*` -- this file is types plus a
 * handful of frozen constants, and must stay that way.
 */

export type Platform = 'leetcode' | 'codeforces' | 'codechef' | 'geeksforgeeks';

export const PLATFORM_LABELS: Readonly<Record<Platform, string>> = Object.freeze({
  leetcode: 'LeetCode',
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  geeksforgeeks: 'GeeksforGeeks',
});

/**
 * Where the user's code came from, in descending order of trustworthiness.
 * Surfaced in the popup so the user can judge the capture before sending it
 * (spec.md 6.4).
 */
export type CodeSource = 'siteStorage' | 'editorApi' | 'domScrape' | 'selection' | 'none';

export type ActionId = 'youtube' | 'chatgpt' | 'copyPrompt';

export interface ProblemContext {
  platform: Platform;
  /** 'LeetCode', 'Codeforces', ... */
  platformLabel: string;
  /** Canonical problem URL, query and hash stripped. */
  url: string;
  /** 'sort-an-array', '1352A', 'FLOW001'. */
  slug: string;
  /** '912' | '1352A' | null. */
  number: string | null;
  title: string;
  /** 'Medium' | '1200' | 'Easy' | null. */
  difficulty: string | null;
  /** May be empty -- several platforms hide tags until revealed. */
  tags: string[];
  statementMd: string | null;
  examplesMd: string | null;
  constraintsMd: string | null;
  /** The language selected in the editor, e.g. 'C++' | 'Python3'. */
  language: string | null;
  code: string | null;
  codeSource: CodeSource;
  isContest: boolean;
  /**
   * Paywalled or login-gated: a named condition, not a capture failure
   * (D027). Both actions stay available; the prompt is built link-only.
   */
  isLocked: boolean;
  /** Epoch ms. */
  extractedAt: number;
  /** Human-readable notes about what could not be read. */
  warnings: string[];
}

export interface Settings {
  youtubeTemplate: string;
  promptTemplate: string;
  maxPromptChars: number;
  openInNewTab: boolean;
  focusNewTab: boolean;
  includeCode: boolean;
  /** false => clipboard-only flow, no ChatGPT tab is opened. */
  autoInjectChatGpt: boolean;
  /**
   * Opt-in: submit the prompt automatically once it has been *verifiably*
   * inserted, instead of leaving it for the user to send. **Off by default.**
   * This reverses the never-submit default of [D003] and is only acceptable
   * under [D050]: the human pre-read is a prompt-injection safeguard, so
   * auto-submit fires only after read-back verification and never on the
   * clipboard-fallback path. Meaningless unless `autoInjectChatGpt` is true.
   */
  autoSubmitChatGpt: boolean;
  /** 0 disables history entirely. */
  historyLimit: number;
  /** Popup toggle; persists across restarts. */
  historyPaused: boolean;
  theme: 'system' | 'light' | 'dark';
}

export interface HistoryEntry {
  /** '<platform>:<identifier>' -- identity and de-duplication key (D024). */
  problemKey: string;
  platform: Platform;
  title: string;
  /** The variant most recently visited, so a revisit returns the user there. */
  url: string;
  number: string | null;
  visitedAt: number;
}

export type ToastLevel = 'info' | 'warn' | 'error';

/** Discriminated union carried by every sendMessage call (spec.md 4.1). */
export type Msg =
  | { type: 'EXTRACT_CONTEXT' }
  /**
   * `diagnostics` rides alongside rather than inside `ProblemContext`: it is
   * support data about the *extraction*, not part of the problem, and the
   * data model has no business carrying it (D031, D044).
   */
  | { type: 'CONTEXT_RESULT'; context: ProblemContext; diagnostics?: string[] }
  | { type: 'RUN_ACTION'; action: ActionId; tabId?: number }
  | { type: 'CLAIM_PENDING_PROMPT' }
  /**
   * Reply to a RUN_ACTION of 'copyPrompt' sent from the popup, which has to do
   * its own clipboard write (D041). `prompt` is null when there was nothing to
   * build one from; the worker has already said so.
   */
  | { type: 'PROMPT_RESULT'; prompt: string | null }
  /**
   * `autoSubmit` travels with the prompt (decided by the worker from settings
   * when the action fired), so the ChatGPT content script never reads settings
   * itself. It is false on every path but a claim that both found a prompt and
   * had the opt-in on ([D050]).
   */
  | { type: 'PENDING_PROMPT'; prompt: string | null; autoSubmit: boolean }
  | { type: 'TOAST'; level: ToastLevel; text: string };
