# Testing — DSA Helper

How this extension is verified. Automated checks catch regressions in pure logic; the manual matrix catches everything that depends on a site we don't control.

**Maintenance:** when a phase of the [implementation plan](implementation-plan/implementation-plan-1.md) adds behaviour, add its checks here in the same change. When a bug escapes to a user, add the case that would have caught it.

**Last updated:** 2026-09-06

---

## 1. Automated checks

One command runs everything, in the order that fails fastest:

```bash
npm run verify
```

That is `typecheck` → `test` → `build` → `check:build`. Run it before every commit; it must pass before a release. The four steps are also available individually (`npm run typecheck`, `npm test`, `npm run build`, `npm run check:build`) — the last one needs a build to already exist.

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest, plain Node | `src/core/` — template rendering, `html2md`, truncation order, migrations, history semantics, URL resolver |
| Adapter | Vitest + jsdom + saved HTML fixtures | Each platform adapter against real captured pages, practice and contest |
| Contract | Vitest | Message-shape validation — every `Msg` variant round-trips |
| Conventions | Vitest, `src/conventions.test.ts` | Project-wide invariants: no network API anywhere ([D010](decisions.md)), no user-facing string says *question* ([D023](decisions.md)), no two entry points share a file name ([D045](decisions.md)) |
| **Artifact** | `tools/check-build.mjs` | The built `dist/`, against the manifest — see below |

### 1.1 Why the artifact is checked separately

Everything above reads the **source**. The build check reads what Chrome actually loads, and it exists because those are not the same thing.

Two entry modules were both named `index.ts`. CRXJS resolves chunks by basename, so the generated service worker imported the content script and the real background chunk was emitted but referenced by nothing — no keyboard shortcut, no context menu, no popup button and no migration ever ran. The typecheck passed. All 491 tests passed. The build log was clean and listed both chunks at plausible sizes. The popup still opened and still read the problem correctly, because it messages the content script directly.

Six phases shipped that way. Nothing that reads source could have seen it ([D045](decisions.md)).

So `npm run check:build` asserts things about `dist/` that no unit test can:

- the file the manifest names as the service worker really is the background entry, and still registers `onInstalled`, `contextMenus`, `onCommand` and `onMessage`
- no content script or the worker pulls in React ([D012](decisions.md))
- each entry's transitive closure is within its load-cost budget ([architecture.md](architecture.md) §7)
- nothing is emitted that nothing loads — an orphan chunk is usually the visible symptom of a wiring bug
- no first-party chunk contains a network API ([D010](decisions.md))
- the permission set is exactly the declared one, with no broad host match ([spec.md](spec.md) §10)

If it ever fails, read the failing line before rebuilding: every one of them names a real disagreement between what the source says and what was emitted.

Adapter tests opt into jsdom per file:

```ts
// @vitest-environment jsdom
```

**Fixtures are the highest-value asset here.** They are the only mechanism that detects a site redesign before users do. Store trimmed HTML (statement region + editor region), scrub account-identifying markup, and refresh on a schedule — a fixture that silently rots is worse than none.

### 1.2 End-to-end tests (Playwright)

Everything above reads source or the built artifact without a running browser. The e2e layer loads `dist/` as an unpacked extension in a real Chromium and drives its pages — the first automation of the manual rounds that previously had *none* ([D047](decisions.md)). It is **not** part of `npm run verify`: it needs a browser and a current build, so it runs on demand.

```bash
npm run build
npm run test:e2e
```

| Covers | Notes |
|---|---|
| Options page renders every section | The rendering §3f/§3g call out as having no test coverage |
| YouTube preview recomputes as its template is edited | Against the bundled sample problem |
| Prompt size counter escalates `ok → warn → over` | The [D018](decisions.md) sync-limit guard |
| Reset-to-default restores the shipped template | |
| Theme control drives `data-theme` across the six theme × system combinations | Each combination is screenshotted into the report and `e2e/output/screenshots/` |

