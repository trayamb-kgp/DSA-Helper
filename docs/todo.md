# DSA Helper — TODO

Pending items. Tick the box when done; add a note underneath if the outcome is worth recording.

**Last updated:** 2026-09-03

---

## 1. Contact address for the privacy policy

- [x] Decide which address to publish — **a dedicated alias**, not a personal mailbox
- [ ] Create the alias
- [ ] Set `CONTACT_EMAIL` in [`src/core/links.ts`](../src/core/links.ts) and paste the same address into [PRIVACY.md](PRIVACY.md) → Contact

Still blocks publishing — the Web Store requires a working contact — but it is now a substitution rather than a decision.

**Notes:** _Decided 2026-09-03. A dedicated alias over a personal address because a published contact gets scraped permanently and an alias can be abandoned; over an issues-URL-only because the store wants a reachable address. Until it is set, `CONTACT_EMAIL` is `null`, the About section renders no contact line and PRIVACY.md carries a visible `CONTACT_EMAIL_PENDING` marker rather than a plausible-looking wrong address ([D046](decisions.md#d046))._

---

## 2. Effective date for the privacy policy

- [x] Set the `Effective date` in [PRIVACY.md](PRIVACY.md)

**Notes:** _Set to **3 September 2026**, the date the policy was adopted, rather than left for publication day. The policy binds from the moment anyone can read it, and the repository going public is that moment — waiting for store approval would leave it unfalsifiable in the window where it is already published. If submission slips, an earlier date is harmless: it means the policy has been in force longer._

---

## 3. Licence

- [x] Choose a licence — **PolyForm Strict 1.0.0**
- [x] Add a `LICENSE` file
- [x] Update the Licence section of [README.md](../README.md)

**Notes:** _Originally MIT (2026-09-03). Changed to **PolyForm Strict 1.0.0** on 2026-09-06 ([D048](decisions.md#d048)): the owner does not want the code forked or republished, and MIT's grant is precisely the right to fork, so a reworded MIT was not an option. PolyForm Strict is the standard source-available licence that keeps the source readable and runnable for noncommercial/personal use while withholding redistribution and modified-version distribution. `package.json` carries `"license": "PolyForm-Strict-1.0.0"`; `private: true` stays, unrelated to the licence. The repo stays **public** so the privacy-policy URL keeps resolving ([D046](decisions.md#d046)) — public + source-available, not open-source._

---

## 4. Distribution

- [x] Decide: unpacked install only, or publish to the Chrome Web Store — **Web Store**, with the source **private** on GitHub and the privacy policy hosted separately ([D055](decisions.md#d055))
- [ ] Connect Cloudflare Pages to the private repo (build output directory `website`, no build command) and set `SITE_URL` in [`src/core/links.ts`](../src/core/links.ts) to the address it returns

Setting `SITE_URL` resolves the privacy-policy URL the store form requires and the About privacy link in options. The diagnostics report link no longer depends on it — with the repo private it routes to the contact email instead of a GitHub issue ([D055](decisions.md#d055), revising [D046](decisions.md#d046)).

**Notes:** _Decided 2026-09-03; distribution revised 2026-09-14 ([D055](decisions.md#d055)). Originally the repo was to stay public so `privacyUrl()` and `issueUrl()` resolved; hosting the policy on its own static site (`website/` → Cloudflare Pages) decouples the public policy URL from repo visibility, so the source can be private. Because it is going to the store, items 1 and 3 do bind, and [STORE-LISTING.md](STORE-LISTING.md) now carries the copy, the per-permission justifications and the submission checklist._

---

## 5. Test fixtures

- [ ] Capture **real** saved HTML per platform (practice + contest, plus Premium on LeetCode)
- [x] Wire them into adapter tests
- [ ] Set a refresh schedule

Capture early — they're the only thing that detects a site redesign before users do. [architecture.md](architecture.md) §12.

**Notes:** _M2 shipped three LeetCode fixtures and M6 five more (Codeforces problemset + contest, CodeChef practice + contest, GfG practice) in `src/content/platform/__fixtures__/`. All were **hand-built** to the page shapes documented in [spec.md](spec.md) §6.3 and §6.6 — a contest page and a Premium page both need a logged-in account to reach. They exercise every code path and the suite passes against them, but they cannot detect a redesign, which is the main thing a fixture is for. Replacing them with real captures (trimmed to the statement and editor regions, account markup scrubbed, header comment saying what the fixture is for) should leave the tests passing unchanged — and if it doesn't, that difference is exactly the finding. Priority order: **GeeksforGeeks first** (its hashed CSS-module class names are the most likely thing in the project to be wrong), then CodeChef, then LeetCode contest/Premium. Codeforces is server-rendered and stable, so its two are the least urgent._

**Progress (2 of 8 recaptured, 2026-09-06):**

- _`leetcode-practice.html` — recaptured from live, prompted by the number-extraction bug the live e2e lane caught ([implementation-plan-2](implementation-plan/implementation-plan-2.md)). It did **not** leave the tests unchanged — exactly the finding this item predicts: the live state now carries a `titleSlug`-only fragment the old snapshot lacked (so the fixture now guards the fix), the tab title lost its leading number, and the topic-tag list grew from 3 to 8._
- _`leetcode-contest.html` — rebuilt from a live logged-in capture of "3168. Minimum Number of Chairs in a Waiting Room". Findings: (a) modern LeetCode serves former-contest problems at the **practice URL with full JSON**, so a post-contest page has no "no-JSON" state to capture — the fixture keeps its DOM-fallback role by having the JSON removed deliberately; (b) the modern **example shape** is `<div class="example-block">` + `<span class="example-io">` + `<table>`, not `<pre>` — a format no fixture exercised before, now covered and confirmed to convert cleanly (Input/Output/Explanation + the state table survive). A true no-JSON contest page could only be captured during a live contest._

_The remaining six (LeetCode Premium, CodeChef ×2, GfG, Codeforces ×2) are still hand-built._

---

## 6. LeetCode storage key shape

- [ ] Confirm on a live page
- [x] Document in the LeetCode adapter

[spec.md](spec.md) §14.

**Notes:** _Deliberately not load-bearing. M2 probes rather than addresses: every `localStorage` key mentioning the slug (or, failing that, the frontend id) is a candidate, and the buffer whose language matches the one open in the editor wins ([D038](decisions.md#d038)). Whatever the keys turn out to be called, the approach stands — so this is now a confirmation, not a blocker._

---

## 7. README documentation table

- [x] Add `decisions.md` and `todo.md` rows

**Notes:** _Done 2026-09-02, alongside moving the docs into `docs/`. The README stayed at the repo root so GitHub renders it as the landing page; the table now also lists the implementation plan._

---

## 8. Build milestones

- [ ] **M0** Scaffold — Vite + CRXJS + TS + React, manifest, icons, loads unpacked
- [x] **M1** Core — types, storage, template renderer, `html2md`
- [x] **M2** LeetCode adapter — metadata + all four code-capture layers
- [x] **M3** YouTube action — all three trigger surfaces
- [x] **M4** Prompt builder + copy-to-clipboard
- [x] **M5** ChatGPT injection — banner + clipboard fallback
- [x] **M6** Codeforces, CodeChef, GeeksforGeeks adapters
- [x] **M7** Options page + history
- [x] **M8** Polish — README statements, icons, ready to package

Detail in [spec.md](spec.md) §13.

**Notes:** _M1 done 2026-09-03 — 124 unit tests, typecheck and build clean. M2 done 2026-09-03 — 225 tests total, content-script bundle 18 KB with no React. M3 done 2026-09-03 — 301 tests, service-worker chunk 4.9 KB. M4 done 2026-09-03 — 346 tests; a generated prompt still needs pasting into ChatGPT by hand to judge quality (item 11). M5 done 2026-09-03 — 383 tests, ChatGPT content script 3.2 KB, dist 290 KB; the deliberately-broken-selector check is the one that still needs a browser. M6 done 2026-09-03 — 454 tests, all four platforms, content script 27 KB, dist 298 KB. M7 done 2026-09-03 — 491 tests, dist 327 KB; the options page is the first substantial UI and none of its rendering is test-covered, so it needs eyes. M8 done 2026-09-03 — 516 tests, dist 273 KB, `npm run verify` green end to end. M8 found the one bug that mattered: the emitted service worker was the content script, so no shortcut, menu or popup button had worked since phase 3 ([D045](decisions.md#d045)). M0 stays unticked until the Chrome checks in item 11 are run — and the first of them would have caught that in phase 0. M2's own manual walk-through (practice, contest, Premium) is tracked in the phase 2 Track section._

---

## 9. Docs due at M8

- [x] `TESTING.md` — the manual smoke matrix promised in [architecture.md](architecture.md) §12
- [x] `CHANGELOG.md`
- [x] Store listing copy + permission justifications

**Notes:** _TESTING.md and CHANGELOG.md created early (2026-09-03) rather than at M8, so they can be maintained phase by phase instead of reconstructed at the end. Store listing copy landed at M8 as [STORE-LISTING.md](STORE-LISTING.md) — identity, detailed description, single-purpose statement, per-permission justifications, the data-usage answers, a screenshot plan and the submission checklist._

---

## 10. Decisions marked `Revisit`

Each names its own trigger in [decisions.md](decisions.md). None needs action before launch.

- [ ] **D021** Host permissions required, not optional — revisit if install conversion suffers
- [ ] **D026** Figure handling — revisit if figure-heavy problems prove common
- [ ] **D027** Paywall detection — revisit if detection proves unreliable
- [ ] **D032** No remote selector config — revisit if breakage blast radius proves intolerable

**Notes:** _—_

---

## 11. Verify in Chrome

Everything below is automated-green but needs a real browser to confirm.

**Phase 8 — the build wiring** ([TESTING.md](TESTING.md) §3g): **run this first.** Six checks that were broken in every build from phase 3 to phase 7 while the whole automated suite stayed green ([D045](decisions.md#d045)) — context menu present, both shortcuts live, all three popup buttons working, no service-worker console errors.

**Phase 0 — the scaffold:**

- [ ] `dist/` loads unpacked with no errors on the extension card
- [ ] Toolbar icon opens the popup on a LeetCode problem page
- [ ] Options page opens from the extension card
- [ ] `chrome://extensions/shortcuts` lists all three commands, `Alt+Shift+Y` and `Alt+Shift+G` bound
- [ ] Confirm the two default shortcuts don't collide with LeetCode's own editor hotkeys — **do this before the defaults are locked in for release**

**Phase 2 — extraction** ([TESTING.md](TESTING.md) §3a): walk the popup readout over a practice, a contest and a Premium problem; check code provenance and language; note the live `localStorage` key shape (item 6) and whether the fixtures still match (item 5).

**Phase 3 — the YouTube action** ([TESTING.md](TESTING.md) §3b): all three surfaces open the same search; the badge follows SPA navigation between problems without a reload; an unsupported page and a `chrome://` page each say something rather than nothing.

**Phase 4 — the prompt** ([TESTING.md](TESTING.md) §3c): **paste a generated prompt into ChatGPT and judge the reply** — prompt quality is the actual product and no test can check it; copy from all three surfaces and confirm the clipboard holds the same text each time.

**Phase 5 — ChatGPT injection** ([TESTING.md](TESTING.md) §3d): the prompt lands in the composer **unsent** with the banner; **break the composer selector on purpose** and confirm the clipboard fallback fires; opening ChatGPT by hand inserts nothing.

**Phase 6 — the other three platforms** ([TESTING.md](TESTING.md) §3e): one practice and one contest URL per platform (GfG: practice only); **confirm the GfG hashed class names still match**, which is the single most likely thing to be wrong.

**Phase 7 — options, history and diagnostics** ([TESTING.md](TESTING.md) §3f): walk every section of the options page — none of its rendering is test-covered; **read a copied broken-page report** and confirm no code is in it; check history de-duplicates across both Codeforces URL forms.

Run `npm run build`, then `chrome://extensions` → Developer mode → Load unpacked → select `dist/`. See [TESTING.md](TESTING.md) §3, §3a–§3f.

**Notes:** _—_

---

## 12. Options page must explain `openInNewTab`'s scope

- [x] Label it so it reads as governing the YouTube result only

[D042](decisions.md#d042) settled that the ChatGPT action always opens a new tab — navigating the current tab would destroy the problem page the prompt was built from. That is right, and it looks like a bug next to a setting called "open in new tab". The options page (phase 7) has to say which action it applies to.

**Notes:** _Done in phase 7. The toggle reads "Open results in a new tab" with the hint "YouTube only — Ask ChatGPT always opens a new tab, so the problem page you are on is not closed underneath you."_

---

## Done

- [x] Product spec — [spec.md](spec.md)
- [x] Architecture — [architecture.md](architecture.md)
- [x] Name and placeholder icons
- [x] Domain model — [domain.md](domain.md)
- [x] Twelve open domain questions resolved (U1–U12)
- [x] README — with contest-ethics and content-relay statements
- [x] Privacy policy — [PRIVACY.md](PRIVACY.md), minus items 1 and 2 above
- [x] Decision log — [decisions.md](decisions.md)
