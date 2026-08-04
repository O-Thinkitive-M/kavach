<img src="assets/shield-256.png" alt="Kavach" width="96" align="right">

# Kavach

Autonomous AI PR review for Claude Code.

Paste a GitHub PR URL into Claude Code. Kavach fetches the diff, routes it to the
reviewers that matter for those files, judges it, posts inline comments for
findings it can stand behind, and sends a Google Chat summary.

**One paste. No questions. No configuration.**

```
you:  https://github.com/acme/api/pull/482

      Kavach — 12 of 18 files reviewed · security, typescript, business-logic
      Critical 0 · High 2 · Medium 3 · Low 1
      7 inline comments posted · Chat card sent
```

## Install

```bash
/plugin marketplace add O-Thinkitive-M/kavach
/plugin install kavach@kavach
```

Set two environment variables:

```bash
export GITHUB_TOKEN="ghp_..."               # needs `repo` scope
export GOOGLE_CHAT_WEBHOOK="https://chat.googleapis.com/v1/spaces/..."
```

That is the whole setup. There is no onboarding interview — Kavach detects the
stack on its first run in a repo and writes `.pr-architect/config.json` itself.

## Use

Paste a PR URL in chat, or:

```
/kavach-review https://github.com/owner/repo/pull/123
```

From the terminal:

```bash
node src/cli.ts run https://github.com/owner/repo/pull/123
node src/cli.ts publish --run .pr-architect/runs/123-abc1234 --dry-run
```

## How it works

```
PR URL
  → cli.ts run      detect stack · fetch diff · parse hunks · route · budget
  → Claude          reads context.json + 2-4 reviewer rubrics, writes findings.json
  → cli.ts publish  dedupe · confidence policy · inline comments · Chat card
```

The CLI does every deterministic step; Claude Code does the judgement. There is no
API key and no LLM client — that is why it is cheap.

**Claude never fetches the diff itself.** A 37-file PR is ~193,000 tokens of raw
patch. `cli.ts run` budgets it down to 60k before Claude sees anything, keeping the
highest-signal files whole and truncating the rest at hunk boundaries so line
numbers stay valid.

### Adaptive routing

Eight reviewers exist; two to four run per PR, chosen from the diff:

| Reviewer | Triggered by |
|---|---|
| `architecture` | default for any stack |
| `react` | `.tsx`/`.jsx`, hooks, components |
| `typescript` | `.ts`, type declarations, `any`/`@ts-ignore` |
| `security` | `auth/`, `api/`, secrets, raw SQL, dangerous APIs |
| `performance` | queries, loops with `await`, memoization |
| `accessibility` | UI components, ARIA, click handlers |
| `testing` | test files, deleted tests |
| `business-logic` | large deletions, migrations, changed conditionals |

Every selection records a reason, shown in the Chat card.

### Confidence policy

Uncertain observations are never presented as defects:

| Confidence | Verified | Posted as |
|---|---|---|
| ≥ 0.8 | yes | **Issue** |
| ≥ 0.8 | no | **Suggestion** |
| 0.5 – 0.8 | either | **Question** — *"Could this introduce a regression under StrictMode?"* |
| < 0.5 | either | dropped |

Reviews are always posted as `COMMENT`, never `REQUEST_CHANGES`. **Kavach never
blocks a merge**, even on Critical findings.

### Never spams

- duplicate findings from multiple reviewers merge into one comment
- a fingerprint already posted is never posted again, even after a rebase
- comments are capped (default 15); the rest go in the review summary
- a finding on a line outside the diff moves to the summary rather than failing
  the whole review

## Configuration

Optional. Kavach works with none.

```bash
/kavach-config                                  # show
/kavach-config review.maxComments=25
/kavach-config budget.maxContextTokens=120000
/kavach-config review.neverReviewers=accessibility
```

`.pr-architect/rules.md` and `knowledge.md` are yours — write project rules there
and every reviewer will honor them. Kavach never overwrites either file.

## Development

Zero runtime dependencies. Node 24 runs the TypeScript directly — no build step.

```bash
node --test test/*.test.ts
```

## License

MIT