**It runs on Microsoft Edge by default**, because that is the Chromium here that loads an unpacked extension: Chrome stable (137+) dropped the `--load-extension` switch, and Playwright's bundled Chromium will not start on this machine. Edge serves `chrome-extension://` pages identically. Override with `PW_CHANNEL` ([D047](decisions.md)). See [../e2e/README.md](../e2e/README.md) for the full harness notes and its limits — keyboard shortcuts and native context-menu items **cannot** be driven this way, so the shortcut surface stays a manual check (§3b, §4).

The suite above is the **offline `e2e` project**: hermetic, no network, safe as a gate. Everything so far reads a frozen input — source, the built artifact, or a bundled sample — so none of it can see the live site drift out from under a fixture. That is the failure a user hit ([implementation-plan-2](implementation-plan/implementation-plan-2.md)), and it needs a second, deliberately different lane.

#### The live lane — extraction drift canaries

A separate **`live` project** loads *real* problem pages and runs the extension's own extraction against them (the exact call the popup makes), then asserts the problem number survives. It is the one check that catches a site redesign before users do, and it is **opt-in** — never `npm run verify`, never a required check ([D047](decisions.md)).

```bash
npm run build
npm run test:e2e:live
```

| Canary | Asserts | Status |
|---|---|---|
| Codeforces `1352/A` | number is `1352A`, and it reaches the YouTube query | passes |
| CodeChef `FLOW001` | number is `FLOW001` | passes |
| LeetCode `two-sum` | number is `1` | passes |
| LeetCode `distinct-subsequences` | number is `115`, and it reaches the YouTube query | passes |

- **A red live run means "the site moved, go look" — not "the build is broken".** It is a pre-release and on-demand step. The offline `e2e` project may run on push; the `live` project runs manually (or, later, on a schedule), never as a required check.
- **Run it headed.** LeetCode sits behind a Cloudflare interstitial a headless browser cannot clear, and extensions need a real window. `PW_HEADLESS=1` will be challenged; a challenged page never hydrates and is reported **skipped**, not failed — an outage or a headless block can never redden the lane. Run it with a window (the default).
- **These caught a real bug.** The LeetCode rows began as `test.fail()` documenting the reported defect — every problem lost its number (the search came out `LeetCode Distinct Subsequences solution`, no `115`), because the JSON walker accepted a `titleSlug`-only page-state fragment that carried no `questionFrontendId`. That is fixed in `leetcode.ts` (`looksLikeQuestion` now requires a real question object), so the rows are ordinary passing guards; the `distinct-subsequences` row is the exact URL the user reported. This is the `test.fail()`-becomes-a-guard flow the lane is built around.

---

## 2. Loading the extension

```bash
npm run build
```

Then: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

After any rebuild, click the reload icon on the extension card. Changes to the service worker sometimes need the card's **service worker** link opened once to re-activate it.

For iterative work, `npm run dev` gives hot reload; the extension still has to be loaded from `dist/` once. `npm run dev` serves **no web page** — it rebuilds the extension. There is nothing to open at `localhost:5173`, and it is not needed for any check below.

### 2.1 Where errors show up

| What broke | Where to look |
|---|---|
| An action did nothing | `chrome://extensions` → the card → **service worker** link → Console |
| Extraction is wrong | The problem page's own DevTools console |
| The popup misbehaves | Right-click inside the popup → **Inspect** |
| ChatGPT insertion | The ChatGPT tab's DevTools console |

The service worker sleeps after ~30 s. Opening its console wakes it; a keystroke also wakes it, so a cold worker is not a bug.

### 2.2 Changing settings

Use the options page — the extension card's **Details** → **Extension options**, or the **Settings** link at the foot of the popup. Every toggle in §3 onward is there.

To reset everything to stock, or to set something quickly while testing, the **service worker console** still works:

```js
await chrome.storage.sync.remove(['settings', 'promptTemplate'])
```

No reload is needed after either: every action reads settings fresh.

