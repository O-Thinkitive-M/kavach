---
description: Set up or change Kavach's GitHub token and Google Chat webhook.
argument-hint: [status]
---

Set up Kavach's credentials by following the `kavach-setup` skill.

If `$ARGUMENTS` is `status`, only show what is currently configured:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" setup --status
```

Otherwise check status first, then ask only for what is missing. Never echo a
token or webhook URL back to the user.
