<img src="assets/shield-256.png" alt="Kavach" width="80" align="right">

# Kavach — Setup Guide

**Kavach reviews your GitHub pull requests automatically.** You paste a PR link
into Claude Code, and it reads the code, leaves comments on the exact lines with
problems, and sends a summary to Google Chat.

This guide takes about **5 minutes**. No prior setup knowledge needed.

---

## Table of contents

1. [What you need before starting](#1-what-you-need-before-starting)
2. [Get a GitHub token](#2-get-a-github-token)
3. [Get a Google Chat webhook](#3-get-a-google-chat-webhook-optional)
4. [Install Kavach](#4-install-kavach)
5. [Tell Kavach your credentials](#5-tell-kavach-your-credentials)
6. [Set up your project](#6-set-up-your-project)
7. [Review your first PR](#7-review-your-first-pr)
8. [The day-wise review log](#8-the-day-wise-review-log)
9. [Using it on any other project](#9-using-it-on-any-other-project)
10. [Settings you can change](#10-settings-you-can-change)
11. [When something goes wrong](#11-when-something-goes-wrong)
12. [Common questions](#12-common-questions)

### The flow at a glance

| # | You do this | How often |
|---|---|---|
| 1 | Open your project folder in Claude Code | every session |
| 2 | Install the plugin | once per machine |
| 3 | `/kavach-setup` — token and webhook | **once ever** |
| 4 | `/kavach-init` — stack and what to focus on | **once per project** |
| 5 | Paste a PR URL | every review, no questions |

---

## 1. What you need before starting

| What | Why | How to check |
|---|---|---|
| **Claude Code** | Kavach runs inside it | You're already using it |
| **Node.js 22.18+ or 24+** | Runs Kavach's code | Type `node --version` in a terminal |
| **A GitHub account** | To read PRs and post comments | You have one if you use GitHub |
| **A Google Chat space** | For summaries — *optional* | Skip if you don't use Chat |

If `node --version` shows less than `v22.18`, install a newer Node from
[nodejs.org](https://nodejs.org) — **v24 LTS is the safe choice**. Kavach runs
TypeScript directly, and older versions can't do that without a special flag.
Everything else you already have.

> **You do NOT need:** an Anthropic API key, a paid subscription beyond Claude
> Code, the `gh` CLI, Docker, or any npm install. Kavach has zero dependencies.

---

## 2. Get a GitHub token

A token is a password that lets Kavach read your PRs and post comments **as you**.

### Steps

1. Click this link: **[Create a token](https://github.com/settings/tokens/new?scopes=repo&description=Kavach%20PR%20Review)**
   *(It pre-fills the right settings for you.)*

2. You'll see a form. Check these:

   | Field | What to set |
   |---|---|
   | **Note** | `Kavach PR Review` (already filled in) |
   | **Expiration** | `90 days` is a good balance. Pick `No expiration` only if you understand the risk |
   | **Scopes** | ✅ **`repo`** must be checked (already checked for you) |

3. Scroll to the bottom → click the green **Generate token** button.

4. **Copy the token immediately.** It starts with `ghp_` and looks like
   `ghp_AbC123...`. GitHub shows it **only once** — if you navigate away, you'll
   have to make a new one.

5. Paste it somewhere safe for the next two minutes. You'll give it to Kavach in
   [step 5](#5-tell-kavach-your-credentials).

> ### ⚠️ Treat this token like a password
> Anyone with it can act as you on GitHub. **Never** paste it into a chat message
> to a colleague, commit it to a repo, or put it in a Slack channel. Kavach stores
> it in a locked file that only your user account can read.

<details>
<summary><b>Working at a company with SSO?</b> (click to expand)</summary>

If your organization uses SAML single sign-on, after creating the token you must
also authorize it:

1. Go to <https://github.com/settings/tokens>
2. Find your new token → click **Configure SSO** next to it
3. Click **Authorize** beside your organization's name

Without this, the token works on your personal repos but returns "not found" on
company repos.
</details>

<details>
<summary><b>Prefer a fine-grained token?</b> (click to expand)</summary>

Fine-grained tokens work too and are more restrictive, which is better practice.
Create one at <https://github.com/settings/personal-access-tokens/new> and set:

- **Repository access** → the repos you want reviewed
- **Permissions** → **Pull requests: Read and write**
- **Permissions** → **Contents: Read-only**

These start with `github_pat_` instead of `ghp_`. Kavach handles both.
</details>

---

## 3. Get a Google Chat webhook (optional)

A webhook is a URL that lets Kavach post messages into a Chat space. **Skip this
section if you don't use Google Chat** — Kavach works fine without it.

### Steps

1. Open **Google Chat** in your browser.
2. Open the space where you want review summaries (or create one, e.g. `#code-reviews`).
3. Click the **space name** at the top → **Apps & integrations**.
4. Click **Webhooks** → **Add webhook**.
5. Fill in:
   - **Name**: `Kavach`
   - **Avatar URL**: optional — paste
     `https://raw.githubusercontent.com/O-Thinkitive-M/kavach/main/assets/shield-128.png`
     to show the Kavach shield on messages
6. Click **Save**, then **copy the URL** it gives you.

It looks like:
```
https://chat.googleapis.com/v1/spaces/AAQA.../messages?key=...&token=...
```

> **This URL is also a secret.** Anyone with it can post messages to your space.

<details>
<summary><b>Don't see "Apps & integrations"?</b> (click to expand)</summary>

Your Google Workspace admin has disabled webhooks, or you're in a direct message
rather than a space (webhooks only work in spaces). Ask your admin, or skip Chat
notifications entirely — Kavach still posts comments on the PR itself.
</details>

---

## 4. Install Kavach

In Claude Code, run these two commands:

```
/plugin marketplace add O-Thinkitive-M/kavach
```

```
/plugin install kavach@kavach
```

That works on any machine — nothing to clone, no `npm install`, no build step.

<details>
<summary><b>Installing from a local clone instead</b> (click to expand)</summary>

If you are developing Kavach itself, or working offline, point the marketplace
at your checkout instead:

```
/plugin marketplace add /path/to/your/kavach
/plugin install kavach@kavach
```

The path must be the folder containing the `.claude-plugin` directory.
</details>

### Check it installed

```
/plugin
```

You should see **kavach** in the list. If you don't, see
[When something goes wrong](#11-when-something-goes-wrong).

---

## 5. Tell Kavach your credentials

In Claude Code, type:

```
/kavach-setup
```

Kavach will ask for your GitHub token, and for the Chat webhook if you have one.
**Paste them when asked.** It checks them against GitHub immediately and tells you:

```
✓ token belongs to your-username
✓ can read your-org/your-repo
✓ stored in /home/you/.kavach/credentials.json
```

That's it. **You only do this once, ever** — not once per project.

### Where your credentials go

They're saved in `~/.kavach/credentials.json`, a file only your user account can
open (permissions `0600`). It sits in your home folder, **outside any project**, so
it can't be committed to a repo by accident.

### Check what's stored

```
/kavach-setup status
```

Shows a masked version (`ghp_…4a2f`), never the real token.

---

## 6. Set up your project

**Open the project folder you want reviewed** in Claude Code, then run:

```
/kavach-init
```

Kavach looks at the folder first and figures out the mechanical details itself,
then asks you **a few short questions** — with its guesses already filled in, so
you're confirming rather than typing:

| It asks | Example answer |
|---|---|
| **Is this stack right?** | *"I detected Next.js · TypeScript · pnpm · Vitest. Correct?"* → yes |
| **What is this project?** | "Patient scheduling API for a healthcare provider" |
| **What matters most in review?** | "auth, PHI handling, data migrations" |
| **Any rules to enforce?** | "All DB access goes through `repositories/`" |
| **Keep a review log?** | yes / no — off by default |

**This happens once per project folder.** After it, paste a PR link and Kavach
reviews silently — it never asks you anything again.

### Why bother?

Question 2 and 3 are what turn a generic reviewer into one that knows your
codebase. Telling Kavach *"payments and auth are where bugs hurt"* makes it look
harder at those files. Rules are enforced on every single review.

### Changing your answers later

Run `/kavach-init` again any time. It keeps what you already told it and updates
what you change:

```
/kavach-init            # update — keeps existing answers
/kavach-init reset      # start over, discard the old requirements
/kavach-init status     # show what's configured now
```

> **This step is optional.** Skip it and Kavach still reviews using auto-detection
> alone. It's just noticeably better when you've told it what the project is.

---

## 7. Review your first PR

Open **any project** in Claude Code and paste a pull request link into the chat:

```
https://github.com/your-org/your-repo/pull/42
```

That's the whole command. Kavach:

1. Downloads the PR's changes
2. Picks the 2–4 most relevant reviewers for those files
3. Reads the code and finds problems
4. Posts comments on the exact lines
5. Sends a summary to Google Chat

You'll see something like:

```
Kavach — 12 of 18 files reviewed · security, typescript, business-logic
Critical 0 · High 2 · Medium 3 · Low 1
7 inline comments posted · Chat card sent
```

Then open the PR on GitHub — the comments are there.

### Want to try it safely first?

Add `--dry-run` to see what *would* be posted without actually posting:

```
Review https://github.com/your-org/your-repo/pull/42 but use --dry-run on publish
```

### Want a deeper review?

Just say so — "review this PR thoroughly" — and Kavach uses more reviewers and a
bigger budget.

---

## 8. The day-wise review log

**Off by default.** Turn it on when setting up a project — `/kavach-init` asks, or:

```
/kavach-config notify.reviewLog=true
```

Once on, every review is recorded in a dated file inside the project:

```
.pr-architect/logs/2026-08-04.md
```

One file per day, appended to after each review. Open it directly, or ask:

```
/kavach-log                 # today
/kavach-log 2026-08-04      # a specific day
/kavach-log list            # which days have logs
```

Entries are deliberately terse — one line per finding, so a month of reviews stays
small and cheap to read back:

```markdown
# Kavach — 2026-08-04

<sub>severity C/H/M/L/S · kind I=issue Q=question S=suggestion</sub>

### 14:36 [#482 Add patient search endpoint](https://github.com/acme/api/pull/482) @dev
security,typescript,business-logic · 12/18 files · H2 M3 L1 · 7 posted · [review](…)
- `H/I` src/api/search.ts:34 — Unparameterized SQL query
- `M/Q` src/api/search.ts:51 — Could this return unbounded rows
- `L/S` src/api/format.ts:12 — Consider extracting this helper
```

`H/I` means High severity, posted as an Issue. `M/Q` is a Medium raised as a
question.

It's useful for a standup ("what did we review yesterday?"), for spotting patterns
across a week, and as a record of what the agent actually did.

Logs are local to each project. Commit them if the team wants shared history, or
add `.pr-architect/logs/` to that project's `.gitignore` to keep them private.

To turn logging off again: `/kavach-config notify.reviewLog=false`

---

## 9. Using it on any other project

**Nothing to set up.** Open a different project, paste a PR link, and it works.

The first time Kavach sees a new project it silently figures out the language,
framework, package manager and test tool, then saves that to a
`.pr-architect/` folder in that project.

Run `/kavach-init` in each project you care about to tell it what that project is —
that's per-folder, and takes a minute. Your credentials from
[step 5](#5-tell-kavach-your-credentials) are already shared across all of them.

It works with any stack — React, Next.js, Node, Python, Go, Java, Rust, PHP, Ruby,
plain JavaScript, or a mix.

### Should I commit the `.pr-architect/` folder?

| File | Commit it? | Why |
|---|---|---|
| `config.json` | ✅ Yes | Your team shares the same review settings |
| `rules.md` | ✅ Yes | Project rules everyone benefits from |
| `knowledge.md` | ✅ Yes | Shared context about the codebase |
| `stack.md` | ✅ Yes | Detected stack info |
| `runs/` | ❌ No | Temporary working files |
| `logs/` | your call | Day-wise review history — commit for shared record, ignore to keep the repo clean |

Add this to that project's `.gitignore`:

```gitignore
.pr-architect/runs/
.pr-architect/logs/     # remove this line if you want shared review history
```

### Teaching Kavach your project's rules

Open `.pr-architect/rules.md` in the project and write plain sentences:

```markdown
# Project rules

- All database access must go through `repositories/`, never direct SQL in components.
- Every API route requires `requireAuth()` as the first line.
- Money values are always integers in cents, never floats.
```

Every reviewer reads this and enforces it. This is the single highest-value thing
you can do to make reviews better.

---

## 10. Settings you can change

Everything has a sensible default. Change things only if you want to.

```
/kavach-config
```

shows current settings. To change one:

```
/kavach-config review.maxComments=25
```

| Setting | Default | What it does |
|---|---|---|
| `review.maxComments` | `15` | Most comments Kavach will post on one PR |
| `review.mode` | `standard` | `deep` uses more reviewers and costs more |
| `review.minConfidenceForIssue` | `0.8` | How sure it must be to call something a problem |
| `review.minConfidenceToComment` | `0.5` | Below this, findings are dropped entirely |
| `review.alwaysReviewers` | `security` | Always run these, whatever the files |
| `review.neverReviewers` | *(empty)* | Never run these |
| `budget.maxContextTokens` | `60000` | Bigger = more thorough but slower |
| `notify.googleChat` | `true` | Set `false` to stop Chat messages |
| `notify.reviewLog` | `false` | Set `true` for day-wise markdown logs |

### Making reviews quieter

Too many comments? Try:

```
/kavach-config review.maxComments=8
/kavach-config review.minConfidenceForIssue=0.9
```

### Making reviews more thorough

```
/kavach-config budget.maxContextTokens=120000
/kavach-config review.mode=deep
```

---

## 11. When something goes wrong

### "Kavach needs credentials"

Your token is missing, expired, or doesn't cover that repo. Run `/kavach-setup`
and paste a new one. If it's a **different organization's** repo, Kavach asks for a
token for that org specifically and keeps your existing one — so work and personal
repos can both work on one machine.

### "Cannot see ... (404)"

Usually one of:

- The token doesn't have access to that repository
- The repo is private and your token lacks `repo` scope
- **Your company uses SSO and you skipped authorizing the token** — see the SSO
  note in [step 2](#2-get-a-github-token)
- The PR number doesn't exist (check the URL)

### "GitHub rejected the token (401)"

The token was deleted or expired. Make a new one and run `/kavach-setup`.

### Comments aren't appearing on the PR

Check whether setup warned you the token can't post:

```
/kavach-setup status
```

A read-only token still lets reviews run and Chat summaries send, but nothing gets
posted to GitHub. You need a token with `repo` scope (classic) or *Pull requests:
read & write* (fine-grained).

### No Chat message arrives

Test the webhook directly:

```
/kavach-setup
```

and ask it to test the Chat connection. If the webhook was deleted or the space
was removed, create a new webhook and paste it in.

### Kavach reviewed only some files

That's intentional on large PRs. It reviews the most important files within its
budget and tells you honestly: *"Reviewed 12 of 18 files"*. To review more:

```
/kavach-config budget.maxContextTokens=120000
```

### "kavach" doesn't appear after installing

- Check the path you gave `/plugin marketplace add` contains a `.claude-plugin`
  folder
- Restart Claude Code
- Run `/plugin` to see what's actually installed

---

## 12. Common questions

**Does this cost extra money?**
No API key, no extra bill. It runs inside your existing Claude Code session.
Kavach is deliberately built to use few tokens — a 190,000-token pull request gets
compressed to about 60,000 before Claude reads anything.

**Can it block my pull requests from merging?**
No. Never. Kavach always posts as a plain comment, never "Request changes", even
for Critical findings. A human always decides.

**Will it spam my PR with dozens of comments?**
No. Comments are capped (15 by default), duplicate findings from different
reviewers merge into one, and anything it's unsure about becomes a single question
instead of an accusation. Re-running on the same PR posts nothing new.

The one exception: **Critical and High findings are always posted**, even past the
cap. A serious security bug should never be hidden in a collapsed summary because
twelve style nits got there first. Everything else overflows into the review body
with a note explaining how to raise the cap.

**What if the PR isn't in my project's language?**
It still gets reviewed. Kavach notices the mismatch, tells the reviewers, and they
fall back to general engineering review — correctness, security, error handling —
without applying framework rules that may not apply. Confidence is capped lower for
anything stack-specific.

**What about a merged, closed, or draft PR?**
All reviewed. A merged or closed PR gets a note at the top of the review saying so.
A draft is reviewed as work in progress, leaning toward questions rather than
defect claims.

**What if it's wrong about something?**
It's designed to be cautious. Findings it can't verify are phrased as questions —
*"Could this introduce a regression under StrictMode?"* — not statements. Anything
below 50% confidence is discarded entirely. Reply to the comment as you would to a
colleague.

**Does it send my code anywhere?**
Your code goes to GitHub (already there) and to Claude, same as any Claude Code
session. Nothing else. The only outbound message is the Chat summary, which
contains findings, not source code.

**Can my whole team use this?**
Yes. Each person installs the plugin and runs `/kavach-setup` with their own
token — comments appear under each person's name. Shared settings live in the
committed `.pr-architect/config.json`.

**Does it work on private repos?**
Yes, as long as your token has access. Add the SSO authorization step if your
company requires it.

**Can I run it in CI instead of Claude Code?**
The credential layer supports it — set `GITHUB_TOKEN` and `GOOGLE_CHAT_WEBHOOK`
as environment variables and they override the stored file. The review step still
needs Claude Code, so full unattended CI isn't supported yet.

**How do I remove it?**
```
/plugin uninstall kavach
rm ~/.kavach/credentials.json
```
And delete the token at <https://github.com/settings/tokens>.

---

## Quick reference

| I want to... | Command |
|---|---|
| Set up credentials (once ever) | `/kavach-setup` |
| Set up a project (once per folder) | `/kavach-init` |
| See what's configured | `/kavach-setup status` · `/kavach-init status` |
| See today's reviews | `/kavach-log` |
| Review a PR | Paste the PR URL in chat |
| Review thoroughly | `/kavach-review <url>` and say "deep" |
| See settings | `/kavach-config` |
| Change a setting | `/kavach-config review.maxComments=10` |
| Teach it project rules | Edit `.pr-architect/rules.md` |

---

## Want to see it work before trusting it?

There are six ready-made test pull requests, one per stack, each with known
defects planted at known severities:

| Stack | Test PR |
|---|---|
| React | [#2](https://github.com/O-Thinkitive-M/kavach/pull/2) |
| Spring Boot | [#3](https://github.com/O-Thinkitive-M/kavach/pull/3) |
| Angular | [#4](https://github.com/O-Thinkitive-M/kavach/pull/4) |
| Node / Express | [#5](https://github.com/O-Thinkitive-M/kavach/pull/5) |
| .NET | [#6](https://github.com/O-Thinkitive-M/kavach/pull/6) |
| Python / Flask | [#7](https://github.com/O-Thinkitive-M/kavach/pull/7) |

Paste one into Claude Code, then compare the result against the matching file in
[testing/](https://github.com/O-Thinkitive-M/kavach/tree/main/testing) — each one
lists every planted defect and its expected severity.

---

**Still stuck?** Ask Claude Code directly — *"Kavach isn't posting comments, help
me debug it"* — it can read the config and error output and tell you what's wrong.
