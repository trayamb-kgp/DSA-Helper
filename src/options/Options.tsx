/**
 * The options page (spec.md section 9.4).
 *
 * Everything the user owns is editable here, plus the support surface that
 * replaces telemetry (D031). Sections in spec order: Templates, Behaviour,
 * History, Appearance, Diagnostics, Shortcuts, About.
 *
 * Settings are written through `core/storage`, which debounces at 500 ms and
 * splits `promptTemplate` onto its own sync key — a long template can approach
 * the 8 KB per-item limit on its own (D018), which is why the editors below
 * carry a size warning.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HistoryEntry, ProblemContext, Settings } from '../core/types';
import { PLATFORM_LABELS } from '../core/types';
import {
  SYNC_ITEM_LIMIT_BYTES,
  checkItemSize,
  clearLastExtraction,
  flushWrites,
  getHistory,
  getLastExtraction,
  getSettings,
  setHistory,
  setSettings,
  type LastExtraction,
} from '../core/storage';
import { DEFAULT_PROMPT, DEFAULT_YOUTUBE_TEMPLATE } from '../core/templates';
import { applyLimit } from '../core/history';
import { buildPrompt } from '../core/prompt';
import { buildQuery, varsFromContext } from '../core/youtube';
import { buildReport, fieldReports } from '../core/diagnostics';
import { applyTheme, THEMES, type Theme } from '../core/theme';
import { CONTACT_EMAIL, gmailComposeUrl, issueUrl, privacyUrl } from '../core/links';
import { copyInPage } from '../content/platform/clipboard';

const EXTENSION_VERSION = chrome.runtime.getManifest().version;

/**
 * ISSUE_URL resolves as soon as CONTACT_EMAIL is set (it routes to email now,
 * D031 revised); PRIVACY_URL stays null until SITE_URL is filled in
 * (core/links.ts). Every use below renders nothing rather than a dead link —
 * the report is still built and still copyable, which is the part that matters.
 */
const ISSUE_URL = issueUrl();
const GMAIL_URL = gmailComposeUrl();
const PRIVACY_URL = privacyUrl();

/** A bundled problem to preview templates against before anything is captured. */
const SAMPLE: ProblemContext = {
  platform: 'leetcode',
  platformLabel: 'LeetCode',
  url: 'https://leetcode.com/problems/sort-an-array/',
  slug: 'sort-an-array',
  number: '912',
  title: 'Sort an Array',
  difficulty: 'Medium',
  tags: ['Array', 'Divide and Conquer', 'Sorting'],
  statementMd: 'Given an array of integers `nums`, sort it in ascending order.',
  examplesMd: '**Example 1:**\n\n```\nInput: nums = [5,2,3,1]\nOutput: [1,2,3,5]\n```',
  constraintsMd: '- `1 <= nums.length <= 5 * 10^4`',
  language: 'Python3',
  code: 'class Solution:\n    def sortArray(self, nums):\n        return sorted(nums)',
  codeSource: 'editorApi',
  isContest: false,
  isLocked: false,
  extractedAt: 0,
  warnings: [],
};

// --- small pieces -----------------------------------------------------------

function Section({
  title,
  children,
  note,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {note ? <p className="muted">{note}</p> : null}
      {children}
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint ? <em className="hint">{hint}</em> : null}
      </span>
    </label>
  );
}

/** Copy button that says what it did, then goes quiet again. */
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  return (
    <button
      type="button"
      className="ghost"
      onClick={() => {
        void copyInPage(text).then((ok) => {
          setState(ok ? 'done' : 'failed');
          setTimeout(() => setState('idle'), 2000);
        });
      }}
    >
      {state === 'idle' ? label : state === 'done' ? 'Copied' : "Couldn't copy"}
    </button>
  );
}

/**
 * A template editor with its reset, its copy button and its size warning.
 *
 * The size warning is not decoration: `chrome.storage.sync` refuses a write
 * past 8 KB per item, and a user who has just lost a long template to a silent
 * failure has lost real work (D018, D029).
 */
function TemplateEditor({
  id,
  label,
  hint,
  value,
  fallback,
  storageKey,
  rows,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  fallback: string;
  storageKey: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  const size = checkItemSize(storageKey, value);

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <div className="field-actions">
          <CopyButton text={value} />
          <button type="button" className="ghost" onClick={() => onChange(fallback)}>
            Reset to default
          </button>
        </div>
      </div>
      <p className="muted">{hint}</p>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      <p className={size.level === 'ok' ? 'counter' : `counter ${size.level}`}>
        {value.length} characters · {size.bytes} of {SYNC_ITEM_LIMIT_BYTES} bytes
        {size.level === 'warn' ? ' — approaching the sync limit' : ''}
        {size.level === 'over' ? " — too large to sync; this won't save" : ''}
      </p>
    </div>
  );
}

// --- the page ---------------------------------------------------------------

