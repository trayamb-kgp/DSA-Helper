# Chrome Web Store listing

Everything the submission form asks for, written out so it is reviewed here rather than typed into a text box at midnight. Copy each block verbatim.

**Last updated:** 2026-09-03 · **Target version:** 0.1.0

---

## 1. Identity

| Field | Value |
|---|---|
| **Name** | DSA Helper |
| **Short description** (132 char max) | Turn the problem you are on into a YouTube search or a ready-to-send ChatGPT review, in one keystroke. |
| **Category** | Productivity → Developer Tools |
| **Language** | English (UK) |
| **Version** | 0.1.0 |

The short description is 102 characters. It matches `manifest.config.ts`'s `description` field, which is what Chrome shows on the extension card — keep the two in step.

---

## 2. Detailed description

> You're on a LeetCode problem. You're stuck, or you've written something and you're not sure about it. The usual next step is a lot of copying: the title into YouTube, or the statement, the constraints and your code into a chat window, one selection at a time.
>
> DSA Helper does that in one keystroke.
>
> **Search YouTube** — `Alt+Shift+Y` opens YouTube results for a query built from the problem you're looking at.
>
> **Ask ChatGPT** — `Alt+Shift+G` opens ChatGPT with a full prompt already typed in: the problem, the examples, the constraints, your code, and a clear request for a correctness, complexity and optimality review.
>
> **By default it never presses Enter for you.** The prompt is typed into the message box and left there — you read it, change it if you want, and send it yourself. That pause is deliberate: the prompt carries text from a page the extension doesn't control, and you should see what you're about to send. If you'd rather skip it, an **off-by-default** setting sends automatically once the prompt is confirmed typed in.
>
> **Copy prompt** — the same prompt on your clipboard, opening nothing.
>
> WORKS ON
> • LeetCode — practice and contest problems, including Premium problems (labelled, not broken)
> • Codeforces — problemset, contest and gym
> • CodeChef — practice and contest
> • GeeksforGeeks — practice problems
>
> BOTH TEXTS ARE YOURS
> The YouTube query and the ChatGPT prompt are templates you can edit, with variables for the platform, title, number, difficulty, statement, examples, constraints, language and your code — and a reset button when you overdo it.
>
> HONEST ABOUT WHAT IT CAN'T READ
> If a section of a problem can't be read, the prompt says so rather than quietly omitting it. Maths is passed through exactly as written. Figures that can't travel in a text prompt are named — "[Figure: … — not included]" — so the model knows it's reasoning without one instead of confidently guessing. Long problems are shortened from the statement first; your code is never truncated.
>
> NO SERVERS, NO ACCOUNTS, NO TRACKING
> The extension makes no network requests of its own. There is no backend, no analytics, no telemetry and no error reporting — not as a policy, but structurally: no code path exists that could send anything anywhere. Your settings stay in your browser. Your code is never written to disk, never synced, and never kept after the action that used it.
>
> A NOTE ABOUT CONTESTS
> This extension does not restrict itself during contests and does not detect whether one is running. Using AI assistance in a live contest breaks the rules of LeetCode, Codeforces and CodeChef. It won't stop you and it won't warn you. That decision, and its consequences, are yours.
>
> NOT AFFILIATED
> DSA Helper is an independent tool, not affiliated with, endorsed by, or sponsored by LeetCode, Codeforces, CodeChef, GeeksforGeeks, or OpenAI / ChatGPT. All trademarks belong to their respective owners. It acts only on content already shown to you, at your request, and you are responsible for using it in line with each site's terms of service.

---

## 3. Single purpose

The Web Store requires one sentence, and it must genuinely describe one purpose.

> DSA Helper reads the competitive-programming problem on the page you are viewing and turns it into either a YouTube search or a prepared ChatGPT prompt, so you do not have to retype it.

---

## 4. Permission justifications

One per permission. Reviewers read these against the code, so each says what the permission is used for and nothing more.

| Permission | Justification to submit |
|---|---|
| `storage` | Stores the user's own settings and their two editable templates, plus a local list of recently visited problems. Nothing is stored remotely; the extension has no server. |
| `activeTab` | Reads the problem on the tab the user triggered the action from. Granted only by that explicit action — a keyboard shortcut, a context-menu click, or a popup button. |
| `scripting` | Injects three small functions into the current page on demand: one that reads the problem, one that writes to the clipboard, and one that shows a status message. No script runs until the user triggers an action. |
| `contextMenus` | Adds the right-click menu that is one of the three ways to trigger an action. |
| `tabs` | Opens the YouTube or ChatGPT tab, and matches a prepared prompt to the tab it was prepared for. The tab id is the only way to deliver a prompt to the correct tab; `activeTab` alone does not provide the id of a newly created tab. |
| Host access to `leetcode.com`, `codeforces.com`, `codechef.com`, `geeksforgeeks.org`, `practice.geeksforgeeks.org` | These are the sites whose problems the extension reads. Reading them is the extension's entire function; it does nothing on any other site. |
| Host access to `chatgpt.com` | Places the prepared prompt into the ChatGPT message box. By default it does not submit it — the user reads it and sends it. Submitting automatically is an off-by-default setting the user can turn on. |

