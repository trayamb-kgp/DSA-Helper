import { useEffect, useState } from 'react';
import type { Msg, ProblemContext } from '../core/types';

/**
 * Phase 2 verification readout.
 *
 * The phase-2 exit criteria are stated in terms of what the popup shows for a
 * practice, a contest and a Premium problem, so this renders exactly those
 * fields and nothing else. Phase 3 replaces it with the resolved-query preview
 * and the action buttons; phase 7 builds the popup proper.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'ready'; context: ProblemContext };

async function requestContext(): Promise<State> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return { kind: 'unsupported' };

  const request: Msg = { type: 'EXTRACT_CONTEXT' };
  // No content script on the page means no listener, which rejects. That is
  // an unsupported page, not an error worth showing.
  const reply = await chrome.tabs.sendMessage(tab.id, request).catch(() => null);

  if (reply && typeof reply === 'object' && (reply as Msg).type === 'CONTEXT_RESULT') {
    return { kind: 'ready', context: (reply as Extract<Msg, { type: 'CONTEXT_RESULT' }>).context };
  }
  return { kind: 'unsupported' };
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

  useEffect(() => {
    let live = true;
    void requestContext().then((next) => {
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

  const { context } = state;

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
