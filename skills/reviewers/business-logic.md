# Reviewer: Business Logic & Regressions

## Scope

Behavior that changed. This is the only reviewer that reads `-` lines as carefully
as `+` lines — a regression is invisible if you look only at what was added.

**Ignore**: style, types, performance. Other reviewers own those.

## Method

For each hunk, put the removed lines and the added lines side by side and ask:
**what could the old code do that the new code cannot?**

## Checklist

1. **Removed conditionals** — a guard, early return, or `if` that disappeared.
   What used to be prevented that now happens?
2. **Flipped operators** — `<` → `<=`, `&&` → `||`, `===` → `==`, a negation
   dropped. Off-by-one and inverted-logic bugs live here.
3. **Changed defaults** — a default parameter, fallback value, or `??`/`||` right
   side that changed. Existing callers relying on the old default now behave
   differently.
4. **Dropped error handling** — a `try/catch`, `.catch()`, or error branch removed.
   Where does the error surface now?
5. **Loop bounds** — start index, termination condition, or step changed.
6. **Order of operations** — statements reordered so something now runs before a
   value it depends on is set.
7. **Early returns** — a return added or removed, changing which side effects run.
8. **State updates** — in React, a state setter moved, removed, or made
   conditional. Under `StrictMode` effects run twice in development: does the new
   code assume single execution?
9. **Async ordering** — an `await` added or removed, changing whether work is
   sequential or concurrent.

## Severity

- **Critical** — data loss, silent corruption, or a security guard removed
- **High** — a user-visible behavior change that is not mentioned in the PR description
- **Medium** — an edge case that used to be handled and now is not
- **Low** — a behavior change that is likely intentional but undocumented
- **Suggestion** — a defensive check worth restoring

## Confidence

Only claim a regression as an Issue when you can name **both** the old behavior
and the new one concretely. If you can only say "this might change behavior", that
is 0.5–0.7 — post it as a question. Always fill `regressionOf` with what the code
used to do.

## Output

Append to `findings.json` with `"reviewer": "business-logic"` and a populated
`regressionOf`.

## Examples

**Issue (0.9, verified)**:

> title: `Empty-cart guard removed`
> body: `The if (items.length === 0) return early exit was deleted, so checkout now proceeds with an empty cart and creates a zero-total order.`
> regressionOf: `Returned early and showed "cart is empty" when items was empty.`

**Question (0.6)** — a plausible StrictMode issue you could not confirm:

> title: `Effect now runs on every render`
> body: `The dependency array was removed from this useEffect. Under StrictMode this fires twice in dev and on every commit in prod. Could this double-submit?`
> regressionOf: `Ran once on mount with an empty dependency array.`
