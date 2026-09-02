# DSA Helper — TODO

Pending items. Tick the box when done; add a note underneath if the outcome is worth recording.

**Last updated:** 2026-09-02

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

- [ ] Capture saved HTML per platform (practice + contest)
- [ ] Wire them into adapter tests
- [ ] Set a refresh schedule

Capture early — they're the only thing that detects a site redesign before users do. [architecture.md](architecture.md) §12.

**Notes:** _—_

---

## 6. LeetCode storage key shape

- [ ] Discover during M2
- [ ] Document in the LeetCode adapter

[spec.md](spec.md) §14.

**Notes:** _—_

---

## 7. README documentation table

- [x] Add `decisions.md` and `todo.md` rows

**Notes:** _Done 2026-09-02, alongside moving the docs into `docs/`. The README stayed at the repo root so GitHub renders it as the landing page; the table now also lists the implementation plan._

---

## 8. Build milestones

- [ ] **M0** Scaffold — Vite + CRXJS + TS + React, manifest, icons, loads unpacked
- [ ] **M1** Core — types, storage, template renderer, `html2md`
- [ ] **M2** LeetCode adapter — metadata + all four code-capture layers
- [ ] **M3** YouTube action — all three trigger surfaces
- [ ] **M4** Prompt builder + copy-to-clipboard
- [ ] **M5** ChatGPT injection — banner + clipboard fallback
- [ ] **M6** Codeforces, CodeChef, GeeksforGeeks adapters
- [ ] **M7** Options page + history
- [ ] **M8** Polish — README statements, icons, ready to package

Detail in [spec.md](spec.md) §13.

**Notes:** _—_

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

## 11. Verify the scaffold in Chrome

Phase 0 is automated-green but these need a real browser:

- [ ] `dist/` loads unpacked with no errors on the extension card
- [ ] Toolbar icon opens the popup on a LeetCode problem page
- [ ] Options page opens from the extension card
- [ ] `chrome://extensions/shortcuts` lists all three commands, `Alt+Shift+Y` and `Alt+Shift+G` bound
- [ ] Confirm the two default shortcuts don't collide with LeetCode's own editor hotkeys

Run `npm run build`, then `chrome://extensions` → Developer mode → Load unpacked → select `dist/`. See [TESTING.md](TESTING.md) §3.

**Notes:** _—_

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
