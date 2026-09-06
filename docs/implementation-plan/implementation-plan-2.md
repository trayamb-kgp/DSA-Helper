# Implementation Plan 2 — Live extraction smoke tests

**Covers:** adding a second e2e lane that runs the **built extension against real problem pages** and asserts extraction still works — the drift detector the fixture suite structurally cannot be ("suggestion B").
**Status:** implemented — all three phases landed 2026-09-06, and follow-up #1 (the LeetCode number fix) landed the same day. Live lane fully green: Codeforces, CodeChef, and both LeetCode canaries pass; the LeetCode rows are now regression guards rather than expected-failures. Follow-ups #2 (LeetCode fixture refresh) and #3 (CodeChef difficulty label) also landed 2026-09-06 — all three related follow-ups are now done.
**Last updated:** 2026-09-06

Source documents: [TESTING.md](../TESTING.md) · [decisions.md](../decisions.md) ([D047](../decisions.md#d047)) · [e2e/README.md](../../e2e/README.md) · [implementation-plan-1.md](implementation-plan-1.md)

---

## Why this plan exists

A user reported that on `leetcode.com/problems/distinct-subsequences/description/` the YouTube search came out as `LeetCode Distinct Subsequences solution` — **no problem number**. The default template is `{platform} {number} {title} solution`, so an empty `{number}` collapsed away.

Driving the built extension against the live page (headed Edge, past Cloudflare) reproduced it and found the root cause:

- The bug hits **every** LeetCode problem, not just the daily-question route — `/problems/two-sum/` loses its number too.
- LeetCode's embedded page state now contains a **`titleSlug`-only fragment**. The JSON walker's `looksLikeQuestion` accepts a match on `titleSlug === slug` alone ([leetcode.ts](../../src/content/platform/leetcode.ts)), so the BFS returns that partial fragment first — it has no `questionFrontendId` and no `title`. The number then falls to `document.title` ("Distinct Subsequences - LeetCode"), which carries no leading number, and comes out `null`. The complete question data, with the id, is present elsewhere in the page but never reached.
- Codeforces extraction is clean. CodeChef works but its difficulty reads `"Difficulty:242"` (label not stripped). GeeksforGeeks returns `number: null` **by design** ([D024](../decisions.md#d024)).

**Why no test caught it.** The LeetCode adapter test asserts `number === '912'` against `leetcode-practice.html` — a *frozen snapshot* that still contains a complete question JSON. It stays green while live LeetCode changed shape. This is textbook fixture rot ([TESTING.md](../TESTING.md) §3a, [todo.md](../todo.md) #5). `npm run verify` never opens a browser or touches the live site, so it **cannot** see this class of failure. Only a test that runs against the real site can — which is what this plan adds.

**Scope boundary.** This plan builds the **test lane and its specs**. It does **not** fix the extraction bugs it documents — those are follow-ups (see the closing section), tracked separately so this plan stays about testing.

---

## How to use this plan

Same conventions as [implementation-plan-1.md](implementation-plan-1.md): phases are sequential; each carries **Decisions / Q&A / Track / Additional Notes**; a significant decision gets a numbered entry in [decisions.md](../decisions.md) in the same change; **Track** is the resumption state, cleared to `Phase complete.` when done.

**Standing rules that apply here**

- The offline lane (`npm run test:e2e`) must stay **hermetic** — no network, deterministic, safe as a gate. Nothing in this plan may make it flaky.
- The live lane is **opt-in**, never a commit or CI gate. A red live run means "the site moved, go look" — not "the build is broken".
- The live lane reuses the existing harness ([e2e/fixtures.ts](../../e2e/fixtures.ts)); it does not fork a second way of loading the extension.

---

## The shape, in one picture

```
e2e/
  fixtures.ts              # shared harness (extension in Edge) — extended, not replaced
  options.spec.ts          # offline lane  → project "e2e"   → npm run test:e2e
  extraction.live.spec.ts  # live lane     → project "live"  → npm run test:e2e:live   (NEW)
```

`playwright.config.ts` grows two projects that split on filename:

```ts
projects: [
  { name: 'e2e',  testMatch: /(?<!\.live)\.spec\.ts$/ },                 // offline, default
  { name: 'live', testMatch: /\.live\.spec\.ts$/, retries: 2, timeout: 90_000 },
]
```

```jsonc
"test:e2e":      "playwright test --project=e2e",     // hermetic, unchanged in spirit
"test:e2e:live": "playwright test --project=live"      // opt-in drift canary
```

---

## Phase 1 — The live lane

**Goal.** A second, isolated Playwright lane that shares the harness but never runs on the default trigger. No live assertions yet — just the plumbing, proven not to disturb the offline suite.

**Exit criteria.** `npm run test:e2e` runs **only** `options.spec.ts` (offline, green, no network). `npm run test:e2e:live` runs the `live` project and finds a placeholder spec that passes. The two lanes share one `fixtures.ts`.

### Tasks

- [x] `playwright.config.ts` — add the `e2e` and `live` projects with the `testMatch` split above; give `live` its own `retries` and `timeout`. Leave the shared `use`/reporter as they are.
- [x] `package.json` — `test:e2e` → `playwright test --project=e2e`; add `test:e2e:live` → `playwright test --project=live`. `test:e2e:report` unchanged.
- [x] `e2e/fixtures.ts` — add a live helper, `extractContext(serviceWorker, urlPart)`: from the service worker, find the tab whose URL contains `urlPart`, send `{ type: 'EXTRACT_CONTEXT' }`, return the `CONTEXT_RESULT` (or a shaped error). This is the same call the popup makes; it needs no popup.
- [x] Confirm the default lane is untouched: `npm run test:e2e` still green, offline (5 passed, headless).

### Decisions (prospective)

- **Two projects, split by filename, over an env gate or a grep tag.** A `*.live.spec.ts` file matched by a named project is discoverable in the config itself; an env flag hides the separation inside each spec, and a title tag hides it in a string. To be recorded as an extension of [D047](../decisions.md#d047).
- **The live lane reuses `fixtures.ts` and Edge.** Same reason Edge is the default there ([D047](../decisions.md#d047)); a live lane on a different browser would test a different thing.

### Q&A

- _Resolved:_ should `test:e2e:live` force headed (Cloudflare needs it) rather than relying on the default? **The default (headed) is the contract, not a hard override.** Headedness lives in `fixtures.ts` (`PW_HEADLESS`), and the live lane reuses that one launch path rather than forking it. A headless run is *safe* rather than forbidden: a Cloudflare-challenged page never hydrates, and the loader turns that into a `skip`, not a failure. Documented in the spec header and both READMEs.

### Track

Phase complete. Config carries the `e2e`/`live` split; `test:e2e:live` added; `extractContext` + `ExtractResult` live in `fixtures.ts`; offline lane re-run green (5 passed).

### Additional Notes

- Finding a Chrome tab id from a Playwright `Page` has no direct API, so `extractContext` matches on a URL substring inside the service worker — the approach proven in the throwaway live probe this plan came from.

---

## Phase 2 — The extraction smoke spec

**Goal.** `e2e/extraction.live.spec.ts` — open real problem pages, run our extraction, and assert the number survives. The spec that would have caught the reported bug.

**Exit criteria.** `npm run test:e2e:live` opens each canary headed, clears Cloudflare, waits for hydration, and asserts. The Codeforces canary **passes**. The LeetCode canary is present and marked **expected-failure** (`test.fail()`), documenting the known bug until the extraction fix lands. The offline lane is unaffected.

### Tasks

- [x] Canary list, fixed URLs only (never the rotating daily question):
  - Codeforces `problemset/problem/1352/A` → expect `number === '1352A'`, title non-empty. **Passes.**
  - CodeChef `problems/FLOW001` → expect `number === 'FLOW001'` (the resolved Q&A below). **Passes.**
  - LeetCode `problems/two-sum/` → expect `number === '1'` — wrapped in `test.fail()` with a comment pointing at the extraction follow-up.
  - LeetCode `problems/distinct-subsequences/description/` → expect `number === '115'` — same `test.fail()` treatment (this is the exact reported URL shape).
- [x] Per canary: `page.goto`; poll `page.title()` until it is not `Just a moment…` (Cloudflare) / the SPA shell; then poll `extractContext` until `context.title` is non-empty or a timeout; assert. (Implemented as the `loadProblem` helper.)
- [x] Prefer **headed** for this lane (extensions + Cloudflare); `PW_HEADLESS=1` gets challenged here and the affected canaries skip rather than fail.
- [x] A site that is unreachable should **skip**, not hard-fail: on `goto`/hydration timeout, `test.skip(true, …)` so an outage reads as skipped rather than red.
- [x] Assert the downstream effect too, once number is present: `buildQuery(DEFAULT_YOUTUBE_TEMPLATE, varsFromContext(ctx), ctx.url)` contains the number — the exact thing the user saw fail. (On the Codeforces canary.)

### Decisions (prospective)

- **The LeetCode canary ships as `test.fail()`, not deleted or commented out.** It documents the requirement *and* the known break in the suite; when the extraction fix lands, the test "unexpectedly passes", the marker is removed, and it becomes a real re-regression guard. Recorded with [D047](../decisions.md#d047).
- **Unreachable ≠ failed.** The live lane distinguishes "the site is down" (skip) from "the site changed and our extraction broke" (fail). Only the second is a signal worth acting on.

### Q&A

- _Resolved:_ include a CodeChef canary now? **Yes.** Added, asserting `number === 'FLOW001'` (passes); difficulty (`Difficulty:242`) is left to follow-up #3. The canary set now covers three platforms.

### Track

Phase complete. `e2e/extraction.live.spec.ts` written and run headed: Codeforces + CodeChef pass, both LeetCode rows fail-as-expected (`4 passed` — the two `x` are the expected failures). No skips — headed Edge cleared Cloudflare.

### Additional Notes

- With `retries` on the live project, a transient network failure and an assertion failure both count as "failed", so a flaky run can satisfy `test.fail()` for the wrong reason. Acceptable while the lane is opt-in; revisit if it ever becomes scheduled.
- Keep assertions conservative — `two-sum` is number `1` forever, `1352A` is stable — but prefer "number is non-empty" over exact strings for any canary whose identifier could legitimately change.

---

## Phase 3 — Wiring and documentation

**Goal.** The lane is discoverable, its opt-in nature is documented, and the release process knows to run it.

**Exit criteria.** TESTING.md and e2e/README.md describe the two lanes; the release checklist runs the live lane; [decisions.md](../decisions.md) records the split and the expected-failure convention.

### Tasks

- [x] [TESTING.md](../TESTING.md) §1.2 — add the live lane: what it is, `npm run test:e2e:live`, that it is opt-in / pre-release, and the headed-for-Cloudflare caveat. Keep the offline description as the hermetic default.
- [x] [TESTING.md](../TESTING.md) §5 (release checklist) — add "run `npm run test:e2e:live`; if a canary fails on *drift* (not an outage), re-capture the stale fixture ([todo.md](../todo.md) #5) before release."
- [x] [e2e/README.md](../../e2e/README.md) — document the two projects, the `*.live.spec.ts` convention, and the canary set.
- [x] [decisions.md](../decisions.md) — extend [D047](../decisions.md#d047) with a dated addendum recording: the project split, why the live lane is opt-in and off CI, and the `test.fail()`-documents-known-bugs convention.
- [x] Note CI treatment explicitly (in the D047 addendum): the offline `e2e` project may run on push; the `live` project runs manually or on a schedule, never as a required check.

### Decisions (prospective)

- Captured under Phase 1 and Phase 2; this phase writes them into [decisions.md](../decisions.md).

### Q&A

- _Resolved:_ is a nightly CI workflow for the live lane in scope now, or a later item? **Later.** The intent is documented (in the D047 addendum and above); the workflow itself is not built in this plan. There is no CI pipeline in the repo yet, so this stays a written contract until one exists.

### Track

Phase complete. §1.2 + §5 of TESTING.md updated; e2e/README.md documents both lanes and the canary set; D047 carries a 2026-09-06 addendum and its index row/date are bumped.

### Additional Notes

- The live lane is the automation of the manual instinct already in the docs — [TESTING.md](../TESTING.md) §5's "adapter 'verified on' dates reviewed" and [todo.md](../todo.md) #5's "refresh fixtures from live pages". It turns "someone remembers to check" into "a command tells you".

---

## Related follow-ups — surfaced here, out of scope for this plan

The live reproduction found real defects. This plan writes the tests that watch for them; the fixes are separate work, listed so they are not lost:

1. ~~**LeetCode number extraction (major — every problem).**~~ **Done (2026-09-06).** `looksLikeQuestion` now requires a real question object (`questionFrontendId` **and** `title`) before the walk accepts it, and uses `titleSlug` only to pick *our* problem among named candidates — so the `titleSlug`-only fragment is skipped and the walk reaches the object that carries the id. The two Phase 2 `test.fail()` markers were removed; the canaries pass as regression guards, and `distinct-subsequences` also asserts the number reaches the YouTube query.
2. ~~**Refresh the LeetCode fixture (A).**~~ **Done (2026-09-06).** `leetcode-practice.html` recaptured from the live page (trimmed, scrubbed): it now carries the `titleSlug`-only fragment the old snapshot lacked, so the fast adapter suite exercises the shape that broke and the practice `number === '912'` assertion fails on the old walker. Findings recorded in [todo.md](../todo.md) #5 (tab title lost its number; topic tags 3 → 8). The other seven fixtures remain hand-built.
3. ~~**CodeChef difficulty label (minor).**~~ **Done (2026-09-06).** The live chip renders `Difficulty:242` (no cached JSON on the page, so the DOM path is used); `codechef.ts` now strips a leading `Difficulty` label (optional colon/space) from the DOM value. Guarded by the refreshed contest fixture (chip now reads `Difficulty:2100`), three focused unit cases, and a live-lane assertion that no label leaks through.

---

## Cross-plan notes

- This plan adds **no** new production code and touches **no** adapter — only `e2e/`, `playwright.config.ts`, `package.json`, and docs. The offline `verify` gate is unchanged.
- It depends on nothing outstanding from [implementation-plan-1.md](implementation-plan-1.md); it builds on the harness delivered by [D047](../decisions.md#d047).
