# Test: React frontend

**PR:** https://github.com/O-Thinkitive-M/kavach/pull/2
**File:** `testing/fixtures/react/src/components/UserDashboard.tsx`
**Expect Kavach to route to:** `react`, `typescript`, `accessibility`

## Project setup to test with

```
/kavach-init
```

Answer:
- **Project**: "Customer-facing dashboard for an e-commerce admin panel"
- **Focus areas**: `user data, XSS, render performance`
- **Rules**:
  - All list keys must be stable ids, never array indices
  - No `dangerouslySetInnerHTML` without explicit sanitization
  - Every interactive element must be keyboard reachable

## What is planted in the PR

| Line area | Defect | Expected severity |
|---|---|---|
| `dangerouslySetInnerHTML={{ __html: user.bio }}` | XSS from unsanitized user content | **Critical** |
| `user.bio` read while `user` is `null` on first render | Crash before fetch resolves | **High** |
| `useEffect` opens a WebSocket with no cleanup | Connection leak on every mount | **High** |
| Second `useEffect` uses `userId` but deps are `[filters]` | Stale data when userId changes | **Medium** |
| `key={i}` on a filtered + sorted list | Wrong element reuse on reorder | **Medium** |
| `<div onClick>` for "Clear" | Not keyboard reachable, no role | **Medium** |
| Icon-only `<button>` with `<TrashIcon />` | No accessible name | **Medium** |
| `<img src={o.thumbnail} />` | Missing `alt` | **Low** |
| `.filter().sort()` on every render | Unmemoized, but small — should be a Suggestion, not an Issue | **Suggestion** |
| `useState<any>` and `(o: any)` | Loose typing | **Low** |

## What to check in the result

- [ ] The XSS finding is **Critical** and phrased as an Issue, not a question
- [ ] The StrictMode/cleanup finding appears — this is the React reviewer earning its place
- [ ] The unmemoized sort is **not** reported as a defect (memoization is a judgement call)
- [ ] Your `rules.md` entries are actually enforced — the `key={i}` finding should cite the rule
- [ ] Nothing is posted twice if you re-run
