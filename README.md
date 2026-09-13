<img src="public/icons/icon128.png" alt="" width="72" align="left" hspace="12">

# DSA Helper

**Get unstuck on a DSA problem without retyping anything.** A Chrome extension for LeetCode, Codeforces, CodeChef and GeeksforGeeks that turns the problem you're looking at — and the code you've written — into either a YouTube search or a ready-to-send ChatGPT review, in one keystroke.

<br clear="left">

> **Status: feature-complete, pre-release.** All four platforms and all three actions are built and covered by 516 unit tests. What remains is verification in a real browser and the Chrome Web Store submission itself — see [docs/TESTING.md](docs/TESTING.md) §2.3 for the manual walkthrough and [docs/STORE-LISTING.md](docs/STORE-LISTING.md) for the release checklist. Not yet on the Chrome Web Store.

---

## What it does

You're on a problem page. You're stuck, or you've written something and you're not sure about it. Two shortcuts:

| Action | Default shortcut | What happens |
|---|---|---|
| **Search YouTube** | `Alt+Shift+Y` | Opens YouTube results for a query built from the problem — `LeetCode 912 Sort an Array solution` |
| **Ask ChatGPT** | `Alt+Shift+G` | Opens ChatGPT with a full prompt already typed in: the problem, the examples, the constraints, your code, and a clear request for a correctness / complexity / optimality review. **You read it and press Enter yourself** |
| **Copy prompt** | *(unbound)* | Puts that same prompt on your clipboard without opening anything |

All three are also available from the toolbar popup and the right-click menu. Shortcuts can be rebound at `chrome://extensions/shortcuts`.

**Both texts are templates you own.** The YouTube query and the ChatGPT prompt are editable in settings, with variables like `{platform}`, `{title}`, `{number}`, `{statement}`, `{constraints}`, `{code}` — and a reset-to-default button when you overdo it.

## Supported sites

| Platform | Practice | Contest |
|---|---|---|
| **LeetCode** | `leetcode.com/problems/…` | ✅ |
| **Codeforces** | `codeforces.com/problemset/…` | ✅ (contest + gym) |
| **CodeChef** | `codechef.com/problems/…` | ✅ |
| **GeeksforGeeks** | Practice problems | — |

`leetcode.cn` and GfG article pages are out of scope for now.

## Installing

Not yet published. To run it from source:

```bash
npm install
```

```bash
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the `dist/` folder.

## Known limitations

These are known and deliberate, not bugs:

- **Codeforces problem pages have no editor**, so there's usually no code to capture there. The prompt still carries the problem; paste your code in yourself, or select it on the page first.
- **Figures don't travel.** Tree diagrams, grids and geometry images can't go into a text prompt. They're replaced with `[Figure: … — not included]` so ChatGPT knows something is missing rather than confidently reasoning without it. Maths (LaTeX) *is* passed through intact.
- **LeetCode Premium problems** are detected and labelled, not reported as errors. The YouTube search still works normally — arguably it's most useful exactly there.
- **If a site redesigns**, some fields may go missing before a patch ships. The extension degrades — a shorter prompt, a simpler search — rather than breaking, and tells you what it couldn't read.
- **Long problems get trimmed.** If the prompt exceeds the size cap, the statement is shortened first, then the examples. **Your code is never truncated.**

## Contests — please read

The extension **does not restrict itself during contests**. Contest problem pages behave exactly like practice pages, and it does not detect whether a contest is currently running.

Using AI assistance during a live contest violates the rules of LeetCode, Codeforces and CodeChef. This tool will not stop you, and it will not warn you. **That decision, and its consequences, are entirely yours.** It is stated here plainly so that the choice is an informed one.

## About copying problem content

The core of this extension is putting a problem statement — content published by the platform — into a search box or a chat window, along with your own code. The project's position:

- It automates a copy-paste **you could perform by hand**, and nothing more.
- Content moves **only when you trigger an action**. Nothing happens in the background.
- Nothing is stored, republished, aggregated, or redistributed by this extension.
- **Your own agreements with each platform still apply to you.** This tool does not alter, override or absorb them.

## Privacy in one line

**Nothing leaves your browser except the tab you asked to open.** No servers, no accounts, no analytics, no telemetry, no network requests of any kind. See [docs/PRIVACY.md](docs/PRIVACY.md) for the full statement.

## Documentation

| File | What's in it |
|---|---|
| [docs/spec.md](docs/spec.md) | Product requirements — features, page scope, data model, prompt templates, milestones |
| [docs/architecture.md](docs/architecture.md) | How it's built and why, including how it holds up at Web Store scale |
| [docs/domain.md](docs/domain.md) | Vocabulary, business rules, invariants — the concepts the code must honour |
| [docs/decisions.md](docs/decisions.md) | Decision log — why the project is built the way it is |
| [docs/todo.md](docs/todo.md) | Open items and pending decisions |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | What changed, release by release |
| [docs/TESTING.md](docs/TESTING.md) | Automated checks and the manual smoke matrix |
| [docs/implementation-plan/](docs/implementation-plan/) | Phase-by-phase build plan |
| [docs/PRIVACY.md](docs/PRIVACY.md) | The privacy statement |
| [docs/STORE-LISTING.md](docs/STORE-LISTING.md) | Chrome Web Store copy, permission justifications and the release checklist |
| [docs/RELEASING.md](docs/RELEASING.md) | The CI/CD release runbook — how a version ships to the Web Store |

## Development

Stack: **Manifest V3, React 19 + TypeScript 5.9, Vite 8** via `@crxjs/vite-plugin`. React is confined to the popup and options pages — content scripts and the service worker ship none of it, and `npm run check:build` fails the build if that ever stops being true.

One command runs everything — typecheck, unit tests, build, then the checks against the built artifact:

```bash
npm run verify
```

That last step is not ceremony. A unit suite can be entirely green while the extension Chrome loads is wrong: two entry modules named `index.ts` once collided, the generated service worker imported the content script instead of the background code, and every keyboard shortcut, context menu and popup button was inert. Nothing but a check against `dist/` could see it ([D045](docs/decisions.md)).

```bash
npm run dev
```

Two conventions worth knowing before contributing:

1. **One term for one thing.** It is a *problem*, never a *question* — see [docs/domain.md](docs/domain.md) §3.1.
2. **Each site's knowledge lives in one file.** Fixing a LeetCode redesign must never require touching Codeforces code, the prompt builder or the UI.

The placeholder icons are generated, not downloaded — no third-party licence attached:

```bash
python tools/gen-placeholder-icons.py
```

## Licence

[PolyForm Strict 1.0.0](LICENSE). The source is available to read and to run for permitted (noncommercial and personal) purposes — but **redistribution and distribution of changed or derivative versions are not permitted**. Source-available, not open-source: no forking, no republishing. See also the [disclaimer](DISCLAIMER.md).

The placeholder icons are generated by the script in `tools/`, so no third-party asset licence is attached to them either ([D009](docs/decisions.md)).

## Disclaimer

DSA Helper is an independent tool, **not affiliated with** LeetCode, Codeforces, CodeChef, GeeksforGeeks, or OpenAI / ChatGPT. It runs entirely in your browser, acts only on content already on your screen at your request, and sends nothing anywhere of its own. You are responsible for using it in line with each site's terms of service. See [DISCLAIMER.md](DISCLAIMER.md) for the full text.
