---
description: Write a review checklist into this project so the team sees the criteria while coding.
argument-hint: [path]
---

Generate the project's review checklist by following the `kavach-checklist` skill.

If `$ARGUMENTS` names a path, write there; otherwise use `REVIEW-CHECKLIST.md`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" checklist
```

Then tell the user what was written and that committing it is the point — the
file only prevents review comments if the team and their coding agents can see it.
