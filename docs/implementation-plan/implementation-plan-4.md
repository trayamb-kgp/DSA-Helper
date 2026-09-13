# Implementation Plan 4 — CI/CD (GitHub Actions)

**Scope.** Stand up the continuous-integration and release pipeline the docs have
promised but never built: a hermetic CI gate on every change, and a
tag-triggered release that packages the extension and uploads it to the Chrome
Web Store as a draft. This plan turns written intent — [D030](../decisions.md#d030)
(fixture-gated, staged rollout), the [D047](../decisions.md#d047) addendum
("offline e2e *may* run on push; the live lane runs nightly/manual, never a
required check — not built until a CI pipeline exists") — into actual workflows.

**New decisions this plan records:** [D052](../decisions.md#d052) (pipeline shape
and branch/trigger model), [D053](../decisions.md#d053) (single version source +
tag guard), [D054](../decisions.md#d054) (upload-to-draft only; publish and
rollout stay manual).

**Status:** not yet built. Phases are ordered so each is independently
mergeable and leaves `main`/`dev` green.

---

## Decisions taken (from the planning conversation)

| Question | Answer |
|---|---|
| Release branch & trigger | `dev` → merge to `prod` to release; push tag `vX.Y.Z` on `prod` to trigger the release workflow. `main` remains the GitHub default / PR base. |
| Web Store step on release | **Upload only** to the store draft. Publishing and the staged rollout % ([D030](../decisions.md#d030)) stay a manual dashboard action. |
| e2e in CI now | `npm run verify` is the blocking gate. Offline Playwright `e2e` runs as a **non-blocking** job. The live lane and a nightly workflow are **deferred**. |
| Version source of truth | `package.json` is authoritative; `manifest.config.ts` reads its version from it. CI asserts the pushed tag equals `package.json` version. |

---

## The release flow, end to end (target state)

1. Land all changes on `dev` via PRs (CI green).
2. Decide to release. On `dev`, bump the version once: `npm version <patch|minor|major> --no-git-tag-version` (edits `package.json` only; the manifest now follows it — [D053](../decisions.md#d053)). Commit, add a dated `[Unreleased]` → `[x.y.z]` rename in [CHANGELOG.md](../CHANGELOG.md).
3. Merge `dev` → `prod`.
4. Tag the `prod` commit with the **same** version and push it:
   ```bash
   git checkout prod && git pull
   git tag v0.2.0
   git push origin prod --tags
   ```
5. The tag push fires `release.yml`. It re-verifies, re-builds, guards
   `tag == package.json version`, zips `dist/`, uploads the zip to the CWS
   draft, and creates a GitHub Release with the zip attached.
6. **Manual, in the CWS dashboard:** review the draft, publish at a **10%**
   staged rollout ([D030](../decisions.md#d030)), smoke-test the published
   build, then promote to 50% → 100%.

The one automated failure mode we accept: a red release run after a tag push
means "the tag went out but nothing shipped" — fix forward and re-tag
(`v0.2.1`), never force-move a tag (see Phase 3 notes).

---

## Phase 0 — Version single source of truth ([D053](../decisions.md#d053))

Prereq for the release guard; a small code change, shippable on its own.

- [ ] In [manifest.config.ts](../../manifest.config.ts), replace the hardcoded
      `version: '0.1.0'` with the value from `package.json`:
      ```ts
      import pkg from './package.json';   // resolveJsonModule is on; tsconfig includes this file
      // ...
      version: pkg.version,
      ```
- [ ] Confirm the emitted manifest still carries the right version:
      `npm run build && npm run check:build` (check-build already reads
      `dist/manifest.json`'s `version`).
- [ ] `npm run verify` stays green.
- [ ] From now on, **never** edit the version in `manifest.config.ts`; bump
      `package.json` only.

*Note:* `npm version` normally creates a git tag; use
`--no-git-tag-version` at bump time because the tag is pushed on `prod`, not
`dev`, and must be created deliberately (step 4 above).

---

## Phase 1 — CI workflow (`.github/workflows/ci.yml`)

The hermetic gate. Blocking.

- [ ] Trigger on `pull_request` (any base) and `push` to `dev` and `prod`.
      (`main` PRs are covered by the base-agnostic `pull_request` trigger.)
- [ ] `concurrency` keyed on the ref, `cancel-in-progress: true`, so
      superseded pushes don't pile up runners.
- [ ] Single job `verify` on `ubuntu-latest`:
  - [ ] `actions/checkout@<pinned sha>`
  - [ ] `actions/setup-node@<pinned sha>` with `node-version` matching local
        (Node 20/22 LTS) and `cache: npm`.
  - [ ] `npm ci`
  - [ ] `npm run verify` — this is `typecheck && test && build && check:build`,
        i.e. the same gate developers run. The fixture-based adapter unit tests
        that [D030](../decisions.md#d030) requires ride inside `npm run test`; no
        separate step needed.
- [ ] `permissions: contents: read` (least privilege; this job publishes nothing).
- [ ] Pin every third-party action to a full commit SHA, not a floating tag.

**Acceptance:** open a throwaway PR into `dev`; the `verify` check runs and
blocks on failure. Add it as a required status check in branch protection for
`dev` and `prod`.

---

## Phase 2 — Offline e2e job (non-blocking)

Adds the Playwright offline lane as a **separate, non-required** job — coverage
signal without gating merges (chosen scope; the live lane stays deferred).

- [ ] Second job `e2e` in `ci.yml` (or a sibling workflow), `needs: verify` so
      it only runs on an already-verified build.
- [ ] `continue-on-error: true` **and** left out of required checks, so a red
      run is visible but never blocks. (Revisit once it proves stable.)
- [ ] Steps: `npm ci` → `npm run build` (the e2e fixtures refuse to run without
      a current `dist/` — see [playwright.config.ts](../../playwright.config.ts))
      → `npx playwright install chromium` → run the offline project only:
      `npm run test:e2e` (the `e2e` project excludes `*.live.spec.ts`).
- [ ] Extensions need a real (non-old-headless) Chromium. Use the bundled
      Chromium under the **new** headless mode, which loads MV3 extensions
      ([D047](../decisions.md#d047) addendum). Set the env the config expects
      (`PW_HEADLESS=1`, and `PW_CHANNEL` left unset to use bundled Chromium);
      wrap in `xvfb-run -a` if the new-headless path still needs a display on
      the runner.
- [ ] Upload `e2e/output/report` as an artifact on failure for triage.

**Explicitly out of scope here:** the `live` lane and any nightly/scheduled
workflow. Deferred by decision; the [D047](../decisions.md#d047) contract already
describes them as later work.

---

## Phase 3 — Release workflow (`.github/workflows/release.yml`)

Tag-triggered. The order is deliberate: **verify → build → zip → CWS upload →
GitHub Release last**, so a failed upload never leaves an orphan Release
advertising a version that never shipped.

- [ ] Trigger: `on: push: tags: ['v*']`.
- [ ] `permissions: contents: write` (needs to create the Release).
- [ ] `concurrency` keyed on the tag; do not cancel in progress.
- [ ] Single job, `ubuntu-latest`, using the release **environment** (below):
  1. [ ] `checkout` the tagged commit with `fetch-depth: 0` (the ancestry
         guard below needs full history and the `prod` ref, not the default
         shallow single-commit fetch).
  2. [ ] **Version guard.** Fail unless the tag equals `package.json` version:
         strip the leading `v` from `github.ref_name`, compare to
         `node -p "require('./package.json').version"`, exit 1 on mismatch.
         This is the single highest-value safety check — it stops a tag that
         points at a commit whose manifest says something else.
  3. [ ] **Branch-ancestry guard (hard fail).** Fail unless the tagged commit
         is an ancestor of `prod` — i.e. the tag was actually cut from the
         release branch, not from `dev` or a stray commit. Fetch the branch and
         assert:
         ```bash
         git fetch origin prod --depth=0
         git merge-base --is-ancestor "$GITHUB_SHA" origin/prod \
           || { echo "::error::tag $GITHUB_REF_NAME is not on prod"; exit 1; }
         ```
         `--is-ancestor` exits non-zero when the commit is not contained in
         `prod`, which fails the step. This closes the gap left by the tag
         trigger firing regardless of branch ([D052](../decisions.md#d052)).
  4. [ ] `npm ci`
  5. [ ] `npm run verify` — re-verify from scratch; never trust that CI already
         ran on this commit (a tag can point anywhere).
  6. [ ] Zip the built extension: `dist/` → `dsa-helper-<version>.zip`
         (the naming matches the gitignored pattern already in
         [.gitignore](../../.gitignore); reuse `tools/` if a zip helper is added).
  7. [ ] **Upload to Chrome Web Store (draft only).** Use
         `chrome-webstore-upload-cli`'s `upload` command *without* a publish
         flag — [D054](../decisions.md#d054). Needs four secrets (below). Do
         **not** pass `--auto-publish`.
  8. [ ] Create the GitHub Release last: `softprops/action-gh-release@<sha>`,
         attaching the zip, body seeded from the version's CHANGELOG section.
- [ ] Pin all actions to SHAs.

**Secrets** (repo → Settings → Environments → a `release` environment, so a
required reviewer can gate the deploy):
- [ ] `CWS_EXTENSION_ID`
- [ ] `CWS_CLIENT_ID`
- [ ] `CWS_CLIENT_SECRET`
- [ ] `CWS_REFRESH_TOKEN`

Obtain these once via the Google Cloud OAuth flow for the Chrome Web Store API;
document the refresh-token regeneration steps in a runbook, since refresh tokens
can expire/rotate.

**Re-tagging on failure.** If the release run fails after the tag exists, cut a
new patch tag (`v0.2.1`) rather than deleting and re-pushing the same tag —
moved tags are a known footgun (consumers and the GitHub Release may already
reference the old SHA).

---

## Phase 4 — Documentation & guardrails

- [ ] Add a short **Release runbook** section to [docs/STORE-LISTING.md](../STORE-LISTING.md)
      or a new `docs/RELEASING.md`: the six-step flow above, the manual 10% →
      50% → 100% rollout, and the secret-rotation notes. Link it from
      [README.md](../../README.md).
- [ ] Enable branch protection: require the `verify` check on `dev` and `prod`;
      keep `e2e` non-required.
- [ ] Confirm `decisions.md` carries [D052](../decisions.md#d052)–[D054](../decisions.md#d054)
      (done alongside this plan).
- [ ] Leave a `[Unreleased]` entry discipline note in place (CHANGELOG already
      documents it) — the release body is generated from it.

---

## Deferred / future work (tracked, not built here)

- **Nightly live-lane workflow** — run the `live` Playwright project on a
  schedule and on manual dispatch; report drift, never block. ([D047](../decisions.md#d047))
- **Automated staged rollout** — promote the manual publish to an API-driven
  `deployPercentage` once the pipeline has shipped a few releases by hand and
  earned trust. ([D030](../decisions.md#d030), [D054](../decisions.md#d054))
- **Promote `e2e` to a required check** once it proves non-flaky in CI.
- **Firefox/Edge add-on stores** — out of scope; MV3 CWS only for now.

---

## Open questions

- _Resolved:_ branch/trigger model, publish mode, e2e scope, version source —
  see the decisions table at the top.
- _To settle at build time:_ exact Node LTS version for the runner (match the
  local dev version); whether the new-headless Chromium path needs `xvfb-run`
  on `ubuntu-latest` or runs cleanly without a virtual display.
