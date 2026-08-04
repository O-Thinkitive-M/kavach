---
description: Set up Kavach for this project — confirm the stack and what to focus on.
argument-hint: [status | reset]
---

Set up Kavach for this project by following the `kavach-init` skill.

If `$ARGUMENTS` is `status`, only show what is currently configured:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" init --status
```

If `$ARGUMENTS` is `reset`, discard the existing project answers first, then run
the full interview again:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" init --reset
```

Otherwise: detect the stack, ask the four questions in one message with the
detected values pre-filled, and save. This is a one-time setup per project folder —
reviews afterwards run without asking anything.
