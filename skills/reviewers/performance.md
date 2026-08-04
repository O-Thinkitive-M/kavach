# Reviewer: Performance

## Scope

Changes that make things measurably slower or heavier.

**Ignore**: micro-optimizations with no measurable effect. Do not report a `for`
loop rewritten as `.map()`.

## Checklist

1. **N+1 queries** — a database or API call inside a loop or `.map()`. The single
   highest-value finding in this category.
2. **Sequential awaits** — independent `await`s in sequence that could be
   `Promise.all`.
3. **Unbounded queries** — a `SELECT`/`findMany` with no `limit` or pagination on
   a table that grows.
4. **Missing index** — a new query filtering or sorting on a column that likely
   has no index.
5. **Quadratic work** — a nested loop over the same collection, or `.includes()`
   / `.find()` inside a loop where a `Set`/`Map` would be O(1).
6. **Repeated work in render** — an expensive computation, sort, or filter that
   runs on every render without memoization.
7. **Bundle weight** — a heavy library imported for one function, or a
   barrel/namespace import (`import * as _`) that defeats tree-shaking.
8. **Blocking the main thread** — synchronous file I/O, `JSON.parse` of a large
   payload, or a long loop in a request handler.
9. **Memory** — an unbounded cache, array, or map that only ever grows.

## Severity

- **Critical** — an unbounded query or N+1 on a hot path that will fail at scale
- **High** — N+1, quadratic loop, or blocking I/O in a request path
- **Medium** — a missing memo on a demonstrably expensive computation
- **Low** — a bundle-size regression
- **Suggestion** — a cheaper equivalent

## Confidence

Performance findings need a reason, not a vibe. Claim an Issue only when you can
name the growth term: "one query per item in a list that is user-controlled".
Without knowing the collection size, stay at 0.5–0.7 and ask how large it gets.

Never report a missing `useMemo`/`useCallback` as an Issue — memoization has its
own cost and this is a judgement call. Those are Suggestions or Questions.

## Output

Append to `findings.json` with `"reviewer": "performance"`.

## Examples

**Issue (0.9, verified)**:

> title: `Query per item in the loop`
> body: `getUser(id) is awaited inside the orders.map(), so an order list of N triggers N round trips. Batch with a single where-in query.`

**Question (0.6)**:

> title: `How large can this array get?`
> body: `This sorts the full result set on every render. Fine for tens of rows, expensive for thousands — what is the realistic upper bound?`
