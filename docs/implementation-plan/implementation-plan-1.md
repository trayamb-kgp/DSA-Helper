# Implementation Plan 1 — DSA Helper v1

**Covers:** the whole of v1, phases 0–8 (spec.md §13 milestones M0–M8).
**Status:** not started.
**Last updated:** 2026-09-02

Source documents: [spec.md](../spec.md) · [architecture.md](../architecture.md) · [domain.md](../domain.md) · [decisions.md](../decisions.md)

---

## How to use this plan

Phases are sequential — each depends on the one before. Work one phase at a time and don't start the next until the current phase's **Exit criteria** are met.

Every phase carries four standing subheadings:

| Subheading | What goes in it |
|---|---|
| **Decisions** | Decisions made *while implementing this phase*. Anything significant is also copied into [decisions.md](../decisions.md) as a numbered entry — this section is the working scratch, that file is the permanent record. |
| **Q&A** | Questions put to the user during the phase, the options offered, and the answer chosen. Keeps the reasoning behind a choice recoverable later. |
| **Track** | Live resumption state — what's done, what's in progress, what's next, and anything a fresh session would need to pick up mid-task. **Cleared to `Phase complete.` once the phase is finished.** |
| **Additional Notes** | Anything else worth carrying forward: gotchas, discovered site behaviour, things deliberately deferred. |

**Resumption protocol.** If work stops mid-phase (context exhausted, session ended), the **Track** section alone must be enough to continue. Before stopping, record: the last file touched and its state, the exact next action, and any discovery not yet written into a document. Update Track as work proceeds, not retroactively.

**Standing rules for every phase**

- A significant decision → a numbered entry in [decisions.md](../decisions.md), in the same change.
- Terminology: **problem**, never *question* ([D023](../decisions.md)).
- Content scripts and the service worker ship **no React** ([D012](../decisions.md)).
- `core/` stays free of `document` and `chrome.*` so it tests in plain Node.
- No network requests, ever ([D010](../decisions.md)).

---

## Phase 0 — Scaffold

**Goal.** A loadable, empty extension. No features.

**Exit criteria.** `npm run build` succeeds; the `dist/` folder loads via `chrome://extensions` → Load unpacked; the toolbar icon opens an empty popup on a LeetCode problem page; `npm run typecheck` and `npm test` both pass with zero tests.

### Tasks

- [ ] `npm init`; install React, React DOM, TypeScript, Vite, `@crxjs/vite-plugin`, Vitest, jsdom, type packages
- [ ] `tsconfig.json` — strict mode on
- [ ] `vite.config.ts` with the CRXJS plugin; separate entry points so popup/options bundle React and content scripts do not
- [ ] `manifest.config.ts` — MV3, name "DSA Helper", version `0.1.0`, icons from `public/icons/`
- [ ] Manifest permissions exactly as [spec.md](../spec.md) §10 — no `<all_urls>`
- [ ] Manifest `commands`: `search-youtube` → `Alt+Shift+Y`, `ask-chatgpt` → `Alt+Shift+G`, `copy-prompt` unbound
- [ ] Content script match patterns for the four platforms and `chatgpt.com`
- [ ] Folder skeleton per [spec.md](../spec.md) §4.2 with placeholder files
- [ ] Minimal React popup ("DSA Helper" and nothing else) and an empty options page
- [ ] Service worker entry that registers listeners at top level and does nothing
- [ ] Scripts: `dev`, `build`, `test`, `typecheck`
- [ ] `.gitignore` — `node_modules`, `dist`

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- Verify the CRXJS plugin's current MV3 support before committing to it; if it fights the MAIN-world content script needed in Phase 2, a plain Vite multi-entry build with a hand-written manifest is the fallback.
- Keep the manifest generated from TypeScript so permissions stay reviewable in one typed place.

---

## Phase 1 — Core

**Goal.** Every pure function the rest of the project depends on, fully tested, with no browser involved.

