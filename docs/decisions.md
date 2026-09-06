# DSA Helper — Decision Log

**A living document.** This is the historical record of *why* the project is the way it is. `spec.md` says what to build, `architecture.md` says how it's structured, `domain.md` says what the words mean — this file says **why those answers were chosen and what was given up.**

**Last updated:** 2026-09-06

---

## How to use this file

**Reading it:** if you're about to change something and can't tell why it's built the way it is, the answer should be here. If a decision looks wrong, read its *Consequences* before overturning it — most of the awkward-looking choices are paying for something.

**Adding to it.** Record a decision when it:

- constrains future work (something later becomes hard or impossible),
- was contested — a real alternative was rejected,
- would be re-litigated by someone who didn't know the reasoning, or
- reverses or narrows an earlier decision.

**Don't record:** naming a variable, picking a library version, a bug fix, or anything already fully explained in the other three documents. This file holds *reasoning*, not specification — link to the other documents rather than restating them.

**Changing a decision:** never edit a decision's substance in place and never delete one. Add a new entry, and mark the old one `Superseded by D0xx` with the date. The wrong turn is often the most useful thing in the file.

**Status vocabulary:** `Accepted` · `Superseded by D0xx` · `Deprecated` (no longer applies, nothing replaced it) · `Proposed` (agreed in principle, not yet in effect) · `Revisit` (accepted, but with a known trigger for reconsideration).

---

## Index

