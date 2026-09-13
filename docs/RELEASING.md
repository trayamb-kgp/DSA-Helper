# Releasing DSA Helper

How a version goes from `dev` to the Chrome Web Store. The pipeline is two
GitHub Actions workflows ([.github/workflows/ci.yml](../.github/workflows/ci.yml),
[.github/workflows/release.yml](../.github/workflows/release.yml)); the *why* is
in [D052](decisions.md#d052)–[D054](decisions.md#d054), and the build plan is
[implementation-plan-4](implementation-plan/implementation-plan-4.md).

**The rule that keeps it safe:** the release is automated up to the point of
publishing, and **publishing stays manual**. CI uploads the build to the Web
Store *draft*; a human reviews it and rolls it out. This honours the staged
rollout in [D030](decisions.md#d030) — a bad adapter change reaching 100% of
users at once is a reputational event, so a person always gates the last step.

---

## One-time setup (before the first release)

These are GitHub-side settings, done once in the repository UI.

1. **Create a `release` environment** — repo → Settings → Environments → New
   environment → `release`. Optionally add yourself as a required reviewer so
   every release deploy pauses for a manual approval.

2. **Add four secrets to that environment** (Settings → Environments → `release`
   → Environment secrets). These come from the Google Cloud OAuth flow for the
   Chrome Web Store API:
   - `CWS_EXTENSION_ID` — the extension's ID on the Web Store.
   - `CWS_CLIENT_ID`
   - `CWS_CLIENT_SECRET`
   - `CWS_REFRESH_TOKEN`

   How to obtain each of these is in **Obtaining the four Web Store secrets**
   below.

3. **Branch protection** — Settings → Branches. On `dev` and `prod`, require the
   **`verify`** status check to pass before merging. Leave the **`e2e`** check
   *non-required* (it is intentionally non-blocking until it proves stable).

### Obtaining the four Web Store secrets

CI needs no secrets. Only the release workflow does — these four. One comes from
the store dashboard; the other three come from a one-time Google Cloud OAuth
setup.

**Prerequisite.** The Chrome Web Store API can only *update an existing* item,
not create one. So the extension must be **uploaded manually once** through the
dashboard to create the listing before any automated release can update it — the
first release is manual, the pipeline takes over from the second.

1. **`CWS_EXTENSION_ID`** — in the [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (one-time $5 registration), open your item; the **Item ID** is the 32-char
   string shown there and in the URL.

2. **`CWS_CLIENT_ID` + `CWS_CLIENT_SECRET`** — in the
   [Google Cloud Console](https://console.cloud.google.com):
   1. Create or select a project.
   2. APIs & Services → **Library** → enable the **Chrome Web Store API**.
   3. APIs & Services → **OAuth consent screen** → User type **External**; fill
      app name and your emails. **Then set publishing status to "In production"
      (publish the app).** ⚠️ While it stays in *Testing*, refresh tokens expire
      after **7 days** and releases break weekly; in production the token does
      not expire. No Google verification is needed since you are the only user.
   4. APIs & Services → **Credentials** → **Create Credentials** → **OAuth
      client ID** → application type **Desktop app**. Copy the **Client ID** and
      **Client secret**.

3. **`CWS_REFRESH_TOKEN`** — the OAuth token tied to those credentials. Easiest,
   in your own terminal:
   ```bash
   npx chrome-webstore-upload-keys
   ```
   It prompts for the Client ID + secret, opens a browser to authorize with the
   **same Google account that owns the CWS item**, and prints the refresh token.
   (Manual alternative: [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
   with "Use your own OAuth credentials", scope
   `https://www.googleapis.com/auth/chromewebstore`, then exchange the code for
   tokens.)

Add all four under Settings → Environments → `release` → **Environment secrets**
(names exactly as above). A green release run is your confirmation they are
correct — the upload step fails loudly on a bad or expired credential. If it
ever fails with an auth error, regenerate `CWS_REFRESH_TOKEN` and update the
secret; that is the usual maintenance point.

---

## Cutting a release

The version lives in **one** place, `package.json`; the manifest derives from it
([D053](decisions.md#d053)), so bump it once.

1. **On `dev`, bump the version** (no git tag yet — the tag belongs on `prod`):
   ```bash
   git checkout dev && git pull
   npm version <patch|minor|major> --no-git-tag-version
   ```

2. **Update the changelog.** In [CHANGELOG.md](CHANGELOG.md), rename the
   `[Unreleased]` section to the new version with today's date, and open a fresh
   empty `[Unreleased]`. The release notes on GitHub are generated from this
   version's section.

3. **Commit and push** the bump + changelog on `dev`; let CI go green.

4. **Merge `dev` → `prod`.**

5. **Tag the `prod` commit and push the tag.** The tag must equal the
   `package.json` version, prefixed with `v`:
   ```bash
   git checkout prod && git pull
   git tag v0.2.0
   git push origin prod --tags
   ```

Pushing the tag fires `release.yml`, which:

- guards that the tag equals `package.json`'s version;
- guards (hard fail) that the tagged commit is an ancestor of `prod` — a tag cut
  from `dev` or a stray commit will not release;
- runs `npm run verify` from scratch;
- zips `dist/` into `dsa-helper-<version>.zip`;
- uploads that zip to the Chrome Web Store **draft** (never auto-publishes);
- creates a GitHub Release last, with the zip attached and notes from the
  changelog.

---

## Publishing (manual, in the CWS dashboard)

After the workflow succeeds, the build is sitting in the store draft.

1. Open the item in the Chrome Web Store developer dashboard and review the
   uploaded draft.
2. Publish at a **10%** staged rollout ([D030](decisions.md#d030)).
3. Smoke-test the *published* build against the live sites
   ([TESTING.md](TESTING.md) §2.3).
4. Promote **10% → 50% → 100%** as it holds up.

---

## The website (privacy policy + landing page)

The `website/` directory (landing page + `privacy.html`) is a **separate deploy
from the extension**, on its own track. It is a static site — no build step, no
server code — hosted on **Vercel** ([D055](decisions.md#d055),
[D056](decisions.md#d056)). The Chrome Web Store requires a public privacy-policy
URL, and this site is what provides it while the repository itself stays private.

**How it deploys — automatically, from `prod`.** The Vercel project is connected
to this GitHub repo. Its production branch is **`prod`**, so **the moment a change
to `website/` lands on `prod`, Vercel rebuilds and redeploys** the site at
`https://dsa-helper-zeta.vercel.app`. There is nothing to run by hand — no
`wrangler deploy`, no upload. (The old Cloudflare `wrangler.jsonc` has been
removed; deployment is entirely Vercel's GitHub integration now.)

The practical consequence: **a `website/` edit only goes live once it reaches
`prod`.** Editing it on `dev` changes nothing users see until `dev` → `prod` is
merged. This is the same "the deploy branch is the source of truth" rule the
extension follows, just pointed at a different branch consumer.

### The hard-coded link — how the extension finds the policy

The extension does **not** fetch the site or discover its URL at runtime. The
address is a **compile-time constant**: `SITE_URL` in
[`src/core/links.ts`](../src/core/links.ts), currently
`https://dsa-helper-zeta.vercel.app`. `privacyUrl()` builds `${SITE_URL}/privacy.html`
from it, and that string is **baked into whatever build you ship**. So the link
the installed extension opens is frozen at the version it was built with — it does
not follow the site if the site later moves.

Two independent places therefore hold this URL, and both must agree:

1. **`SITE_URL`** in the extension build (the in-extension "Privacy policy" link).
2. **The Web Store listing's Privacy Policy field** (what reviewers and the store
   page point at) — also mirrored in [STORE-LISTING.md](STORE-LISTING.md).

### If the deployment ever changes (new URL, new host, or custom domain)

Because the URL is hard-coded, changing where the site lives is **not** just a
hosting change — it requires shipping a new extension build. Do all of these, or
the in-extension link will point at a dead address for already-installed users:

1. **Update `SITE_URL`** in [`src/core/links.ts`](../src/core/links.ts) to the new
   origin (no trailing slash). This is the only code change.
2. **Cut a new extension release** (the flow above) so the corrected link is in a
   published build. Users on the old build keep the old, now-stale link until they
   update — a compile-time constant cannot be hot-fixed, which is the tradeoff for
   having no runtime network dependency.
3. **Update the Web Store** Privacy Policy URL field, and
   [STORE-LISTING.md](STORE-LISTING.md) to match.
4. **Update the docs** that name the concrete URL: this file,
   [STORE-LISTING.md](STORE-LISTING.md), [todo.md](todo.md) #4, and record the
   move as a new decision revising [D056](decisions.md#d056).
5. **If the host itself changes** (away from Vercel) or the production branch
   changes, reconnect/reconfigure the integration accordingly, and make sure the
   new host still publishes **only** `website/` — nothing outside it, so the
   private `docs/` tree never leaks ([D055](decisions.md#d055)).

A **custom domain** on the same Vercel project is the cheapest kind of move: point
the domain at the project in Vercel, then do steps 1–4 with the new domain. The
old `*.vercel.app` URL keeps working, so there is no hard cutover — but the
in-extension link is still only corrected by a new release.

---

## If a release run fails

- **Fix forward with a new patch tag** (`v0.2.1`). Do **not** delete and
  re-push the same tag — a moved tag is a footgun once the GitHub Release or
  anything else references the old commit.
- A failure *before* the upload step means nothing shipped; fix and re-tag.
- A failure at the GitHub-Release step *after* a successful upload means the
  draft is already in the store — publish it from the dashboard and create the
  Release by hand if needed, rather than re-running the whole tag.

---

## What is deliberately manual or deferred

- **Publishing + rollout %** — manual by design ([D054](decisions.md#d054)).
- **The live e2e lane and a nightly drift-check workflow** — deferred
  ([D047](decisions.md#d047)); the offline lane runs in CI but does not gate.
- **API-driven staged rollout** — a future optimisation, to be earned once the
  manual flow has shipped a few releases ([implementation-plan-4](implementation-plan/implementation-plan-4.md)).
