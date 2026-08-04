# Test: Python / Flask backend

**PR:** https://github.com/O-Thinkitive-M/kavach/pull/7
**File:** `testing/fixtures/python/app/reports.py`
**Expect Kavach to route to:** `security`, `business-logic`, `architecture`

## Project setup to test with

```
/kavach-init
```

Answer:
- **Project**: "Reporting service for an order management system"
- **Focus areas**: `SQL injection, secrets, revenue accuracy`
- **Rules**:
  - Use SQLAlchemy parameter binding, never `%` string formatting in SQL
  - Never pass request input to `subprocess` with `shell=True`
  - Monetary amounts are integer cents; never introduce floats

## What is planted in the PR

| Line area | Defect | Expected severity |
|---|---|---|
| `"... WHERE customer_name = '%s'" % name` | SQL injection | **Critical** |
| `subprocess.check_output(... + path, shell=True)` | Shell injection | **Critical** |
| `API_KEY = "sk_live_..."` | Hardcoded API key in source | **Critical** |
| `hashlib.md5` for passwords | Broken password hashing | **Critical** |
| `user.email` where `.first()` may return `None` | `AttributeError` on unknown id | **High** |
| `Order.query.get(order_id)` in a loop | N+1 | **High** |
| `apply_discount` returns a float from integer cents | Money precision loss — violates your stated rule | **High** |
| `/user/<user_id>` returns email with no ownership check | IDOR / PII exposure | **High** |

## What to check in the result

- [ ] The `apply_discount` float finding cites your `rules.md`, proving project rules are enforced
- [ ] Python routes correctly even if the project config says TypeScript — and if it does not match,
      check that the **stack mismatch note** appears and confidence is lowered
- [ ] `check_output` is caught as injection, not just "use a library"
