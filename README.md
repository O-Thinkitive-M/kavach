<div align="center">

<img src="assets/shield-256.png" alt="Kavach" width="180">

# Kavach

### *Paste a link. Get a review. That's the whole interface.*

[![version](https://img.shields.io/badge/version-1.0.0-2b7489)](https://github.com/O-Thinkitive-M/kavach)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](#development)
[![tests](https://img.shields.io/badge/tests-114%20passing-brightgreen)](test/)
[![node](https://img.shields.io/badge/node-%E2%89%A522.18-339933)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Autonomous PR review inside Claude Code.**
No API key · No onboarding interview · Never blocks a merge

[Setup guide](SETUP.md) · [How it works](#how-it-works) · [Configuration](#configuration)

</div>

---

You paste a pull request URL into Claude Code. Kavach fetches the diff, picks the
reviewers that matter for those files, reads the code, posts inline comments on
the exact lines with problems, and sends a summary to Google Chat.

```
you:  https://github.com/acme/api/pull/482

      Kavach — 12 of 18 files reviewed · security, typescript, business-logic
      Critical 0 · High 2 · Medium 3 · Low 1
      7 inline comments posted · Chat card sent
```

No confirmations. No "shall I post?". One paste, start to finish.

---

## Install

> **First time?** The **[step-by-step setup guide](SETUP.md)** covers getting a
> GitHub token, connecting Google Chat, and your first review — about 5 minutes.

```bash
# From a local clone (use this until the repo is published):
/plugin marketplace add /path/to/kavach
/plugin install kavach@kavach

# Once the repo is public:
/plugin marketplace add O-Thinkitive-M/kavach
/plugin install kavach@kavach
```

Then paste a PR URL. The first time, Kavach asks for a GitHub token (and
optionally a Google Chat webhook), verifies them against the live API, and stores
them. **It never asks again** — every later review runs silently.

To set up ahead of time: `/kavach-setup`

Credentials live in `~/.kavach/credentials.json` with `0600` permissions, outside
any repository, so they cannot be committed by accident. `GITHUB_TOKEN` and
`GOOGLE_CHAT_WEBHOOK` environment variables take precedence when set — that is
what CI should use.

### Multiple accounts

Reviewing a repo your stored token cannot reach? Kavach detects it, asks for a
token covering that organization, and stores it scoped to that owner — your
existing default is left alone. One machine, work and personal repos:

```bash
kavach setup --token <token> --repo acme/api --owner acme
```

---

## How it works

```
PR URL
  → cli.ts run      detect stack · fetch diff · parse hunks · route · budget
  → Claude          reads context.json + 2-4 reviewer rubrics, writes findings.json
  → cli.ts publish  dedupe · confidence policy · inline comments · Chat card
```

The CLI does every deterministic step; Claude Code does the judgement. There is no
API key and no LLM client — that is why it is cheap.

**Claude never fetches the diff itself.** A real 37-file PR is ~193,000 tokens of
raw patch. `cli.ts run` budgets it to 60k before Claude sees anything, keeping the
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
blocks a merge**, even on Critical findings. A human always decides.

### Never spams, never hides

- duplicate findings from multiple reviewers merge into one comment
- a fingerprint already posted is never posted again, even after a rebase
- comments are capped (default 15) — but **Critical and High findings are always
  posted**, even past the cap, so a serious defect is never buried in a summary
- overflow is listed in the review body with the cap explained
- a finding on a line outside the diff moves to the summary rather than failing
  the whole review

### Handles the awkward cases

| Situation | Behaviour |
|---|---|
| PR is in a language the project isn't configured for | Reviewers are told, and fall back to general engineering review with lower confidence |
| PR is already merged or closed | Says so in the review, still posts |
| Draft PR | Reviewed as work in progress, leaning toward questions |
| Empty PR, or only generated/binary files | Publishes an honest "nothing reviewable" summary rather than failing |
| Hundreds of findings | Severity-ordered; body truncated to GitHub's 65536 limit instead of 422-ing |
| More than 1000 changed files | Fetches the first 1000 and says so |

---

## Works with any stack

React · Next.js · Node · Python · Go · Java · Rust · PHP · Ruby · or a mix.

Open a new project, paste a PR link, and it works. On first run Kavach silently
detects the language, framework, package manager, test framework and monorepo
layout, then writes `.pr-architect/config.json`.

### Set up a project properly — `/kavach-init`

Optional, once per project folder. Kavach detects the mechanical details itself
and asks a few short questions with its guesses pre-filled:

- **Is this stack right?** — *Next.js · TypeScript · pnpm · Vitest*
- **What is this project?** — *"Patient scheduling API for a healthcare provider"*
- **What matters most?** — *auth, PHI handling, data migrations*
- **Any rules to enforce?** — *"All DB access goes through `repositories/`"*
- **Keep a day-wise review log?** — off by default

Answers go into every reviewer's context, so findings are grounded in what your
project actually is. Re-run any time to update; `/kavach-init reset` starts over.

**Reviews after this never ask you anything.**

### Day-wise review log — optional

Off by default. Enable per project during `/kavach-init`, or with
`/kavach-config notify.reviewLog=true`. Each review then appends one compact line
per finding to `.pr-architect/logs/YYYY-MM-DD.md`:

```
### 14:36 [#482 Add patient search endpoint](…) @dev
security,typescript · 12/18 files · H2 M3 L1 · 7 posted · [review](…)
- `H/I` src/api/search.ts:34 — Unparameterized SQL query
- `M/Q` src/api/search.ts:51 — Could this return unbounded rows
```

```bash
/kavach-log             # today
/kavach-log list        # which days have logs
```

### Teach it your project's rules

Write plain sentences in `.pr-architect/rules.md`:

```markdown
- All database access goes through `repositories/`, never direct SQL in components.
- Every API route requires `requireAuth()` as the first line.
- Money values are integers in cents, never floats.
```

Every reviewer reads this and enforces it. It is the highest-value thing you can
do to improve review quality.

---

## Configuration

Optional. Kavach works with none.

```bash
/kavach-config                                  # show current settings
/kavach-config review.maxComments=25
/kavach-config budget.maxContextTokens=120000
/kavach-config review.neverReviewers=accessibility

/kavach-setup status                            # what credentials are configured
```

| Setting | Default | Effect |
|---|---|---|
| `review.maxComments` | `15` | Cap on inline comments per PR |
| `review.mode` | `standard` | `deep` uses more reviewers and a larger budget |
| `review.minConfidenceForIssue` | `0.8` | Above this a finding is stated as an Issue |
| `review.minConfidenceToComment` | `0.5` | Below this a finding is dropped |
| `review.alwaysReviewers` | `security` | Always run, whatever the files |
| `review.neverReviewers` | *(empty)* | Never run |
| `budget.maxContextTokens` | `60000` | Larger is more thorough but slower |
| `notify.googleChat` | `true` | Set `false` to stop Chat messages |
| `notify.reviewLog` | `false` | Day-wise markdown log, opt-in per project |

---

## Development

Zero runtime dependencies. Node 24 runs the TypeScript directly — no build step,
no bundler, no `npm install`.

```bash
node --test test/*.test.ts     # 114 tests
node src/cli.ts run <pr-url>
node src/cli.ts publish --run <dir> --dry-run
```

| Path | What it holds |
|---|---|
| `src/diff/` | patch parsing and the token budget |
| `src/review/` | routing, dedupe, confidence policy |
| `src/github/` | REST client, PR fetch, review publish |
| `src/store/` | config, credentials, migrations |
| `skills/reviewers/` | the eight reviewer rubrics (plain markdown) |

---

<div align="center">

Built at [Thinkitive](https://github.com/O-Thinkitive-M) · MIT

<sub>The shield is Marvel's Captain America shield, used as an internal project mark.</sub>

</div>
