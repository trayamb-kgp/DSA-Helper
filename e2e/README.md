# e2e — end-to-end tests

Playwright tests that load the **built** extension into a real Chromium and
drive its pages. They cover what source-level tests can't: the options page
rendering, live previews, the size guard, and the theme matrix — the manual
rounds in [../docs/TESTING.md](../docs/TESTING.md) §3f–§3g that had no
automation before ([D047](../docs/decisions.md)).

## Two lanes (Playwright projects)

The suite splits into two projects, matched by filename in
[../playwright.config.ts](../playwright.config.ts):

| Project | Files | Network | When |
|---|---|---|---|
| `e2e` (default) | `*.spec.ts` except `*.live.spec.ts` | none — hermetic | `npm run test:e2e`, any time |
| `live` | `*.live.spec.ts` | opens real problem pages | `npm run test:e2e:live`, opt-in / pre-release |

The offline `e2e` lane is deterministic and safe as a gate. The `live` lane is
the drift detector the fixture suite structurally cannot be: it runs the
extension's own extraction against the live site and asserts the problem number
survives — catching a redesign before users do. A red `live` run means "the
site moved, go look", **not** "the build broke", so it is never a required
check. Naming a spec `*.live.spec.ts` is what puts it in that lane.

### Live canaries

`extraction.live.spec.ts` opens fixed URLs (never the rotating daily problem):

| Canary | Expects | Status |
|---|---|---|
| Codeforces `1352/A` | number `1352A`, and it reaches the YouTube query | passes |
| CodeChef `FLOW001` | number `FLOW001` | passes |
| LeetCode `two-sum`, `distinct-subsequences` | number `1`, `115` | `test.fail()` — documents a known live bug until the extraction fix lands |

Two rules keep the lane honest: an **unreachable or un-hydrated** page (an
outage, or a headless Cloudflare block) is `skip`ped, not failed — only a page
that *did* load and dropped the number fails; and the LeetCode rows ship as
`test.fail()`, so they document the bug now and flip to real regression guards
the moment extraction is fixed (they will then "unexpectedly pass").

**Run the live lane headed.** LeetCode's Cloudflare interstitial needs a real
window; `PW_HEADLESS=1` gets challenged and the affected canaries skip.

## Which browser (important)

The suite loads an **unpacked** extension, and that only works on some
Chromiums:

| Channel | Loads the extension? |
|---|---|
| **Edge** (`msedge`) — the default | ✅ works |
| Playwright's bundled Chromium (`chromium`) | ✅ on CI; fails to start on this Windows box (VC++/side-by-side runtime) |
| Google Chrome stable (`chrome`) | ❌ Chrome 137+ removed the `--load-extension` switch |

Edge is Chromium and serves `chrome-extension://` pages identically, so it is a
faithful target for the extension's own surfaces. Override the channel with
`PW_CHANNEL` (e.g. `PW_CHANNEL=chromium` on CI). See [D047](../docs/decisions.md).

## Running

```bash
npm run build
npm run test:e2e
```

The build step is not optional: this layer reads what Chrome actually loads
from `dist/`, the same reason `check:build` exists. The harness refuses to run
with a clear error if `dist/manifest.json` is missing.

- `npm run test:e2e` — run the offline lane (headed by default).
- `PW_HEADLESS=1 npm run test:e2e` — run it without a browser window (uses
  Chrome's new headless mode, which loads extensions; the old one does not).
- `npm run test:e2e:live` — run the live lane. Keep it **headed** (don't set
  `PW_HEADLESS`): the LeetCode canaries hit Cloudflare otherwise and skip.
- `npm run test:e2e:report` — open the last HTML report, including the theme
  screenshots attached to each run. The six theme × system shots are also
  written to `e2e/output/screenshots/` as named files.

## Layout

| File | What it holds |
|---|---|
| `fixtures.ts` | Launches the persistent context with the extension attached; exposes `context`, `serviceWorker`, `extensionId`, `seedStorage`, the page URLs, and `extractContext` (runs the extension's extraction against a live tab). |
| `options.spec.ts` | Offline lane (`e2e`). The options page: sections, previews, size guard, reset, theme × system matrix. |
| `extraction.live.spec.ts` | Live lane (`live`). Opens real problem pages and asserts the extracted number survives. |

Everything Playwright writes lands under `e2e/output/` (gitignored).

## Notes and limits

- **Extensions need a persistent context**, so each test launches its own with a
  throwaway profile, rather than using Playwright's shared browser fixture.
- **Keyboard shortcuts (`Alt+Shift+Y/G`) and native context-menu items can't be
  driven here** — Chrome dispatches `commands` at the browser level, outside the
  page. Their three-surface parity ([D013](../docs/decisions.md)) stays a manual
  check for the shortcut; the popup and menu are automatable and are the next
  specs to grow.
- **Screenshots are report attachments, not committed pixel baselines** — font
  rendering differs across machines, so the assertions carry the regression
  signal and the images are for human review.
