# Testing — DSA Helper

How this extension is verified. Automated checks catch regressions in pure logic; the manual matrix catches everything that depends on a site we don't control.

**Maintenance:** when a phase of the [implementation plan](implementation-plan/implementation-plan-1.md) adds behaviour, add its checks here in the same change. When a bug escapes to a user, add the case that would have caught it.

**Last updated:** 2026-09-02

---

## 1. Automated checks

Run all three before every commit; all three must pass before a release.

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest, plain Node | `src/core/` — template rendering, `html2md`, truncation order, migrations, history semantics, URL resolver |
| Adapter | Vitest + jsdom + saved HTML fixtures | Each platform adapter against real captured pages, practice and contest |
| Contract | Vitest | Message-shape validation — every `Msg` variant round-trips |

Adapter tests opt into jsdom per file:

```ts
// @vitest-environment jsdom
```

**Fixtures are the highest-value asset here.** They are the only mechanism that detects a site redesign before users do. Store trimmed HTML (statement region + editor region), scrub account-identifying markup, and refresh on a schedule — a fixture that silently rots is worse than none.

---

## 2. Loading the extension

```bash
npm run build
```

Then: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

After any rebuild, click the reload icon on the extension card. Changes to the service worker sometimes need the card's **service worker** link opened once to re-activate it.

For iterative work, `npm run dev` gives hot reload; the extension still has to be loaded from `dist/` once.

---

## 3. Phase 0 acceptance — scaffold

Current state. Everything below except the Chrome load is verified automatically.

- [x] `npm run typecheck` passes
- [x] `npm test` passes
- [x] `npm run build` produces `dist/` with no warnings
- [x] `dist/manifest.json` declares MV3, the four platform match patterns, `chatgpt.com`, all three commands, and `world: "MAIN"` on the editor bridge
- [x] Content-script and service-worker bundles contain **no React** (they are < 1 KB; React lives only in the popup/options chunk)
- [x] Total bundle well under the 500 KB budget (~197 KB)
- [x] Popup HTML mounts React, applies CSS, logs no console errors
- [ ] **Manual:** `dist/` loads unpacked in Chrome with no errors on the extension card
- [ ] **Manual:** the toolbar icon opens the popup on a LeetCode problem page
- [ ] **Manual:** the options page opens from the extension card
- [ ] **Manual:** `chrome://extensions/shortcuts` lists all three commands, with `Alt+Shift+Y` and `Alt+Shift+G` bound

---

## 3a. Phase 2 acceptance — LeetCode adapter

Automated, against the fixtures in `src/content/platform/__fixtures__/`:

