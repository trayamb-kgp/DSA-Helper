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