**Remote code:** none. The extension executes no code that is not in the package. Say so explicitly on the form — this question is a common rejection cause when answered carelessly.

---

## 5. Data-usage disclosures

The form asks you to tick what is collected. **Tick nothing.** Then certify all three statements, which are true:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://dsa-helper-zeta.vercel.app/privacy.html` — the static site served from `website/` on Vercel ([D055](decisions.md#d055), provider [D056](decisions.md#d056)). `SITE_URL` in [`src/core/links.ts`](../src/core/links.ts) is set to this origin, so the in-extension privacy link resolves. The repository itself is private; the policy is public because the site is, not because the repo is.

If a reviewer asks why an extension that reads problem statements and source code collects nothing: it assembles that text into a query or a prompt in the browser, uses it for that one action, and discards it. It is never transmitted by the extension, because the extension makes no requests.

---

## 6. Screenshots

Five 1280×800 PNGs. Shoot them on a light theme with a real problem, at default settings.

| # | What | Why it earns its slot |
|---|---|---|
| 1 | The popup open on a LeetCode problem, showing the readout and the YouTube search preview | The whole product in one frame: it read the problem, and it shows you the search before running it |
| 2 | ChatGPT with the prompt in the composer, banner visible, **not sent** | The differentiator, and the thing people will not believe until they see it |
| 3 | The options page Templates section, prompt editor with its live preview open | "Both texts are yours to edit" is the second-biggest reason to install |
| 4 | The right-click menu on a Codeforces problem | Shows a second platform and a second trigger surface in one image |
| 5 | The diagnostics panel with a field-by-field readout | Signals that failures are handled honestly — unusual enough to be worth a slot |

Do not screenshot the history list; it shows problem titles and reads as tracking at a glance, which is the opposite of true.

**Small promo tile** (440×280) is required. Icon on a flat background with the name — no screenshot content, it renders too small.

---

## 7. Release configuration

- **Staged rollout: required.** Start at **10%**. ([D030](decisions.md)) The extension reads sites it does not control, and a redesign or a wrong selector reaches every user at once otherwise. Hold at 10% until a full smoke pass on the published build, then 50%, then 100%.
- **Visibility:** Public.
- **Distribution:** All regions.
- **"What's new":** the `Added`/`Changed`/`Fixed` sections of the matching version in [CHANGELOG.md](CHANGELOG.md).

---

## 8. Submission checklist

Work top to bottom. Nothing below is optional.

**Blockers — the listing cannot be submitted with any of these open**

- [ ] `CONTACT_EMAIL` set in [`src/core/links.ts`](../src/core/links.ts), and the same address pasted into [PRIVACY.md](PRIVACY.md) → Contact ([todo.md](todo.md) #1)
- [x] `SITE_URL` set in [`src/core/links.ts`](../src/core/links.ts) — the Vercel address `https://dsa-helper-zeta.vercel.app` for the `website/` site ([todo.md](todo.md) #4, [D055](decisions.md#d055)/[D056](decisions.md#d056))
- [ ] Privacy policy URL `https://dsa-helper-zeta.vercel.app/privacy.html` (live, returns 200) entered on the form
- [x] Licence chosen and [`LICENSE`](../LICENSE) committed — PolyForm Strict 1.0.0 ([todo.md](todo.md) #3)
- [x] Privacy policy effective date set ([todo.md](todo.md) #2)

**Verification**

- [ ] `npm run verify` passes — typecheck, tests, build, and the checks against `dist/`
- [ ] The full manual smoke matrix in [TESTING.md](TESTING.md) §3 passes on the **packaged** build, not a dev build
- [ ] Both default shortcuts confirmed not to collide with the editor hotkeys on each site ([todo.md](todo.md) #11)
- [ ] A generated prompt pasted into ChatGPT and the reply judged useful — prompt quality is the product, and no test can check it ([TESTING.md](TESTING.md) §3c)
- [ ] Fixtures replaced with real captures, GeeksforGeeks first ([todo.md](todo.md) #5)

**Packaging**

- [ ] `manifest.config.ts` version matches `package.json` and the CHANGELOG heading
- [ ] `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) renamed to the version with its date, and a fresh `[Unreleased]` opened
- [ ] ZIP built from a clean `dist/` — `rm -rf dist && npm run build && npm run check:build`
- [ ] Package contains no source maps and no fixtures

**After approval**

- [ ] Rollout set to 10%, not 100%
- [ ] Tag the release commit
- [ ] Re-run the smoke matrix against the published build before widening the rollout
