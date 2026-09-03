# Implementation Plan 1 — DSA Helper v1

**Covers:** the whole of v1, phases 0–8 (spec.md §13 milestones M0–M8).
**Status:** phases 0–3 complete (manual Chrome checks from phases 0, 2 and 3 outstanding). Phase 4 is next.
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
- [x] `TESTING.md` — that matrix as a repeatable checklist — created 2026-09-03, maintained per phase
- [x] `CHANGELOG.md` — created 2026-09-03, maintained per phase
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
