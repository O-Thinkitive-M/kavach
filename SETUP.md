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
6. [Review your first PR](#6-review-your-first-pr)
7. [Using it on any other project](#7-using-it-on-any-other-project)
8. [Settings you can change](#8-settings-you-can-change)
9. [When something goes wrong](#9-when-something-goes-wrong)
10. [Common questions](#10-common-questions)

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
   - **Avatar URL**: leave blank, or paste
     `https://raw.githubusercontent.com/O-Thinkitive-M/kavach/main/assets/shield-128.png`
     once the repo is public
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

### Right now (before the repo is published)

Kavach isn't on GitHub yet, so install it from the folder on your computer.
In Claude Code, run these two commands:

```
/plugin marketplace add /home/ttpl-lnvl15-0287/Desktop/Agents/PR Review Agent
```

```
/plugin install kavach@kavach
```

> Replace the path if you moved the folder. It must be the folder that contains
> the `.claude-plugin` directory.

### Later (once the repo is pushed to GitHub)

```
/plugin marketplace add O-Thinkitive-M/kavach
/plugin install kavach@kavach
```

### Check it installed

```
/plugin
```

You should see **kavach** in the list. If you don't, see
[When something goes wrong](#9-when-something-goes-wrong).

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

## 6. Review your first PR

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

## 7. Using it on any other project

**Nothing to set up.** Open a different project, paste a PR link, and it works.

The first time Kavach sees a new project it silently figures out the language,
framework, package manager and test tool, then saves that to a
`.pr-architect/` folder in that project. It never asks you questions about it.

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

Add this to that project's `.gitignore`:

```gitignore
.pr-architect/runs/
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

## 8. Settings you can change

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

## 9. When something goes wrong

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

## 10. Common questions

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
| Set up credentials | `/kavach-setup` |
| See what's configured | `/kavach-setup status` |
| Review a PR | Paste the PR URL in chat |
| Review thoroughly | `/kavach-review <url>` and say "deep" |
| See settings | `/kavach-config` |
| Change a setting | `/kavach-config review.maxComments=10` |
| Teach it project rules | Edit `.pr-architect/rules.md` |

---

**Still stuck?** Ask Claude Code directly — *"Kavach isn't posting comments, help
me debug it"* — it can read the config and error output and tell you what's wrong.
