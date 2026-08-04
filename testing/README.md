<img src="../assets/shield-256.png" alt="Kavach" width="72" align="right">

# Kavach — test suite

Six pull requests, one per stack, each with deliberately planted defects. Use
these to check Kavach behaves correctly on a stack before pointing it at real
work.

**Every fixture is intentionally broken.** Nothing here is imported by the plugin;
it exists only to be reviewed.

## The test PRs

| Stack | PR | What it exercises |
|---|---|---|
| **React** | [#2](https://github.com/O-Thinkitive-M/kavach/pull/2) | XSS, effect cleanup, stale deps, keys, a11y — [react.md](react.md) |
| **Spring Boot** | [#3](https://github.com/O-Thinkitive-M/kavach/pull/3) | SQL injection, `Optional.get()`, N+1, missing authz — [springboot.md](springboot.md) |
| **Angular** | [#4](https://github.com/O-Thinkitive-M/kavach/pull/4) | `bypassSecurityTrustHtml`, subscription leaks, debounce — [angular.md](angular.md) |
| **Node / Express** | [#5](https://github.com/O-Thinkitive-M/kavach/pull/5) | Shell + SQL injection, MD5 passwords, leaked secret — [node.md](node.md) |
| **.NET** | [#6](https://github.com/O-Thinkitive-M/kavach/pull/6) | SQL injection, null deref, empty catch, hardcoded conn string — [dotnet.md](dotnet.md) |
| **Python / Flask** | [#7](https://github.com/O-Thinkitive-M/kavach/pull/7) | `%`-format SQL, `shell=True`, float money — [python.md](python.md) |

Each `.md` lists **exactly what is planted, at what severity**, so you can check
Kavach's output against ground truth rather than guessing whether it did well.

## How to test one

1. Create a project folder matching that stack (or use any existing project).
2. Install the plugin:
   ```
   /plugin marketplace add O-Thinkitive-M/kavach
   /plugin install kavach@kavach
   /kavach-setup
   ```
3. Run `/kavach-init` and answer with the **project setup** block from that
   stack's `.md` — the summary, focus areas and rules are chosen to be
   verifiable against the planted defects.
4. Paste the PR URL into Claude Code.
5. Compare the result against the table in that `.md`.

## What a good result looks like

Judge on these, not on finding count:

- **Every Critical is caught.** Injection, hardcoded credentials and leaked
  secrets are the non-negotiables.
- **Nothing invented.** A finding that does not correspond to a planted defect
  is either a genuine catch you should verify, or a false positive worth noting.
- **Uncertain things read as questions.** "Could this…?" not "This is broken."
- **Project rules are cited.** If `rules.md` says money is integer cents, the
  float finding should reference it.
- **Correct code is left alone.** `decimal` in .NET and `using var` disposal are
  right; flagging them is a false positive.
- **Re-running posts nothing.** Dedupe should be silent on a second pass.

## Cross-cutting things to test

| Test | How |
|---|---|
| **Comment cap** | PR #5 produces 15+ findings. Check every Critical is still posted inline. |
| **Cap raised** | `/kavach-config review.maxComments=30`, re-run, compare. |
| **Stack mismatch** | Run the Python PR (#7) from a React project. A note should appear telling reviewers to lower confidence. |
| **Dedupe** | Review any PR twice. The second run should post nothing and send no Chat card. |
| **Strictness** | `/kavach-init` with `lenient` vs `strict` and compare finding counts. |
| **Logs off by default** | Confirm no `.pr-architect/logs/` appears until you opt in. |
| **Never blocks** | Check every review is `COMMENTED` and the PR stays mergeable. |

## Cleaning up

When you are finished, these branches and PRs can all be removed:

```bash
for b in react-frontend springboot-backend angular-frontend \
         node-backend dotnet-backend python-backend; do
  git push origin --delete "test/$b"
done
```

Deleting a branch closes its PR automatically. PR #1 (`kavach-test-fixture`)
is the original smoke test and can go the same way.
