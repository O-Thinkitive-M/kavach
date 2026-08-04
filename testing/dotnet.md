# Test: .NET backend

**PR:** https://github.com/O-Thinkitive-M/kavach/pull/6
**File:** `testing/fixtures/dotnet/Controllers/InvoiceController.cs`
**Expect Kavach to route to:** `security`, `business-logic`, `architecture`

## Project setup to test with

```
/kavach-init
```

Answer:
- **Project**: "Billing API for invoice management"
- **Focus areas**: `billing accuracy, SQL injection, data exposure`
- **Rules**:
  - Connection strings come from configuration, never from source
  - Use parameterized `SqlCommand`, never string concatenation
  - Every endpoint returning invoice data must verify tenant ownership

## What is planted in the PR

| Line area | Defect | Expected severity |
|---|---|---|
| `"... WHERE Customer = '" + customer + "'"` | SQL injection | **Critical** |
| `ConnectionString` with an inline `sa` password | Hardcoded production credential | **Critical** |
| `FirstOrDefault(...)` then `.Amount` in `Totals` | `NullReferenceException` on a missing id | **High** |
| `Get(int id)` returns null with no 404 | Serializes `null` to the client | **Medium** |
| `Totals` queries per id in a loop | N+1 | **High** |
| `catch (Exception) { }` in `Void` | Swallows all failures, returns `Ok()` regardless | **High** |
| `Void` has no authorization check | Any caller can void any invoice | **Critical** |
| `SqlConnection` used alongside `AppDbContext` | Two data access strategies in one controller | **Medium** |
| `decimal` is correct here | Kavach should **not** flag this — decimal is right for money | *(no finding)* |

## What to check in the result

- [ ] The **absence** matters: `decimal` for money is correct and must not be flagged
- [ ] `using var conn` is correct disposal — should not be reported as a leak
- [ ] The empty `catch` finding explains the consequence (client sees success on failure)
- [ ] C# routes sensibly even though it is not in the extension map
