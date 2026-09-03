import { useEffect, useState } from 'react';
import type { ActionId, Msg, ProblemContext, Settings } from '../core/types';
import { getSettings } from '../core/storage';
import { buildQuery, varsFromContext } from '../core/youtube';
import { copyInPage } from '../content/platform/clipboard';

/**
 * The popup, as far as phase 3 takes it.
 *
 * Two jobs: the extraction readout that makes phase 2 checkable by eye, and
 * the read-only YouTube query preview with the button beside it -- the user
 * sees what will be searched before committing to it, and edits the template
 * in settings rather than the query here (D006).
 *
 * Phase 7 builds the popup proper: history, the pause toggle, the other two
 * action buttons.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'ready'; context: ProblemContext; settings: Settings; tabId: number };

async function load(): Promise<State> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return { kind: 'unsupported' };

  const request: Msg = { type: 'EXTRACT_CONTEXT' };
  // No content script on the page means no listener, which rejects. That is
  // an unsupported page, not an error worth showing.
  const [reply, settings] = await Promise.all([
    chrome.tabs.sendMessage(tab.id, request).catch(() => null),
    getSettings(),
  ]);

  if (reply && typeof reply === 'object' && (reply as Msg).type === 'CONTEXT_RESULT') {
    return {
      kind: 'ready',
      context: (reply as Extract<Msg, { type: 'CONTEXT_RESULT' }>).context,
      settings,
      tabId: tab.id,
    };
  }
  return { kind: 'unsupported' };
}

/**
 * Dispatch through the service worker rather than acting here, so the popup
 * button takes exactly the path the shortcut and the menu take (D013).
 */
function run(action: ActionId, tabId: number): void {
  const message: Msg = { type: 'RUN_ACTION', action, tabId };
  void chrome.runtime.sendMessage(message).catch(() => undefined);
  window.close();
}

/**
 * Copy is the one action the popup finishes itself.
 *
 * The worker still builds the prompt -- one builder, one result -- but the
 * write has to happen here: while the popup is open the page is not the
 * focused document, and `writeText` refuses there (D040). The popup holds the
 * click's user gesture, so it is the surface that can.
 */
async function copyPrompt(tabId: number): Promise<'copied' | 'failed'> {
  const message: Msg = { type: 'RUN_ACTION', action: 'copyPrompt', tabId };
  const reply: unknown = await chrome.runtime.sendMessage(message).catch(() => null);

  if (
    typeof reply !== 'object' ||
    reply === null ||
    (reply as Msg).type !== 'PROMPT_RESULT'
  ) {
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
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    let live = true;
    void load().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <main className="popup">
        <h1>DSA Helper</h1>
        <p className="muted">Reading the page…</p>
      </main>
    );
  }

  if (state.kind === 'unsupported') {
    return (
      <main className="popup">
        <h1>DSA Helper</h1>
        <p className="muted">
          Not a supported problem page. LeetCode works today; Codeforces, CodeChef and
          GeeksforGeeks arrive in a later phase.
        </p>
      </main>
    );
  }

  const { context, settings, tabId } = state;
  // The same function the action uses, so the preview cannot promise
  // something the button does not do (D006).
  const preview = buildQuery(
    settings.youtubeTemplate,
    varsFromContext(context),
    context.url,
  ).query;

  return (
    <main className="popup">
      <h1>{context.platformLabel}</h1>
      <p className="title">
        {context.number ? `${context.number}. ` : ''}
        {context.title}
      </p>

      <Row label="Difficulty" value={context.difficulty ?? '—'} />
      <Row label="Tags" value={context.tags.length > 0 ? context.tags.join(', ') : '—'} />
      <Row label="Kind" value={context.isContest ? 'Contest' : 'Practice'} />
      <Row label="Code" value={describeCode(context)} />
      <Row
        label="Statement"
        value={context.statementMd ? `${context.statementMd.length} chars` : '—'}
      />
      <Row
        label="Examples"
        value={context.examplesMd ? `${context.examplesMd.length} chars` : '—'}
      />
      <Row
        label="Constraints"
        value={context.constraintsMd ? `${context.constraintsMd.length} chars` : '—'}
      />

      {/* A named condition, not a failure (D027). */}
      {context.isLocked && (
        <p className="locked">Premium problem — statement not available to you</p>
      )}

      <p className="preview-label">YouTube search</p>
      <p className="preview" title={preview}>
        {preview}
      </p>
      <button type="button" className="primary" onClick={() => run('youtube', tabId)}>
        Search YouTube
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          void copyPrompt(tabId).then(setCopied);
        }}
      >
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
    </main>
  );
}