---

## 2.3 Your first testing session

The checklists in §3 onward are grouped by the phase that introduced them, which is the right shape for a record and the wrong shape for a person sitting down to test. This is the order to actually work through, most informative first.

**Setup, once.**

```bash
npm run build
```

1. `chrome://extensions` → **Developer mode** on → **Load unpacked** → select `dist/`.
2. Open `chrome://extensions/shortcuts` and **bind `copy-prompt`** — it ships unbound on purpose (Chrome permits four suggested keys; we claim two, and leave the third to you). Confirm `Alt+Shift+Y` and `Alt+Shift+G` are listed.
3. Pin the extension to the toolbar, so the badge is visible.

**Round 0 — does it load at all?** (§3, ~2 min)
No red error on the extension card; the toolbar icon opens the popup; the options page opens.

**Round 1 — LeetCode extraction.** (§3a, ~5 min)
Open `leetcode.com/problems/two-sum/`. The badge should show a dot. Open the popup: title, number, difficulty, tags and the three section sizes should all be populated, and Code should name a source. **This is the spine — if it is wrong, everything downstream is too**, so stop and report it before going on.

**Round 2 — the YouTube action.** (§3b, ~5 min)
On that same problem, fire it three ways: `Alt+Shift+Y`, the popup button, the right-click menu. All three must open the *same* search, and it must match the preview the popup showed.

**Round 3 — the prompt.** (§3c, ~10 min) ← **the one that matters most**
Copy the prompt and **paste it into ChatGPT by hand**. Read the reply. Pick a problem you already know the answer to, so you can judge whether the review is any good. Prompt quality is the actual product and no test can check it.

**Round 4 — Ask ChatGPT.** (§3d, ~10 min)
`Alt+Shift+G`. The prompt should land in the composer **unsent**, with the banner. Check your conversation list afterwards: no new conversation should have been started.

**Round 5 — the other three platforms.** (§3e, ~10 min)
**GeeksforGeeks first** — its hashed CSS-module class names are the most likely thing in the project to be wrong. Then CodeChef, then Codeforces.

**Round 5b — options, history and diagnostics.** (§3f, ~10 min)
The options page has **no test coverage of its rendering at all**, so this is the round where eyes are the only check. Walk every section, then read a copied broken-page report and confirm your code is not in it.

**Round 6 — the failure paths.** (~10 min)
Fire a shortcut on `example.com` (expect a toast), on `chrome://extensions` (expect a `!` badge), and break the ChatGPT composer selector on purpose to prove the clipboard fallback fires (§3d).

**If you only have fifteen minutes:** Round 0, Round 1, Round 3. Those three tell you whether the thing works.

**When something is wrong,** open **Settings → Diagnostics**. It shows what the last extraction managed, field by field, including which selector matched and which fallback it had to reach for, and the **Copy a broken-page report** button puts all of that on your clipboard. That report is designed to be pasted as-is: it carries no problem text and none of your code. Add the exact URL and anything in the service worker console.

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

## 3d. Phase 5 acceptance — ChatGPT injection

Automated:

