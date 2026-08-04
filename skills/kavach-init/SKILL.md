---
name: kavach-init
description: Set up Kavach for a project — confirm its tech stack and capture what the team wants reviewed. Use when the user runs /kavach-init, asks to set up or configure Kavach for this project or repository, wants to change what Kavach focuses on, or asks to update the project's review requirements or rules.
---

# Kavach — project setup

Run **once per project**. Detection handles everything mechanical, so this is a
short conversation, not a form. Re-running updates the answers; nothing is lost
unless the user asks for a reset.

**Everything is stored per user**, under `~/.kavach/projects/<project>/` — never
inside the repository. These answers are the user's own: a teammate reviewing the
same repo has their own separate rules and settings, and nothing here can be
committed by accident.

## Step 1 — detect first, ask second

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" init --detect
```

Returns JSON:

```jsonc
{
  "detected": { "name","language","framework","packageManager","testFramework","monorepo","stack" },
  "alreadyInitialized": false,
  "existing": null,               // or the previous summary + focusAreas
  "availableReviewers": ["architecture","react","typescript","security", …]
}
```

**If `alreadyInitialized` is true**, tell the user what is currently configured and
ask what they want to change. Do not re-ask everything from scratch.

## Step 2 — ask

Ask **all of it in one message**, with the detected values already filled in so the
user is confirming rather than typing. Keep it to these four:

1. **Stack** — "I detected *Next.js · TypeScript · pnpm · Vitest · monorepo*. Correct?"
   One line. They confirm or correct it.

2. **What is this project?** — one or two sentences. "A patient-scheduling API for
   a healthcare provider" tells every reviewer more than any config flag.

3. **What matters most in review?** — the areas where a bug would hurt. Examples:
   *payments, auth, data migrations, PHI handling, public API surface*. Kavach
   reviews these more thoroughly.

4. **Any rules to enforce?** — team conventions Kavach should check every time.
   Examples: *"All DB access goes through repositories/"*, *"Every API route calls
   requireAuth() first"*, *"Money is integer cents, never floats"*.

5. **Keep a review log for this project?** — off by default. When on, each review
   appends one compact line per finding to `.pr-architect/logs/YYYY-MM-DD.md`.
   Useful for standups and for tracking what was reviewed over a week; skip it if
   the team does not want extra files in the repo.

Also ask **strictness** only if they seem to want control:
*lenient* (8 comments, high bar) · *balanced* (15, default) · *strict* (25, deep mode).

Anything they skip keeps its default. Do not push for answers.

## Step 3 — save

One command, only the flags they actually answered:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" init \
  --summary "patient-scheduling API for a healthcare provider" \
  --focus "auth,PHI handling,data migrations" \
  --rules "All DB access goes through repositories/
Every API route calls requireAuth() first
Money is integer cents, never floats" \
  --strictness balanced \
  --logs true
```

- `--rules` takes one rule per line; they are **appended** to the user's own
  `rules.md` for this project, never overwritten.
- `--stack` only if detection got it wrong.
- `--reset` only if the user explicitly wants to discard the old requirements.

## Step 4 — confirm

Report what was saved in two or three lines, and tell them the important part:

> Kavach is set up for this project. Paste any PR URL and it reviews
> autonomously — it won't ask you anything again. Run `/kavach-init` any time to
> change these answers.
>
> These settings are yours alone, stored outside the repo. Nothing was added to
> the project's files.

## Rules

- **Never ask about credentials here.** That is the `kavach-setup` skill and it is
  a separate, once-per-user thing.
- Never ask for something detection already answered — that is the whole point of
  running `--detect` first.
- If the user says "just use the defaults", run `init` with no flags and move on.
- Setup is **optional**. If they paste a PR URL without ever running this, review
  it anyway using detected values.
