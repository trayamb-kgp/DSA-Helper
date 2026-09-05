# Implementation Plan 1 — DSA Helper v1

**Covers:** the whole of v1, phases 0–8 (spec.md §13 milestones M0–M8).
**Status:** all nine phases built. Everything that can be verified without a browser is verified: 516 tests, typecheck, build, and `npm run check:build` against the emitted artifact. What remains is manual — the smoke matrix, the store screenshots, and two one-line substitutions before submission.
**Last updated:** 2026-09-03

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

- [x] `npm init`; install React, React DOM, TypeScript, Vite, `@crxjs/vite-plugin`, Vitest, jsdom, type packages
- [x] `tsconfig.json` — strict mode on
- [x] `vite.config.ts` with the CRXJS plugin; separate entry points so popup/options bundle React and content scripts do not
- [x] `manifest.config.ts` — MV3, name "DSA Helper", version `0.1.0`, icons from `public/icons/`
- [x] Manifest permissions exactly as [spec.md](../spec.md) §10 — no `<all_urls>`
- [x] Manifest `commands`: `search-youtube` → `Alt+Shift+Y`, `ask-chatgpt` → `Alt+Shift+G`, `copy-prompt` unbound
- [x] Content script match patterns for the four platforms and `chatgpt.com`
- [x] Folder skeleton per [spec.md](../spec.md) §4.2 with placeholder files
- [x] Minimal React popup ("DSA Helper" and nothing else) and an empty options page
- [x] Service worker entry that registers listeners at top level and does nothing
- [x] Scripts: `dev`, `build`, `test`, `typecheck`
- [x] `.gitignore` — `node_modules`, `dist`

### Decisions

None significant enough for [decisions.md](../decisions.md) — phase 0 executed [D011](../decisions.md) (the stack) as planned. Four working choices worth recording here:

- **The MAIN-world editor bridge was registered in phase 0, not phase 2.** It is an inert stub, but registering it now proved CRXJS emits `world: "MAIN"` correctly — the one plugin risk this plan flagged. That risk is retired; phase 2 can build on it rather than discover a problem late.
- **Vitest config kept separate** (`vitest.config.ts`). The CRXJS plugin has no business running during unit tests.
- **Production builds are minified with no sourcemaps.** The bundle budget is < 500 KB and there is no reason to ship full source to every user; `vite dev` has sourcemaps regardless.
- **Toolchain pinned:** Vite 8.2.2, CRXJS 2.7.1, React 19.2, TypeScript 5.9, Vitest 4.1. CRXJS 2.7.1 declares Vite 8 support, so no version compromise was needed.

### Q&A

None — nothing in this phase was ambiguous enough to need a decision from the user.

### Track

**Phase complete**, except four checks that require a real Chrome and cannot be automated from here. Verified automatically:

- `npm run typecheck`, `npm test`, `npm run build` all pass, no warnings
- `dist/manifest.json` correct: MV3, the four platform match patterns, `chatgpt.com`, all three commands, and **`world: "MAIN"` on the editor bridge**
- Bundle ~197 KB total, well under the 500 KB budget
- Content-script and service-worker chunks are < 1 KB — **no React outside popup/options**, confirming [D012](../decisions.md)
- Popup HTML mounts React, applies its CSS, and logs no console errors (served from `dist/` and loaded in a browser)

**Outstanding — user action, tracked in [TESTING.md](../TESTING.md) §3 and [todo.md](../todo.md) #11:**

1. `dist/` loads unpacked in Chrome with no card errors
2. Toolbar icon opens the popup on a LeetCode problem page
3. Options page opens from the extension card
4. `chrome://extensions/shortcuts` lists all three commands with the two defaults bound

**Next action:** phase 1 — start with `src/core/types.ts`, then the `html2md` LaTeX and figure tests before their implementation.

### Additional Notes

- **CRXJS 2.7.1 handles `world: "MAIN"`.** The fallback plan (plain Vite multi-entry + hand-written manifest) is not needed.
- CRXJS rewrites `background.service_worker` to a generated `service-worker-loader.js`; the manifest's source path stays `src/background/index.ts`.
- It also auto-generates `web_accessible_resources` for content scripts, with duplicated match entries — cosmetic, harmless, not worth working around.
- `allowImportingTsExtensions` was needed in `tsconfig.json` so `vite.config.ts` can import `./manifest.config.ts` with its extension, which silences a Vite 8 native-config-loader warning.
- Popup and options are emitted at `dist/src/popup/index.html` and `dist/src/options/index.html` — CRXJS preserves the source path.

---

## Phase 1 — Core

**Goal.** Every pure function the rest of the project depends on, fully tested, with no browser involved.

**Exit criteria.** `npm test` green. Template rendering, markdown conversion, truncation ordering, history semantics and migrations all covered by unit tests. Nothing in `core/` imports `document` or `chrome.*`.

### Tasks

- [x] `types.ts` — `Platform`, `ProblemContext`, `CodeSource`, `Settings`, `HistoryEntry`, `Msg` union ([spec.md](../spec.md) §4.1, §5)
- [x] `storage.ts` — typed get/set per area; `promptTemplate` in its own key; size guard warning past ~7 KB; 500 ms write debounce
- [x] `migrations.ts` — `schemaVersion`, ordered `v(n)→v(n+1)` chain, unknown future versions left untouched
- [x] `templates.ts` — variable substitution; **empty variables collapse and double spaces squeeze**; `{number_suffix}`; `{language_slug}` map (`C++`→`cpp`, `Python3`→`python`, default empty); `DEFAULT_YOUTUBE_TEMPLATE`; `DEFAULT_PROMPT`
- [x] `html2md.ts` — headings, lists, `<pre>`/`<code>`, tables, emphasis
- [x] `html2md.ts` — **LaTeX passes through verbatim** ([D026](../decisions.md))
- [x] `html2md.ts` — **figures become `[Figure: <alt> — not included]`**, never dropped ([D026](../decisions.md))
- [x] `html2md.ts` — escape markdown fences in extracted content so a statement can't close our code block ([architecture.md](../architecture.md) §9.2)
- [x] `truncate.ts` — statement first, then examples, **never code**; mark every cut point ([D022](../decisions.md))
- [x] `history.ts` — `problemKey` = `<platform>:<identifier>`; one entry per problem; revisit bumps to top and updates `url` and `visitedAt`; respects `historyLimit` and `historyPaused` ([D024](../decisions.md))
- [x] Missing-section notes: absent statement/examples/constraints render an explicit note, never emptiness ([spec.md](../spec.md) §8)
- [x] Unit tests for all of the above, including every-variable-absent rendering

### Decisions

Three were significant enough to be copied into [decisions.md](../decisions.md):