**Exit criteria.** `npm test` green. Template rendering, markdown conversion, truncation ordering, history semantics and migrations all covered by unit tests. Nothing in `core/` imports `document` or `chrome.*`.

### Tasks

- [ ] `types.ts` — `Platform`, `ProblemContext`, `CodeSource`, `Settings`, `HistoryEntry`, `Msg` union ([spec.md](../spec.md) §4.1, §5)
- [ ] `storage.ts` — typed get/set per area; `promptTemplate` in its own key; size guard warning past ~7 KB; 500 ms write debounce
- [ ] `migrations.ts` — `schemaVersion`, ordered `v(n)→v(n+1)` chain, unknown future versions left untouched
- [ ] `templates.ts` — variable substitution; **empty variables collapse and double spaces squeeze**; `{number_suffix}`; `{language_slug}` map (`C++`→`cpp`, `Python3`→`python`, default empty); `DEFAULT_YOUTUBE_TEMPLATE`; `DEFAULT_PROMPT`
- [ ] `html2md.ts` — headings, lists, `<pre>`/`<code>`, tables, emphasis
- [ ] `html2md.ts` — **LaTeX passes through verbatim** ([D026](../decisions.md))
- [ ] `html2md.ts` — **figures become `[Figure: <alt> — not included]`**, never dropped ([D026](../decisions.md))
- [ ] `html2md.ts` — escape markdown fences in extracted content so a statement can't close our code block ([architecture.md](../architecture.md) §9.2)
- [ ] `truncate.ts` — statement first, then examples, **never code**; mark every cut point ([D022](../decisions.md))
- [ ] `history.ts` — `problemKey` = `<platform>:<identifier>`; one entry per problem; revisit bumps to top and updates `url` and `visitedAt`; respects `historyLimit` and `historyPaused` ([D024](../decisions.md))
- [ ] Missing-section notes: absent statement/examples/constraints render an explicit note, never emptiness ([spec.md](../spec.md) §8)
- [ ] Unit tests for all of the above, including every-variable-absent rendering

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- Write the `html2md` LaTeX and figure tests **first** — they encode [D026](../decisions.md), which is the decision most likely to be undone by accident during a refactor.
- Truncation tests should include the pathological case: code longer than the entire budget. The statement collapses to almost nothing; the code stays whole.

---

## Phase 2 — LeetCode adapter

**Goal.** One platform working end to end for extraction, including all four code-capture layers and the MAIN-world bridge.

**Exit criteria.** On a LeetCode practice problem, a contest problem, and a Premium problem, the popup shows correct title, number, difficulty, tags, and code with its provenance. Adapter unit tests pass against saved fixtures.

### Tasks

