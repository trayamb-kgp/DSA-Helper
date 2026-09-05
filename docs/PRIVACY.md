# Privacy Policy — DSA Helper

**Effective date:** 3 September 2026
**Applies to:** the DSA Helper Chrome extension, all versions.

---

## The short version

**DSA Helper collects nothing, sends nothing, and has no servers.**

It has no backend, no accounts, no analytics, no telemetry, no error reporting, and no network requests of its own. Everything it does happens inside your browser, on your machine. There is no infrastructure anywhere that could receive your data, because none exists.

The only things that ever leave your browser are the pages **you** ask it to open — a YouTube search, or ChatGPT — and those are ordinary tab navigations you could perform yourself.

---

## What the extension reads

Only on a problem page of a [supported site](../README.md#supported-sites), and only **at the moment you trigger an action** — never in the background, never on a schedule, never on pages it doesn't support:

- The problem's title, identifier, difficulty and tags
- The problem statement, examples and constraints
- The page's address
- **The code currently in the editor**, and which language it's in

None of this is transmitted anywhere by the extension. It is assembled into a search query or a prompt, and then used for that one action.

## What is stored, and where

All storage is your browser's own extension storage, on your device. Three kinds:

| What | Where | How long |
|---|---|---|
| **Your settings and templates** — the YouTube query template, the ChatGPT prompt template, your preferences | Chrome's synced extension storage, so they follow you across Chrome installs where you're signed in | Until you change them or remove the extension |
| **Recently visited problems** — platform, title, identifier, link, and when. **Never the statement. Never your code.** | Your device only. Not synced | Until you clear it, or it falls off the end of your chosen limit |
| **A prepared prompt awaiting hand-off** — held for a few seconds while the ChatGPT tab opens | Memory only, never written to disk | Deleted the moment it is used, or within 5 minutes, or when you close the browser |

**Your code is deliberately the most protected of these.** It is never written to disk, never synced, never added to history, and never kept after the action that used it.

## What the extension never does

- No data is sent to the developer. There is nowhere for it to go.
- No analytics, usage tracking, crash reporting, or fingerprinting.
- No advertising, no profiling, no data sold or shared with anyone.
- No reading of pages outside the supported problem sites and ChatGPT.
- No browsing history, bookmarks, cookies, passwords or form data is accessed.
- No account, sign-up, or identifier of any kind.
- No remote code is downloaded or executed — the extension is exactly what you installed.

## When you use an action, you are visiting another company's site

This matters, so it is stated plainly.

- **Search YouTube** opens a YouTube results page with your query. Google receives that query as it would any search you typed.
- **Ask ChatGPT** opens ChatGPT with a prompt placed in the message box — containing the problem details and, unless you've turned that off, **your code**. **The extension never sends it.** It is typed in and left there for you to read; nothing reaches OpenAI unless you press Enter.
- **Copy prompt** places the same text on your clipboard and opens nothing.

Once you send a message on those sites, what happens to it is governed by **their** privacy policies, not this one:

- [Google Privacy Policy](https://policies.google.com/privacy) (YouTube)
- [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy) (ChatGPT)

If you'd rather your code never went into a prompt at all, turn off **Include my code** in the extension's settings.

## Permissions, and why each is needed

| Permission | Why |
|---|---|
| Access to the four problem sites | To read the problem you're on and the code you've written. This is the extension's entire purpose |
| Access to `chatgpt.com` | To place the prepared prompt into the message box |
| Storage | To keep your templates, settings and history on your device |
| Tabs | To open the YouTube or ChatGPT tab, and to deliver the prompt to the right one |
| Context menus | To provide the right-click menu |
| Scripting / active tab | To read the current page when you ask for an action |

No permission is used for any purpose beyond the one listed.

## Your control over your data

- **See everything it holds** — settings and history are visible and editable in the extension's options page.
- **Clear your history** at any time, or **pause** recording, or switch it off entirely by setting the limit to zero.
- **Keep a copy of your templates** with the copy button in options — worth doing if you've spent time on your prompt.
- **Delete everything** by removing the extension. Chrome erases all of its stored data, including synced settings. This is not reversible, so copy any template you want to keep first.

## Children

The extension is a study tool for programming practice sites and is not directed at children under 13. It collects no personal information from anyone, of any age.

## Changes to this policy

If the extension ever changes in a way that affects this policy — in particular, if it ever gains a network connection of any kind — this document will be updated before that version ships, and the change will be described in the release notes. The current version always lives in the extension's repository.

## Contact

Questions about privacy, or about this policy: `CONTACT_EMAIL_PENDING`

> **Not yet substituted.** The published address is a dedicated alias kept separate from any
> personal mailbox. It is set in one place — `CONTACT_EMAIL` in
> [`src/core/links.ts`](../src/core/links.ts) — and copied here at submission time. The Chrome
> Web Store requires a working contact, so this must be real before the listing goes live; see
> [todo.md](todo.md) #1.

---

*Both this policy and its claims are structural, not promises. The extension makes no network requests, so there is no code path by which your data could reach anyone — including the developer.*
