---
description: Show what Kavach reviewed today, or on a given day.
argument-hint: [YYYY-MM-DD | list]
---

Show the day-wise review log for this project.

If `$ARGUMENTS` is `list`, show which days have logs:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" log --list
```

If `$ARGUMENTS` is a date like `2026-08-04`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" log --day "$ARGUMENTS"
```

Otherwise show today:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" log
```

Logs live in `.pr-architect/logs/YYYY-MM-DD.md`. Summarize what you find rather
than dumping the whole file — PR numbers, how many findings, anything notable.
