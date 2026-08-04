---
description: Show or tune Kavach's configuration for this repository.
argument-hint: [key=value ...]
---

Kavach configures itself automatically — this command is only for tuning.

If `$ARGUMENTS` is empty, show the current config:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" config --show
```

Otherwise apply each `key=value` pair:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" config --set <key=value>
```

Common keys:

| Key | Meaning |
|---|---|
| `review.maxComments` | cap on inline comments (default 15) |
| `review.mode` | `standard` or `deep` |
| `review.minConfidenceForIssue` | above this a finding is stated as an Issue (0.8) |
| `review.minConfidenceToComment` | below this a finding is dropped (0.5) |
| `review.alwaysReviewers` | comma-separated, always run |
| `review.neverReviewers` | comma-separated, never run |
| `budget.maxContextTokens` | token cap per review (60000) |
| `notify.googleChat` | `true`/`false` |

Then report what changed in one line.