export function Options() {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [history, setHistoryState] = useState<HistoryEntry[]>([]);
  const [last, setLast] = useState<LastExtraction | null>(null);

  useEffect(() => {
    void Promise.all([getSettings(), getHistory(), getLastExtraction()]).then(
      ([loaded, entries, extraction]) => {
        setLocal(loaded);
        setHistoryState(entries);
        setLast(extraction);
        applyTheme(document.documentElement, loaded.theme);
      },
    );
  }, []);

  /** Every edit writes through immediately; the storage layer debounces. */
  const update = useCallback((patch: Partial<Settings>) => {
    setLocal((current) => (current ? { ...current, ...patch } : current));
    void setSettings(patch);
    if (patch.theme) applyTheme(document.documentElement, patch.theme);
  }, []);

  const previewContext = last?.context ?? SAMPLE;

  const youtubePreview = useMemo(
    () =>
      settings
        ? buildQuery(settings.youtubeTemplate, varsFromContext(previewContext), previewContext.url)
            .query
        : '',
    [settings, previewContext],
  );

  const promptPreview = useMemo(
    () => (settings ? buildPrompt(previewContext, settings).prompt : ''),
    [settings, previewContext],
  );

  const report = useMemo(
    () =>
      buildReport({
        context: last?.context ?? null,
        diagnostics: last?.diagnostics ?? [],
        extensionVersion: EXTENSION_VERSION,
        userAgent: navigator.userAgent,
        at: last?.at ?? null,
      }),
    [last],
  );

  if (!settings) {
    return (
      <main className="options">
        <h1>DSA Helper</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="options">
      <h1>DSA Helper — Settings</h1>

      <Section
        title="Templates"
        note="Both texts are yours to edit. The preview below each one renders against the last problem you used the extension on, or a bundled sample before that."
      >
        <TemplateEditor
          id="yt"
          label="YouTube search"
          hint="Variables: {platform} {number} {title} {slug} {difficulty} {url} {language}. An empty variable collapses away."
          value={settings.youtubeTemplate}
          fallback={DEFAULT_YOUTUBE_TEMPLATE}
          storageKey="settings"
          rows={2}
          onChange={(youtubeTemplate) => update({ youtubeTemplate })}
        />
        <p className="preview-label">Preview</p>
        <p className="preview">{youtubePreview}</p>

        <TemplateEditor
          id="prompt"
          label="ChatGPT prompt"
          hint="Variables: {platform} {title} {number} {number_suffix} {difficulty} {tags} {url} {statement} {examples} {constraints} {language} {language_slug} {code}."
          value={settings.promptTemplate}
          fallback={DEFAULT_PROMPT}
          storageKey="promptTemplate"
          rows={16}
          onChange={(promptTemplate) => update({ promptTemplate })}
        />
        <details>
          <summary>Preview the rendered prompt</summary>
          <pre className="preview-block">{promptPreview}</pre>
        </details>
      </Section>

      <Section title="Behaviour">
        <Toggle
          label="Open results in a new tab"
          hint="YouTube only — Ask ChatGPT always opens a new tab, so the problem page you are on is not closed underneath you."
          checked={settings.openInNewTab}
          onChange={(openInNewTab) => update({ openInNewTab })}
        />
        <Toggle
          label="Switch to the new tab"
          checked={settings.focusNewTab}
          onChange={(focusNewTab) => update({ focusNewTab })}
        />
        <Toggle
          label="Include my code in the prompt"
          checked={settings.includeCode}
          onChange={(includeCode) => update({ includeCode })}
        />
        <Toggle
          label="Type the prompt into ChatGPT automatically"
          hint="Off: Ask ChatGPT copies the prompt to your clipboard and opens no tab, instead of opening ChatGPT with the prompt typed in."
          checked={settings.autoInjectChatGpt}
          onChange={(autoInjectChatGpt) => update({ autoInjectChatGpt })}
        />
        {settings.autoInjectChatGpt && (
          <Toggle
            label="Send the prompt automatically"
            hint="Off by default. On: once the prompt is confirmed typed into ChatGPT, it is sent for you. The prompt is built from a problem page the extension doesn't control, so reading it before it's sent is a safeguard against prompt injection — leave this off if you're unsure. Nothing is ever sent if the prompt can't be typed in."
            checked={settings.autoSubmitChatGpt}
            onChange={(autoSubmitChatGpt) => update({ autoSubmitChatGpt })}
          />
        )}
        {settings.autoInjectChatGpt && (
          <Toggle
            label="Show the review reminder on ChatGPT"
            hint="On by default. Shows a small “review it, then press Enter” banner after the prompt is typed into ChatGPT. Turn it off and the message box just fills silently. Has no effect when the prompt is sent automatically."
            checked={settings.showChatGptBanner}
            onChange={(showChatGptBanner) => update({ showChatGptBanner })}
          />
        )}
        <div className="field">
          <label htmlFor="cap">Maximum prompt size</label>
          <p className="muted">
            Longer prompts are shortened by trimming the statement first, then the examples. Your
            code is never cut — the prompt goes over this cap instead.
          </p>
          <input
            id="cap"
            type="number"
            min={1000}
            max={100000}
            step={1000}
            value={settings.maxPromptChars}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(value) && value > 0) update({ maxPromptChars: value });
            }}
          />
        </div>
      </Section>

      <Section
        title="History"
        note="Recently visited problems, kept on this computer only. One entry per problem: returning to one moves it back to the top rather than adding a duplicate."
      >
        <div className="field">
          <label htmlFor="limit">How many to keep</label>
          <input
            id="limit"
            type="number"
            min={0}
            max={200}
            value={settings.historyLimit}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(value) || value < 0) return;
              update({ historyLimit: value });
              // Lowering the limit applies immediately rather than waiting for
              // the next visit to trim the list.
              const trimmed = applyLimit(history, value);
              setHistoryState(trimmed);
              setHistory(trimmed);
            }}
          />
        </div>
        <p className="muted">
          {history.length === 0
            ? 'Nothing recorded yet.'
            : `${history.length} problem${history.length === 1 ? '' : 's'} recorded.`}
        </p>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setHistoryState([]);
            setHistory([]);
            void clearLastExtraction().then(() => setLast(null));
            void flushWrites();
          }}
        >
          Clear history
        </button>
        <p className="muted warn-note">
          <strong>Removing the extension erases everything it stores</strong> — these settings, your
          templates and this history. Nothing is kept anywhere else. Use the copy buttons above to
          keep a copy of a template you have put work into.
        </p>
      </Section>

      <Section title="Appearance">
        <div className="field">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={settings.theme}
            onChange={(e) => update({ theme: e.target.value as Theme })}
          >
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme === 'system' ? 'Match my system' : theme === 'light' ? 'Light' : 'Dark'}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section
        title="Diagnostics"
        note="What the extension managed to read the last time you used it. This is here so a page that looks broken can be diagnosed without anything being sent anywhere — the extension collects no analytics."
      >
        {!last ? (
          <p className="muted">
            Nothing yet. Use the extension on a problem page, then come back here.
          </p>
        ) : (
          <>
            <p className="muted">
              {PLATFORM_LABELS[last.context.platform]} · {last.context.slug || '(no identifier)'} ·{' '}
              {new Date(last.at).toLocaleString()}
            </p>
            <table className="diag">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {fieldReports(last.context).map((row) => (
                  <tr key={row.field} className={row.status}>
                    <td>{row.field}</td>
                    <td>{row.status === 'ok' ? 'ok' : row.status === 'expected' ? 'absent' : 'missing'}</td>
                    <td>{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {last.diagnostics.length > 0 && (
              <ul className="muted">
                {last.diagnostics.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="field-actions">
          <CopyButton text={report} label="Copy a broken-page report" />
          {ISSUE_URL ? (
            <a className="ghost" href={ISSUE_URL}>
              Email the report
            </a>
          ) : null}
          {/* Always-opens fallback: a mailto does nothing when no OS mail
              handler is registered, so offer an in-browser Gmail compose too
              (D057). New tab, so the options page isn't navigated away. */}
          {GMAIL_URL ? (
            <a className="ghost" href={GMAIL_URL} target="_blank" rel="noreferrer">
              Open in Gmail
            </a>
          ) : null}
        </div>
        <p className="muted">
          Copy the report, then use <em>Email the report</em> for your own mail app or{' '}
          <em>Open in Gmail</em> if that opens nothing, and paste it in. The report holds the
          page's URL shape, the extension and Chrome versions, and which fields were read. It
          contains <strong>no problem text and none of your code</strong> — paste it as-is.
        </p>
      </Section>

      <Section title="Shortcuts">
        <table className="shortcuts">
          <tbody>
            <tr>
              <td>Search YouTube</td>
              <td>
                <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd>
              </td>
            </tr>
            <tr>
              <td>Ask ChatGPT</td>
              <td>
                <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>G</kbd>
              </td>
            </tr>
            <tr>
              <td>Copy prompt</td>
              <td className="muted">not bound</td>
            </tr>
          </tbody>
        </table>
        <p className="muted">
          <code>Copy prompt</code> ships unbound on purpose — there is no third combination that
          is safe to claim on every keyboard layout, so the choice is yours. Set it, or change the
          other two, at <code>chrome://extensions/shortcuts</code>. Chrome does not let an
          extension open that page for you, so copy the address and paste it into the address bar.
        </p>
        <CopyButton text="chrome://extensions/shortcuts" label="Copy that address" />
      </Section>

      <Section title="About">
        <p className="muted">
          DSA Helper {EXTENSION_VERSION}. Everything happens in your browser: the extension makes no
          network requests of its own, has no accounts and no backend, and nothing you do with it
          leaves your machine except the tabs it opens for you.
        </p>
        <p className="muted">
          Settings and templates sync between Chrome installs you are signed in to. History stays on
          this computer.
        </p>
        {(PRIVACY_URL || CONTACT_EMAIL) && (
          <p className="muted">
            {PRIVACY_URL && (
              <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
                Privacy policy
              </a>
            )}
            {PRIVACY_URL && CONTACT_EMAIL ? ' · ' : null}
            {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
          </p>
        )}
      </Section>
    </main>
  );
}
