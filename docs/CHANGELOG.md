# Changelog

All notable changes to DSA Helper. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

**Maintenance:** add entries under `[Unreleased]` as work lands, not at release time. When a version ships, rename that section to the version with its date and open a fresh `[Unreleased]`. Entries describe **what changed for the user**, not which files moved — the reasoning belongs in [decisions.md](decisions.md), and the build detail in the [implementation plan](implementation-plan/implementation-plan-1.md). The `Added`/`Changed`/`Fixed`/`Removed`/`Security` sections of a released version become the "What's new" text in the Chrome Web Store listing.

---

## [Unreleased]

### Added

- **Turn off the ChatGPT review reminder** (2026-09-06) — the "Prompt inserted — review it, then press Enter" banner is now a setting, **on by default**. Leave it on to keep the reminder; turn it off and the message box just fills silently ([D051](decisions.md#d051)).

- **Send to ChatGPT automatically, if you want to** (2026-09-06) — a new setting, **off by default**, that sends the prompt for you once it has been confirmed typed into ChatGPT, instead of waiting for you to press Enter. The default is unchanged: the prompt is typed in and left for you to read first, because it is built from a page the extension doesn't control and reading it is a safeguard. When the opt-in is on, the prompt is still only sent after it is verified in the composer — never a half-typed prompt, and never the clipboard fallback ([D050](decisions.md#d050)).

- **Ready to publish** (2026-09-03) — source-available under PolyForm Strict 1.0.0 (changed from MIT on 2026-09-06, [D048](decisions.md#d048)), with a privacy policy that now carries an effective date, and a full Chrome Web Store listing written out: description, single-purpose statement, a justification for every permission, the data-usage answers, a screenshot plan and a submission checklist. One command, `npm run verify`, runs the typecheck, the tests, the build and a set of checks against the built extension itself.

- **Settings, history and diagnostics** (2026-09-03) — the options page is real. Both templates are editable, resettable and copyable, with a live preview of what they produce and a warning before a template grows too large to sync. Behaviour toggles, a size cap for the prompt, and light/dark/system themes. The popup now keeps a list of problems you have used it on — one entry per problem, most recent first, with a pause switch that stops recording without erasing what is there. And a diagnostics panel that shows exactly what the extension could and could not read on the last problem, with a one-click report you can paste into an issue: it carries the page's URL shape and which fields failed, and **never your code or the problem text**.

- **Codeforces, CodeChef and GeeksforGeeks** (2026-09-03) — all four platforms now work. Codeforces reads its statement, rating and samples, keeps the LaTeX exactly as written, and passes Russian statements through untouched; its problem pages have no editor, so no code is captured there and the extension says that is normal rather than reporting a fault. CodeChef and GeeksforGeeks read their statements, difficulty and tags, and capture code from the editor. GeeksforGeeks problems have no number, so searches use the title alone.

- **Ask ChatGPT** (2026-09-03) — the flagship action. Opens ChatGPT in a new tab with the review prompt already typed into the composer, and **stops there**: you read it and press Enter yourself. The extension never sends anything for you — that pause is a security control, since the prompt carries text from a page nobody controls. If the composer can't be filled, the prompt goes to your clipboard with a note to paste it, so it is never lost. Turn off auto-inject in settings for a clipboard-only flow that opens no tab at all. The prompt itself is held in memory only, handed to the tab it was prepared for, deleted the moment it is used, and gone after five minutes — it contains your code, so it never touches disk.

- **Copy prompt** (2026-09-03) — the review request itself, on your clipboard from the popup, the right-click menu or a shortcut you bind. It carries the problem, the examples, the constraints, your code and the review instructions, and it is honest about what it lacks: a section that couldn't be read says so, a Premium problem says the statement is locked, and a solution that couldn't be captured leaves a note to paste it in rather than an empty code block. Your code is never cut to fit the size cap — the statement is shortened first, then the examples, and the prompt goes over the cap before it touches what you wrote. Works without ChatGPT being involved at all.

- **Search YouTube** (2026-09-03) — the first working action. From a LeetCode problem, `Alt+Shift+Y`, the popup button and the right-click menu all open a YouTube search built from your own template; the popup shows the exact search string first, so nothing happens that you did not see coming. The search still works when the problem can't be read — it falls back to the page title and then to the URL — and firing it somewhere unsupported tells you so instead of doing nothing. The toolbar icon marks pages the extension recognises.

- **LeetCode extraction** (2026-09-03) — the extension can now read a LeetCode problem page: title, number, difficulty, tags, and the statement split into problem, examples and constraints, plus your in-progress code from whichever of four sources has it — the site's own saved buffer, the editor's model, the visible lines on the page, or your current text selection. Where the code came from is recorded and shown, so you can judge a capture before sending it. Practice and contest problems both work, and a Premium problem reports itself as locked rather than as a failure. The popup shows what was read; the actions arrive in the next phase.

- **Core library** (2026-09-03) — the pure functions the features are built from: the shared type vocabulary, settings storage with a sync-quota guard and write batching, schema migrations, template rendering, HTML-to-markdown conversion, prompt truncation and history semantics. Covered by 124 unit tests. Still not wired to anything the user can see.
- **Project scaffold** (2026-09-02) — Manifest V3 extension building with Vite 8, React 19 and TypeScript 5.9 via `@crxjs/vite-plugin` 2.7.1. Loads unpacked; popup and options pages render; service worker, platform content script, MAIN-world editor bridge and ChatGPT content script are registered but inert. No features yet.
- **Documentation set** (2026-09-01 – 2026-09-02) — [spec.md](spec.md), [architecture.md](architecture.md), [domain.md](domain.md), [decisions.md](decisions.md), [todo.md](todo.md), [PRIVACY.md](PRIVACY.md), [TESTING.md](TESTING.md) and the [implementation plan](implementation-plan/implementation-plan-1.md).
- **Placeholder icons** — generated locally by `tools/gen-placeholder-icons.py`, no third-party licence attached ([D009](decisions.md)).

### Changed

- **Emailing a broken-page report no longer depends on a mail app** (2026-09-14) — the diagnostics panel now offers **Open in Gmail** beside **Email the report**. "Email the report" opens your own mail app, which does nothing on a machine with no mail app set up; the new link opens a pre-addressed Gmail compose window in the browser instead, so the report always has somewhere to go. Copy the report first with the button beside them, then paste it in — it still carries no code and no problem text ([D057](decisions.md#d057)).

### Fixed

- **Nothing outside the popup actually worked** (2026-09-03) — the keyboard shortcuts, the right-click menu and all three popup buttons had been inert in every build since the YouTube action shipped. Two source files were both named `index.ts`, and the build tool, which names each output after its file, wired the extension's background worker to the wrong one of them — so the part that listens for a shortcut was never loaded. Only the popup's own reading of the page still worked, which is why it looked alive. Fixed by renaming the files, and by adding checks that inspect the built extension rather than the source, so this cannot happen quietly again.
- **A message that named one site out of four** (2026-09-03) — triggering an action somewhere unsupported said the extension works on "LeetCode problem pages". It has worked on Codeforces, CodeChef and GeeksforGeeks since well before this. The message is now built from the list of supported sites, so it cannot fall behind again.
- **The settings page claimed a limit Chrome does not impose** (2026-09-03) — it said Chrome allows only two suggested shortcuts, which is why `Copy prompt` ships unbound. Chrome allows four; the third is left to you on purpose, because no third combination is safe to claim on every keyboard layout. The section now shows the current bindings in a table and says so.

### Notes

- Maths in problem statements is carried through verbatim, and figures that cannot travel in a text prompt are named rather than dropped ([D026](decisions.md), [D035](decisions.md)).
- Exponents and indices survive the conversion: `5 * 10^4` in a constraint stays `5 * 10^4` rather than becoming `5 * 104` ([D026](decisions.md)).
- Text quoted from a problem page is wrapped in labelled tags in the prompt, so the model reads it as reference material rather than as instructions ([D040](decisions.md)). The extension never sends a prompt for you — you read it first ([D003](decisions.md)).
- Removing the extension erases everything it stores ([D029](decisions.md)). The options page says so plainly and gives you a copy button for each template.
- Statements are relayed in whatever language the page serves — no detection, no translation ([D026](decisions.md)). Figures that cannot travel in a text prompt are named rather than dropped, so the model knows it is reasoning without one.
- Nothing is published yet. The first Web Store release will be `0.1.0` and must go out as a staged percentage rollout ([D030](decisions.md)).
- Two substitutions remain before submission, both one line in `src/core/links.ts`: the repository slug and the published contact address. Until they are set, the links they would produce render as nothing rather than as dead links, and the diagnostics report is still built and still copyable without them ([D046](decisions.md)).
