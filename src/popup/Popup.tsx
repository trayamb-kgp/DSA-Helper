/**
 * The popup (spec.md section 9.2).
 *
 * On a supported page: what was read, the resolved YouTube query, the three
 * actions, and any warnings. On any page: the history list, which is still
 * useful when the current tab is not a problem at all.
 *
 * Actions dispatch through the service worker so the popup takes exactly the
 * path the shortcut and the menu take (D013). The one exception is copying,
 * which the popup has to finish itself — the page is not the focused document
 * while a popup is open, and `writeText` refuses there (D041).
 */

import { useCallback, useEffect, useState } from 'react';
import type { ActionId, HistoryEntry, Msg, ProblemContext, Settings } from '../core/types';
import { PLATFORM_LABELS } from '../core/types';
import { getHistory, getSettings, setHistory, setSettings } from '../core/storage';
import { buildQuery, varsFromContext } from '../core/youtube';
import { looksBroken } from '../core/diagnostics';
import { applyTheme } from '../core/theme';
import { copyInPage } from '../content/platform/clipboard';

interface Loaded {
  context: ProblemContext | null;
  settings: Settings;
  history: HistoryEntry[];
  tabId: number | null;
}

async function load(): Promise<Loaded> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [settings, history] = await Promise.all([getSettings(), getHistory()]);

  let context: ProblemContext | null = null;
  if (tab?.id != null) {
    const request: Msg = { type: 'EXTRACT_CONTEXT' };
    // No content script means no listener, which rejects. That is an
    // unsupported page, not an error worth showing.
    const reply: unknown = await chrome.tabs.sendMessage(tab.id, request).catch(() => null);
    if (typeof reply === 'object' && reply !== null && (reply as Msg).type === 'CONTEXT_RESULT') {
      context = (reply as Extract<Msg, { type: 'CONTEXT_RESULT' }>).context;
    }
  }

  return { context, settings, history, tabId: tab?.id ?? null };
}

function run(action: ActionId, tabId: number): void {
  const message: Msg = { type: 'RUN_ACTION', action, tabId };
  void chrome.runtime.sendMessage(message).catch(() => undefined);
  window.close();
}

/**
 * Copy is the one action the popup finishes itself.
 *
 * The worker still builds the prompt — one builder, one result — but the write
 * has to happen here, because the popup holds the click's user gesture and the
 * page does not have focus (D041).
 */
async function copyPrompt(tabId: number): Promise<'copied' | 'failed'> {
  const message: Msg = { type: 'RUN_ACTION', action: 'copyPrompt', tabId };
  const reply: unknown = await chrome.runtime.sendMessage(message).catch(() => null);

  if (typeof reply !== 'object' || reply === null || (reply as Msg).type !== 'PROMPT_RESULT') {
    return 'failed';
  }
  const { prompt } = reply as Extract<Msg, { type: 'PROMPT_RESULT' }>;
  if (!prompt) return 'failed';
  return (await copyInPage(prompt)) ? 'copied' : 'failed';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{value}</span>
    </div>
  );
}

function describeCode(context: ProblemContext): string {
  if (!context.code) return 'not captured';
  const from: Record<ProblemContext['codeSource'], string> = {
    siteStorage: 'site storage',
    editorApi: 'the editor',
    domScrape: 'the page (visible lines only)',
    selection: 'your selection',
    none: 'nowhere',
  };
  const language = context.language ? `${context.language}, ` : '';
  return `${language}${context.code.length} chars from ${from[context.codeSource]}`;
}

export function Popup() {
  const [state, setState] = useState<Loaded | null>(null);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    let live = true;
    void load().then((next) => {
      if (!live) return;
      setState(next);
      applyTheme(document.documentElement, next.settings.theme);
    });
    return () => {
      live = false;
    };
  }, []);

  const togglePause = useCallback(() => {
    setState((current) => {
      if (!current) return current;
      const historyPaused = !current.settings.historyPaused;
      void setSettings({ historyPaused });
      return { ...current, settings: { ...current.settings, historyPaused } };
    });
  }, []);

  const forget = useCallback((problemKey: string) => {
    setState((current) => {
      if (!current) return current;
      const history = current.history.filter((entry) => entry.problemKey !== problemKey);
      setHistory(history);
      return { ...current, history };
    });
  }, []);

  if (!state) {
    return (
      <main className="popup">
        <h1>DSA Helper</h1>
        <p className="muted">Reading the page…</p>
      </main>
    );
  }

  const { context, settings, history, tabId } = state;

  return (
    <main className="popup">
      {context && tabId != null ? (
        <Problem
          context={context}
          settings={settings}
          tabId={tabId}
          copied={copied}
          onCopy={() => void copyPrompt(tabId).then(setCopied)}
        />
      ) : (
        <>
          <h1>DSA Helper</h1>
          <p className="muted">
            Not a problem page. Works on LeetCode, Codeforces, CodeChef and GeeksforGeeks.
          </p>
        </>
      )}

      <History
        entries={history}
        paused={settings.historyPaused}
        onTogglePause={togglePause}
        onForget={forget}
      />

      <footer className="footer">
        <button type="button" className="link" onClick={() => void chrome.runtime.openOptionsPage()}>
          Settings
        </button>
      </footer>
    </main>
  );
}