- [x] **Submit is gated, not absent** — auto-submit is an off-by-default opt-in ([D050](decisions.md#d050)). A source-reading test still forbids key-event and form submission outright; `shouldSubmit` is a tested predicate (true only when the insertion verified **and** the user opted in); and the send button is clicked only when enabled. The never-submit *default* of [D003](decisions.md#d003) is unchanged
- [x] The prompt is written to `chrome.storage.session` and nowhere else; `local` and `sync` stay empty ([D018](decisions.md#d018))
- [x] Claiming is one-shot: a second claim returns null and leaves nothing behind; an expired entry is deleted rather than left to be claimed later
- [x] Two problem tabs firing in quick succession get their own prompts (architecture.md §5.3)
- [x] Prompts expire at 5 minutes, are swept on `tabs.onRemoved`, and an unreadable entry is swept too
- [x] Insertion descends its three strategies and verifies by read-back; a composer that discards writes, and one that takes only part of the prompt, both count as failures
- [x] Whitespace differences do not count as failures — that is just ProseMirror splitting paragraphs
- [x] The prompt is inserted as text, never markup
- [x] ChatGPT content script 3.2 KB with no React; total `dist/` 290 KB against the 500 KB budget

Manual, in a real Chrome:

- [ ] **The prompt lands unsent (default)** — with auto-submit off (the default), `Alt+Shift+G` on a LeetCode problem opens ChatGPT with the prompt in the composer and the banner above it. **Nothing is sent.** Check the conversation list: no new conversation was started
- [ ] **Auto-submit, when opted in ([D050](decisions.md#d050))** — turn on *Send the prompt automatically* in options, fire `Alt+Shift+G`, and confirm the prompt is inserted and then sent once (one new message, no duplicate). Turn it back off and confirm the prompt again waits unsent
- [ ] **Auto-submit never fires on a failed insert** — with auto-submit on, break `COMPOSER_SELECTORS` so insertion fails; confirm the prompt goes to the clipboard and **nothing is sent**
- [ ] **Review banner toggle ([D051](decisions.md#d051))** — with the banner setting on (default), `Alt+Shift+G` shows the "review it, then press Enter" banner; turn it off in options and confirm the composer fills with no banner. With auto-submit on and succeeding, no banner shows either way
- [ ] **Break the selector on purpose** — edit `COMPOSER_SELECTORS` in `inject.ts` to something that cannot match, rebuild, and confirm the prompt reaches the clipboard with the *"press Ctrl+V"* toast. This is the path that runs the day ChatGPT redesigns, so it is the one worth proving
- [ ] **The selector is still right** — `COMPOSER_SELECTORS` carries a verified-on date of 2026-09-03 derived from spec.md §7.2 rather than from a live page. Confirm the first entry is the one that matches
- [ ] **Two tabs at once** — fire the action from two different problem tabs in quick succession; each ChatGPT tab must get its own prompt, not the same one twice
- [ ] **An ordinary visit inserts nothing** — open `chatgpt.com` by hand and confirm no prompt appears and no banner shows
- [ ] **A stale prompt is never resurrected** — fire the action, close the ChatGPT tab without using it, then open ChatGPT by hand. Nothing should be inserted
- [ ] **`autoInjectChatGpt: false`** — no tab opens and the prompt goes to the clipboard instead
- [ ] **`focusNewTab: false`** — the ChatGPT tab loads in the background, the prompt still lands, and the banner is waiting when you switch to it. Note that the *clipboard fallback* cannot work in this case, since an unfocused document cannot write the clipboard ([D041](decisions.md#d041)) — worth seeing what happens if both conditions hit at once
- [ ] **A very long prompt** — one near the size cap still inserts, and the composer is not truncated

---

## 3e. Phase 6 acceptance — Codeforces, CodeChef, GeeksforGeeks

Automated:

- [x] **No adapter imports from another** ([D043](decisions.md#d043)), checked against the source
- [x] Every URL form resolves: Codeforces problemset/contest/gym/submit, CodeChef practice and contest, GfG on both hosts — and no two adapters ever claim the same URL
- [x] Codeforces `1352A` collapses to one identity from both of its paths ([D024](decisions.md#d024))
- [x] Codeforces LaTeX arrives verbatim; the figure is named, not dropped; the `*NNNN` rating reads as the difficulty and stays out of the tags
- [x] **A Russian statement passes through untouched** — no detection, no translation, no warning ([D026](decisions.md#d026))
- [x] Codeforces problem pages return no code and record it as *expected*; a submit page warns, because an editor was expected there ([D014](decisions.md#d014))
- [x] CodeChef uses its JSON `body` as the markdown it already is; the DOM path converts rendered HTML instead
- [x] CodeChef's practice pattern is tried before its contest pattern, and the site's own sections are excluded
- [x] **Every GfG CSS-module selector is prefix-matched**, asserted structurally so an exact hash cannot be introduced (architecture.md §6.3)
- [x] GfG reports no problem number and falls back to the slug for a title
- [x] Content-script bundle 27 KB with no React; `dist/` 298 KB against the 500 KB budget

Manual, in a real Chrome. **The fixtures for these three are hand-built** ([todo.md](todo.md) #5), so this section is where they get checked against reality:

- [ ] **GeeksforGeeks first.** Its hashed CSS-module class names are the single most likely thing in the project to be wrong. Open a practice problem and confirm the statement, difficulty and tags all read
- [ ] **CodeChef practice** — confirm the page still ships a cached API response, and that the statement is the markdown body rather than the scraped DOM (the popup's Statement size is the tell: the two differ)
- [ ] **CodeChef contest** — the DOM fallback path, on a live contest problem
- [ ] **Codeforces problemset** — statement, samples, rating; check a **maths-heavy** problem and confirm the `$$$...$$$` reaches the prompt untouched
- [ ] **Codeforces contest and gym** — both forms resolve, and `1352A` from `/problemset/` and from `/contest/` show as the same problem
- [ ] **A Russian problem** — the statement arrives in Russian, with no warning about it
- [ ] **A figure-heavy Codeforces problem** — each image becomes `[Figure: … — not included]` and no image URL is embedded
- [ ] **No code on a Codeforces problem page** — the popup says code was not captured, and nothing reads as an error
- [ ] **A Codeforces submit page** — code *is* captured there
- [ ] Then update the fixtures from what you saw, and confirm the suite still passes unchanged

---

## 3f. Phase 7 acceptance — options, history and diagnostics

Automated:

- [x] **The redaction rule holds** — a report built from a context stuffed with sentinel strings contains none of them, not even a fragment, and the query string never survives into the reported URL (architecture.md §10.4)
- [x] Sizes and presence are reported in their place
- [x] The report separates `missing` from `absent (expected)`, so a Codeforces page with no editor is not reported as a fault
- [x] History records on every action; **both Codeforces URL forms collapse onto one entry**, keeping the most recently visited variant ([D024](decisions.md#d024))
- [x] A returning problem moves to the top; the limit caps the list; a limit of zero records nothing
- [x] Pausing stops recording without disturbing what is already there ([domain.md](domain.md) R17)
- [x] A history write that throws never stops an action ([D016](decisions.md#d016))
- [x] The last extraction is stored in `local` only — it carries the user's code ([D018](decisions.md#d018))
- [x] `setSettings` merges: a patch leaves untouched settings alone, and two changes inside one debounce window both survive
- [x] Theme applies, and `system` un-applies rather than setting a third value

Manual, in a real Chrome. **This section matters more than the others:** the options page is the first substantial UI in the project and **none of its rendering is covered by tests**. Everything it computes is core and tested; everything it draws needs eyes.

- [ ] **Every section renders** — Templates, Behaviour, History, Appearance, Diagnostics, Shortcuts, About. Nothing overlapping, nothing cut off
- [ ] **A template edit persists** — change the YouTube template, reload the page, confirm it stuck
- [ ] **And nothing else reset** — after that edit, check the history limit, the toggles and the prompt template are all as you left them. This is the bug phase 7 found: `setSettings` used to replace the whole settings object
- [ ] **Reset to default** restores the shipped template, and **Copy** puts it on the clipboard
- [ ] **The previews are live** — edit a template and watch the preview under it change. Before you have used the extension on anything it previews a bundled sample; after, it previews your last problem
- [ ] **The size warning fires** — paste ~7 KB into the prompt template and confirm the counter turns amber, then red past 8 KB
- [ ] **Theme** — set light on a dark system and dark on a light one; check both the options page *and* the popup
- [ ] **History de-duplicates live** — open `1352A` on Codeforces by `/problemset/problem/1352/A`, use an action, then by `/contest/1352/problem/A` and use one again. **One entry**, pointing at the second URL
- [ ] **Pause** — turn it on in the popup, visit a new problem, confirm nothing is added and the existing list is untouched
- [ ] **Forget one** (the × beside an entry) and **Clear history** both work
- [ ] **A history entry re-opens its problem** in a new tab
- [ ] **The diagnostics panel** shows the last problem, field by field, with fallback selector notes
- [ ] **Read the copied report.** Copy it, paste it into a text editor, and look: your code must not be in it, and neither must the problem statement. This is the one check nobody else can do for you
- [ ] **The known-breakage line** — hard to trigger deliberately; if you ever see a page where most fields fail, confirm the popup points at Diagnostics rather than looking merely broken

---

## 3g. Phase 8 acceptance — polish and release

Short, because most of phase 8 is the matrix in §4. These are the things phase 8 *changed*, and the one that matters is the first.

**The build wiring — do this first, it invalidates everything else if it fails.**

- [ ] `npm run verify` passes end to end
- [ ] Load `dist/` unpacked. On the extension card, the **service worker** link opens a console with **no errors**
- [ ] In that console, run `chrome.contextMenus` — it should be defined, not `undefined`
- [ ] Right-click on a problem page: the DSA Helper menu **appears**. Before phase 8 it did not, on any build
- [ ] `Alt+Shift+Y` on a problem page opens a search. Before phase 8 it did nothing
- [ ] All three popup buttons do something. Before phase 8 none of them did

> These six are not paranoia. Every one of them was broken in every build from phase 3 to phase 7, and the automated suite was green throughout ([D045](decisions.md)). If any fails, the emitted service worker is wrong again — check `dist/service-worker-loader.js` and see which chunk it imports.

**Strings.**

- [ ] Trigger an action on a page that is not a problem — say `example.com`. The toast names **all four** platforms, not just LeetCode
- [ ] Options → Shortcuts shows the two bound keys in a table and says `Copy prompt` is unbound
- [ ] Options → About shows no Privacy policy link and no contact address — correct until `REPO_SLUG` and `CONTACT_EMAIL` are set ([D046](decisions.md)). Once they are, both appear and both resolve
- [ ] Options → Diagnostics shows no "Open an issue" button, same reason

**Themes.** The options page has no test coverage of its rendering, and phase 8 added a table to it.

- [ ] Options page in Light, Dark, and Match-my-system, with the OS in each mode — six combinations. The `kbd` keys in the Shortcuts table must stay legible in all of them
- [ ] Popup in the same six. Check the history list and the warning line, which use the accent colours

**Package hygiene.**

- [ ] `dist/` contains no `.map` files and no fixtures
- [ ] `dist/manifest.json` version matches `package.json`

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
| Prompt inserted into ChatGPT (default) | Sits unsent in the composer; **auto-submit is off by default** | [D003](decisions.md) |
| Prompt inserted with auto-submit on | Sent once, only after the insertion verified; never on the clipboard fallback | [D050](decisions.md) |
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

The full submission checklist — store copy, permission justifications, screenshots, rollout — lives in [STORE-LISTING.md](STORE-LISTING.md) §8. This is the testing half of it.

- [ ] `npm run verify` passes — typecheck, tests, build, and the checks against `dist/`
- [ ] `npm run test:e2e:live` run headed; if a canary fails on **drift** (the page loaded but a field is now wrong), not an outage (skipped), re-capture the stale fixture ([todo.md](todo.md) #5) before release
- [ ] Full smoke matrix passes **against a packaged build**, not a dev build
- [ ] Every edge case in §4 verified
- [ ] [CHANGELOG.md](CHANGELOG.md) updated, `[Unreleased]` cut to a version
- [ ] Version bumped in `manifest.config.ts` and `package.json`
- [ ] Adapter selector "verified on" dates reviewed; anything older than ~90 days re-checked
- [ ] Staged percentage rollout configured — never ship to 100% at once ([D030](decisions.md))
