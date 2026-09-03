# DSA Helper — TODO

Pending items. Tick the box when done; add a note underneath if the outcome is worth recording.

**Last updated:** 2026-09-03

---

## 1. Contact address for the privacy policy

- [ ] Decide which address to publish
- [ ] Replace the placeholder in [PRIVACY.md](PRIVACY.md) → Contact section

Blocks publishing — the Web Store requires a working contact. Options: personal address, a dedicated alias for store listings, or a public issues URL.

**Notes:** _—_

---

## 2. Effective date for the privacy policy

- [ ] Set the `Effective date` in [PRIVACY.md](PRIVACY.md) on publication day

**Notes:** _—_

---

## 3. Licence

- [ ] Choose a licence
- [ ] Add a `LICENSE` file
- [ ] Update the Licence section of [README.md](../README.md)

Blocks the repo going public. With no licence the default is all rights reserved — nobody can legally fork or contribute.

**Notes:** _—_

---

## 4. Distribution

- [ ] Decide: unpacked install only, or publish to the Chrome Web Store

Items 1 and 3 only bind if you publish. See [spec.md](spec.md) §14.

**Notes:** _—_

---

## 5. Test fixtures

- [ ] Capture **real** saved HTML per platform (practice + contest, plus Premium on LeetCode)
- [x] Wire them into adapter tests
- [ ] Set a refresh schedule

Capture early — they're the only thing that detects a site redesign before users do. [architecture.md](architecture.md) §12.

**Notes:** _M2 shipped three LeetCode fixtures and M6 five more (Codeforces problemset + contest, CodeChef practice + contest, GfG practice) in `src/content/platform/__fixtures__/`. All eight are **hand-built** to the page shapes documented in [spec.md](spec.md) §6.3 and §6.6 — a contest page and a Premium page both need a logged-in account to reach. They exercise every code path and the suite passes against them, but they cannot detect a redesign, which is the main thing a fixture is for. Replacing them with real captures (trimmed to the statement and editor regions, account markup scrubbed, header comment saying what the fixture is for) should leave the tests passing unchanged — and if it doesn't, that difference is exactly the finding. Priority order: **GeeksforGeeks first** (its hashed CSS-module class names are the most likely thing in the project to be wrong), then CodeChef, then LeetCode contest/Premium. Codeforces is server-rendered and stable, so its two are the least urgent._

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
- [ ] **M8** Polish — README statements, icons, ready to package

Detail in [spec.md](spec.md) §13.

**Notes:** _M1 done 2026-09-03 — 124 unit tests, typecheck and build clean. M2 done 2026-09-03 — 225 tests total, content-script bundle 18 KB with no React. M3 done 2026-09-03 — 301 tests, service-worker chunk 4.9 KB. M4 done 2026-09-03 — 346 tests; a generated prompt still needs pasting into ChatGPT by hand to judge quality (item 11). M5 done 2026-09-03 — 383 tests, ChatGPT content script 3.2 KB, dist 290 KB; the deliberately-broken-selector check is the one that still needs a browser. M6 done 2026-09-03 — 454 tests, all four platforms, content script 27 KB, dist 298 KB. M7 done 2026-09-03 — 491 tests, dist 327 KB; the options page is the first substantial UI and none of its rendering is test-covered, so it needs eyes. M0 stays unticked until the four Chrome checks in item 11 are run; M2's own manual walk-through (practice, contest, Premium) is tracked in the phase 2 Track section._

---

## 9. Docs due at M8

- [x] `TESTING.md` — the manual smoke matrix promised in [architecture.md](architecture.md) §12
- [x] `CHANGELOG.md`
- [ ] Store listing copy + permission justifications

**Notes:** _TESTING.md and CHANGELOG.md created early (2026-09-03) rather than at M8, so they can be maintained phase by phase instead of reconstructed at the end. Store listing copy still belongs at M8._

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
