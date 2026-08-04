---
name: kavach-setup
description: Collect and verify Kavach's GitHub token and Google Chat webhook. Use when Kavach reports it needs credentials (KAVACH_NEEDS), when the user asks to set up, configure, connect, or change Kavach's GitHub token or Chat webhook, or when a review fails because the token cannot access a repository.
---

# Kavach setup

Kavach needs a GitHub token to read PRs and post comments, and optionally a
Google Chat webhook for summaries. Credentials are stored once per user at
`~/.kavach/credentials.json` with `0600` permissions — outside any repository, so
they can never be committed.

**Ask only for what is missing.** Check first:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" setup --status
```

## GitHub token

If no token is configured, ask the user for one in a single message. Tell them:

- Create it at <https://github.com/settings/tokens/new?scopes=repo>
- It needs the **`repo`** scope — that covers reading the diff and posting reviews
- A fine-grained token also works if it grants **Pull requests: read & write**
  on the repositories they want reviewed

When they provide it, store and verify in one step. Pass `--repo` whenever you
know which repository they are reviewing, because that checks real access rather
than just that the token exists:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" setup --token "<token>" --repo owner/repo
```

This prints which account the token belongs to and whether it can post comments.
If it reports the token cannot post, say so plainly — reviews will still run and
notify Chat, but nothing will appear inline.

## Google Chat webhook

Optional. If it is missing, ask whether they want Chat summaries; if they decline,
skip it — Kavach works without one.

To get a webhook: open the Google Chat space → **Apps & integrations** →
**Webhooks** → **Add webhook** → copy the URL.

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" setup --webhook "<url>" --test-chat
```

`--test-chat` posts a confirmation message so they can see it landed.

## A token that does not cover a repository

When a review fails with `KAVACH_NEEDS=github-token` and a `KAVACH_OWNER=<org>`,
the stored token cannot see that organization's repository. Ask for a token that
can, and store it scoped to that owner so the existing default is preserved:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" setup --token "<token>" --repo <org>/<repo> --owner <org>
```

This is how one machine reviews both work and personal repositories.

## Rules

- **Never echo a token or webhook URL back** to the user, never write one into a
  file in the repository, and never put one in a commit message. The CLI masks
  them in all of its own output — do the same in yours.
- Do not ask for credentials that are already configured.
- Environment variables (`GITHUB_TOKEN`, `GOOGLE_CHAT_WEBHOOK`) take precedence
  over stored values. If one is set, say so rather than asking for a replacement.
- After setup succeeds, **resume whatever the user originally asked for** — if
  they pasted a PR URL, review it now without making them paste it again.
