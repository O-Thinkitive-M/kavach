# Test: Spring Boot backend

**PR:** https://github.com/O-Thinkitive-M/kavach/pull/3
**File:** `testing/fixtures/springboot/src/main/java/com/acme/orders/OrderController.java`
**Expect Kavach to route to:** `security`, `business-logic`, `architecture`, `performance`

## Project setup to test with

```
/kavach-init
```

Answer:
- **Project**: "Order management API for a B2B commerce platform"
- **Focus areas**: `payments, SQL injection, authorization`
- **Rules**:
  - Never build SQL by string concatenation; use parameter binding
  - Every endpoint that mutates data requires an authorization check
  - Never call `.get()` on an `Optional` without `isPresent()` or `orElseThrow()`

## What is planted in the PR

| Line area | Defect | Expected severity |
|---|---|---|
| `"... WHERE customer_name = '" + customer + "'"` | SQL injection via `@RequestParam` | **Critical** |
| `DB_PASSWORD = "prod_Pa55w0rd!"` | Hardcoded production credential | **Critical** |
| `repository.findById(id).get()` (3 places) | `NoSuchElementException` on unknown id | **High** |
| `refund()` has no authorization check | Any caller can refund any order | **High** |
| `refund(@RequestParam double amount)` | Floating point for money | **High** |
| `report()` loops `findById` per id | N+1 query | **High** |
| `catch (Exception e) {}` in `delete` | Silently swallows every failure | **High** |
| `@DeleteMapping` with no auth | Unprotected destructive endpoint | **Critical** |
| Controller calls `JdbcTemplate` directly | Bypasses the repository layer | **Medium** |

## What to check in the result

- [ ] SQL injection and the hardcoded password are both **Critical**
- [ ] All three `.get()` calls are flagged, and they **merge into one comment** if identical
- [ ] The N+1 finding names the growth term, not just "this is slow"
- [ ] The layering finding cites your `rules.md`, not a generic opinion
- [ ] Java routes correctly even though the project may be configured as TypeScript