| ID | Decision | Status | Date |
|---|---|---|---|
| **Product & scope** ||||
| [D001](#d001) | Four platforms; problem pages only | Accepted | 2026-09-01 |
| [D002](#d002) | Three trigger surfaces, no on-page floating button | Accepted | 2026-09-01 |
| [D003](#d003) | Prompt is injected into ChatGPT but never sent | Accepted (narrowed by [D050](#d050)) | 2026-09-01 |
| [D004](#d004) | ChatGPT is the only AI destination in v1 | Accepted | 2026-09-01 |
| [D005](#d005) | Both texts are user-owned templates | Accepted | 2026-09-01 |
| [D006](#d006) | YouTube query is configured, not edited per problem | Accepted | 2026-09-01 |
| [D007](#d007) | Contest pages get no special handling | Accepted (extended 2026-09-02) | 2026-09-01 |
| [D008](#d008) | Clipboard action and history included in v1 | Accepted | 2026-09-01 |
| [D009](#d009) | Name "DSA Helper"; icons generated, not sourced | Accepted | 2026-09-01 |
| [D050](#d050) | Auto-submit to ChatGPT as an opt-in, off by default | Accepted | 2026-09-06 |
| **Architecture** ||||
| [D010](#d010) | No backend, no network calls of our own | Accepted | 2026-09-01 |
| [D011](#d011) | React + TypeScript + Vite | Accepted | 2026-09-01 |
| [D012](#d012) | React confined to popup and options | Accepted | 2026-09-01 |
| [D013](#d013) | Service worker owns all orchestration | Accepted | 2026-09-01 |
| [D014](#d014) | Layered code capture, with provenance | Accepted | 2026-09-01 |
| [D015](#d015) | Per-field extraction isolation | Accepted | 2026-09-01 |
| [D016](#d016) | Degrade, never dead-end | Accepted | 2026-09-01 |
| [D017](#d017) | Prompt handoff is per-tab, one-shot, memory-only | Accepted | 2026-09-01 |
| [D018](#d018) | Storage split three ways; code never written to disk | Accepted | 2026-09-01 |
| [D019](#d019) | Versioned settings with a migration chain | Accepted | 2026-09-01 |
| [D020](#d020) | MAIN-world bridge is read-only and authenticated | Accepted | 2026-09-01 |
| [D021](#d021) | Host permissions required, not optional | Revisit | 2026-09-01 |
| [D022](#d022) | Statement is truncated before code, never after | Accepted | 2026-09-01 |
| **Domain & semantics** ||||
| [D023](#d023) | "Problem", never "question" | Accepted | 2026-09-02 |
| [D024](#d024) | Identity is platform + identifier, never the URL | Accepted | 2026-09-02 |
| [D025](#d025) | The open editor language is the solution attempt | Accepted | 2026-09-02 |
| [D026](#d026) | Statement fidelity: maths verbatim, figures named, language untouched | Revisit | 2026-09-02 |
| [D027](#d027) | Inaccessible problems are a named condition, not a failure | Revisit | 2026-09-02 |
| [D028](#d028) | No modelling of multi-part or interactive problems | Accepted | 2026-09-02 |
| [D029](#d029) | Nothing survives uninstall; templates are copyable | Accepted | 2026-09-02 |
| **Operations & release** ||||
| [D030](#d030) | Staged rollout, fixture-gated releases | Accepted | 2026-09-01 |
| [D031](#d031) | Diagnostics and clipboard bug reports instead of telemetry | Accepted | 2026-09-01 |
| [D032](#d032) | No remote selector configuration | Revisit | 2026-09-01 |
| [D033](#d033) | Content-relay position stated publicly | Accepted | 2026-09-02 |
| [D048](#d048) | Licence is PolyForm Strict, not MIT — source-available, no forking | Accepted | 2026-09-06 |
| [D049](#d049) | Non-affiliation disclaimer; framed "nothing leaves your device" | Accepted | 2026-09-06 |
| **Implementation** ||||
| [D034](#d034) | `html2md` converts a DOM element, not an HTML string | Accepted | 2026-09-03 |
| [D035](#d035) | Fence escaping is narrow by design | Accepted | 2026-09-03 |
| [D036](#d036) | Inaccessibility is a field on `ProblemContext` | Accepted | 2026-09-03 |
| [D037](#d037) | Adapters are handed the page, they never reach for it | Accepted | 2026-09-03 |
| [D038](#d038) | Stored buffers are chosen by open language, not recency | Accepted | 2026-09-03 |
| [D039](#d039) | Page detection lives in the service worker, not the page | Accepted | 2026-09-03 |
| [D040](#d040) | Quoted problem text is tagged, not fenced | Accepted | 2026-09-03 |
| [D041](#d041) | The clipboard write happens in whichever surface has focus | Accepted | 2026-09-03 |
| [D042](#d042) | `openInNewTab` governs the YouTube result only | Accepted | 2026-09-03 |
| [D043](#d043) | Adapter-common code lives in `shared.ts`, not in an adapter | Accepted | 2026-09-03 |
| [D044](#d044) | Diagnostics report the last extraction, not a live one | Accepted | 2026-09-03 |
| [D045](#d045) | Entry points are uniquely named, and the built artifact is checked | Accepted | 2026-09-03 |
| [D046](#d046) | Outward-facing URLs live in one module and degrade to nothing | Accepted | 2026-09-03 |
| [D047](#d047) | End-to-end tests run on the built extension, on Edge (+ live drift lane) | Accepted | 2026-09-06 |

---

## Product & scope

<a id="d001"></a>
### D001 — Four platforms; problem pages only

**Decision.** Support LeetCode, Codeforces, CodeChef and GeeksforGeeks, on practice **and** contest problem pages. GfG articles, LeetCode Explore, and `leetcode.cn` are out.

**Context.** Every supported page type is a separate parser against a site we don't control, and each one has to be maintained forever.

**Reasoning.** Problem pages are where the need actually occurs — someone reading an article isn't stuck on a problem they're trying to solve. Contest pages were included because their problems are indistinguishable from practice problems once a contest ends, and excluding them would have blocked a large share of Codeforces.

**Alternatives.** Problem pages only (rejected: excludes most of Codeforces, whose problems mostly live under contest URLs); everything on the domain with best-effort fallback (rejected: unbounded maintenance for pages the tool can't serve well).

**Consequences.** Eight page-type parsers to maintain, not four. Each new platform is a new file plus fixtures. The tool is silent on article pages, which some users will read as it being broken.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §3

<a id="d002"></a>
### D002 — Three trigger surfaces, no on-page floating button

**Decision.** Keyboard shortcut, toolbar popup, and right-click context menu. No widget injected into the page.

**Reasoning.** The shortcut serves the actual use case (hands on keyboard, mid-problem). The popup is where discoverability and configuration live. The context menu costs almost nothing. A floating button was rejected specifically because it puts pixels on someone else's page — the most common reason a coding-site extension gets uninstalled.

**Consequences.** All three surfaces must behave identically, which is why orchestration is centralised ([D013](#d013)). Discoverability rests entirely on the toolbar icon; a first-run hint may be needed if people don't find the shortcuts.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §9

<a id="d003"></a>
### D003 — Prompt is injected into ChatGPT but never sent

**Decision.** Open ChatGPT, type the prompt into the composer, stop. The user reads it and presses Enter.

**Context.** Four ways to get text into ChatGPT: URL parameter, auto-inject and auto-send, auto-inject and stop, or clipboard.

**Reasoning.** The URL parameter is the most robust but caps out around a few thousand characters — a full statement plus code exceeds that routinely. Auto-sending removes the user's chance to notice that the code captured was the wrong language, or that the statement is truncated. Stopping short is also a **security control**: the prompt contains text scraped from a page we don't control, and a human reading it before sending is the last line of defence against prompt injection.

**Alternatives.** URL query parameter (rejected: truncation); auto-send (rejected: no review step, and it makes the extension the sender rather than the user); clipboard only (kept as the fallback, [D008](#d008)).

**Consequences.** Depends on ChatGPT's composer internals, which is the single most fragile part of the project. Requires a verified-insertion check and a clipboard fallback. Accepted as the cost of the feature working at all.

**Narrowed by [D050](#d050) (2026-09-06):** the never-submit behaviour remains the **default**, but a user may now opt in to auto-submit. The security reasoning above is why that opt-in is off by default, warned, and gated on verified insertion.

**Status.** Accepted (narrowed by [D050](#d050)) · 2026-09-01 · see [spec.md](spec.md) §7.2, [architecture.md](architecture.md) §13, [D050](#d050)

<a id="d004"></a>
### D004 — ChatGPT is the only AI destination in v1

**Decision.** One destination. The code is structured so adding Claude or Gemini is a new adapter plus a settings picker, but neither ships.

**Reasoning.** Each destination is a separate fragile DOM integration ([D003](#d003)). Shipping three would triple the most breakable surface before knowing whether anyone wants the other two.

**Consequences.** Users of other assistants are served only by the clipboard action. Adding a destination later requires a settings migration for the new preference.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §12

<a id="d005"></a>
### D005 — Both texts are user-owned templates

**Decision.** The YouTube query and the ChatGPT prompt are editable templates with named variables, each resettable to default.

**Reasoning.** What makes a good review request is personal — some people want complexity analysis, others want debugging, others want to be told the insight and left to code it. Guessing wrong makes the tool useless; letting people fix it costs a settings page.

**Alternatives.** Fixed prompt with section toggles (rejected: less flexible for no less work); several named preset modes (rejected: more UI, more state, more to maintain — a single editable template covers it).

**Consequences.** The prompt template can approach the per-item sync storage limit, forcing split keys and a size guard. Users can break their own prompt, so reset-to-default is mandatory. Template rendering must handle every variable being absent.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §8

<a id="d006"></a>
### D006 — YouTube query is configured, not edited per problem

**Decision.** The query comes from the template with no per-problem editing step. The popup shows it read-only before you click.

**Reasoning.** The action's entire value is that it's one keystroke. An edit box before every search destroys that, to fix a problem YouTube's own search box already fixes after you land.

**Alternatives.** Editable preview before opening (rejected: adds a step to the fastest path); both with a toggle (rejected: a setting to work around a step that shouldn't exist).

**Consequences.** A bad query means editing the template or fixing it on YouTube. The read-only preview exists so the query is never a surprise.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §7.1

<a id="d007"></a>
### D007 — Contest pages get no special handling

**Decision.** Contest problem pages behave exactly like practice pages: no block, no warning, no confirmation. The ethical position is stated plainly in the README instead.

**Extended 2026-09-02:** live and archived contests are also not distinguished — no countdown parsing, no liveness detection anywhere in the codebase.

**Context.** Using AI assistance during a live contest violates LeetCode's, Codeforces' and CodeChef's rules. The tool could block it, warn about it, or say nothing.

**Reasoning.** The product decision is to inform rather than police. A user who wants to break contest rules can open ChatGPT in another tab regardless, so a block buys integrity theatre at the cost of breaking the tool on archived contest problems — which are just practice. The liveness extension follows from the same logic: detection would be per-platform, fragile, and would only enable a restriction that was already declined.

**Alternatives.** Block with settings override; warn once and proceed; hard block. All rejected as restricting a choice the user is entitled to make, and as requiring detection code that would break.

**Consequences.** The project accepts a reputational risk — being called a cheating tool — mitigated only by stating the position plainly. Zero contest-detection code, which is also a real maintenance saving.

**Status.** Accepted · 2026-09-01, extended 2026-09-02 · see [spec.md](spec.md) §11, [domain.md](domain.md) R26

<a id="d008"></a>
### D008 — Clipboard action and history included in v1

**Decision.** Ship "copy prompt to clipboard" as a first-class action, and a list of recently visited problems.

**Reasoning.** The clipboard action is not a nice-to-have: it's the terminal fallback whenever ChatGPT injection fails ([D003](#d003)), so it must exist anyway — exposing it as its own action costs one button. History is cheap and covers a real pattern: returning to a problem attempted yesterday.

**Consequences.** History creates the only persistent record of user activity, which forces the "identity only, never statements, never code" constraint and the surrounding controls ([D029](#d029)).

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §7.3, §9.2

<a id="d009"></a>
### D009 — Name "DSA Helper"; icons generated, not sourced

**Decision.** Named DSA Helper. Placeholder icons generated locally by a script in `tools/`, not downloaded from a free-icon site.

**Reasoning.** Free icon resources almost always carry attribution requirements that follow the project into a store listing, and downloading binaries from untrusted hosts isn't worth it for a placeholder. A generated icon has no licence attached at all.

**Consequences.** Icons are geometric rather than designed; final artwork drops into the same four paths with no other change.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §2

---

## Architecture

<a id="d010"></a>
### D010 — No backend, no network calls of our own

**Decision.** The extension never originates an HTTP request. No servers, no accounts, no API keys, no analytics, no telemetry.

**Context.** The project is intended for the Chrome Web Store at potentially large scale.

**Reasoning.** This is the **load-bearing decision of the whole project.** It makes scaling free (a million users cost what a hundred do), makes the privacy claim structurally true rather than a promise, and makes Web Store review straightforward. Everything else is downstream of it.

**Consequences.** No usage data, ever — product decisions are made blind. Breakage must be found through fixtures and user reports rather than error rates. Any future feature needing a server inverts this and must be decided deliberately, not arrived at. Constrains [D031](#d031) and [D032](#d032).

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §2, §10

<a id="d011"></a>
### D011 — React + TypeScript + Vite

**Decision.** Manifest V3, React + TypeScript, bundled with Vite via `@crxjs/vite-plugin`.

**Alternatives.** Plain JS with no build step (rejected: no type safety across a message-passing boundary where shape errors are the likely bug class); TypeScript + Vite without React (viable, but the options page has enough stateful form UI to justify it).

**Consequences.** A build step between editing and testing. Bundle size needs watching, which is why [D012](#d012) exists.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §4

<a id="d012"></a>
### D012 — React confined to popup and options

**Decision.** Content scripts and the service worker ship zero React. Separate bundles; content scripts import nothing from the UI layer.

**Reasoning.** Content scripts run on every problem page, forever, on every user's machine including slow ones. Shipping a UI framework into that path buys nothing — there is no UI on the page ([D002](#d002)) — and costs load time on someone else's site, which is how an extension gets blamed for making a site feel slow.

**Consequences.** A hard architectural boundary that must not be crossed casually; any shared code lives in the framework-free core.

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §7

<a id="d013"></a>
### D013 — Service worker owns all orchestration

**Decision.** Commands, menus, action dispatch, prompt building and tab creation all live in the service worker. The popup is a renderer.

**Reasoning.** Two of the three trigger surfaces ([D002](#d002)) never open a popup, so popup-hosted logic would need duplicating. One dispatch path means the surfaces cannot drift apart in behaviour.

**Consequences.** All logic must survive the service worker being killed after ~30 s idle: no in-memory state, listeners registered synchronously at top level, handoffs through storage ([D017](#d017)).

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §4.1, §5.1

<a id="d014"></a>
### D014 — Layered code capture, with provenance

**Decision.** Try, in order: the site's own stored buffer, the editor's model via an injected page script, a DOM scrape of rendered lines, then the user's text selection. Record which one succeeded and show it to the user.

**Context.** All four sites use virtualised editors, so the obvious approach — reading the DOM — silently returns only the visible lines.

**Reasoning.** A truncated solution produces a confidently wrong review, which is worse than no review. The ordering puts complete sources first and marks the incomplete one as untrustworthy rather than excluding it.

**Alternatives.** Editor API only (rejected: single point of failure); selection only (rejected: adds a step to every use); no code at all (rejected: it's the core value).

**Consequences.** The most site-specific code in the project, four layers per adapter. Provenance must be carried through to the UI and the prompt. On Codeforces the expected outcome is *no code*, which is correct behaviour and must not be treated as an error.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §6.4

<a id="d015"></a>
### D015 — Per-field extraction isolation

**Decision.** Every extracted field has its own guard. A failure yields a recorded gap, never an exception out of the adapter.

**Context.** All users run identical code against sites that redesign without notice, so any breakage is global and simultaneous, with store review sitting between diagnosis and fix.

**Reasoning.** This converts the realistic worst case from "the extension is broken for everyone" to "the prompt is missing the word Medium". It's the difference between an emergency and a scheduled fix.

**Consequences.** More verbose extraction code. Every consumer must tolerate every field being absent — the invariant that only platform and link are guaranteed. Pairs with [D016](#d016).

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §6.2

<a id="d016"></a>
### D016 — Degrade, never dead-end

**Decision.** Both actions are defined as a descent through reduced information, ending in a clipboard fallback and an explanation. No code path may end with the user having pressed a key and nothing happening.

**Reasoning.** Silent failure is the worst outcome for a keyboard-driven tool: the user can't tell whether they missed the key, the page is unsupported, or the tool is broken.

**Consequences.** Every failure needs a defined next rung and a message. More paths to test — hence the manual smoke matrix.

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §8.2

<a id="d017"></a>
### D017 — Prompt handoff is per-tab, one-shot, memory-only

**Decision.** A prepared prompt is keyed to the specific tab opened for it, deleted the moment it's claimed, expires after ~5 minutes, and is never written to disk.

**Context.** Refines the original spec, which described a single global slot.

**Reasoning.** Users fire the action from several problem tabs in quick succession; a global slot lets the wrong prompt reach the wrong tab, or a later prompt overwrite an earlier one. Deleting on claim means opening ChatGPT manually an hour later never resurrects an old prompt. Memory-only because the prompt contains the user's code.

**Consequences.** Requires tab-lifecycle cleanup and expiry sweeping. Adds a debounce so holding the shortcut doesn't open twenty tabs.

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §5.3

<a id="d018"></a>
### D018 — Storage split three ways; code never written to disk

**Decision.** Settings and templates sync across devices; history stays local; the pending prompt is memory-only. The user's code is never written to synced or local storage.

**Reasoning.** Templates are worth carrying between machines and are small. History is disposable, per-device, and would burn the sync write quota. Code is the most sensitive thing the extension touches and has no reason to outlive the action using it.

**Consequences.** Three storage areas with different semantics and quotas. A sync size guard is needed because the prompt template can approach the per-item limit ([D005](#d005)).

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §5.2

<a id="d019"></a>
### D019 — Versioned settings with a migration chain

**Decision.** Stored data carries a schema version; upgrades run ordered migrations; unknown future versions are left untouched rather than overwritten.

**Reasoning.** Matters far more after publishing than during development: users skip versions, and synced data can arrive from a machine running an older build. A user whose carefully written template silently resets writes a bad review.

**Consequences.** Every stored-shape change needs a migration and a fixture of the old shape.

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §5.4

<a id="d020"></a>
### D020 — MAIN-world bridge is read-only and authenticated

**Decision.** The script that reads editor state runs in the page's own JavaScript world, does nothing but read, and exchanges messages with a per-load nonce and origin checks. Responses are length-capped and treated as untrusted.

**Context.** Reading a virtualised editor's full buffer ([D014](#d014)) requires being in the page's world, where the page can see and impersonate our code.

**Reasoning.** If the bridge only ever reads and never evaluates, a hostile page gains nothing by talking to it.

**Consequences.** More protocol code than a direct call. A timeout is required so silence falls through to the next capture layer instead of hanging.

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §6.4, §9.1

<a id="d021"></a>
### D021 — Host permissions required, not optional

**Decision.** The five platform hosts and `chatgpt.com` are required permissions, granted at install, rather than optional ones requested on first use.

**Reasoning.** The extension is completely inert without them, so a deferred grant flow trades an honest install dialog for a confusing first-run failure.

**Alternatives.** Optional host permissions with per-site prompting — genuinely better for install-funnel conversion and the privacy story, at the cost of a first-run grant flow.

**Consequences.** A noisier install dialog listing five sites, which is the largest single drop-off point in the install funnel.

**Status.** **Revisit** — reconsider if install conversion proves to be a problem after publishing · 2026-09-01 · see [architecture.md](architecture.md) §9.3

<a id="d022"></a>
### D022 — Statement is truncated before code, never after

**Decision.** When a prompt exceeds its size cap, trim the statement first, then the examples. **Never** the user's code.

**Reasoning.** The user's code is the one part the AI can't get anywhere else, and reviewing half a function produces confidently wrong feedback. The statement is partly recoverable from the link.

**Consequences.** A pathologically long solution could crowd out the statement almost entirely. Truncation points must be marked so the model knows text was cut.

**Status.** Accepted · 2026-09-01 · see [spec.md](spec.md) §7.2

---

## Domain & semantics

<a id="d023"></a>
### D023 — "Problem", never "question"

**Decision.** One term across all documents, identifiers and user-facing strings: **problem**. "Question" is retired.

**Context.** The original spec used both interchangeably, including a central `QuestionContext` type alongside "problem page" and "problem statement".

**Reasoning.** All four platforms say "problem". "Question" is ambiguous here — the user also asks a *question* of ChatGPT, which is a different thing.

**Consequences.** Rename applied across spec and architecture (`QuestionContext` → `ProblemContext`, "Recent questions" → "Recent problems"). Any future code using "question" for the platform entity is a defect.

**Status.** Accepted · 2026-09-02 · see [domain.md](domain.md) §3.1

<a id="d024"></a>
### D024 — Identity is platform + identifier, never the URL

**Decision.** A problem is identified by its platform and that platform's identifier. All URL variants collapse to one identity. History holds one entry per problem, moved to the top on return. Identity never crosses platforms.

**Context.** Codeforces `1352A` is reachable at two paths; LeetCode adds `/description/`, `/submissions/` and query suffixes.

**Reasoning.** URL-based identity would make history a wall of near-duplicates. Cross-platform identity would need a curated equivalence dataset that can't exist without a backend ([D010](#d010)).

**Alternatives.** One entry per URL (rejected: visible duplicates); pure chronological log (rejected: a 20-item list could be three problems repeated); de-duplicate without re-ordering (rejected: the problem you're working on now sinks down the list).

**Consequences.** Each adapter must produce a stable identifier — including GfG, which has no number and must use its slug. Entries store the most recently visited URL variant.

**Status.** Accepted · 2026-09-02 · see [spec.md](spec.md) §5.1, [domain.md](domain.md) R19–R20

<a id="d025"></a>
### D025 — The open editor language is the solution attempt

**Decision.** When several language buffers exist for one problem, the one currently open in the editor is the solution attempt. No picker.

**Reasoning.** What's on screen is what the user is thinking about. Choosing by most-recently-edited can send code the user isn't looking at, producing a review that appears to be about the wrong thing.

**Alternatives.** Most recently edited (rejected: surprising); prompt the user when ambiguous (rejected: adds a step to a one-keystroke flow); send all buffers (rejected: long prompt, unfocused review).

**Consequences.** A user who switched languages and expects a review of the other file gets the visible one. Predictable, but occasionally not what was wanted.

**Status.** Accepted · 2026-09-02 · see [spec.md](spec.md) §6.4

<a id="d026"></a>
### D026 — Statement fidelity: maths verbatim, figures named, language untouched

**Decision.** LaTeX passes through unmodified. Figures become `[Figure: … — not included]`. Statements are relayed in whatever language the page serves, with no detection or translation.

**Reasoning.** Constraints expressed in maths are exactly what a review must not get wrong, and ChatGPT reads LaTeX natively — so verbatim is both most accurate and cheapest. Figures cannot travel in text at all; naming their absence is the difference between a model that says "I can't see the diagram" and one that reasons confidently without it. Language detection on short mathematical text is unreliable, and ChatGPT is multilingual anyway.

**Alternatives.** Convert LaTeX to plain text (rejected: lossy beyond simple inequalities); drop figures silently (rejected: exactly the failure the disclosure rule exists to prevent); embed figure URLs as images (rejected: ChatGPT can't fetch them, so it reads as breakage).

**Consequences.** Review quality is genuinely capped for figure-heavy problems — the placeholder makes the ceiling visible, it does not raise it. Prompts containing raw LaTeX look noisy to a human skimming them.

**Status.** **Revisit** — if figure-heavy problems prove common in practice, the ceiling may justify a different approach · 2026-09-02 · see [spec.md](spec.md) §6.5

<a id="d027"></a>
### D027 — Inaccessible problems are a named condition, not a failure

**Decision.** Paywalled or login-gated problems (LeetCode Premium) are detected and reported as their own state — "statement not available to you" — distinct from an extraction failure. Both actions remain available.

**Reasoning.** Without this, every Premium problem produces a false "the extension is broken" impression for something working exactly as intended. At scale that's a steady stream of support mail and bad reviews. The YouTube search is arguably *most* valuable here, since the user can't read the statement at all.

**Alternatives.** Treat as an ordinary capture gap (rejected: the false-breakage impression is the whole problem); block the ChatGPT action (rejected: overrides a judgement the user can make).

**Consequences.** One more per-adapter detection to maintain. If paywall detection proves fragile it degrades to an ordinary capture gap — a regression, not a break.

**Status.** **Revisit** — depends on detection proving reliable in practice · 2026-09-02 · see [spec.md](spec.md) §6.6

<a id="d028"></a>
### D028 — No modelling of multi-part or interactive problems

**Decision.** One problem, one statement, one attempt. Subtasks, follow-ups and interactive protocols are treated as prose inside the statement.

**Reasoning.** An interactive problem's statement says it's interactive; a follow-up is a paragraph. The AI reads and adjusts. Explicit modelling would add fields across all four adapters for something the prompt already conveys.

**Consequences.** No structured handling if these cases later need distinct treatment.

**Status.** Accepted · 2026-09-02 · see [domain.md](domain.md) §11 U12

<a id="d029"></a>
### D029 — Nothing survives uninstall; templates are copyable

**Decision.** Accept that removing the extension erases everything. Mitigate with a one-click copy button on each template, and state the behaviour plainly in options.

**Reasoning.** A user may spend real effort on a prompt template. Full export/import is a proper feature — file handling, validation, version tolerance — where a copy button reuses the clipboard path that already exists for the copy-prompt action.

**Alternatives.** Document only, no copy (rejected: leaves an authored asset unrecoverable); full settings export/import (rejected: disproportionate for v1); export including history (rejected: history is the least valuable thing to preserve).

**Consequences.** Backup is manual and easy to forget. Settings still sync between signed-in Chrome installs while the extension is installed.

**Status.** Accepted · 2026-09-02 · see [spec.md](spec.md) §9.4

---

## Operations & release

<a id="d030"></a>
### D030 — Staged rollout, fixture-gated releases

**Decision.** Every release goes out as a percentage rollout. Adapter tests run against saved HTML fixtures in CI and gate the release. Each adapter records when its selectors were last verified.

**Context.** All users run identical code against sites we don't control, so a bad adapter change breaks everyone at once ([D015](#d015)).

**Reasoning.** A bad release reaching 5% of users is a bug report; reaching 100% is a reputational event. Fixtures are the only mechanism that can detect a site redesign before users do.

**Consequences.** Fixtures must be captured early and refreshed on a schedule, or they rot into a false sense of safety. Releases take longer to reach everyone.

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §10.3, §12

<a id="d031"></a>
### D031 — Diagnostics and clipboard bug reports instead of telemetry

**Decision.** No analytics. Instead: a diagnostics panel that reports field-by-field extraction results for the current page, and a "report a broken page" button that builds a redacted blob — never statement text, never user code — and opens a prefilled issue.

**Reasoning.** Support burden grows linearly with users, but adding telemetry would invert [D010](#d010) and turn a zero-cost extension into an operational service with a real privacy policy. Self-service diagnostics scale to any number of users with no infrastructure.

**Consequences.** Breakage is discovered only when someone reports it. No aggregate view of which adapters are failing or how often.

**Status.** Accepted · 2026-09-01 · see [architecture.md](architecture.md) §10.4

<a id="d032"></a>
### D032 — No remote selector configuration

**Decision.** Selectors ship in the extension. No fetching them from a remote file to patch breakage without a store review.

**Context.** The obvious fix for global-simultaneous breakage ([D015](#d015)) is remote config, since store review sits between diagnosis and fix.

**Reasoning.** It would introduce the first network call and destroy the "nothing leaves the browser" property that the privacy posture and store review both rest on ([D010](#d010)). Remotely delivered behaviour also sits close enough to the remote-code prohibition to invite review friction.

**Consequences.** Every breakage waits for a release and a review. Mitigated by [D015](#d015) (breakage degrades rather than breaks) and [D030](#d030) (a fast-patch path).

**Status.** **Revisit** — only if blast radius proves intolerable in practice, and then as strictly schema-validated data with a bundled fallback and an honestly updated privacy policy · 2026-09-01 · see [architecture.md](architecture.md) §10.5

<a id="d033"></a>
### D033 — Content-relay position stated publicly

**Decision.** The README and store listing carry a short statement of the project's position on moving platform-published content into a third-party AI service: it automates a copy-paste the user could do by hand, content moves only on explicit user action, nothing is stored or redistributed, and the user's own agreements with each platform still bind them.

**Context.** Neither the spec nor the architecture originally addressed copyright or platform terms, and the core act of the extension is exactly this relay.

**Reasoning.** Having a prepared, honest answer costs one paragraph. Not having one when a platform or a reviewer asks is a much worse position.

**Alternatives.** Formal legal review (deferred: proportionate for a commercial product, not for a free tool); say nothing (rejected: no prepared answer).

**Consequences.** A public position that has to stay accurate — if the extension ever stores or transmits content, this statement must change first.

**Status.** Accepted · 2026-09-02 · see [README.md](../README.md), [spec.md](spec.md) §11

---

## Implementation

Decisions taken while building, rather than while designing. They are listed separately because their provenance matters: each was forced by contact with real code, not chosen up front.

<a id="d034"></a>
### D034 — `html2md` converts a DOM element, not an HTML string

**Decision.** `html2md(root: Element)` walks a live DOM subtree. It does not accept, or parse, serialized HTML. Its unit tests run under jsdom rather than in plain Node.

**Context.** [architecture.md](architecture.md) §12 asks that `core/` stay free of `document` and `chrome.*` so it tests without a browser. A markdown converter is the one piece of `core/` that cannot honestly meet that bar — it has to parse HTML somehow.

**Reasoning.** Every caller is an adapter that already holds the element; serializing it and re-parsing would be wasted work and a second chance to get the parse wrong. The alternative — a hand-written HTML parser inside `core/` — is a large, permanently fragile surface that has to survive whatever malformed markup four different sites emit, which is precisely the work a browser has already done correctly. Taking an `Element` uses only an ambient DOM *type*, so the module still imports nothing.

**Alternatives.** Hand-rolled string parser (rejected: large surface, real bug risk, no upside); pull in a parser dependency (rejected: bundle cost in a content script for a job the page's own parser already did); require adapters to pre-convert (rejected: moves the same problem into four files instead of one).

**Consequences.** The phase 1 exit criterion "tests in plain Node" holds for every `core/` module except `html2md`, which declares `@vitest-environment jsdom`. `core/` remains free of `chrome.*` without exception. If `html2md` is ever needed somewhere without a DOM, an explicit parse step becomes that caller's problem, not this module's.

**Status.** Accepted · 2026-09-03 · see [implementation-plan-1.md](implementation-plan/implementation-plan-1.md) phase 1

<a id="d035"></a>
### D035 — Fence escaping is narrow by design

**Decision.** `html2md` escapes exactly two things in extracted text: runs of three or more backticks, and runs of three or more tildes. It does **not** escape `_`, `*`, `^`, `\`, `$` or any other markdown metacharacter.

**Context.** [architecture.md](architecture.md) §9.2 requires that a statement cannot close our code block and inject sibling instructions into the prompt. The obvious implementation is a general-purpose markdown escaper.

**Reasoning.** A general escaper would destroy [D026](#d026). `_`, `^`, `\` and `$` are the working vocabulary of LaTeX, and a Codeforces statement is dense with them — escaping `a_1 \cdot a_2` into `a\_1 \\cdot a\_2` is exactly the lossy plain-text approximation D026 exists to forbid. Only a fence-forming run is actually dangerous, because only a fence can terminate the block that quotes the statement. Escaping the rest buys no security and costs the fidelity the whole feature rests on.

**Alternatives.** Escape all markdown metacharacters (rejected: breaks D026 outright); escape nothing and rely on a longer outer fence (rejected: the outer fence is chosen by the prompt template, which the user can edit); strip fences instead of escaping them (rejected: silently deletes content, and a statement legitimately containing three backticks is a code sample worth keeping).

**Consequences.** Anyone tightening the escaper later must not widen it. The tests in `html2md.test.ts` assert both directions — that fences *are* escaped and that TeX underscores are *not* — so a well-meaning broadening fails the suite rather than quietly degrading every maths-heavy prompt. Fenced code blocks are handled separately, by choosing a fence longer than any backtick run they contain.

**Status.** Accepted · 2026-09-03 · see [architecture.md](architecture.md) §9.2, [D026](#d026)

<a id="d036"></a>
### D036 — Inaccessibility is a field on `ProblemContext`

**Decision.** `ProblemContext` carries `isLocked: boolean`. [spec.md](spec.md) §5 is amended to include it.

**Context.** [D027](#d027) requires that a paywalled problem be reported as its own condition rather than as an extraction failure, and §6.6 describes the resulting popup text and link-only prompt. The data model in §5 had no field to carry that state, so the two sections contradicted each other.

**Reasoning.** Without a field, the locked state can only be inferred from the shape of a failure — a null statement plus a populated title — which is exactly the ambiguity D027 exists to remove, and would leave a genuinely broken selector indistinguishable from a Premium problem. A boolean set deliberately by the adapter that detected the paywall is unambiguous at every downstream point.

**Alternatives.** Infer it from null fields (rejected: recreates the ambiguity); encode it as a `warnings[]` string (rejected: warnings are prose for humans, and matching on their text is brittle); a wider `status` enum (deferred: there is one named condition today, and a boolean that later becomes an enum is a smaller mistake than an enum with one meaningful member).

**Consequences.** Every adapter must set the field, defaulting to `false`. The prompt builder branches on it in phase 4, and the popup in phase 3.

**Status.** Accepted · 2026-09-03 · see [spec.md](spec.md) §5, §6.6, [D027](#d027)

<a id="d037"></a>
### D037 — Adapters are handed the page, they never reach for it

**Decision.** `extractMeta` and `extractCode` take an `ExtractEnv` — the URL, the `Document`, the page's `localStorage`, and callbacks for the editor bridge and the current selection — instead of reading `document`, `location` and `localStorage` off the global scope. The adapter interface in [spec.md](spec.md) §6.2 is amended accordingly, and gains `canonicalUrl(url)` and `isReady(env)`.

**Context.** The interface as sketched took no arguments, which means every adapter reads ambient globals. A fixture test then has to install a whole page into the test's own globals, one fixture at a time, and undo it afterwards.

**Reasoning.** Ambient globals make the most site-coupled code in the project the hardest part to test, which is backwards — the adapters are exactly where a fixture suite has to be cheap enough that nobody skips writing one. Injection also removes the shared-state hazard between fixtures, lets `localStorage` probing be tested without touching a real store, and makes the MAIN-world bridge stubbable, so layer 2 of the code ladder is testable without a page at all. The adapter still reads nothing but the page; what changed is who hands it over.

**Consequences.** One more parameter through the extraction path, and a small `makeEnv()` in the content script that builds the real one. `warnings` and `diagnostics` ride on the env as sinks, which is what makes the per-field guards ([D015](#d015)) composable. `canonicalUrl` is needed because `ProblemContext.url` must survive a failed `extractMeta`; `isReady` is what the retry backoff polls.

**Status.** Accepted · 2026-09-03 · see [spec.md](spec.md) §6.2, [implementation-plan-1.md](implementation-plan/implementation-plan-1.md) phase 2

<a id="d038"></a>
### D038 — Stored buffers are chosen by open language, not recency

**Decision.** When `localStorage` probing turns up several saved buffers for one problem, the one whose language matches the language currently open in the editor wins. Failing that, the longest buffer wins and the user is told the choice was a guess. [spec.md](spec.md) §6.4's "most recently written plausible value" is amended to this.

**Context.** The spec asked for the most recently written value. The Storage API exposes no write time, and LeetCode stores none alongside the buffer, so recency is not knowable from inside the page.

**Reasoning.** Rather than approximate recency badly, use the signal that is actually available and is already the right answer: [D025](#d025) says the buffer open in the editor is the solution attempt, and the open language is recorded in a global storage key. That makes layer 1 agree with layer 2 by construction rather than by luck. The remaining tie — several buffers, no language signal — is decided by length because it is stable across runs, and the guess is surfaced as a warning rather than hidden.

**Alternatives.** Sort keys lexicographically and take the last (rejected: arbitrary, and silently so); return every buffer and let the prompt carry all of them (rejected: D025 already refused this); skip layer 1 when ambiguous (rejected: throws away a usually-correct capture to avoid an occasionally-wrong one).

**Consequences.** A solver who has just switched language, before the site has written the new global key, may get the previous buffer. The warning says the choice was a guess, so the capture is visible before it is sent.

**Status.** Accepted · 2026-09-03 · see [spec.md](spec.md) §6.4, [D025](#d025)

<a id="d039"></a>
### D039 — Page detection lives in the service worker, not the page

**Decision.** "Is this a supported problem page?" is answered in the service worker by a pure URL match on `chrome.tabs.onUpdated` / `onActivated`. The content script keeps no supported-page flag, patches no history methods and runs no observer. [spec.md](spec.md) §6.1 is amended accordingly.

**Context.** §6.1 specified page-side detection recomputed on `popstate`, patched `pushState`/`replaceState`, and a debounced observer on `document.title`.

**Reasoning.** The `pushState` half of that cannot work. A content script runs in an isolated world with its own `window`, so a patched `history.pushState` there never sees the page's own calls — only a MAIN-world script would, and the MAIN-world script is read-only by [D020](#d020), which patching a page method plainly is not. Meanwhile the service worker gets SPA navigation for free: Chrome fires `tabs.onUpdated` with the new `url` on a history state change, no `webNavigation` permission needed. So the worker's version is both the only one that fully works and the cheaper one — it removes an observer from every problem page, and the page-load budget in [architecture.md](architecture.md) §7 is one of the tighter constraints in the project. Zero observers beats a well-scoped one.

**Consequences.** `platformForUrl` had to move somewhere the worker can import without dragging an adapter — and therefore `html2md` — into a code path with a 20 ms wake budget; hence `core/urls.ts`, which `manifest.config.ts` now also reads its match patterns from, so the three lists cannot drift. Detection is URL-only, so a page that is a problem page at a URL we do not recognise is invisible to the badge; that is the same blindness `matches()` already has, not a new one.

**Alternatives.** Keep the observer for the title and drop only the history patching (rejected: the observer then earns its cost on nothing the worker doesn't already know); request `webNavigation` (rejected: a new permission on the install dialog for something `tabs` already provides, against [D021](#d021)'s posture); patch history from the MAIN world (rejected: contradicts D020 outright).

**Status.** Accepted · 2026-09-03 · see [spec.md](spec.md) §6.1, [architecture.md](architecture.md) §7, [D020](#d020)

<a id="d040"></a>
### D040 — Quoted problem text is tagged, not fenced

**Decision.** Extracted statement, examples and constraints are wrapped in named tags — `<problem_statement>`, `<examples>`, `<constraints>` — and the default prompt states what they mean. Any occurrence of those closing tags inside the extracted text is entity-escaped. [spec.md](spec.md) §8's default template is amended to carry the disclosure line.

**Context.** [architecture.md](architecture.md) §9.2 requires extracted content to be "fenced and labeled in the prompt as quoted problem material, not as instructions". Statements are attacker-controllable in principle, and that text goes into a prompt the user sends to ChatGPT.

**Reasoning.** A literal markdown fence cannot be the mechanism. Fencing a statement renders its LaTeX, lists and headings as inert literal text — the lossy plain-text approximation [D026](#d026) exists to forbid — and statements contain their own fenced example blocks, which would close ours from the inside. Named tags survive nested markdown untouched, cost nothing in fidelity, and are the boundary convention models are actually trained to read as data. Escaping rather than stripping a closing tag found in the text matters because a problem *about* XML is an ordinary problem, and deleting from a statement is the failure mode D026 rules out.

**Alternatives.** A markdown fence per section (rejected: destroys D026 and collides with the statement's own fences); no delimiter, relying on the section headings (rejected: a heading is not a boundary, and the statement can write its own headings); strip closing tags instead of escaping them (rejected: silently deletes content).

**Consequences.** The default template gains a line explaining the tags, which a user editing their template can delete — the wrapping survives, the explanation does not. This is one mitigation among four in §9.2, and the load-bearing one remains that the extension never auto-submits ([D003](#d003)).

**Status.** Accepted · 2026-09-03 · see [architecture.md](architecture.md) §9.2, [spec.md](spec.md) §8, [D026](#d026)

<a id="d041"></a>
### D041 — The clipboard write happens in whichever surface has focus

**Decision.** The service worker builds the prompt; the *write* is done by the surface that fired the action. The keyboard command and the context menu inject the writer into the page. The popup writes it itself, from a `PROMPT_RESULT` reply. [spec.md](spec.md) §7.3 is amended.

**Context.** §7.3 said the write happens in the content script, on the grounds that service workers have no clipboard. True, but incomplete.

**Reasoning.** `navigator.clipboard.writeText` requires the calling document to be focused, and while the popup is open the page is **not** the focused document — the write throws "Document is not focused" there. The `execCommand` fallback needs a focused document too, so it does not rescue this. The permission that would lift the requirement, `clipboardWrite`, is deliberately not requested ([spec.md](spec.md) §10, [D021](#d021)'s posture), and asking for it to avoid a fifteen-line branch would be a poor trade on the install dialog. So the surface holding the user's gesture has to do the write: for two surfaces that is the page, for one it is the popup. Everything before delivery — context, settings, template, truncation — is the same code either way, so the prompts cannot differ.

**Alternatives.** Add `clipboardWrite` (rejected: a new permission for a UI convenience); have the popup close first and let the page write (rejected: races the close, and a failed write after the popup is gone has nowhere to report); always write from the popup (rejected: two of three surfaces never open one).

**Consequences.** `runAction` takes a `returnPrompt` option and the `Msg` union gains `PROMPT_RESULT`. The single-dispatch-path property of [D013](#d013) is preserved in the part that matters — what the prompt contains — while delivery varies by surface, which it must.

**Status.** Accepted · 2026-09-03 · see [spec.md](spec.md) §7.3, §4.1, [D013](#d013)

<a id="d042"></a>
### D042 — `openInNewTab` governs the YouTube result only

**Decision.** The ChatGPT action always opens a new tab. `openInNewTab` applies to the YouTube search alone; `focusNewTab` applies to both. [spec.md](spec.md) §5 is amended to say so beside the setting.

**Context.** §7.1 renders the YouTube search "per `openInNewTab` / `focusNewTab`", while §7.2 step 5 says flatly "Open `https://chatgpt.com/` in a new tab". The setting's name suggests it governs both, and nothing said otherwise.

**Reasoning.** Navigating the current tab to ChatGPT would destroy the problem page — the page the prompt was just built from, and the page the user returns to after reading the review. Worse, the extraction that fills the prompt happens in that tab, so "reuse the tab" and "have something to send" are in direct conflict. The YouTube case has no such problem: the search is terminal, and a solver who wants to stay in one tab is expressing a real preference about their tab strip.

**Alternatives.** Honour the setting for both (rejected: closes the problem page mid-action); rename the setting to `openYouTubeInNewTab` (rejected: it is stored data, so renaming costs a migration for a label — worth doing if the options page proves confusing, not before); a second setting for ChatGPT (rejected: a toggle whose only sensible value is `true`).

**Consequences.** A user who turns the setting off still gets a new ChatGPT tab, which looks inconsistent until the options page explains it — so the options page must ([todo.md](todo.md) #12). `focusNewTab: false` remains meaningful for ChatGPT, and is the more interesting case: the tab loads in the background, the prompt still lands in the composer, and the review banner is waiting when the user switches to it.

**Status.** Accepted · 2026-09-03 · see [spec.md](spec.md) §5, §7.1, §7.2

<a id="d043"></a>
### D043 — Adapter-common code lives in `shared.ts`, not in an adapter

**Decision.** The four-layer code ladder, the language table, the heading-based statement splitter and the small DOM helpers moved out of the LeetCode adapter into `content/platform/shared.ts`. **No adapter imports from another.** What stays in an adapter is what only that site knows: its selectors, its JSON shape, its paywall markers, its URL grammar.

**Context.** Phase 2 built all of that inside `leetcode.ts` because there was one adapter. Phase 6 added three more, and its exit criterion is that no adapter imports from another.

**Reasoning.** The alternative — Codeforces importing `runCodeLadder` from `leetcode.ts` — makes a LeetCode edit able to break Codeforces, which is exactly the blast-radius coupling [architecture.md](architecture.md) §8.3 is built to prevent. The line between the two files is drawn on *knowledge*, not on convenience: `shared.ts` may not contain a single site's name, and an adapter may not contain anything a second site would also need. That test is what keeps the split from eroding into a junk drawer.

**Alternatives.** A base-class or mixin per adapter (rejected: inheritance for four objects that share no state); duplicate the ladder four times (rejected: a capture bug would then need fixing four times, and would be fixed in three); re-export the shared pieces from `leetcode.ts` so the tests need no change (rejected: that *is* an adapter importing from another, wearing a hat).

**Consequences.** One more module in the extraction subsystem, and its tests live in `shared.test.ts` rather than being reached through one platform's fixtures — which is what keeps it honest about being platform-neutral. The Codeforces adapter is the standing proof the split is real: it does **not** use the shared splitter, because its statements are structured in the DOM and are frequently in Russian, so matching English heading text would work on roughly half the site.

**Status.** Accepted · 2026-09-03 · see [architecture.md](architecture.md) §6.1, §8.3, [spec.md](spec.md) §4.2

<a id="d044"></a>
### D044 — Diagnostics report the last extraction, not a live one

**Decision.** The options page's diagnostics panel shows the **most recent** extraction, stored in `chrome.storage.local` by whichever action ran it. It does not re-run extraction against a tab. `diagnostics` rides on the `CONTEXT_RESULT` message rather than inside `ProblemContext`, and `GET_CONTEXT_FOR_POPUP` — unused since it was written — is removed from the contract.

**Context.** [architecture.md](architecture.md) §10.4 describes the panel as running "the resolver + adapter against the current tab".

**Reasoning.** An options page has no current tab. It is itself a tab, so `tabs.query({active: true})` returns the options page; and Chrome may open it in its own window, so "the last focused window" is no better. Every workaround — scan every tab for a supported URL, ask the user to pick one — adds a step to the moment when someone is already confused about why a page did not work. Storing the extraction when it happens inverts that: the user hits the problem, opens settings, and the report is already there. It is also the more honest artefact, since it reports what actually happened rather than what happens on a re-run that may now succeed.

**Alternatives.** Re-run against the first supported tab found (rejected: silently reports a different page than the one that failed); a diagnostics button in the popup instead (rejected: the popup is small and this is a rare, deliberate act); put `diagnostics` in `ProblemContext` (rejected: it is data about the *extraction*, not about the problem, and it would then ride into every prompt path that carries a context).

**Consequences.** One `local` key, overwritten per action, holding one problem's worth of extraction — which includes the user's code, so it is `local` and never `sync` ([D018](#d018)). A user who has never used the extension sees an empty panel, which the copy says plainly. The panel is one action behind if the page has since changed.

**Status.** Accepted · 2026-09-03 · see [architecture.md](architecture.md) §10.4, [spec.md](spec.md) §4.1, [D031](#d031)

<a id="d045"></a>
### D045 — Entry points are uniquely named, and the built artifact is checked

**Decision.** No two extension entry points may share a file name. `background/index.ts` and `content/platform/index.ts` are renamed to `serviceWorker.ts` and `contentScript.ts`. `tools/check-build.mjs` runs after every build and verifies the emitted `dist/` against the manifest — that the service worker really is the background chunk, that no content script pulls in React, that nothing emitted is unreachable, that the permission set is exactly the declared one. `npm run verify` runs typecheck, tests, build and that check as one command.

**Context.** Found while walking the phase 8 release checklist. CRXJS names each emitted chunk after its entry's *basename* and then rewrites the manifest by looking the entry up under that name. Both entries were called `index.ts`, so both resolved to the same chunk and the content script won: the generated `service-worker-loader.js` imported `contentScript`, and the real background chunk was emitted but referenced by nothing.

Every background listener therefore failed to register — `chrome.commands`, `chrome.contextMenus`, the popup's `RUN_ACTION` handler, `onInstalled` and its migration. Both keyboard shortcuts, the entire right-click menu, all three popup buttons and the badge were inert. This had been true since phase 3, when the background listeners were first written.

**Reasoning.** Nothing in the project could see it. The typecheck passes — the source is correct. All 491 unit tests pass — they import modules directly and never go near a chunk. The build log is clean and prints both chunks at plausible sizes. The popup even opens and reads the problem correctly, because it messages the content script itself and never involves the worker. The only observer that could have caught it is one that reads `dist/` and asks whether the file Chrome is told to load is the file we meant, which nothing did.

That is the general lesson, and it is why the fix is two things rather than one. Renaming the entries removes this instance. It does not remove the class: any future build-tool behaviour that rewrites paths, splits chunks or resolves by name can produce an artifact that disagrees with the source, and no source-level test will ever notice. So the artifact gets its own checks, and they assert identity (is the worker the background code?) rather than existence (did a file get emitted?).

The unique-names rule is kept anyway, as the cheaper of the two defences and the one that reads as intent: `serviceWorker.ts` and `contentScript.ts` say what they are, where two files named `index.ts` said only where they live.

**Alternatives.** Configure `rollupOptions.output.entryFileNames` to include the directory (rejected: fights CRXJS for control of names it also reads back, and the failure mode if the two disagree is this same bug wearing a different hat); rely on the manual smoke matrix to catch it (rejected: it would have — on the first check of phase 0 — but only because a human loaded the extension, and the whole point is that six phases shipped without one); check only the size of the emitted chunks (rejected: both chunks were plausibly sized, which is exactly why the build log looked fine).

**Consequences.** `npm run verify` is the command to run before any commit that touches the build, and before packaging. The build check is the only test in the project that requires a prior `npm run build`, so it lives in `tools/` rather than the Vitest suite, and its failures name the manifest field at fault. `src/conventions.test.ts` additionally asserts the unique-name rule at source level, so the cheap check runs on every test invocation and the expensive one on demand. A dead chunk in `dist/` is now a build failure rather than a curiosity, since an orphan is usually the visible symptom of a wiring bug like this one.

**Status.** Accepted · 2026-09-03 · see [architecture.md](architecture.md) §7, [D012](#d012), [todo.md](todo.md) #11

<a id="d046"></a>
### D046 — Outward-facing URLs live in one module and degrade to nothing

**Decision.** The repository URL, the issue tracker, the published privacy policy and the contact address are constants in `core/links.ts`, exposed through functions that return `null` while the underlying value is unset. Every consumer renders nothing rather than a dead link. They are compile-time constants, not settings.

**Context.** Phase 8 has to publish a licence, a privacy-policy URL and a contact address, and the options page has carried `const ISSUE_URL: string | null = null` since phase 7 with a comment deferring it. The repository does not exist yet and the contact alias has not been created, so two values are known-unknown at the moment the release documents need them.

**Reasoning.** The alternative is to substitute placeholder strings and fix them at submission, which puts the deadline on human memory at exactly the point where a missed edit ships a `github.com/OWNER/repo` link to every user. Making the absence typed instead makes it structural: the value is `null`, the function returns `null`, the link does not render, and there is nothing to forget. Filling it in later is a one-line change in one file, which is also what makes it safe to defer.

Settings storage was considered and rejected. These describe the project, not the user — they are identical for every install, they must not sync between machines, and a user editing where bug reports go is a phishing vector, not a feature.

The privacy policy points at the repository copy rather than a hosted page because there is no site to host it on, and a policy that lives beside the code it describes cannot silently diverge from it.

**Alternatives.** Environment variables read at build time (rejected: adds a build-config surface, and a missing variable fails at build rather than degrading); leave the values as `TODO` strings (rejected: a string is truthy, so the link renders and points nowhere); put them in `manifest.config.ts` (rejected: the options page cannot read arbitrary manifest fields conveniently, and the manifest is not where prose belongs).

**Consequences.** `pendingReleaseValues()` reports what is still unset, so "we forgot" is answerable by a function rather than by re-reading a checklist. Two items in [todo.md](todo.md) narrow from decisions to substitutions. The About section of the options page and the Diagnostics "Open an issue" button appear only once their values exist, which means the first published build may ship without them — acceptable, because the diagnostics report is still built and still copyable, and the link was only ever a convenience on top.

**Status.** Accepted · 2026-09-03 · see [D031](#d031), [todo.md](todo.md) #1, #4

<a id="d047"></a>
### D047 — End-to-end tests run on the built extension, on Edge

**Decision.** A Playwright suite in `e2e/` loads the built `dist/` as an unpacked extension in a real Chromium and drives the extension's own pages. It is separate from `npm run verify` — it needs a browser and a current build — and runs via `npm run test:e2e`. The default browser channel is **Microsoft Edge**, overridable with `PW_CHANNEL`. Its screenshots are report attachments, not committed pixel baselines.

**Context.** Everything the project tested read either source (Vitest) or the built artifact statically (`check:build`, [D045](#d045)). Nothing ever ran the extension. The options page in particular ships real rendering with no coverage of it at all, and [TESTING.md](TESTING.md) §3f/§3g leans entirely on a human walking every section in six theme combinations. That is exactly the kind of check that rots when nobody has fifteen minutes.

**Reasoning — why Edge is the default.** An unpacked extension only loads on some Chromiums, and on this setup the obvious two do not:

- **Google Chrome stable** launches but ignores the extension: Chrome 137 (2025) removed the `--load-extension` / `--disable-extensions-except` command-line switches as an anti-malware measure, and there is no flag to bring them back on the stable channel.
- **Playwright's bundled Chromium** fails to start on this Windows machine with a side-by-side/VC++ runtime error, before any extension question arises.
- **Edge** loads it, exposes the MV3 service worker to Playwright, and serves `chrome-extension://` pages identically. For exercising the extension's *own* surfaces — options, popup, the storage-backed logic behind them — Edge is a faithful Chromium target. So it is the default, and CI or another machine can point `PW_CHANNEL` at the bundled `chromium` (which loads extensions fine under the new headless mode).

This does mean the e2e browser is not the primary shipping target. That is acceptable because these tests exercise our code, not Chrome's chrome: the surfaces under test are ordinary extension pages whose behaviour does not vary between Chromium builds. The things that *do* vary — and the browser-level machinery we cannot drive at all — are called out below.

**Reasoning — why not pixel baselines.** The theme matrix is the visual half of §3g, so it is tempting to assert screenshots with `toHaveScreenshot`. Rejected: font rendering differs across machines and OSes, so a committed baseline would fail on every contributor who is not on the machine that generated it, and the maintenance answer to that (per-platform baselines, tolerance thresholds) buys noise, not signal. Instead the assertions carry the regression coverage — every section present, previews recomputing, the size counter escalating, `data-theme` flipping — and the screenshots are attached to the report for a human to glance at.

**Alternatives.** Fold e2e into `npm run verify` (rejected: verify is the fast, browser-free pre-commit gate and the release blocker; a browser-dependent, machine-specific step does not belong in it — it is documented alongside the manual matrix instead); depend on the service worker to derive the extension id (kept — it works on Edge; a `chrome://extensions` scrape was prototyped as a fallback and dropped as more brittle than the service-worker URL); drive keyboard shortcuts and context-menu items (rejected as impossible here, not undesirable: Chrome dispatches `commands` and native menus at the browser level, outside any page, so [D013](#d013)'s three-surface parity keeps a manual leg for the shortcut).

**Consequences.** The options page, previously covered by nothing, now has a rendering regression net. `PW_HEADLESS=1` uses Chrome's *new* headless mode, since the old one loads no extensions. Everything Playwright writes lands under `e2e/output/` (gitignored), including the six named theme screenshots. The next specs to grow are the popup and, once fixtures can stand in for a live site, content-script extraction — the harness's `seedStorage` and page helpers exist for exactly that. Playwright's Chromium was still installed (`npx playwright install chromium`) so CI has the portable path without extra setup.

**Addendum (2026-09-06) — a live lane for extraction drift.** A user reported a numberless YouTube search on a LeetCode problem; driving the built extension against the live page reproduced it, and the reason no test caught it is structural — every existing check reads a *frozen* input (source, `dist/`, or a saved fixture), so none can see the live site change shape under a fixture ([implementation-plan-2](implementation-plan/implementation-plan-2.md)). The answer is a second Playwright **project**, not a second harness:

- **Two projects split by filename** in `playwright.config.ts`: `e2e` (everything except `*.live.spec.ts`) and `live` (only `*.live.spec.ts`). `npm run test:e2e` → `--project=e2e`; `npm run test:e2e:live` → `--project=live`. The split is chosen over an env flag or a title tag because it is visible in the config itself and in the file name, not hidden inside a spec. Both projects reuse the one `fixtures.ts` and Edge — a live lane on a different loader would be testing a different thing.
- **The live lane is opt-in and never a required check.** A network-dependent test must never be able to redden the hermetic gate, so it is off `npm run verify` entirely. Intended CI treatment: the offline `e2e` project may run on push; the `live` project runs manually or on a schedule, never as a blocking check. A red live run means "the site moved, go look", not "the build broke". An unreachable or un-hydrated page (an outage, or a headless Cloudflare block) is `skip`ped, not failed — only a page that loaded and dropped a field fails.
- **`test.fail()` documents a known live bug in the suite itself.** The LeetCode canaries assert the number that was lost; marking them expected-failure kept the requirement and the break both recorded, and made the fix self-announcing — a fixed extraction makes them "unexpectedly pass", the cue to remove the marker. That is exactly what happened: the lane shipped with the markers, the `leetcode.ts` `looksLikeQuestion` fix landed in the very next change, the rows flipped to unexpected passes, and the markers came off — they are now ordinary regression guards. The extraction fix was deliberately a *separate* change from the test lane, so the lane's value (catching drift the fixtures cannot) is recorded independently of any one bug. A nightly CI workflow for the lane is documented as intent, not built here.

**Status.** Accepted · 2026-09-05 (live lane added 2026-09-06) · see [D045](#d045), [D013](#d013), [TESTING.md](TESTING.md) §1.2, [../e2e/README.md](../e2e/README.md), [implementation-plan-2](implementation-plan/implementation-plan-2.md)

<a id="d048"></a>
### D048 — Licence is PolyForm Strict, not MIT

**Decision.** The project is licensed under **PolyForm Strict 1.0.0**, a source-available licence, replacing the MIT licence chosen at first release. The source stays public and readable, and may be run for permitted (noncommercial and personal) purposes, but **redistribution and distribution of changed or derivative works are not permitted**. `package.json` carries `"license": "PolyForm-Strict-1.0.0"`.

**Context.** The MIT choice was recorded in the Phase 8 Q&A of [implementation-plan-1](implementation-plan/implementation-plan-1.md) ("no reason to constrain anyone building on it"). The owner's position changed: they do not want the code forked or republished at all. MIT cannot express that — its entire grant *is* the right to fork, copy, and redistribute, so a "reworded MIT" is a contradiction, not an option.

**Reasoning.** The real goal is "no forks", and the closest standard, named licence is PolyForm Strict: it withholds redistribution and modified-version distribution while leaving the source readable and runnable. Two things it deliberately does **not** do, recorded so they are not rediscovered as surprises:

1. **A licence cannot hide the code.** A Chrome extension ships its bundled source to every user's disk; anyone can read it. PolyForm Strict makes copying or republishing *unlawful* (grounds for a Web Store or DMCA takedown), not *impossible*. That legal footing is the actual protection.
2. **Source-available is not open-source, and does not touch the behavioural transparency story.** The repository stays **public** — which [D046](#d046) and `core/links.ts`'s `privacyUrl()` depend on, since the Web Store requires a reachable privacy-policy URL. Public repo + PolyForm Strict = source-available. The "nothing leaves your browser" privacy posture is about what the code *does*, not who may reuse it, and is unchanged.

**Alternatives.** Plain all-rights-reserved / no-licence (rejected: the owner preferred a named, standard licence over bespoke wording); PolyForm Noncommercial (rejected: it permits forking and modification for any noncommercial purpose, which is the thing being prevented); BUSL-1.1 (rejected: it auto-converts to open-source after a term, and eventual open-sourcing is not wanted); keeping MIT (rejected: see Context). A hand-edited proprietary text was rejected in favour of the canonical PolyForm Strict text, unmodified — editing a named licence loses the point of using one.

**Consequences.** No community contributions or third-party redistribution are permitted; this is intended. `README.md`, `docs/STORE-LISTING.md`, `docs/todo.md` #3, and `package.json` are updated to match. The icons licence note ([D009](#d009)) is unrelated and unchanged. Supersedes the Phase 8 MIT choice.

**Status.** Accepted · 2026-09-06 · see [implementation-plan-3](implementation-plan/implementation-plan-3.md) Phase 3, [D046](#d046), [D009](#d009), [../LICENSE](../LICENSE)

<a id="d049"></a>
### D049 — Non-affiliation disclaimer, framed "nothing leaves your device"

**Decision.** Ship a standalone [`DISCLAIMER.md`](../DISCLAIMER.md) (linked from the README and the store listing) that (a) states DSA Helper is **not affiliated with** LeetCode, Codeforces, CodeChef, GeeksforGeeks, or OpenAI/ChatGPT, (b) describes the extension's behaviour honestly, and (c) places responsibility for complying with each site's terms of service on the user. The behaviour is framed as **"nothing leaves your device"**, never as "stores nothing".

**Context.** The owner wanted the extension to be "legally safe", and proposed wording along the lines of "the extension is not storing the information ... it is just an automation tool", motivated by sites like LinkedIn prohibiting scraping. Two problems with that framing had to be resolved first.

**Reasoning.**

1. **A disclaimer documents conduct; it does not override a site's ToS or copyright.** So the real protection is the factual properties of the extension — no network requests ([D010](#d010)), on-device-only storage ([D018](#d018)), least-privilege permissions ([D021](#d021)), and single user-initiated actions on content already on screen — and the disclaimer's job is only to state those truthfully and to put ToS compliance on the user. Calling it "just an automation tool" carries no legal weight and is not relied on.
2. **"Stores nothing" was false.** The extension stores settings, history, and a most-recent extraction locally. The accurate, still-strong claim is that this information **never leaves the device**. In the course of writing this, a real defect surfaced: `lastExtraction` was persisting the full `ProblemContext` — **including the user's code** — to `chrome.storage.local`, contradicting both [PRIVACY.md](PRIVACY.md) and [D018](#d018) ("code never written to disk"). Fixed by stripping `code` before storage (keeping `codeSource` so diagnostics can still report that a solution was captured); `actions.test.ts` and `diagnostics.test.ts` now pin the stripped behaviour. This is a [D018](#d018) enforcement fix, recorded here because it is what lets the disclaimer and privacy policy make the "code never touches disk" claim honestly.

**ToS review (2026-09-06).** The target sites' terms were read before finalising the wording, because they bear on how the tool may be used:

- **GeeksforGeeks** — the strictest: expressly prohibits automated/non-human access (bots, scripts) and "data mining, robots, or similar data gathering and extraction tools", and prohibits reproducing its content.
- **CodeChef** — expressly prohibits scraping and manipulation of platform content; content may be copied/printed for personal use only, notices intact.
- **LeetCode** — content is copyrighted and LeetCode's exclusive property; users must abide by its copyright restrictions (no clause specific to browser extensions was found).
- **Codeforces** — only general prohibitions (no damaging use, no commercialising content); nothing specific to automation surfaced.
- **OpenAI/ChatGPT** — prohibits *programmatically extracting* Output and bypassing protective measures; the extension inserts input into the composer and does **not** read or extract ChatGPT's responses.

Because several platforms restrict automated access and content reproduction, the disclaimer **does not claim** that any given use is permitted — it states the mild, user-initiated, single-page nature of the tool and makes the user responsible for their own compliance. This is a periodic check: the review date is recorded in `DISCLAIMER.md`.

**Alternatives.** The owner's "not storing / just an automation tool" wording (rejected: partly false, and legally inert); folding the disclaimer into the README only (rejected: a standalone doc is easier to link from the store listing and to point users at); claiming ToS compliance (rejected: not true across all sites, and not the extension author's to assert on the user's behalf).

**Consequences.** `DISCLAIMER.md` exists and is linked from `README.md` and `docs/STORE-LISTING.md` (which gains a non-affiliation block). `PRIVACY.md` gains a row disclosing the local most-recent-extraction storage and its exclusion of code. The code-on-disk fix slightly changes the options-page diagnostics wording for a captured solution ("captured via …, not stored"). The ToS findings will drift and must be re-reviewed periodically.

**Status.** Accepted · 2026-09-06 · see [implementation-plan-3](implementation-plan/implementation-plan-3.md) Phase 4, [D010](#d010), [D018](#d018), [D031](#d031), [PRIVACY.md](PRIVACY.md), [../DISCLAIMER.md](../DISCLAIMER.md)

<a id="d050"></a>
### D050 — Auto-submit to ChatGPT is an opt-in, off by default

**Decision.** Add a setting, `autoSubmitChatGpt`, **off by default**. When it is on, the ChatGPT content script submits the prompt automatically — but only after the insertion has been read-back-verified, and only by clicking ChatGPT's own send button once. When it is off (the default), behaviour is exactly as before: the prompt is inserted and left for the user. This **narrows** [D003](#d003); it does not overturn it.

**Context.** [D003](#d003) made "insert but never submit" the behaviour, and called the pause a security control: the prompt carries text scraped from a problem page nobody controls, and a human reading it before sending is the last line of defence against prompt injection. `inject.ts` and `inject.test.ts` enforced it by asserting **no** submit-shaped code existed in the file at all. The user asked for auto-submit as a convenience. `inject.ts`'s own header said the right way to grant that was "a decision entry that reckons with [the security argument], not a patch here" — this is that entry.

**Reasoning — the reckoning, not a rubber stamp.** D003's prompt-injection argument is real and is *not* dismissed here. Auto-submit removes the human pre-read, so a malicious or manipulative problem statement can now reach the model without a person seeing it first. That risk is accepted only because it is bounded on every side:

- **Off by default.** No existing user's behaviour changes. The safe path stays the path you get without asking.
- **Opt-in and clearly warned.** The options toggle states that the prompt is built from a page the extension doesn't control and that reading it first is a safeguard.
- **Only what was verified.** Submit fires only after the existing read-back check confirms the whole prompt actually landed in the composer — never a half-inserted or wrong-language prompt, and never on the clipboard-fallback path (a prompt that could not be inserted is never sent).
- **The send button, not a key event.** Submission clicks ChatGPT's own send button, and only when it is enabled; it never dispatches a synthetic `Enter` (which could inject a newline or fire into a not-yet-ready composer) and never submits a form directly.
- **The other injection mitigation still stands.** Quoted problem text is still wrapped in named tags so the model reads it as reference, not instructions ([D040](#d040)) — that guard now carries more weight, since the human pre-read is no longer guaranteed.

**The test guard was narrowed, not removed.** A security control enforced by *absence* erodes quietly, so it was not simply deleted. `inject.test.ts` still forbids key-event and form submission outright, still requires the rationale to be documented in the file, and now pins the gate as a tested predicate (`shouldSubmit` is true only when inserted **and** opted-in) plus the enabled-only send behaviour. Hiding the submit in a sibling file to keep the old grep green was explicitly rejected as the evasion the test exists to catch.

**Alternatives.** Keep D003 absolute (rejected: the user wants the convenience, and it can be offered safely); auto-submit on by default (rejected: reverses a security default for everyone, including those who never asked); submit via a synthetic `Enter` (rejected: newline risk and it side-steps the button's enabled state); read the setting in the content script (rejected: the worker already reads settings, so the decision travels with the prompt and `inject.ts` gains no settings dependency).

**Consequences.** `Settings` gains `autoSubmitChatGpt`; the `PENDING_PROMPT` message and the session entry carry an `autoSubmit` flag decided by the worker at action time; `inject.ts` gains a gated `submitComposer`. The options toggle is shown only when auto-inject is on. User-facing copy that promised the extension "never sends" is softened to "off by default" (store listing, `PRIVACY.md`, `TESTING.md`). The send-button selector is now a second ChatGPT-specific string that a redesign can break — when it does, auto-submit degrades to the review banner rather than failing.

**Status.** Accepted · 2026-09-06 · see [implementation-plan-3](implementation-plan/implementation-plan-3.md) Phase 1, [D003](#d003), [D040](#d040), [architecture.md](architecture.md) §9.2

---

## Superseded and deprecated

*None yet.* When a decision is replaced, it stays in place above with its status changed to `Superseded by D0xx`, and is listed here with a one-line note on what changed and why. The record of the wrong turn is often more useful than the correction.
