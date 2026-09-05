# e2e — end-to-end tests

Playwright tests that load the **built** extension into a real Chromium and
drive its pages. They cover what source-level tests can't: the options page
rendering, live previews, the size guard, and the theme matrix — the manual
rounds in [../docs/TESTING.md](../docs/TESTING.md) §3f–§3g that had no
automation before ([D047](../docs/decisions.md)).

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

- `npm run test:e2e` — run the suite (headed by default).
- `PW_HEADLESS=1 npm run test:e2e` — run without a browser window (uses Chrome's
  new headless mode, which loads extensions; the old one does not).
- `npm run test:e2e:report` — open the last HTML report, including the theme
  screenshots attached to each run. The six theme × system shots are also
  written to `e2e/output/screenshots/` as named files.

## Layout

| File | What it holds |
|---|---|
| `fixtures.ts` | Launches the persistent context with the extension attached; exposes `context`, `serviceWorker`, `extensionId`, `seedStorage`, and the page URLs. |
| `options.spec.ts` | The options page: sections, previews, size guard, reset, theme × system matrix. |

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