- [x] 20 real LeetCode URLs resolve correctly, including every practice suffix (`/description/`, `/submissions/`, `/solutions/…`, `?envType=…`, `#anchor`), both contest forms, and the rejections (`leetcode.cn`, `/problemset/`, the phase-6 platforms)
- [x] All URL variants of one problem collapse to a single identity ([D024](decisions.md#d024)); a contest problem stays inside its contest
- [x] Practice: metadata from the embedded question JSON, statement split into problem / examples / constraints, no warnings
- [x] Contest: the same extraction carried by the DOM fallback alone, with the fallback hits recorded in diagnostics
- [x] Premium: `isLocked` true, metadata still complete, and **no** "couldn't read the statement" warning ([D027](decisions.md#d027))
- [x] All four code layers in order; the DOM scrape re-orders Monaco's absolutely-positioned lines and is flagged as possibly incomplete
- [x] Bridge refuses a wrong nonce, a wrong origin, a wrong source window, a stale reply, an oversized buffer; silence resolves null rather than hanging ([D020](decisions.md#d020))
- [x] Constraints keep their exponents — `5 * 10^4` does not become `5 * 104` ([D026](decisions.md#d026))
- [x] Content-script bundle ~18 KB with no React ([D012](decisions.md#d012))

Manual, on a real logged-in account. Open the popup on each and read the fields:

- [ ] **Practice** (e.g. `/problems/sort-an-array/`) — title, number, difficulty, tags and statement sizes all populated; code shows a source and a length
- [ ] **Contest** — the same, with Kind reading `Contest`
- [ ] **Premium** — "Premium problem — statement not available to you", with title, number and difficulty still shown and no warning list
- [ ] **Code provenance** — with the editor focused and a buffer typed, the reported source is `site storage` or `the editor`, not `the page (visible lines only)`
- [ ] **Language** — switch the editor to a second language and confirm the reported language follows the visible buffer ([D025](decisions.md#d025))
- [ ] **Selection fallback** — select text anywhere on the page with no editor buffer and confirm it is picked up as `your selection`
- [ ] While here, note the actual `localStorage` key shape ([todo.md](todo.md) #6) and whether the fixtures still match the live markup ([todo.md](todo.md) #5)

---

## 3b. Phase 3 acceptance — YouTube action

Automated:

- [x] All three surfaces map onto the same three action ids, and every action is reachable from both the command list and the menu
- [x] The default template renders `LeetCode 912 Sort an Array solution`, and the search URL matches spec.md §7.1 exactly
- [x] `openInNewTab` and `focusNewTab` both honoured; a new tab opens beside the problem, not at the end of the strip
- [x] The full ladder — context → page title → URL slug → the raw URL — with the query **never** empty for any template input ([D016](decisions.md#d016))
- [x] Unsupported page toasts; an injection-refusing page falls back to the badge; the two unbuilt actions say so rather than doing nothing
- [x] Debounce holds at 750 ms, per tab *and* per action, and is forgotten when the tab closes ([D017](decisions.md#d017))
- [x] The toast survives the `executeScript` round-trip, renders into a closed shadow root, and uses `textContent` — an `<img onerror>` in a problem title stays text
- [x] Service-worker chunk 4.9 KB, no `html2md`, no React

Manual, in a real Chrome:

- [ ] **All three surfaces agree** — on one LeetCode problem, fire `Alt+Shift+Y`, the popup's **Search YouTube** button, and the right-click menu item. All three must open the same search ([D013](decisions.md#d013))
- [ ] **The preview matches** — the string shown in the popup is exactly what YouTube receives ([D006](decisions.md#d006))
- [ ] **Shortcut collisions** — `Alt+Shift+Y` and `Alt+Shift+G` do nothing unwanted inside LeetCode's editor. **Settle this before the defaults ship**
- [ ] **Badge follows SPA navigation** — click from one problem to another without a reload; the badge stays on. Navigate to `leetcode.com/problemset/`; it goes off
- [ ] **New-tab behaviour** — with `openInNewTab` off, the search replaces the current tab; with `focusNewTab` off, it opens in the background
- [ ] **Unsupported page** — fire the shortcut on `example.com`: a toast, not silence
- [ ] **Un-injectable page** — fire it on `chrome://extensions`: the toolbar badge shows `!` (no toast is possible there)
- [ ] **Held shortcut** — hold `Alt+Shift+Y` down; exactly one tab opens
- [ ] **Degraded search** — disable the content script (or fire immediately on a cold load) and confirm the search still opens *and* a toast explains it used the page title
- [ ] **Context menu scope** — the DSA Helper menu appears on a LeetCode problem and is absent on an unrelated site

---

## 3c. Phase 4 acceptance — prompt builder and clipboard

Automated:

- [x] A full capture carries problem, examples, constraints, code in a language-tagged fence, and the review instructions, with no placeholder left unsubstituted
- [x] Every gap is *stated*: three missing sections give three explicit notes; difficulty, tags and language degrade to named text rather than to blanks (spec.md §8)
- [x] A locked problem states the Premium condition where the statement would be, and still carries the link and every readable field ([D027](decisions.md#d027))
- [x] No code gives the paste placeholder, never an empty fence; `includeCode: false` reads as a choice instead of a failure
- [x] Truncation cuts the statement, then examples, and **never** the code or the constraints — going over budget instead, and saying so ([D022](decisions.md#d022))
- [x] Quoted text is wrapped in labelled tags, and a statement containing `</problem_statement>` cannot close its own wrapper ([D040](decisions.md#d040))
- [x] The clipboard falls back to `execCommand` when the modern API refuses, leaves no textarea behind, and reports failure rather than claiming a copy
- [x] `copyInPage` survives the `executeScript` round-trip, tested by rebuilding it from its own source

Manual, in a real Chrome:

- [ ] **Paste a generated prompt into ChatGPT and judge the reply.** Prompt quality is the actual product and no test can check it. Do this for a problem you already know the answer to, so the reply can be judged
- [ ] **All three surfaces agree** — copy from the popup, the menu and a bound shortcut on the same problem; the clipboard must hold the same text each time. The popup takes a different delivery route ([D041](decisions.md#d041)) and is the one to watch
- [ ] **Bind the shortcut first** — `copy-prompt` ships unbound (Chrome allows only four suggested keys), so set one at `chrome://extensions/shortcuts`
- [ ] **The confirmation is accurate** — on a problem with no captured code, the toast says to paste it in; on a Premium problem it says the statement is locked
- [ ] **A long solution** — paste a 400-line file into the editor and confirm the statement shortens while the code arrives whole
- [ ] **Plain HTTP** — copy on a non-HTTPS page, where the modern clipboard API is unavailable and the `execCommand` fallback has to carry it
- [ ] **`includeCode: false`** — turn it off and confirm the prompt says the omission was deliberate

---

## 4. Manual smoke matrix

From phase 3 onward, run in full before every release. 4 platforms × 2 page kinds × 3 trigger surfaces × 3 actions.

### Trigger surfaces

Every action must behave **identically** whether fired from the keyboard shortcut, the popup button, or the right-click menu — they share one dispatch path ([D013](decisions.md)), and divergence means that path was bypassed.

### Per platform

| Platform | Practice URL | Contest URL |
|---|---|---|
| LeetCode | `/problems/<slug>/` | `/contest/<c>/problems/<slug>/` |
| Codeforces | `/problemset/problem/<id>/<idx>` | `/contest/<id>/problem/<idx>` |
| CodeChef | `/problems/<CODE>` | `/<CONTEST>/problems/<CODE>` |
| GeeksforGeeks | `/problems/<slug>/` | — |

For each: does the popup show the right title, identifier and difficulty? Does the YouTube query read sensibly? Does the prompt contain statement, examples, constraints and code?

### Edge cases that must be checked explicitly

These encode decisions, and a regression here is a decision being silently undone.

| Case | Expected | Decision |
|---|---|---|
| Codeforces problem page | No code captured, reported as normal — **not** an error | [D014](decisions.md) |
| LeetCode Premium problem | "Premium problem — statement not available to you"; both actions still work | [D027](decisions.md) |
| Maths-heavy Codeforces problem | LaTeX passes through **verbatim** | [D026](decisions.md) |
| Problem with a diagram | `[Figure: … — not included]`, never a silent drop | [D026](decisions.md) |
| Russian-language Codeforces statement | Relayed unchanged, no warning | [D026](decisions.md) |
| Same problem via both Codeforces URL forms | **One** history entry, bumped to top | [D024](decisions.md) |
| Several language buffers open | The language **currently on screen** is what gets sent | [D025](decisions.md) |
| Solution longer than the prompt budget | Statement trimmed, examples trimmed, **code intact** | [D022](decisions.md) |
| ChatGPT composer selector broken (break it on purpose) | Falls back to clipboard with an explanatory toast; prompt not lost | [D003](decisions.md) |
| Prompt inserted into ChatGPT | Sits unsent in the composer. **Never auto-submits** | [D003](decisions.md) |
| Any action on an unsupported page | A toast explaining why — never silence | [D016](decisions.md) |
| Shortcut held down | One tab opens, not twenty | [D017](decisions.md) |
| SPA navigation between two problems | Re-detects without a reload | — |
| History paused | Nothing recorded; existing entries untouched | [D029](decisions.md) |

### Performance spot-checks

Against the budgets in [architecture.md](architecture.md) §7:

- [ ] Content script adds no perceptible delay to problem-page load
- [ ] Keystroke to tab opening feels instant (< 400 ms)
- [ ] No console noise on a problem page
- [ ] Bundle under 500 KB; no React in content scripts or the service worker

---

## 5. Release checklist

- [ ] All three automated checks pass
- [ ] Full smoke matrix passes
- [ ] Every edge case in §4 verified
- [ ] [CHANGELOG.md](CHANGELOG.md) updated, `[Unreleased]` cut to a version
- [ ] Version bumped in `manifest.config.ts` and `package.json`
- [ ] Adapter selector "verified on" dates reviewed; anything older than ~90 days re-checked
- [ ] Staged percentage rollout configured — never ship to 100% at once ([D030](decisions.md))