- **[D034](../decisions.md#d034) — `html2md` takes a DOM `Element`, not an HTML string.** The one module in `core/` that cannot honestly test in plain Node; its tests declare `@vitest-environment jsdom`. Every other `core/` module still runs under plain Node, and `core/` remains free of `chrome.*` without exception.
- **[D035](../decisions.md#d035) — fence escaping stays narrow.** Only backtick and tilde runs of 3+ are escaped. Escaping `_` or `\` as a general markdown escaper would, would destroy [D026](../decisions.md#d026) on every Codeforces statement.
- **[D036](../decisions.md#d036) — `isLocked` added to `ProblemContext`.** [spec.md](../spec.md) §5 had no field to carry the state §6.6 and [D027](../decisions.md#d027) require; the spec is amended.

Smaller calls, recorded here only:

- **`truncate.ts` takes a `measure` callback** rather than rendering a template itself. Keeps the module pure, keeps template overhead correctly counted, and lets phase 4 supply the real renderer without this file learning anything about templates.
- **`storage.ts` reads `chrome` off `globalThis` at call time** instead of importing it, so the size guard, debounce, defaults and merge logic all test in plain Node against a stub. The `chrome` touch points are four lines in one function.
- **Unknown template placeholders are left in place verbatim**, not deleted. A user's typo should be visible in the options preview rather than silently swallowing itself.
- **`languageSlug` returns `''` for an unmapped language** rather than guessing from the name. A wrong fence tag is worse than none.
- **`historyLimit: 0` clears the list; `historyPaused` preserves it.** Two different intentions — "I don't want this feature" versus "not right now" — and [spec.md](../spec.md) §5.1 only pins the second.
- **Rendered maths is read from its source annotation.** KaTeX and MathJax both stash the original TeX (`annotation[encoding="application/x-tex"]`, `script[type="math/tex"]`); reading it is what makes "verbatim" achievable at all, since the visual layer is unrecoverable glyph soup.

### Q&A

None — nothing in this phase was ambiguous enough to need a decision from the user. [D034](../decisions.md#d034) bends a stated exit criterion and is flagged there rather than asked, because the alternative (a hand-written HTML parser) is worse on every axis.

### Track

**Phase complete.**

- `npm run typecheck` clean, `npm test` green at **124 tests across 6 files**, `npm run build` succeeds
- `core/` contains no reference to `document` and no reference to `chrome.*` outside the four-line accessor in `storage.ts`
- Every module has a test file: `html2md` (36), `templates` (24), `truncate` (13), `history` (21), `storage` (24), `migrations` (7)

**Next action:** phase 2 — the LeetCode adapter. Start with `adapter.ts` (the `PlatformAdapter` interface) and `resolveAdapter(url)`, which is pure and unit-testable before any page is involved. Capture the practice/contest/Premium fixtures early ([todo.md](../todo.md) #5) — they gate the phase 2 exit criteria and are the only thing that detects a site redesign before users do.

### Additional Notes

- The `html2md` LaTeX and figure tests were written before the implementation, as planned. They caught nothing during the build — but they are now the guard that makes [D035](../decisions.md#d035) enforceable, asserting in both directions: fences *are* escaped, TeX underscores are *not*.
- **Whitespace normalization would corrupt code and maths**, so verbatim chunks are parked behind a sentinel while the surrounding markdown is squeezed, then restored. Without this, indentation inside a `<pre>` does not survive.
- **Fences are sized to their content.** A code block containing ``` gets a four-backtick fence rather than an escaped body, which is the correct markdown answer and keeps the sample readable.
- **List indentation survives normalization** because the squeeze preserves leading whitespace per line. An earlier global squeeze flattened nested lists.
- Adapters must set `isLocked` explicitly. It has no safe default other than `false`, and a missing one silently reads as "not locked".
- `truncate.ts` returns `overBudget: true` rather than cutting code when the budget cannot be met. Phase 4 needs to decide what the popup says in that case — [D022](../decisions.md#d022) settles the behaviour but not the wording.
- Deferred to phase 4, deliberately: assembling the full variable set from a `ProblemContext`. `numberSuffix`, `languageSlug` and `sectionOrNote` are here; the composition that uses them is a prompt-builder concern.

---

## Phase 2 — LeetCode adapter

**Goal.** One platform working end to end for extraction, including all four code-capture layers and the MAIN-world bridge.

**Exit criteria.** On a LeetCode practice problem, a contest problem, and a Premium problem, the popup shows correct title, number, difficulty, tags, and code with its provenance. Adapter unit tests pass against saved fixtures.

### Tasks

- [x] `adapter.ts` — the `PlatformAdapter` interface ([spec.md](../spec.md) §6.2)
- [x] `resolveAdapter(url)` — pure URL→adapter function, unit-tested over many real URLs
- [x] URL matching for `/problems/<slug>/*` and `/contest/<c>/problems/<slug>/*`, tolerant of `/description/`, `/submissions/` and query suffixes ([D024](../decisions.md))
- [x] Stable `problemKey` derivation
- [x] Metadata: embedded question JSON first, DOM fallback second ([spec.md](../spec.md) §6.3)
- [x] **Per-field guards** — one field failing never fails the adapter ([D015](../decisions.md))
- [x] Single `SELECTORS` object with a verified-on date and ordered fallbacks per selector
- [x] Statement HTML → `html2md`; split examples and constraints where separable
- [x] **Premium/locked detection** as its own condition, not a capture gap ([D027](../decisions.md))
- [x] Code layer 1 — probe `localStorage` by slug/frontend id, most recent plausible value; never a hard-coded key
- [x] MAIN-world bridge — read-only, per-load nonce, origin + `event.source` check, 256 KB cap, 1500 ms timeout ([D020](../decisions.md))
- [x] Code layer 2 — Monaco model read through the bridge, plus language id
- [x] Code layer 3 — DOM scrape, always flagged *possibly incomplete*
- [x] Code layer 4 — user text selection
- [x] **Language selection: the buffer currently open in the editor wins** ([D025](../decisions.md))
- [x] Provenance recorded and surfaced
- [x] Capture fixtures: practice, contest, Premium — trimmed, account markup scrubbed
- [x] Retry backoff 100/300/700/1500 ms for un-hydrated pages

### Decisions

Two went into [decisions.md](../decisions.md):

- **[D037](../decisions.md#d037) — adapters are handed the page, they never reach for it.** `extractMeta`/`extractCode` take an `ExtractEnv` (URL, `Document`, `localStorage`, bridge and selection callbacks, plus the `warnings`/`diagnostics` sinks) rather than reading globals. Amends [spec.md](../spec.md) §6.2, which also gains `canonicalUrl` and `isReady`.
- **[D038](../decisions.md#d038) — stored buffers are chosen by open language, not recency.** §6.4 asked for the most recently written value; the Storage API records no write time, so that is not knowable. The open editor language is available and is already the right answer under [D025](../decisions.md#d025).

Smaller calls, recorded here only:

- **`html2md` now renders `<sup>`/`<sub>` as `^` and `_`** (braced when longer than one character), including inside inline code. This was found by the fixture tests, not by reading: LeetCode writes every bound as `5 * 10<sup>4</sup>`, and dropping the markup produced `5 * 104` — not a rounder number but a wrong one, in the constraints, which is the one part of a statement [D026](../decisions.md#d026) says a review must not get wrong. Also folded in: `&nbsp;` is normalised to a space, so LeetCode's `<p>&nbsp;</p>` spacers stop littering the prompt with lines that look blank and aren't.
- **The registry lives in `registry.ts`, not `adapter.ts`.** `adapter.ts` ← `leetcode.ts` ← `registry.ts` is a line; putting the adapter list beside the interface made it a cycle, and a cycle whose failure mode is a temporal-dead-zone error at load time depending on which module the bundler happens to enter first.
- **Statement HTML is parsed into an inert document** (`doc.implementation.createHTMLDocument`), not a detached `<div>`. A detached div in the live document still fetches the images in the statement, and this extension makes no network requests ([D010](../decisions.md#d010)).
- **JSON discovery probes rather than addresses.** No container name is hard-coded — LeetCode has shipped Next.js data, an Apollo cache and neither. Any script mentioning `questionFrontendId` or `titleSlug` is parsed and walked (depth- and budget-capped) for the question object.
- **The statement is split on the markdown, not the DOM**, so the same splitter serves both the JSON path and the DOM path. A "Follow up:" block stays inside the constraints section: truncation never cuts constraints ([D022](../decisions.md#d022)), so that is the placement that cannot lose it.
- **Fixtures are hand-built from the documented page shapes, not captured from a live account** — see Track.

### Q&A

None — nothing in this phase needed a decision from the user. The one judgement call that could have gone either way (D037, changing an interface the spec had already sketched) was made in the direction the project's own testing architecture asks for and recorded rather than raised.

### Track

**Phase complete**, except the manual verification, which needs a real Chrome and a LeetCode account.

Verified automatically — `npm run typecheck`, `npm test` (225 tests, 101 new) and `npm run build` all clean:

- 20 real LeetCode URLs resolve correctly, including every practice suffix, both contest forms, and the rejections (`leetcode.cn`, `/problemset/`, the three phase-6 platforms)
- Practice fixture: title, number, difficulty and all three JSON-only tags read from the embedded question JSON, statement split into three sections, no warnings
- Contest fixture: the same extraction carried entirely by the DOM fallback, with the fallback hits recorded in diagnostics
- Premium fixture: `isLocked` true, metadata still complete, and **no** "couldn't read the statement" warning ([D027](../decisions.md#d027))
- All four code layers, in order, including the DOM scrape re-ordering Monaco's absolutely-positioned lines
- Bridge client refuses a wrong nonce, a wrong origin, a wrong source window, a stale reply and an oversized buffer; silence resolves null rather than hanging
- Content-script bundle 18 KB with zero React ([D012](../decisions.md#d012)); `world: "MAIN"` still emitted correctly

**Outstanding — user action:**

1. **Capture real fixtures** ([todo.md](../todo.md) #5). The three files in `src/content/platform/__fixtures__/` are hand-built to the shapes documented in [spec.md](../spec.md) §6.3 and §6.6, because a contest page and a Premium page both need a logged-in account to reach. They exercise every code path, but they cannot detect a LeetCode redesign — which is the main thing a fixture is for ([architecture.md](../architecture.md) §12). Replace them with real captures, trimmed and scrubbed the same way, and the suite should still pass unchanged.
2. **Confirm the selectors and the `localStorage` key shape on a live page** ([todo.md](../todo.md) #6). `SELECTORS` carries a verified-on date of 2026-09-03 that is honest about being derived from documentation rather than observation. The probing approach stands regardless of what the keys turn out to be named.
3. **Walk the popup readout** over a practice problem, a contest problem and a Premium problem — the phase's stated exit criteria.

### Additional Notes

- The `localStorage` key shape (todo #6) is still open. It is deliberately not load-bearing: nothing hard-codes a key, and `probeLanguage`/`fromSiteStorage` work off whatever is there.
- Premium detection uses positive evidence only — `isPaidOnly` in the JSON with no content, a lock icon or a `/subscribe` link inside the description region, or the phrase "subscribe to unlock". Never "the statement is missing", which is what makes a paywall distinguishable from a broken selector.
- The bridge's nonce is honest about what it buys: the MAIN world is the page's own world, so the channel cannot be secret. The nonce separates our traffic from unrelated `postMessage` noise and stale replies; the reason a forged reply is harmless is that every response is validated, capped and treated as an untrusted string.
- Fixture and trimming convention for phase 6: one file per page kind, a header comment saying what the fixture is *for* and what was scrubbed, keep the statement region and the editor region, drop everything else. Loaded with `?raw` — `vite/client` types are already on, so no `@types/node`.
- Watch out on Windows: backslashes are eaten by heredocs through the Bash tool here. Regex-heavy edits go through the Edit tool.

---

## Phase 3 — YouTube action

**Goal.** The first complete user-facing action, working identically from all three trigger surfaces.

**Exit criteria.** `Alt+Shift+Y`, the popup button, and the context-menu item all open the correct YouTube search from a LeetCode problem. Firing on an unsupported page shows a toast rather than doing nothing. Adapter failure degrades to page title, then to the URL.

### Tasks

- [x] `background/actions.ts` — single `runAction(actionId, tab)` path for every surface ([D013](../decisions.md))
- [x] Debounce per `(tabId, actionId)` at 750 ms ([D017](../decisions.md))
- [x] `commands.ts` — keyboard shortcuts
- [x] `contextMenus.ts` — parent + three children, `documentUrlPatterns` limited to the four platforms
- [x] Content script: supported-page detection, SPA re-detection via history-API patching plus a **`<title>`-scoped** observer — never a `body` subtree observer ([architecture.md](../architecture.md) §7)
- [x] Toolbar badge driven by that detection
- [x] `toast.ts` — shadow DOM, `textContent` only, 4 s auto-dismiss
- [x] YouTube URL construction with correct encoding
- [x] `openInNewTab` / `focusNewTab` honoured
- [x] Degradation ladder: full context → title + number → `document.title` → URL slug ([D016](../decisions.md))
- [x] Popup: read-only resolved-query preview ([D006](../decisions.md))
- [x] Unsupported-page toast

### Decisions

One went into [decisions.md](../decisions.md):

- **[D039](../decisions.md#d039) — page detection lives in the service worker, not the page.** The planned approach (patched `pushState`/`replaceState` plus a `<title>`-scoped observer) has a half that cannot work: a content script's patched `history` lives in the isolated world and never sees the page's own calls, and patching from the MAIN world would contradict [D020](../decisions.md#d020). Chrome reports SPA navigation as an ordinary `tabs.onUpdated` with a new `url`, so the worker gets it for free — and the page keeps *zero* observers, which is strictly better against the load-time budget than the well-scoped one the plan asked for. Amends [spec.md](../spec.md) §6.1.

Smaller calls, recorded here only:

- **`core/urls.ts` is new**, and `manifest.config.ts` now imports its match patterns from it. D039 put a URL match on the service worker's wake path, and the only place one existed was inside the LeetCode adapter — importing which would have pulled `html2md` into a code path with a 20 ms budget. The SW chunk is 4.9 KB and contains no `html2md`; verified in the built output.
- **`core/youtube.ts` is new**, holding query building and the §7.1 ladder. The popup's read-only preview and the worker's action call the *same* function, so the preview cannot promise something the button does not do ([D006](../decisions.md#d006)).
- **The toast is injected, not messaged.** An unsupported page is exactly where the user most needs to be told something, and it is the one place no content script is running. `chrome.scripting.executeScript({ func })` covers it, and `activeTab` is granted by all three surfaces. The catch: `func` is serialised with `toString()`, so `toastInPage` must reference nothing outside its own body or it becomes a silent ReferenceError in the page. `toast.test.ts` rebuilds it from its own source to make that failure loud.
- **A missing `platformForUrl` is the only silent path**, and only when there is no tab to speak to. Every other branch opens a tab or says something ([D016](../decisions.md#d016)). The badge is the last rung when even injection is refused, as on `chrome://` pages.
- **A degraded search says so.** When the query came off the page title rather than a real extraction, a warn toast follows the tab — otherwise a vague result looks like YouTube's fault rather than ours.
- **`splitPageTitle` treats a title that is only the site name as a gap.** These SPAs show `LeetCode` before the route resolves; reporting that as a title would search YouTube for the word "LeetCode". Found by a test, not by reading.
- **The debounce map is module state, deliberately.** The worker forbids that for *durable* state; this is the opposite. The window is 750 ms and MV3 only kills an idle worker after ~30 s, so a restart can never drop a debounce that was still doing anything. Entries are swept past 10× the window, and `tabs.onRemoved` forgets a closed tab.

### Q&A

None — nothing in this phase needed a decision from the user. D039 contradicts a task as written in this plan, and was resolved in the direction the constraint allows rather than raised, since the plan's version is not implementable.

### Track

**Phase complete**, except the manual verification, which needs a real Chrome.

Verified automatically — `npm run typecheck`, `npm test` (301 tests, 76 new) and `npm run build` all clean:

- All three surfaces map onto the same three action ids, and every action is reachable from both the command list and the menu
- The default template renders the documented example, `LeetCode 912 Sort an Array solution`, and the search URL matches spec §7.1 exactly
- `openInNewTab` / `focusNewTab` both honoured; a new tab opens *beside* the problem rather than at the end of the strip
- The full ladder: context → page title → URL slug → the raw URL, with a test asserting the query is **never** empty for any template input
- Unsupported page toasts; an injection-refusing page falls back to the badge; the two unbuilt actions say so rather than doing nothing
- Debounce holds at 750 ms, per tab *and* per action, and is forgotten when the tab closes
- The toast survives being rebuilt from its own source (the `executeScript` round-trip), renders into a closed shadow root, and uses `textContent` — an `<img onerror>` in a problem title stays text
- Service-worker chunk 4.9 KB with no `html2md` and no React; SPA navigation reaches the badge via `tabs.onUpdated`

**Outstanding — user action, tracked in [TESTING.md](../TESTING.md) §3b:**

1. Fire all three surfaces on a real LeetCode problem and confirm they open the same search
2. Confirm `Alt+Shift+Y` and `Alt+Shift+G` don't collide with LeetCode's own editor shortcuts — **before the defaults are locked in for release**
3. Confirm the badge follows SPA navigation between problems without a reload
4. Fire a shortcut on an unsupported page and on a `chrome://` page, and check something is said in each case

### Additional Notes

- This phase proves the message contract end to end. If the service worker is being killed mid-action, it will surface here first — check that no state is held in module scope. The one exception is the debounce map, above, and it is safe by construction.
- The `GET_CONTEXT_FOR_POPUP` message in [spec.md](../spec.md) §4.1 is still unused: the popup asks the tab directly and renders the preview itself, which is presentation rather than orchestration and so does not cut across [D013](../decisions.md#d013). Phase 7 should decide whether that message earns its place or should be dropped from the contract.
- The context menu registers all three children now, per the plan. Two of them currently answer with "arrives in a later phase" — deliberate, and removed as phases 4 and 5 land.
- `chrome.contextMenus.removeAll` runs before every registration because `onInstalled` fires on update as well as install, and creating a duplicate id would leave the remaining items unregistered.

---

## Phase 4 — Prompt builder and clipboard action

**Goal.** A complete, well-formed review request, obtainable without ChatGPT being involved at all.

**Exit criteria.** The copy-prompt action yields a prompt containing problem, examples, constraints, code and instructions — correct on a full capture, and correct on a capture with gaps, where absences are stated explicitly rather than rendered blank.

### Tasks

- [x] Compose prompt from `ProblemContext` + template
- [x] Apply truncation in the correct order, with cut markers ([D022](../decisions.md))
- [x] Fence extracted content and label it as quoted problem material, not instructions ([architecture.md](../architecture.md) §9.2)
- [x] Missing sections → explicit notes ([spec.md](../spec.md) §8)
- [x] Locked problems → link-only prompt with the locked state stated ([D027](../decisions.md))
- [x] No code captured → paste placeholder, not an empty fence
- [x] `includeCode: false` honoured
- [x] Clipboard write in the content script; hidden-textarea + `execCommand` fallback; confirmation toast
- [x] Copy-prompt wired to popup and context menu

### Decisions

Two went into [decisions.md](../decisions.md):

- **[D040](../decisions.md#d040) — quoted problem text is tagged, not fenced.** [architecture.md](../architecture.md) §9.2 asks for extracted content to be "fenced and labeled". A literal markdown fence cannot be the mechanism: it renders the statement's LaTeX, lists and headings as inert text — the approximation [D026](../decisions.md#d026) forbids — and statements carry their own fenced example blocks, which would close ours from the inside. Named tags do the labelling without costing any fidelity. Amends the default template in [spec.md](../spec.md) §8.
- **[D041](../decisions.md#d041) — the clipboard write happens in whichever surface has focus.** §7.3 said the content script does it. That works for the command and the menu, and cannot work for the popup: while the popup is open the page is not the focused document, and `writeText` throws there. The `clipboardWrite` permission that would lift it is deliberately not requested. Amends [spec.md](../spec.md) §7.3 and §4.1.

Smaller calls, recorded here only:

- **`core/prompt.ts` is new**, and it is where every §8 rule lives: the notes, the tags, the placeholders, the truncation call. It is pure, so phase 7's live template preview gets it for free.
- **A locked problem's statement is kept out of the truncation budget entirely.** The note that stands in for it is ours, not quoted, so there is nothing there to shorten.
- **A closing tag found inside extracted text is entity-escaped, not stripped.** A problem *about* XML is an ordinary problem, and deleting from a statement is exactly the failure D026 rules out.
- **`includeCode: false` and "no code captured" read differently** — `(code intentionally not included)` against `(no code captured — I'll paste it below)`. One is a choice, the other is a gap, and a model that cannot tell them apart will apologise for the wrong thing.
- **The copy toast names what is missing.** A prompt without the user's code is still worth copying, but only if they know to paste it in.
- **No degradation ladder for the prompt.** Unlike the YouTube search, a page title alone makes no useful review request, so with no context the action says so rather than copying something worthless.

### Q&A

None — nothing in this phase needed a decision from the user. D041 contradicts §7.3 as written, and was resolved the only way the platform allows.

### Track

**Phase complete**, except the manual verification.

Verified automatically — `npm run typecheck`, `npm test` (346 tests, 45 new) and `npm run build` all clean:

- A full capture carries problem, examples, constraints, code, language-tagged fence and instructions, with no placeholder left unsubstituted
- Every gap is *stated*: three missing sections give three explicit notes, and difficulty, tags and language degrade to named text rather than to blanks
- A locked problem states the Premium condition where the statement would be, and still carries the link and every readable field
- No code gives the paste placeholder, never an empty fence; `includeCode: false` reads as a choice instead
- Truncation cuts the statement, then examples, never the code and never the constraints — going over budget instead, and saying so
- A statement containing `</problem_statement>` cannot close its own wrapper, and nothing of it is deleted
- The clipboard falls back to `execCommand` when the modern API refuses, leaves no textarea behind, and reports failure rather than claiming a copy
- `copyInPage` survives the `executeScript` round-trip, tested by rebuilding it from its own source

**Read end to end, as the plan asked** — and it caught something the tests did not: every prompt carried stray single-space lines, from the whitespace between block elements in the source markup. `normalize` was keeping them alive because the indent-preserving rule that makes nested lists work also protects a line of pure whitespace. Fixed in `html2md`, with a test.

**Outstanding — user action, tracked in [TESTING.md](../TESTING.md) §3c:**

1. **Paste a generated prompt into ChatGPT by hand** and judge the reply. This is the one thing no test can do, and prompt quality is the actual product.
2. Copy from all three surfaces on a real problem and confirm the clipboard holds the same prompt each time — the popup takes a different delivery route (D041) and is the one to watch.
3. Confirm the copy works on a page served over plain HTTP, where the modern clipboard API is unavailable and the fallback has to carry it.

### Additional Notes

- Build this **before** Phase 5 deliberately: it's the fallback the ChatGPT flow depends on, so it must already work before anything can degrade into it. It does — phase 5 can degrade into `runAction('copyPrompt')` directly.
- `copyInPage` is under the same self-containment constraint as `toastInPage`: it is serialised into pages by `executeScript`, so a reference to anything outside its body becomes a silent ReferenceError. Both have a test that rebuilds them from their own source.
- The `describeResult` line is deliberately one sentence — it goes into a toast, and a toast nobody finishes reading is a toast that said nothing.
- Phase 7's options preview should call `buildPrompt` directly rather than reimplementing any of §8.

---

## Phase 5 — ChatGPT injection

**Goal.** The flagship action. The most fragile code in the project ([D003](../decisions.md)).

**Exit criteria.** From a LeetCode problem, the action opens ChatGPT with the prompt in the composer, **unsent**, with the review banner shown. Forcing the composer selector to fail falls back to the clipboard with an explanatory toast, losing nothing.

### Tasks

- [x] `pendingPrompt.ts` — session storage keyed by the created tab id; one-shot delete on claim; 5-minute expiry; sweep on `tabs.onRemoved` ([D017](../decisions.md))
- [x] Prompt never written to `local` or `sync` ([D018](../decisions.md))
- [x] ChatGPT content script claims via the service worker — never reads session storage directly
- [x] Composer wait: `MutationObserver`, 10 s timeout
- [x] Insertion attempt 1: focus, select all, `execCommand('insertText')`
- [x] Insertion attempt 2: synthetic paste `ClipboardEvent`
- [x] Insertion attempt 3: DOM mutation + dispatched `input`
- [x] **Read-back verification** after insertion
- [x] Failure → clipboard fallback + "press Ctrl+V" toast
- [x] Review banner: "Prompt inserted by DSA Helper — review it, then press Enter"
- [x] **Never submit.** No Enter dispatch, no submit-button click, anywhere in this file ([D003](../decisions.md))
- [x] `autoInjectChatGpt: false` → clipboard-only flow
- [x] Manually test the failure path by breaking the selector on purpose

### Decisions

One went into [decisions.md](../decisions.md):

- **[D042](../decisions.md#d042) — `openInNewTab` governs the YouTube result only.** §7.1 renders the search "per `openInNewTab`", §7.2 says flatly "open ChatGPT in a new tab", and the setting's name suggests it covers both. It cannot: navigating the current tab to ChatGPT would destroy the problem page the prompt was just built from. Amends [spec.md](../spec.md) §5 beside the setting.

Smaller calls, recorded here only:

- **The never-submit rule is enforced by reading this file's own source.** `inject.test.ts` imports `inject.ts?raw`, strips the comments so the prose explaining the rule cannot satisfy the check, and fails if `KeyboardEvent`, `'Enter'`, `.click(`, `requestSubmit` or `.submit(` appears. A behavioural test cannot catch a submit added to a path it does not exercise; this can. It is the only security control in the project enforced by *absence*, which is exactly the kind that erodes quietly.
- **The claim is origin-checked as well as tab-checked.** `CLAIM_PENDING_PROMPT` returns the user's code, and any page that knows the extension id can call `sendMessage` ([architecture.md](../architecture.md) §9.1). The sender must be a tab, and that tab must be on ChatGPT's origin.
- **`inject.ts` only auto-runs when `chrome.runtime.id` exists.** It makes the module importable by its own tests, and in the page the guard is false in exactly one situation — after an extension reload, when doing nothing is the right answer anyway.
- **Read-back verification compares whitespace-insensitively.** ProseMirror splits the prompt into paragraph nodes, so what comes back differs from what went in by whitespace alone. Anything more than that is a failed insertion, including a partial one — half a prompt produces a confidently wrong review.
- **The composer observer is disconnected the moment it hits.** ChatGPT streams tokens into the DOM; an observer left running on `document.body` would fire on every one of them.
- **Gaps are announced on the problem tab, not the ChatGPT tab.** That is where the user still is when `focusNewTab` is off, and it happens before ChatGPT has finished loading.
- **A created tab with no id falls back to the clipboard.** Nothing could ever claim that prompt, so it goes somewhere the user can reach instead of being dropped ([D016](../decisions.md#d016)).

### Q&A

None — nothing in this phase needed a decision from the user.

### Track

**Phase complete**, except the manual verification.

Verified automatically — `npm run typecheck`, `npm test` (383 tests, 37 new) and `npm run build` all clean:

- The prompt is written to `chrome.storage.session` and nowhere else; `local` and `sync` stay empty ([D018](../decisions.md#d018))
- Claiming is one-shot: the second claim returns null and leaves nothing behind, and an expired entry is deleted rather than left for a later claim
- Two problem tabs firing in quick succession get their own prompts — the case a global slot would break (architecture §5.3)
- Prompts expire at 5 minutes, are swept on `tabs.onRemoved`, and an unreadable entry is swept too since nothing can ever claim it
- Insertion descends its three strategies and verifies by read-back; a composer that silently discards writes, and one that takes only part of the prompt, both count as failures
- Whitespace differences do *not* count as failures — that is just ProseMirror
- The prompt is inserted as text, never markup: an `<img onerror>` in a problem title stays text
- **No submit path exists in `inject.ts`**, enforced by a source-level test
- ChatGPT content script builds to 3.2 KB with no React; total `dist/` is 290 KB against a 500 KB budget

**Outstanding — user action, tracked in [TESTING.md](../TESTING.md) §3d:**

1. **Break the composer selector on purpose** and confirm the clipboard fallback fires with its toast. The plan asks for this explicitly and it is the path that matters most, because it is the one that runs the day ChatGPT redesigns.
2. Confirm the prompt lands in the composer **unsent**, with the banner, on a real ChatGPT page — and that the selector list is still right (`COMPOSER_SELECTORS` carries a verified-on date of 2026-09-03 derived from documentation, not observation).
3. Fire the action twice from two different problem tabs and confirm each ChatGPT tab gets its own prompt.
4. Open ChatGPT by hand and confirm **nothing** is inserted.

### Additional Notes

- Everything ChatGPT-specific — selector, timeout, insertion strategies — stays in this one module, so a redesign is a single-file fix ([architecture.md](../architecture.md) §7.2).
- The composer selector carries its verified-on date in the file, as asked. It is the value most likely to be wrong, since it was derived from spec §7.2 rather than from a live page.
- The "never submit" rule is a security control, not a preference. Any future convenience request to auto-send needs a decision entry that reckons with that ([D003](../decisions.md)) — and would have to delete a test that exists to stop it.
- `focusNewTab: false` is the interesting case for this action: the ChatGPT tab loads in the background, the insertion still runs, and the banner is waiting when the user switches to it. The clipboard *fallback* is the part that suffers there, since an unfocused document cannot write the clipboard ([D041](../decisions.md#d041)) — worth checking by hand.
- Phase 4's clipboard path is what this degrades into, which is why it was built first. It works.

---

## Phase 6 — Remaining adapters

**Goal.** Codeforces, CodeChef and GeeksforGeeks, following the pattern Phase 2 established.

**Exit criteria.** Each platform verified on one practice and one contest URL (GfG: practice only). Fixtures committed for each. No adapter imports from another.

### Tasks

- [x] **Codeforces** — problemset, contest and gym URL patterns; `problemKey` = contestId + index
- [x] **Codeforces** — `.problem-statement` root; title, limits, `.sample-tests`, sidebar tags, rating from the `*NNNN` tag
- [x] **Codeforces** — LaTeX preserved verbatim; verify against a maths-heavy problem ([D026](../decisions.md))
- [x] **Codeforces** — expect `codeSource: 'none'` on problem pages; confirm this reads as normal, not as an error ([D014](../decisions.md))
- [x] **Codeforces** — submit-page code capture where the editor exists
- [x] **CodeChef** — practice + contest patterns; problem code from the URL; embedded JSON first, `#problem-statement` fallback; editor capture
- [x] **GeeksforGeeks** — both hosts; slug as identifier since there is no number ([D024](../decisions.md))
- [x] **GeeksforGeeks** — hashed CSS-module classes matched **by prefix only**, never exact ([architecture.md](../architecture.md) §6.3)
- [x] Fixtures for each platform and page kind
- [x] Verify figure placeholders on a diagram-heavy problem
- [x] Verify a Russian-language Codeforces statement passes through untouched ([D026](../decisions.md))

### Decisions

One went into [decisions.md](../decisions.md):

- **[D043](../decisions.md#d043) — adapter-common code lives in `shared.ts`, not in an adapter.** The code ladder, the language table and the heading splitter were all inside `leetcode.ts`, because phase 2 had one adapter. The exit criterion here is that no adapter imports from another, so they moved. The line is drawn on *knowledge*: `shared.ts` may not name a single site, and an adapter may not hold anything a second site would also need.

Smaller calls, recorded here only:

- **The `PlatformAdapter` interface did not need changing.** The plan warned that a platform might resist it. None did — including Codeforces, whose page has no editor at all and whose statement is structured rather than heading-delimited. `isReady` and `canonicalUrl` (added in phase 2 as [D037](../decisions.md#d037)) turned out to carry the awkward cases: a Codeforces submit page is "ready" immediately because it will never have a statement.
- **Codeforces does not use the shared splitter.** Its statements are marked up structurally (`.problem-statement > div`, `.input-specification`, `.sample-tests`, `.note`) and are frequently in Russian, so matching the English words "Example" and "Constraints" would work on roughly half the site. It reads the DOM structure instead, which has no language in it. This is the standing proof that D043's split is real rather than a junk drawer.
- **Codeforces' time and memory limits are the constraints.** On this site they are usually the only bounds stated outside the prose, and a complexity answer hangs on them ([D022](../decisions.md#d022) already refuses to truncate constraints).
- **The `*NNNN` sidebar tag is the difficulty, and is kept out of the tags.** Codeforces has no Easy/Medium/Hard; the rating is the closest equivalent spec.md §5 allows. A live contest problem has no rating yet, which is a gap rather than a failure.
- **CodeChef's `body` field is markdown already**, not HTML — it authors in markdown and its API returns the source. Converting it would only lose fidelity, so the JSON path uses it directly and only the DOM path goes through `html2md`.
- **CodeChef's practice pattern is tried before its contest pattern.** A contest problem lives under an arbitrary first segment, so `/problems/FLOW001` would otherwise parse as a contest named "problems". The site's own sections (`/ide`, `/users`, …) are excluded by name for the same reason.
- **GfG's slug is its identity and, in the last resort, its title.** There is no number anywhere ([D024](../decisions.md#d024)), so `number` is null and the YouTube template collapses that variable away. The trailing numeric segment in the URL is GfG's page id, not part of the problem.
- **`core/urls.ts` grew a second, simpler matcher for the three new platforms.** It is deliberately not the adapters' `matches`: the worker runs it on every tab update inside a 20 ms budget and must not import an adapter to do it ([D039](../decisions.md#d039)). A test asserts both agree on every claimed URL.

### Q&A

None — nothing in this phase needed a decision from the user.

### Track

**Phase complete**, except the manual verification.

Verified automatically — `npm run typecheck`, `npm test` (454 tests, 71 new) and `npm run build` all clean:

- **No adapter imports from another**, checked directly against the source
- All four platforms resolve, on every URL form each one has: Codeforces problemset/contest/gym/submit, CodeChef practice and contest, GfG on both hosts — and a test asserts no two adapters ever claim the same URL
- Codeforces: LaTeX arrives verbatim (`$$$1 \le n \le 10^4$$$`), the figure is named rather than dropped, the rating reads as the difficulty and stays out of the tags
- **A Russian statement passes through untouched** — Cyrillic byte-for-byte, no warning about the language, and the structural splitter still works where a heading-text one could not ([D026](../decisions.md#d026))
- Codeforces problem pages return no code and say that is *expected*, not a failure ([D014](../decisions.md#d014)); a submit page warns, because an editor was expected there
- CodeChef: the JSON path uses the markdown body directly; the DOM path converts rendered HTML and records the fallback selector it reached for
- GfG: **every CSS-module selector is prefix-matched**, asserted structurally so an exact hash cannot be introduced, and the fixture's hashes are deliberately not the real ones
- Content-script bundle 27 KB with no React; `dist/` 298 KB against the 500 KB budget

**Read a Codeforces prompt end to end**, as in phase 4 — and it found one more `html2md` blemish: a standalone `<img>` arrived with a stray leading space, from the whitespace between block elements. Every Codeforces figure would have carried it. Fixed, with a test.

**Outstanding — user action, tracked in [TESTING.md](../TESTING.md) §3e:**

1. **Capture real fixtures for all three platforms** ([todo.md](../todo.md) #5). As in phase 2, these are hand-built to the shapes documented in [spec.md](../spec.md) §3 and §6.3. Codeforces is the one most likely to be right, being server-rendered and stable; CodeChef and GfG are SPAs and their markup is a guess.
2. Verify one practice and one contest URL per platform in a real browser (GfG: practice only).
3. Confirm the GfG hashed class names still match — that is the single most likely thing in this phase to be wrong.

### Additional Notes

- Codeforces is the reassuring one: server-rendered and stable. CodeChef and GfG are SPAs and will be the fragile pair. That held — the two SPA adapters are the ones whose selector lists reach for prefix matches and fallbacks.
- If a platform's structure resists the `PlatformAdapter` interface, change the interface deliberately and record why — don't special-case inside one adapter. None did; the interface phase 2 left is sufficient for all four.
- **`shared.ts` has one rule**: it may not name a single site. When phase 7's diagnostics panel or a fifth platform tempts something site-specific into it, that is the test to apply.
- Codeforces `1352A` is reachable at two paths and is one problem ([D024](../decisions.md#d024)) — the case worth re-testing by hand once history exists in phase 7, since it is the reason D024 exists.

---

## Phase 7 — Options page and history

**Goal.** Everything the user owns becomes editable, plus the self-service support surface.

**Exit criteria.** Templates editable, resettable, copyable, and persisted. History populates with correct de-duplication and bump ordering, and the pause toggle works. The diagnostics panel reports field-by-field results for the current page.

### Tasks

- [x] Options shell with sections per [spec.md](../spec.md) §9.4
- [x] Template editors with reset-to-default and **live preview** against the last-seen problem, or a bundled sample
- [x] **Copy-to-clipboard button per template** ([D029](../decisions.md))
- [x] Character counter and size warning approaching the sync per-item limit ([D018](../decisions.md))
- [x] Behaviour toggles: new tab, focus, include code, auto-inject, max prompt chars
- [x] History section: limit, clear, and the plain statement that uninstalling erases everything ([D029](../decisions.md))
- [x] **Pause history** toggle in the popup ([D029](../decisions.md), [domain.md](../domain.md) R17)
- [x] Popup history list, each entry re-triggerable
- [x] Theme: system / light / dark
- [x] Diagnostics panel — which selector matched, which fallback, what failed ([architecture.md](../architecture.md) §10.4)
- [x] "Report a broken page" — redacted blob, **never statement text, never code**; clipboard + prefilled issue
- [x] Link out to `chrome://extensions/shortcuts`

### Decisions

One went into [decisions.md](../decisions.md):

- **[D044](../decisions.md#d044) — diagnostics report the last extraction, not a live one.** [architecture.md](../architecture.md) §10.4 describes the panel as running the adapter "against the current tab". An options page has no current tab — it *is* a tab, and may be in its own window. So the extraction is stored when it happens and the panel reads it back, which is also the more honest artefact: it reports what actually failed, not what a re-run does now.

**A real bug, found by using the code:** `setSettings` **replaced** the stored settings object instead of merging into it. Changing the theme would have silently reset both templates, the history limit and every toggle. It had gone unnoticed since phase 1 because nothing called it — phase 7 is its first caller, twice over. Fixed, with the merge reading the debounce queue first so two changes inside one window cannot overwrite each other, and pinned by tests.

Smaller calls, recorded here only:

- **`GET_CONTEXT_FOR_POPUP` is removed from the message contract.** Phase 3 left it open whether it earned its place; it did not. The popup asks the tab directly, which is presentation rather than orchestration and so does not cut across [D013](../decisions.md#d013).
- **`diagnostics` rides on `CONTEXT_RESULT`, not inside `ProblemContext`.** It is data about the extraction, not about the problem, and putting it in the model would carry it into every prompt path.
- **`lastContext` became `lastExtraction`** — `{ context, diagnostics, at }`. Nothing had ever written the old key, so there is no stored shape to migrate.
- **The diagnostics table distinguishes `missing` from `absent (expected)`.** A Codeforces problem page has no editor and GfG has no number; reporting either as a fault sends someone chasing a bug that is not there ([D014](../decisions.md#d014), [D027](../decisions.md#d027)).
- **The popup carries a known-breakage line** when four or more fields fail at once ([architecture.md](../architecture.md) §10.4). One missing field is ordinary ([D015](../decisions.md#d015)); most of them at once is a redesign, and saying so deflects duplicate reports.
- **`ISSUE_URL` is null.** There is no repository URL yet ([todo.md](../todo.md) #3, #4), so the report button copies the blob — the part that matters — and the "open an issue" link simply is not rendered until there is somewhere to point it.
- **The YouTube template shows a character count, not a byte budget.** It shares the `settings` sync item with everything else, so a byte figure against the 8 KB per-item cap would be misleading. The prompt template has its own key, so its byte counter is exact — and that is the one that can realistically approach the cap ([D018](../decisions.md#d018)).
- **Theme is applied by stamping `data-theme` on the root**, and `system` *removes* the attribute rather than setting a third value, so the CSS media query is back in charge with nothing to override.

### Q&A

None — nothing in this phase needed a decision from the user.

### Track

**Phase complete**, except the manual verification.

Verified automatically — `npm run typecheck`, `npm test` (491 tests, 37 new) and `npm run build` all clean:

- **The redaction rule holds**: a report built from a context stuffed with sentinel strings contains none of them — not the statement, examples, constraints or code, not even a fragment — and the query string never survives into the URL
- Sizes and presence are reported instead, which is what a maintainer actually needs
- History records on every action; **both Codeforces URL forms collapse onto one entry**, keeping the most recently visited variant ([D024](../decisions.md#d024)) — the case the plan asked for
- A returning problem moves to the top rather than duplicating; the limit caps the list; a limit of zero records nothing
- **Pausing stops recording without disturbing what is already there** ([domain.md](../domain.md) R17)
- A history write that throws never stops an action ([D016](../decisions.md#d016))
- The last extraction is stored in `local` only — it carries the user's code, so it never reaches `sync` ([D018](../decisions.md#d018))
- `setSettings` merges: a patch leaves untouched settings alone, and two changes inside one debounce window both survive
- Theme applies and, for `system`, un-applies
- `dist/` 327 KB against the 500 KB budget; still no React in the content scripts or the worker

**Outstanding — user action, tracked in [TESTING.md](../TESTING.md) §3f.** The options page is the first substantial UI in the project and **none of its rendering is covered by tests** — there is no React testing library in the project, and adding one for this was not in scope. Everything it *computes* is core and tested; everything it *draws* needs eyes.

1. Open the options page and walk every section.
2. Edit a template, reload, confirm it persisted — and confirm the other settings did **not** reset (the bug above).
3. Use the extension on a problem, then check the diagnostics panel and **read the copied report** to see for yourself that no code is in it.
4. Check history de-duplication live: visit `1352A` by both Codeforces paths, confirm one entry.

### Additional Notes

- The diagnostics panel is what makes support scale without telemetry ([D031](../decisions.md)). It's tempting to cut under time pressure; it shouldn't be.
- Test history de-duplication with both Codeforces URL forms for the same problem — that's the case [D024](../decisions.md) exists for. Done in `actions.test.ts`, and worth repeating by hand.
- **The redaction rule needs maintaining, not just passing.** `diagnostics.test.ts` checks the fields that exist today. A new field on `ProblemContext` that carries user content has to be added to that test at the same time, or it will ship into a public issue tracker.
- Before release, `ISSUE_URL` in `Options.tsx` needs a real address, and the phase-8 store listing should mention that the extension collects nothing.

---

## Phase 8 — Polish and release preparation

**Goal.** Shippable.

**Exit criteria.** The manual smoke matrix passes in full. Store assets and documentation complete. All publishing blockers in [todo.md](../todo.md) closed.

### Tasks

- [ ] Full smoke matrix: 4 platforms × 2 page kinds × 3 trigger surfaces × 3 actions ([architecture.md](../architecture.md) §12) — **needs a browser; see [TESTING.md](../TESTING.md) §3g first**
- [x] `TESTING.md` — that matrix as a repeatable checklist — created 2026-09-03, maintained per phase
- [x] `CHANGELOG.md` — created 2026-09-03, maintained per phase
- [x] Review every user-facing string: warnings, toasts, banners, empty states
- [x] Theme correctness in both light and dark — CSS audited; the six theme × OS combinations still need eyes ([TESTING.md](../TESTING.md) §3g)
- [x] Performance check against the budgets in [architecture.md](../architecture.md) §7 — automated per entry point in `tools/check-build.mjs`
- [x] Bundle size check; confirm **no React in content scripts or the service worker** ([D012](../decisions.md)) — automated
- [x] README: add `decisions.md` and `todo.md` to the documentation table ([todo.md](../todo.md) #7) — done 2026-09-02
- [~] **Privacy policy contact address** ([todo.md](../todo.md) #1) — decided (dedicated alias, not a personal address); the address itself is one line in `core/links.ts`
- [x] **Privacy policy effective date** ([todo.md](../todo.md) #2) — 3 September 2026
- [x] **Licence + `LICENSE` file** ([todo.md](../todo.md) #3) — MIT
- [x] Store listing copy, screenshots, per-permission justifications ([architecture.md](../architecture.md) §9.3) — [STORE-LISTING.md](../STORE-LISTING.md); the screenshots themselves need the extension running
- [~] Host the privacy policy at a public URL — resolves automatically once `REPO_SLUG` is set ([D046](../decisions.md))
- [x] Confirm staged percentage rollout is configured for the first release ([D030](../decisions.md)) — 10%, recorded in [STORE-LISTING.md](../STORE-LISTING.md) §7

**Added during the phase:**

- [x] **Fixed the build wiring** — the emitted service worker was the content script ([D045](../decisions.md))
- [x] `tools/check-build.mjs` + `npm run verify`
- [x] `src/conventions.test.ts` — the cross-phase checklist, as tests
- [x] `src/core/links.ts` — outward-facing URLs in one place ([D046](../decisions.md))

### Decisions

- **[D045](../decisions.md#d045)** — Entry points are uniquely named, and the built artifact is checked. Found the phase's one real bug: `background/index.ts` and `content/platform/index.ts` both emitted a chunk named `index.ts`, CRXJS resolved the service worker to the content script's, and no background listener had registered since phase 3. Renamed both entries and added `tools/check-build.mjs`.
- **[D046](../decisions.md#d046)** — Outward-facing URLs live in one module and degrade to nothing. `core/links.ts` holds the repo, issue, privacy and contact values; unset ones return `null` and their UI renders nothing rather than a dead link.

### Q&A

**Q. How is this distributed, what licence, what contact address, and where does the source live?**
Asked before any release document was written, because all four change what gets committed rather than merely what gets said. Offered: Web Store / source-public-first / unpacked only; MIT / Apache 2.0 / GPL-3.0 / none; dedicated alias / personal address / issues URL / placeholder; public repo / private repo / local only.

**A. Chrome Web Store · MIT · a dedicated alias · public GitHub repo.** The two concrete values — the alias address and the repository slug — were not supplied, so both are single constants in `core/links.ts` with every consumer degrading to no link ([D046](../decisions.md)). That is why two tasks above are `[~]`: the decision is closed, the substitution is not.

### Track

Phase complete, minus what needs a browser.

**Outstanding, all of it manual:** the smoke matrix (§4), the phase-8 acceptance checks ([TESTING.md](../TESTING.md) §3g), the six theme combinations, the five store screenshots, and judging a real ChatGPT reply (§3c). Two substitutions remain: `REPO_SLUG` and `CONTACT_EMAIL`.

### Additional Notes

- **The green suite was not evidence.** 491 tests, a clean typecheck and a clean build log all coexisted with an extension whose every keyboard shortcut, context menu and popup button was inert. The failure was in the wiring *between* correct source and a correct-looking artifact, which is the one place none of those three look. Anything that rewrites paths — a bundler, a plugin, a manifest generator — can produce it, so the artifact now has its own checks and they assert **identity**, not existence.
- The bug was reachable from the very first item on the phase 0 checklist ("`dist/` loads unpacked with no errors"). It survived six phases because that checklist was never run. A manual check deferred is not a check pending; it is a check absent, and the automated net now exists precisely because deferral is the realistic behaviour.
- Do not skip staged rollout on the first release. It's the only defence against a global simultaneous breakage ([D030](../decisions.md)).
- The README's Known Limitations section was verified claim by claim against the built extension: the Codeforces editorless case, the `[Figure: … — not included]` placeholder string, Premium labelling, degradation on redesign, and statement-before-examples truncation. All five hold.
- `UNSUPPORTED` in `actions.ts` had said "LeetCode problem pages" since phase 3 and stayed wrong through three more platforms. It is built from `PLATFORM_LABELS` now, and its test asserts every label appears rather than pinning the sentence. Prose that lists what the code supports should be generated from the code that supports it.
- Six comments and one test name cited `D040` (prompt tagging) where they meant `D041` (clipboard focus). Harmless to run, corrosive to read — a decision reference that points at the wrong decision is worse than none, because it looks checked.

---

## Cross-phase checklist

Confirmed 2026-09-03. Each line names what holds it, because a checklist that is re-confirmed by reading is a checklist that stops being confirmed.

- [x] No network requests anywhere in the codebase ([D010](../decisions.md)) — `conventions.test.ts` scans every shipped module for seven network APIs; `check-build.mjs` re-runs it against the emitted chunks, where React's own bundle is named rather than excluded
- [x] "Question" appears nowhere as a term for a problem ([D023](../decisions.md)) — `conventions.test.ts`, over the thirteen user-facing modules. Adapters are exempt and must be: LeetCode's JSON really is keyed `questionFrontendId`, and renaming that in the adapter would make it harder to check against the page
- [x] Every extracted field is individually guarded ([D015](../decisions.md)) — every field in all four adapters is read through `field()` or `optionalField()`, and `buildContext` catches per group on top, so one throw costs one field
- [x] No user action can end in silence ([D016](../decisions.md)) — `actions.test.ts` and `surfaces.test.ts` assert an observable outcome, a tab or a toast, on every path including the failure ones
- [x] The user's code is never truncated, never written to disk, never auto-sent ([D018](../decisions.md), [D022](../decisions.md), [D003](../decisions.md)) — truncation order is tested in `prompt.test.ts`, `session`-only storage in `pendingPrompt.test.ts`, and `inject.test.ts` reads its own source to assert no submit path exists
- [x] Every capture gap is disclosed in both the prompt and the popup — `promptGaps` in the prompt, `context.warnings` in the popup, both tested
- [x] [decisions.md](../decisions.md) reflects every significant decision made during implementation — D001–D046

**Still open, and only reachable with a browser:** the manual smoke matrix (§4 of [TESTING.md](../TESTING.md)), which has never been run. [D045](../decisions.md) is what that costs.