function Problem({
  context,
  settings,
  tabId,
  copied,
  onCopy,
}: {
  context: ProblemContext;
  settings: Settings;
  tabId: number;
  copied: 'idle' | 'copied' | 'failed';
  onCopy: () => void;
}) {
  // The same function the action uses, so the preview cannot promise something
  // the button does not do (D006).
  const preview = buildQuery(settings.youtubeTemplate, varsFromContext(context), context.url).query;

  return (
    <>
      <h1>{context.platformLabel}</h1>
      <p className="title">
        {context.number ? `${context.number}. ` : ''}
        {context.title}
      </p>

      <Row label="Difficulty" value={context.difficulty ?? '—'} />
      <Row label="Tags" value={context.tags.length > 0 ? context.tags.join(', ') : '—'} />
      <Row label="Kind" value={context.isContest ? 'Contest' : 'Practice'} />
      <Row label="Code" value={describeCode(context)} />

      {/* A named condition, not a failure (D027). */}
      {context.isLocked && (
        <p className="locked">Premium problem — statement not available to you</p>
      )}

      {/* A redesign, not one bad selector. Deflects duplicate reports. */}
      {looksBroken(context) && (
        <p className="broken">
          Most of this page could not be read — the site may have changed. Settings → Diagnostics
          has a report you can send.
        </p>
      )}

      <p className="preview-label">YouTube search</p>
      <p className="preview" title={preview}>
        {preview}
      </p>

      <button type="button" className="primary" onClick={() => run('youtube', tabId)}>
        Search YouTube
      </button>
      <button type="button" className="secondary" onClick={() => run('chatgpt', tabId)}>
        Ask ChatGPT
      </button>
      <button type="button" className="secondary" onClick={onCopy}>
        {copied === 'idle' ? 'Copy prompt' : null}
        {copied === 'copied' ? 'Copied to clipboard' : null}
        {copied === 'failed' ? "Couldn't copy" : null}
      </button>

      {context.warnings.length > 0 && (
        <ul className="warnings">
          {context.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Recently visited problems (D024, spec.md section 5.1).
 *
 * Pausing is a separate act from clearing and from setting the limit to zero:
 * it stops recording without touching what is already there (domain.md R17).
 */
function History({
  entries,
  paused,
  onTogglePause,
  onForget,
}: {
  entries: HistoryEntry[];
  paused: boolean;
  onTogglePause: () => void;
  onForget: (problemKey: string) => void;
}) {
  return (
    <details className="history">
      <summary>Recent problems {entries.length > 0 ? `(${entries.length})` : ''}</summary>

      <label className="pause">
        <input type="checkbox" checked={paused} onChange={onTogglePause} />
        <span>Pause recording{paused ? ' — nothing new is being saved' : ''}</span>
      </label>

      {entries.length === 0 ? (
        <p className="muted">Nothing yet. Problems appear here as you use the extension on them.</p>
      ) : (
        <ul className="history-list">
          {entries.map((entry) => (
            <li key={entry.problemKey}>
              <a
                href={entry.url}
                onClick={(e) => {
                  e.preventDefault();
                  void chrome.tabs.create({ url: entry.url });
                  window.close();
                }}
              >
                <span className="history-platform">{PLATFORM_LABELS[entry.platform]}</span>
                <span className="history-title">
                  {entry.number ? `${entry.number}. ` : ''}
                  {entry.title}
                </span>
              </a>
              <button
                type="button"
                className="forget"
                aria-label={`Forget ${entry.title}`}
                title="Forget this one"
                onClick={() => onForget(entry.problemKey)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