- [ ] `adapter.ts` — the `PlatformAdapter` interface ([spec.md](../spec.md) §6.2)
- [ ] `resolveAdapter(url)` — pure URL→adapter function, unit-tested over many real URLs
- [ ] URL matching for `/problems/<slug>/*` and `/contest/<c>/problems/<slug>/*`, tolerant of `/description/`, `/submissions/` and query suffixes ([D024](../decisions.md))
- [ ] Stable `problemKey` derivation
- [ ] Metadata: embedded question JSON first, DOM fallback second ([spec.md](../spec.md) §6.3)
- [ ] **Per-field guards** — one field failing never fails the adapter ([D015](../decisions.md))
- [ ] Single `SELECTORS` object with a verified-on date and ordered fallbacks per selector
- [ ] Statement HTML → `html2md`; split examples and constraints where separable
- [ ] **Premium/locked detection** as its own condition, not a capture gap ([D027](../decisions.md))
- [ ] Code layer 1 — probe `localStorage` by slug/frontend id, most recent plausible value; never a hard-coded key
- [ ] MAIN-world bridge — read-only, per-load nonce, origin + `event.source` check, 256 KB cap, 1500 ms timeout ([D020](../decisions.md))
- [ ] Code layer 2 — Monaco model read through the bridge, plus language id
- [ ] Code layer 3 — DOM scrape, always flagged *possibly incomplete*
- [ ] Code layer 4 — user text selection
- [ ] **Language selection: the buffer currently open in the editor wins** ([D025](../decisions.md))
- [ ] Provenance recorded and surfaced
- [ ] Capture fixtures: practice, contest, Premium — trimmed, account markup scrubbed
- [ ] Retry backoff 100/300/700/1500 ms for un-hydrated pages

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- The `localStorage` key shape is an open item ([todo.md](../todo.md) #6). Discover it here, document it in the adapter, and keep the probing approach regardless of what's found — the key name is version-dependent.
- Premium detection needs a marker that isn't merely "statement missing", or it can't be distinguished from a broken selector — which is the entire point of [D027](../decisions.md).
- Fixtures captured here set the pattern for Phase 6. Get the trimming and scrubbing conventions right once.

---

## Phase 3 — YouTube action

**Goal.** The first complete user-facing action, working identically from all three trigger surfaces.

**Exit criteria.** `Alt+Shift+Y`, the popup button, and the context-menu item all open the correct YouTube search from a LeetCode problem. Firing on an unsupported page shows a toast rather than doing nothing. Adapter failure degrades to page title, then to the URL.

### Tasks

- [ ] `background/actions.ts` — single `runAction(actionId, tab)` path for every surface ([D013](../decisions.md))
- [ ] Debounce per `(tabId, actionId)` at 750 ms ([D017](../decisions.md))
- [ ] `commands.ts` — keyboard shortcuts
- [ ] `contextMenus.ts` — parent + three children, `documentUrlPatterns` limited to the four platforms
- [ ] Content script: supported-page detection, SPA re-detection via history-API patching plus a **`<title>`-scoped** observer — never a `body` subtree observer ([architecture.md](../architecture.md) §7)
- [ ] Toolbar badge driven by that detection
- [ ] `toast.ts` — shadow DOM, `textContent` only, 4 s auto-dismiss
- [ ] YouTube URL construction with correct encoding
- [ ] `openInNewTab` / `focusNewTab` honoured
- [ ] Degradation ladder: full context → title + number → `document.title` → URL slug ([D016](../decisions.md))
- [ ] Popup: read-only resolved-query preview ([D006](../decisions.md))
- [ ] Unsupported-page toast

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- This phase proves the message contract end to end. If the service worker is being killed mid-action, it will surface here first — check that no state is held in module scope.
- Confirm `Alt+Shift+Y/G` don't collide with LeetCode's own editor shortcuts on a real page before locking the defaults in.

---

## Phase 4 — Prompt builder and clipboard action

**Goal.** A complete, well-formed review request, obtainable without ChatGPT being involved at all.

**Exit criteria.** The copy-prompt action yields a prompt containing problem, examples, constraints, code and instructions — correct on a full capture, and correct on a capture with gaps, where absences are stated explicitly rather than rendered blank.

### Tasks

- [ ] Compose prompt from `ProblemContext` + template
- [ ] Apply truncation in the correct order, with cut markers ([D022](../decisions.md))
- [ ] Fence extracted content and label it as quoted problem material, not instructions ([architecture.md](../architecture.md) §9.2)
- [ ] Missing sections → explicit notes ([spec.md](../spec.md) §8)
- [ ] Locked problems → link-only prompt with the locked state stated ([D027](../decisions.md))
- [ ] No code captured → paste placeholder, not an empty fence
- [ ] `includeCode: false` honoured
- [ ] Clipboard write in the content script; hidden-textarea + `execCommand` fallback; confirmation toast
- [ ] Copy-prompt wired to popup and context menu

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- Build this **before** Phase 5 deliberately: it's the fallback the ChatGPT flow depends on, so it must already work before anything can degrade into it.
- Read a few generated prompts end to end and paste one into ChatGPT by hand. Prompt quality is the actual product; it's worth judging with eyes, not just tests.

---

## Phase 5 — ChatGPT injection

**Goal.** The flagship action. The most fragile code in the project ([D003](../decisions.md)).

**Exit criteria.** From a LeetCode problem, the action opens ChatGPT with the prompt in the composer, **unsent**, with the review banner shown. Forcing the composer selector to fail falls back to the clipboard with an explanatory toast, losing nothing.

### Tasks

- [ ] `pendingPrompt.ts` — session storage keyed by the created tab id; one-shot delete on claim; 5-minute expiry; sweep on `tabs.onRemoved` ([D017](../decisions.md))
- [ ] Prompt never written to `local` or `sync` ([D018](../decisions.md))
- [ ] ChatGPT content script claims via the service worker — never reads session storage directly
- [ ] Composer wait: `MutationObserver`, 10 s timeout
- [ ] Insertion attempt 1: focus, select all, `execCommand('insertText')`
- [ ] Insertion attempt 2: synthetic paste `ClipboardEvent`
- [ ] Insertion attempt 3: DOM mutation + dispatched `input`
- [ ] **Read-back verification** after insertion
- [ ] Failure → clipboard fallback + "press Ctrl+V" toast
- [ ] Review banner: "Prompt inserted by DSA Helper — review it, then press Enter"
- [ ] **Never submit.** No Enter dispatch, no submit-button click, anywhere in this file ([D003](../decisions.md))
- [ ] `autoInjectChatGpt: false` → clipboard-only flow
- [ ] Manually test the failure path by breaking the selector on purpose

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- Everything ChatGPT-specific — selector, timeout, insertion strategies — stays in this one module, so a redesign is a single-file fix ([architecture.md](../architecture.md) §7.2).
- Record the date the composer selector was verified, in the file.
- The "never submit" rule is a security control, not a preference. Any future convenience request to auto-send needs a decision entry that reckons with that ([D003](../decisions.md)).

---

## Phase 6 — Remaining adapters

**Goal.** Codeforces, CodeChef and GeeksforGeeks, following the pattern Phase 2 established.

**Exit criteria.** Each platform verified on one practice and one contest URL (GfG: practice only). Fixtures committed for each. No adapter imports from another.

### Tasks

- [ ] **Codeforces** — problemset, contest and gym URL patterns; `problemKey` = contestId + index
- [ ] **Codeforces** — `.problem-statement` root; title, limits, `.sample-tests`, sidebar tags, rating from the `*NNNN` tag
- [ ] **Codeforces** — LaTeX preserved verbatim; verify against a maths-heavy problem ([D026](../decisions.md))
- [ ] **Codeforces** — expect `codeSource: 'none'` on problem pages; confirm this reads as normal, not as an error ([D014](../decisions.md))
- [ ] **Codeforces** — submit-page code capture where the editor exists
- [ ] **CodeChef** — practice + contest patterns; problem code from the URL; embedded JSON first, `#problem-statement` fallback; editor capture
- [ ] **GeeksforGeeks** — both hosts; slug as identifier since there is no number ([D024](../decisions.md))
- [ ] **GeeksforGeeks** — hashed CSS-module classes matched **by prefix only**, never exact ([architecture.md](../architecture.md) §6.3)
- [ ] Fixtures for each platform and page kind
- [ ] Verify figure placeholders on a diagram-heavy problem
- [ ] Verify a Russian-language Codeforces statement passes through untouched ([D026](../decisions.md))

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- Codeforces is the reassuring one: server-rendered and stable. CodeChef and GfG are SPAs and will be the fragile pair.
- If a platform's structure resists the `PlatformAdapter` interface, change the interface deliberately and record why — don't special-case inside one adapter.

---

## Phase 7 — Options page and history

**Goal.** Everything the user owns becomes editable, plus the self-service support surface.

**Exit criteria.** Templates editable, resettable, copyable, and persisted. History populates with correct de-duplication and bump ordering, and the pause toggle works. The diagnostics panel reports field-by-field results for the current page.

### Tasks

- [ ] Options shell with sections per [spec.md](../spec.md) §9.4
- [ ] Template editors with reset-to-default and **live preview** against the last-seen problem, or a bundled sample
- [ ] **Copy-to-clipboard button per template** ([D029](../decisions.md))
- [ ] Character counter and size warning approaching the sync per-item limit ([D018](../decisions.md))
- [ ] Behaviour toggles: new tab, focus, include code, auto-inject, max prompt chars
- [ ] History section: limit, clear, and the plain statement that uninstalling erases everything ([D029](../decisions.md))
- [ ] **Pause history** toggle in the popup ([D029](../decisions.md), [domain.md](../domain.md) R17)
- [ ] Popup history list, each entry re-triggerable
- [ ] Theme: system / light / dark
- [ ] Diagnostics panel — which selector matched, which fallback, what failed ([architecture.md](../architecture.md) §10.4)
- [ ] "Report a broken page" — redacted blob, **never statement text, never code**; clipboard + prefilled issue
- [ ] Link out to `chrome://extensions/shortcuts`

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- The diagnostics panel is what makes support scale without telemetry ([D031](../decisions.md)). It's tempting to cut under time pressure; it shouldn't be.
- Test history de-duplication with both Codeforces URL forms for the same problem — that's the case [D024](../decisions.md) exists for.

---

## Phase 8 — Polish and release preparation

**Goal.** Shippable.

**Exit criteria.** The manual smoke matrix passes in full. Store assets and documentation complete. All publishing blockers in [todo.md](../todo.md) closed.

### Tasks

- [ ] Full smoke matrix: 4 platforms × 2 page kinds × 3 trigger surfaces × 3 actions ([architecture.md](../architecture.md) §12)
- [ ] `TESTING.md` — that matrix as a repeatable checklist
- [ ] `CHANGELOG.md`
- [ ] Review every user-facing string: warnings, toasts, banners, empty states
- [ ] Theme correctness in both light and dark
- [ ] Performance check against the budgets in [architecture.md](../architecture.md) §7 — especially content-script load cost
- [ ] Bundle size check; confirm **no React in content scripts or the service worker** ([D012](../decisions.md))
- [x] README: add `decisions.md` and `todo.md` to the documentation table ([todo.md](../todo.md) #7) — done 2026-09-02
- [ ] **Privacy policy contact address** ([todo.md](../todo.md) #1) — blocks publishing
- [ ] **Privacy policy effective date** ([todo.md](../todo.md) #2)
- [ ] **Licence + `LICENSE` file** ([todo.md](../todo.md) #3) — blocks the repo going public
- [ ] Store listing copy, screenshots, per-permission justifications ([architecture.md](../architecture.md) §9.3)
- [ ] Host the privacy policy at a public URL
- [ ] Confirm staged percentage rollout is configured for the first release ([D030](../decisions.md))

### Decisions

_None yet._

### Q&A

_None yet._

### Track

Not started.

### Additional Notes

- Do not skip staged rollout on the first release. It's the only defence against a global simultaneous breakage ([D030](../decisions.md)).
- The README's Known Limitations section must still be accurate at this point — verify each claim against the built extension rather than against the spec.

---

## Cross-phase checklist

Confirm before declaring v1 done:

- [ ] No network requests anywhere in the codebase ([D010](../decisions.md))
- [ ] "Question" appears nowhere as a term for a problem ([D023](../decisions.md))
- [ ] Every extracted field is individually guarded ([D015](../decisions.md))
- [ ] No user action can end in silence ([D016](../decisions.md))
- [ ] The user's code is never truncated, never written to disk, never auto-sent ([D018](../decisions.md), [D022](../decisions.md), [D003](../decisions.md))
- [ ] Every capture gap is disclosed in both the prompt and the popup
- [ ] [decisions.md](../decisions.md) reflects every significant decision made during implementation
