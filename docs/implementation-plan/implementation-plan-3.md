# Implementation Plan 3 — Auto-submit option, banner control, licence, and legal posture

**Covers:** four independent post-v1 changes the user asked for —
1. an **opt-in setting to auto-submit** the prepared prompt into ChatGPT (currently the extension never sends);
2. **removing / making optional the "Prompt inserted…" banner**;
3. **changing the licence from MIT to PolyForm Strict (source-available, no forking)**;
4. a **legal posture pass** — a non-affiliation disclaimer and honest, accurate behaviour wording ("nothing leaves your device"), so the extension is defensible against scraping/ToS concerns.

**Status:** **All four phases landed 2026-09-06.** Phase 3 (licence → PolyForm Strict) and Phase 4 (disclaimer + ToS review + a [D018](../decisions.md#d018) code-on-disk fix found during the legal cross-check) first; then Phase 1 (opt-in auto-submit to ChatGPT, off by default, [D050](../decisions.md#d050)); then Phase 2 (review banner as a setting, on by default, [D051](../decisions.md#d051)). `npm run verify` green, 535 unit tests pass. The only thing owed is the manual ChatGPT smoke check (auto-submit + banner on a real, logged-in page) — see the Phase 1/2 Tracks and [TESTING.md](../TESTING.md) §ChatGPT.
**Last updated:** 2026-09-06

**Q&A resolved with the user (2026-09-06):**
1. **Auto-submit — yes, build it opt-in** (Phase 1 proceeds; off by default).
2. **Banner — make it a setting, default ON** (Phase 2 option (b), keeping the review cue on by default).
3. **Licence — PolyForm Strict** (Phase 3; source-available, no redistribution and no distribution of modified versions — the closest fit to "no forks").
4. **Disclaimer — standalone `DISCLAIMER.md`, and read the platforms' ToS first** (Phase 4).

Source documents: [decisions.md](../decisions.md) (this plan uses **D048** licence, **D049** disclaimer, **D050** auto-submit, **D051** banner — numbered in landing order, Phases 3–4 first) · [spec.md](../spec.md) · [architecture.md](../architecture.md) · [implementation-plan-1.md](implementation-plan-1.md) (Phase 5 = ChatGPT injection; Phase 8 Q&A = the MIT choice) · [implementation-plan-2.md](implementation-plan-2.md)

---

## Why this plan exists, and the one hard constraint

Three of these four are low-risk mechanical changes. **Phase 1 is not.** The "never submit" behaviour is not a UX default — it is a **security control** recorded in [D003](../decisions.md#d003) and enforced by a test that reads [`inject.ts`](../../src/content/chatgpt/inject.ts)'s own source ([`inject.test.ts`](../../src/content/chatgpt/inject.test.ts)) and fails the build if any submit-shaped code appears. [`inject.ts`](../../src/content/chatgpt/inject.ts) says so in its header:

> "A future request to auto-send needs a decision entry that reckons with that, not a patch here."

So Phase 1 is done **only** as a deliberate reversal:

- It is written up as a new numbered decision ([D050]) that weighs the prompt-injection risk D003 exists to mitigate — not slipped in as a toggle.
- The setting is **off by default**, and named so its risk is legible.
- Submit fires **only** after read-back verification of the insertion passes, and **never** on the clipboard-fallback path — a half-inserted or wrong-language prompt must never be auto-sent.
- The `inject.test.ts` guard is **not deleted and not gamed** (e.g. by hiding the submit in a sibling file to keep the grep green — that is exactly the evasion the test's comment warns against). It is **rewritten** to enforce the *new, narrower* invariant: submit is reachable only through the gated, verified path, and never by default.

If the user, on reading this, decides the review pause is worth keeping, **Phases 2–4 stand on their own** and can ship without Phase 1.

---

## How to use this plan

Same conventions as [implementation-plan-1.md](implementation-plan-1.md): each phase carries **Decisions / Q&A / Track / Additional Notes**; a significant decision becomes a numbered entry in [decisions.md](../decisions.md) *in the same change*; **Track** is the resumption state, cleared to `Phase complete.` when done.

**Phase independence.** Unlike Plan 1, these phases are **not sequential** — Phase 3 (licence) and Phase 4 (legal) touch no code and depend on nothing here. Phases 1 and 2 both touch `inject.ts` and are coupled (see the note under Phase 2), so if both are done, do **Phase 1 first** — the banner's wording depends on whether auto-submit exists.

**Standing rules that still apply** ([implementation-plan-1.md](implementation-plan-1.md) restates these):

- A significant decision → a numbered entry in [decisions.md](../decisions.md), same change.
- No network requests, ever ([D010](../decisions.md#d010)) — nothing here adds one.
- Content scripts and the worker ship **no React** ([D012](../decisions.md#d012)).
- `core/` stays free of `document` and `chrome.*`.
- `core/` code changed here (`Settings`, `DEFAULT_SETTINGS`) must keep testing in plain Node.

---

## Phase 1 — Opt-in auto-submit into ChatGPT

**Goal.** A setting that, when the user turns it on, submits the prepared prompt automatically after it has been verifiably inserted — while leaving the default (and the security posture) exactly as it is today for everyone who does not.

**Exit criteria.**
- New setting `autoSubmitChatGpt`, default `false`, persisted and surfaced in the options page **only** when `autoInjectChatGpt` is on (auto-submit is meaningless in the clipboard-only flow).
- With the setting **off**: behaviour is byte-for-byte what it is today — insert, banner, stop. No submit path is reachable.
- With the setting **on**: the prompt is inserted, **read-back-verified**, and only then submitted once. A failed or partial insertion falls back to the clipboard and **does not** submit.
- `inject.test.ts` is rewritten to enforce the new invariant (submit only via the gated, verified path; never by default; the "why" comment still present), and passes.
- `npm run verify` green.

### Tasks

- [x] **[D050]** written into [decisions.md](../decisions.md) as a genuine reckoning with D003's prompt-injection argument; index row added and D003 marked "narrowed by D050" (not superseded — the default is unchanged).
- [x] `src/core/types.ts` — `autoSubmitChatGpt: boolean` added to `Settings` (documented, off by default, D003/D050 pointer); `PENDING_PROMPT` now carries `autoSubmit: boolean`.
- [x] `src/core/storage.ts` — `autoSubmitChatGpt: false` in `DEFAULT_SETTINGS`; no migration needed, confirmed by a `storage.test.ts` case (a bag without the key merges to `false`).
- [x] **Decision travels with the claim.** `pendingPrompt.ts` stores `autoSubmit` in the session entry (decided in `actions.ts` from `built.settings`); `claimPendingPrompt` returns `{ prompt, autoSubmit }`; the worker's claim handler puts it on `PENDING_PROMPT`. `inject.ts` reads no settings.
- [x] `src/content/chatgpt/inject.ts` — after verified insertion, and only when `autoSubmit`, a gated `submitComposer()` clicks the enabled send button once; unreachable from the clipboard-fallback path; a not-ready button falls through to the review banner.
- [x] `src/content/chatgpt/inject.test.ts` — guard **rewritten**: still forbids key-event/form submission and requires the rationale ("SUBMIT ONLY WITH CONSENT" + D003 + D050); adds `shouldSubmit` truth-table and `submitComposer` enabled/disabled/absent behavioural tests. The evasion of hiding submit in a sibling file was avoided — submit lives in `inject.ts`, gated.
- [x] `src/options/Options.tsx` — a "Send the prompt automatically" toggle, rendered only when `autoInjectChatGpt` is on, with a plain trade-off hint; the auto-inject hint's stale "never sends either way" line corrected.
- [x] `pendingPrompt.test.ts` / `actions.test.ts` updated for the new signatures and covering the worker's `autoSubmit` computation (on when opted in; false by default). `npm run verify` green; 108 tests across the four touched files pass.
- [x] **Doc reconciliation:** `PRIVACY.md`, `STORE-LISTING.md` (description + `chatgpt.com` permission row), `TESTING.md` (§ChatGPT + the behaviours table), and `CHANGELOG.md` softened from "never sends" to "off by default", so no shipped copy overstates.

### Decisions (prospective)

- **[D050] — auto-submit is opt-in and reverses D003 for those who choose it.** The single most important entry in this plan. It must read as a genuine reckoning, not a rubber stamp: D003's prompt-injection argument is real, and the mitigation is "off by default + submit only what was verifiably inserted", not "the risk went away".
- **The submit decision is computed in the worker and travels with the prompt**, so the content script never grows a settings dependency and the flag cannot drift from `autoInjectChatGpt`.
- **The `inject.test.ts` invariant is narrowed, not removed.** A security control enforced by absence is exactly the kind that erodes quietly; the replacement enforces "gated + verified + off by default" so the erosion is still caught.

### Q&A

- **Confirm the reversal.** _Resolved 2026-09-06: **yes, build it opt-in.**_ Phase 1 proceeds; the setting is off by default and reverses [D003](../decisions.md#d003) via [D050].
- **Submit mechanism.** _Resolved (recommendation accepted with "yes, build it"): **click the send button, with a verified-enabled check first**_, falling back to *not submitting* (leave it for the user) if the button can't be found — never a blind `Enter` key event, which risks inserting a newline into the multi-line ProseMirror doc.
- **Reliability gate.** Require the send control to be present and enabled before submitting (ChatGPT enables it a beat after input registers). If it isn't ready within a short timeout, leave the prompt inserted and unsent rather than firing into a disabled/again-empty composer.

### Track

**Phase complete** at the code/build/unit level. [D050](../decisions.md#d050) recorded; setting, plumbing, gated submit, options toggle, tests, and doc reconciliation all landed; `npm run verify` green.

**Manual smoke still owed (needs a real, logged-in ChatGPT — same class as the original Phase 5 insertion check, which no automated lane covers here):** with auto-submit off, the prompt lands unsent; with it on, the prompt is inserted and sent exactly once; with it on but `COMPOSER_SELECTORS` broken, the prompt goes to the clipboard and **nothing** is sent; the send-button selector (`SEND_BUTTON_SELECTORS`, verified-on 2026-09-06, documentation-derived) actually matches a live page. Tracked in [TESTING.md](../TESTING.md) §ChatGPT.

### Additional Notes

- Everything ChatGPT-specific stays in `inject.ts` ([architecture.md](../architecture.md) §7.2), submit included — a redesign remains a single-file fix. There are now **two** fragile ChatGPT selectors (composer + send button); when the send button breaks, auto-submit degrades to the review banner rather than failing.
- The [D040](../decisions.md#d040) tagging (quoted problem text wrapped in named tags so the model reads it as reference, not instructions) is the *other* injection mitigation and is unaffected; [D050](../decisions.md#d050) notes it is now carrying more weight, since the human pre-read is no longer guaranteed.
- Phase 2 (banner setting) can now reuse the exact `PENDING_PROMPT`-carries-a-flag pattern established here for `showChatGptBanner`.
- `focusNewTab: false` + auto-submit is the sharp edge: the tab loads in the background and would now send unattended. Call this out in the toggle's hint or consider forcing focus when auto-submit is on.

---

## Phase 2 — Make the "Prompt inserted" banner optional / removable

**Goal.** Stop the indigo `showBanner()` bar ([`inject.ts`](../../src/content/chatgpt/inject.ts) `showBanner`, `BANNER_*`) from appearing on every Alt+Shift+G / toolbar redirect, per the user's request — without silently removing the review cue that [D003](../decisions.md#d003) relies on for users who keep the pause.

**Exit criteria.** The banner no longer shows in the user's chosen configuration; the clipboard-fallback toasts (which carry real "here's your prompt" information) are untouched.

**Coupling with Phase 1.** The banner text is *"…review it, then press Enter."* If Phase 1 ships and auto-submit is on, that sentence is wrong. So the two phases must be reconciled: at minimum, suppress or reword the banner when `autoSubmit` is true.

**Chosen model (resolved 2026-09-06): (b) a setting, default ON.** Add `showChatGptBanner: true` to `Settings` / `DEFAULT_SETTINGS`, a Behaviour toggle in the options page, and gate the `showBanner()` call on it. The review cue stays on for everyone by default; the user turns it off for themselves.

### Tasks

- [x] `src/core/types.ts` — added `showChatGptBanner: boolean` to `Settings` (default true); `PENDING_PROMPT` now carries `showBanner`.
- [x] `src/core/storage.ts` — `showChatGptBanner: true` in `DEFAULT_SETTINGS`; a `storage.test.ts` case confirms a bag without the key merges to `true` (no migration needed).
- [x] Flag delivered the same way as `autoSubmit`: the two now form a small `PromptFlags` object stored in the session entry and returned on the claim, so `inject.ts` still reads no settings.
- [x] `src/content/chatgpt/inject.ts` — the `showBanner()` call is gated on the flag (`if (bannerEnabled) showBanner()`).
- [x] Auto-submit interaction: a succeeding auto-submit returns before the banner check, so no banner shows regardless; a not-ready send button falls through to the (gated) banner, which is the right "press Enter" cue for a waiting prompt.
- [x] `pendingPrompt.test.ts` / `actions.test.ts` updated for the `PromptFlags` object and the `showBanner` flag; `storage.test.ts` gains the banner default case. `inject.test.ts` needed no change (its guard tests don't touch the banner). Full suite 535 green.
- [x] User-facing docs updated: [docs/CHANGELOG.md](../CHANGELOG.md) (new entry), [docs/TESTING.md](../TESTING.md) (banner-toggle manual check). No store-listing/PRIVACY banner copy needed changing — neither claimed the banner always shows.

### Decisions

- **[D051] — the review banner is a setting, on by default.** Recorded in [decisions.md](../decisions.md): a pure UX control that changes what is shown, never whether the prompt is sent; the default keeps D003's visible review cue for everyone.

### Q&A

- **Which model?** _Resolved 2026-09-06: **(b) a setting, default ON.**_ The banner stays on by default (preserving D003's visible review cue); the user can switch it off for themselves.

### Track

**Phase complete.** Setting, plumbing (`PromptFlags`), gated banner, options toggle, tests, and docs all landed; `npm run verify` green, 535 tests pass. Manual smoke (banner shows/hides per the toggle on a real ChatGPT page) folded into the Phase 1 ChatGPT smoke list in [TESTING.md](../TESTING.md).

### Additional Notes

- The banner and the clipboard-fallback toasts are different things: the toasts ("the prompt is on your clipboard, press Ctrl+V") carry information the user needs when insertion failed, and are **not** gated by this setting.

---

## Phase 3 — Licence: MIT → PolyForm Strict (source-available, no forking)

**Goal.** Replace the permissive MIT licence, which explicitly grants the right to fork and redistribute, with **PolyForm Strict 1.0.0** — a source-available licence that permits running the software but forbids redistribution and distribution of modified versions, the closest standard fit to the user's wish that people not fork the code.

**Exit criteria.** `LICENSE`, `README.md`, and the store-listing checklist all reflect PolyForm Strict consistently; nothing in the tree still tells people they may fork it.

### Tasks

- [x] Replace `LICENSE` with the **verbatim PolyForm Strict 1.0.0** text (fetched from the canonical GitHub source), preceded by a licensor notice naming `Copyright (c) 2026 Trayamb Rathore` and summarising the "no redistribution / no modified-version distribution" effect. Canonical text left unmodified.
- [x] `README.md` §Licence rewritten to state PolyForm Strict plainly (source-available, no forking, no republishing); the icons/no-third-party-asset note ([D009](../decisions.md#d009)) kept.
- [x] [docs/STORE-LISTING.md](../STORE-LISTING.md) — blockers checklist line → PolyForm Strict 1.0.0.
- [x] [docs/todo.md](../todo.md) #3 — recorded choice updated with the change rationale and the public-repo interaction.
- [x] `package.json` `"license"` → `"PolyForm-Strict-1.0.0"` (SPDX id); `docs/spec.md` §Distribution and `docs/CHANGELOG.md` `[Unreleased]` updated so no stale "MIT" remains in our own text (dep licences in `package-lock.json` left alone).
- [x] **[D048]** written into [decisions.md](../decisions.md), superseding the Phase 8 MIT choice, with index row + body.

### Decisions (prospective)

- **[D048] — PolyForm Strict 1.0.0; source-available, no forking.** Note the two things the user should understand, recorded so they aren't rediscovered later:
  1. **A licence cannot hide the code** — a Chrome extension ships its bundled source to every user's disk. Proprietary makes copying *unlawful* (grounds for a Web Store / DMCA takedown), not *impossible*.
  2. **Source-available ≠ open-source.** The repo can stay public (which [D046](../decisions.md#d046) and `privacyUrl()` depend on — see the interaction note) while the licence forbids reuse. This does not betray the project's *behavioural* transparency story; it only changes who may reuse the code.

### Q&A

- **Plain vs named source-available?** _Resolved 2026-09-06: **a named source-available licence.**_ **Which one is still open** — the named options differ sharply, and some permit the non-commercial forking the user said they wanted to prevent, so this needs one more confirmation:
  - **PolyForm Strict** — closest to "no forks": run/personal use only; no redistribution and no distribution of modified versions.
  - **PolyForm Noncommercial** — permits use *and modification/forking* for any non-commercial purpose; only commercial use is withheld.
  - **BUSL-1.1** — production-use limitation now, and **auto-converts to an open licence** (e.g. Apache-2.0) after a set period (commonly 4 years).
  - Recommendation given the stated "no forking" goal: **PolyForm Strict**. If the goal is really "no *commercial* clones," PolyForm Noncommercial. BUSL only if a future open-sourcing is acceptable.
- **Keep the GitHub repo public?** It must stay reachable for `privacyUrl()` / `issueUrl()` ([D046](../decisions.md#d046)) unless those are re-hosted. Public repo + source-available licence is fine and the recommended path.

### Track

**Phase complete.** `LICENSE` is PolyForm Strict 1.0.0; `package.json`, `README.md`, `docs/STORE-LISTING.md`, `docs/todo.md`, `docs/spec.md`, `docs/CHANGELOG.md` all consistent; [D048](../decisions.md#d048) recorded. `npm run verify` green. Repo stays public (source-available) so `privacyUrl()` keeps resolving ([D046](../decisions.md#d046)).

### Additional Notes

- **Interaction with [D046](../decisions.md#d046):** `core/links.ts` builds the privacy-policy URL from the public repo (`REPO_SLUG` still unset). If the repo is ever made private to "protect" the code, that URL breaks and the Web Store requirement for a public privacy-policy URL is unmet. Proprietary-but-public is the way to satisfy both.
- Do not touch the icons licence note ([D009](../decisions.md#d009)) — it is about generated assets, not the source.

---

## Phase 4 — Legal posture: non-affiliation disclaimer and accurate wording

**Goal.** Add the disclaimers that actually do work — non-affiliation/trademark, an honest description of behaviour, and a user-responsibility clause — framed on facts that are **literally true of the code**, so the extension is defensible against scraping/ToS concerns without overstating.

**Exit criteria.** A disclaimer exists (dedicated doc + store-listing/README blurb); every factual claim in it matches the code; no claim says "stores nothing" (which is false — see below).

### The accuracy constraint (load-bearing)

The user's proposed wording — *"the extension is not storing the information"* — is **not true as written** and would be worse than no disclaimer. [`storage.ts`](../../src/core/storage.ts) stores, **on the user's device**: history (`chrome.storage.local`), settings/templates (`chrome.storage.sync`), and `lastExtraction` in `local`. **Discovered during this phase:** `lastExtraction` was persisting the full `ProblemContext` **including the user's code** — contradicting both [PRIVACY.md](../PRIVACY.md) and [D018](../decisions.md#d018) ("code never written to disk"). Resolved (user chose "fix the behavior") by stripping `code` before storage; see the extra task below. The accurate framing is **"nothing ever leaves your device"** — no server, no network calls, no transmission — and, now truthfully, **the code never touches disk at all**.

### Tasks

- [x] Added `DISCLAIMER.md` (standalone) containing: non-affiliation/trademark for all five platforms; honest behaviour ("nothing leaves your device", **not** "stores nothing"; code never written to disk); user-responsibility-for-ToS clause; a ChatGPT section; as-is/no-warranty. Carries a "last reviewed" date.
- [x] [docs/STORE-LISTING.md](../STORE-LISTING.md) — added a **NOT AFFILIATED** block to the detailed description. The `chatgpt.com` permission row and the "never presses Enter" copy are left as-is (accurate while Phase 1 is unshipped; Phase 1's tasks already flag softening them if auto-submit lands).
- [x] `README.md` — added a brief **Disclaimer** section pointing to `DISCLAIMER.md`.
- [x] Cross-checked [PRIVACY.md](../PRIVACY.md) — found the code-on-disk contradiction (below), fixed the behaviour, and added a storage-table row disclosing the local most-recent-extraction (problem text kept, **code excluded**).
- [x] **[D018] enforcement fix (code-on-disk):** `src/background/actions.ts` `remember()` now strips `context.code` before `setLastExtraction` (keeps `codeSource`); `src/core/diagnostics.ts` `code` row reports "captured via …, not stored" when code is absent but a source is present; `actions.test.ts` and `diagnostics.test.ts` updated to pin the stripped behaviour (the old test had asserted the code *was* stored). `npm run verify` green.
- [x] **[D049]** written into [decisions.md](../decisions.md) with the disclaimer posture, the dated ToS review, and the code-on-disk fix; index row + body.

### Decisions (prospective)

- **[D049] — disclaimer posture: non-affiliation + accurate on-device framing.** Record the reasoning that a disclaimer documents conduct and does **not** override a site's ToS or copyright — so the real protection is the factual properties (no network, on-device only, least privilege, user-initiated), which the disclaimer merely states truthfully.

### Q&A

- **Doc placement?** _Resolved 2026-09-06: **standalone `DISCLAIMER.md`**, linked from README and the store listing._
- **Read the platforms' ToS first?** _Resolved 2026-09-06: **yes.**_ Before finalising wording, fetch and summarise the current ToS of LeetCode, Codeforces, CodeChef, GeeksforGeeks, and ChatGPT for automated-access / browser-extension / content-reproduction clauses. Record the review date, since these change.

### Track

**Phase complete.** `DISCLAIMER.md` added and linked from README + store listing; ToS reviewed 2026-09-06 (findings in [D049](../decisions.md#d049)); the code-on-disk defect fixed and pinned by tests; `PRIVACY.md` corrected; `npm run verify` green. ToS findings are a periodic re-check (date recorded in `DISCLAIMER.md`).

### Additional Notes

- If Phase 1 (auto-submit) ships, the store listing's "does not submit it — it stops there so the user reads it first" line must be softened to reflect the opt-in, or it becomes an inaccurate statement in a submitted listing.
- The strongest legal position is factual and already mostly built (no network calls, on-device storage, least-privilege permissions, single user-initiated actions). The disclaimer's job is only to state those truthfully — a future feature that adds a server or a network call is what would actually change the risk, not the wording here.

---

## Cross-plan notes

- **Phase 3 adds no production code.** **Phase 4 was expected to add none**, but the legal cross-check surfaced a [D018](../decisions.md#d018) violation (code persisted to disk in `lastExtraction`), so it also carries a small, well-tested fix to `actions.ts` and `diagnostics.ts` — a case of a doc pass finding a real defect.
- **Phase 1 reversed [D003](../decisions.md#d003)** with the user's explicit yes (2026-09-06) — the only part of this plan that changes a security property. Landed as an off-by-default opt-in ([D050](../decisions.md#d050)); the never-submit default is unchanged.
- **Decision ids** from this plan, all now recorded: **D048** (licence), **D049** (disclaimer), **D050** (auto-submit), **D051** (banner) — numbered in landing order (Phases 3–4 first).
- Nothing here touches an adapter, the extraction path, or the no-network invariant.
