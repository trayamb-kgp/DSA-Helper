# Changelog

All notable changes to DSA Helper. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

**Maintenance:** add entries under `[Unreleased]` as work lands, not at release time. When a version ships, rename that section to the version with its date and open a fresh `[Unreleased]`. Entries describe **what changed for the user**, not which files moved — the reasoning belongs in [decisions.md](decisions.md), and the build detail in the [implementation plan](implementation-plan/implementation-plan-1.md). The `Added`/`Changed`/`Fixed`/`Removed`/`Security` sections of a released version become the "What's new" text in the Chrome Web Store listing.

---

## [Unreleased]

### Added

- **LeetCode extraction** (2026-09-03) — the extension can now read a LeetCode problem page: title, number, difficulty, tags, and the statement split into problem, examples and constraints, plus your in-progress code from whichever of four sources has it — the site's own saved buffer, the editor's model, the visible lines on the page, or your current text selection. Where the code came from is recorded and shown, so you can judge a capture before sending it. Practice and contest problems both work, and a Premium problem reports itself as locked rather than as a failure. The popup shows what was read; the actions arrive in the next phase.

- **Core library** (2026-09-03) — the pure functions the features are built from: the shared type vocabulary, settings storage with a sync-quota guard and write batching, schema migrations, template rendering, HTML-to-markdown conversion, prompt truncation and history semantics. Covered by 124 unit tests. Still not wired to anything the user can see.
- **Project scaffold** (2026-09-02) — Manifest V3 extension building with Vite 8, React 19 and TypeScript 5.9 via `@crxjs/vite-plugin` 2.7.1. Loads unpacked; popup and options pages render; service worker, platform content script, MAIN-world editor bridge and ChatGPT content script are registered but inert. No features yet.
- **Documentation set** (2026-09-01 – 2026-09-02) — [spec.md](spec.md), [architecture.md](architecture.md), [domain.md](domain.md), [decisions.md](decisions.md), [todo.md](todo.md), [PRIVACY.md](PRIVACY.md), [TESTING.md](TESTING.md) and the [implementation plan](implementation-plan/implementation-plan-1.md).
- **Placeholder icons** — generated locally by `tools/gen-placeholder-icons.py`, no third-party licence attached ([D009](decisions.md)).

### Notes

- Maths in problem statements is carried through verbatim, and figures that cannot travel in a text prompt are named rather than dropped ([D026](decisions.md), [D035](decisions.md)).
- Exponents and indices survive the conversion: `5 * 10^4` in a constraint stays `5 * 10^4` rather than becoming `5 * 104` ([D026](decisions.md)).
- Nothing is published yet. The first Web Store release will be `0.1.0` and must go out as a staged percentage rollout ([D030](decisions.md)).
- Three items block publishing: the privacy policy contact address, its effective date, and the licence. See [todo.md](todo.md).
