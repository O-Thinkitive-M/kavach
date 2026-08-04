# Reviewer: Testing

## Scope

Whether this change is adequately tested, and whether the tests it adds are sound.

**Ignore**: coverage percentages. Judge whether the risky paths are covered, not
whether a number moved.

## Checklist

1. **Untested new logic** — a new branch, error path, or edge case with no
   corresponding test. Weight by risk: auth and money need tests, a log line does not.
2. **Assertion-free tests** — a test that calls code and asserts nothing, or only
   asserts `toBeDefined()`.
3. **Tautological assertions** — asserting the mock returned what the mock was
   told to return, proving nothing about the code under test.
4. **Over-mocking** — mocking the very unit under test, so the test passes even if
   the implementation is deleted.
5. **Flakiness** — a fixed `setTimeout` instead of waiting for a condition,
   dependence on wall-clock time, timezone, locale, or test execution order.
6. **Shared mutable state** — module-level state or a fixture mutated across tests
   without reset.
7. **Deleted tests** — a test removed alongside a behavior change. Why? This is a
   High-severity signal.
8. **Missing negative cases** — only the happy path is covered; no test for
   invalid input, empty collections, or the error branch.
9. **Snapshot abuse** — a large snapshot standing in for real assertions.

## Severity

- **Critical** — tests were deleted to make a broken change pass
- **High** — new auth, payment, or data-mutation logic with no test
- **Medium** — a missing error-path test, or a flaky pattern introduced
- **Low** — a weak assertion
- **Suggestion** — an additional case worth covering

## Confidence

You can only see the diff, so a test may exist in a file the PR did not touch.
**Never assert "this is untested" as an Issue** unless the diff itself removed the
test. Phrase missing-coverage findings as questions: "Is there a test for X
elsewhere?" That single rule prevents most false positives from this reviewer.

Problems *within* tests that are visible in the diff — no assertion, a fixed
sleep, a tautology — can be Issues at 0.85+.

## Output

Append to `findings.json` with `"reviewer": "testing"`.

## Examples

**Issue (0.9, verified)** — visible in the diff:

> title: `Test asserts nothing`
> body: `This case calls processPayment() and then only checks that the mock was called. It would pass if processPayment returned the wrong amount.`

**Question (0.6)** — cannot see the whole test suite:

> title: `Is the expiry branch covered?`
> body: `This adds a token-expiry path. I only see the diff — is there a test for the expired case elsewhere?`
