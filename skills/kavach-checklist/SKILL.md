---
name: kavach-checklist
description: Generate a REVIEW-CHECKLIST.md documenting what Kavach checks on this project's pull requests, so developers and coding agents follow those rules while writing code instead of discovering them in review. Use when the user runs /kavach-checklist, asks to share or document the review criteria, wants fewer PR comments, or asks to put the review rules into CLAUDE.md.
---

# Kavach — project review checklist

Turn the review criteria into something developers read **before** opening a PR.
Most review comments are avoidable; this is what makes them avoidable.

## Generate it

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" checklist
```

Writes `REVIEW-CHECKLIST.md` into the project containing:

1. The project's own rules — from what the user told `/kavach-init`
2. The areas flagged as high-risk
3. Checklists from only the reviewers that apply to this stack
4. How findings are reported, and that reviews never block a merge

Use `--out <path>` to write elsewhere, `--print` to preview without writing, and
`--force` to replace a file Kavach did not generate.

**This is the one command that writes into the repository.** Everything else
Kavach stores lives under `~/.kavach/`. Say so when reporting back — a user who
expects Kavach never to touch their tree should not be surprised.

## After generating

If the project has a `CLAUDE.md`, a pointer to the checklist is added
automatically, so a coding agent working in that repo follows the same rules the
reviewer applies. Re-running does not duplicate it.

Tell the user two things:

- **Commit it.** The file only prevents review comments if the team sees it.
- **Regenerate after changing rules.** `/kavach-init` adds a rule; this rebuilds
  the checklist to match.

## When the rules are thin

If `/kavach-init` was never run, the checklist has no project-specific section —
only the generic reviewer criteria. That is a much weaker artifact. Suggest
running `/kavach-init` first to capture what the project actually is and which
rules matter, then regenerating.

Do not invent project rules to fill the gap. A rule the team never agreed to is
worse than no rule.
