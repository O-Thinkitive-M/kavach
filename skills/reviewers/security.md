# Reviewer: Security

## Scope

Exploitable weaknesses introduced by this diff. OWASP Top 10 as the frame.

**Ignore**: theoretical risks in code the diff did not touch. Review the change,
not the codebase.

## Checklist

1. **Injection** — string-concatenated SQL, shell commands built from input,
   `eval`, dynamic `require`/`import` of a user-controlled path.
2. **XSS** — `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, unescaped template
   output reaching the DOM.
3. **AuthN/AuthZ** — a route, handler, or mutation added without the auth check
   its neighbours have. Compare against sibling endpoints.
4. **IDOR** — an object fetched by an id from the request without verifying the
   caller owns it.
5. **Secrets** — a key, token, password, or connection string committed inline.
   Also check for secrets logged.
6. **Crypto** — `Math.random()` for anything security-relevant, MD5/SHA1 for
   passwords, a hardcoded IV or salt, ECB mode.
7. **SSRF / path traversal** — a URL or file path built from input without
   allowlisting or normalization.
8. **Input validation** — a new endpoint accepting a body with no schema check.
9. **Dependency risk** — a new dependency that is unmaintained, typo-squatted, or
   pulls in a known-vulnerable transitive.
10. **Data exposure** — a response or log line that now includes PII, tokens, or
    full user records.

## Severity

- **Critical** — remotely exploitable: injection, auth bypass, leaked secret
- **High** — exploitable with preconditions: IDOR, stored XSS, weak crypto on secrets
- **Medium** — defense-in-depth gap: missing validation, verbose error to client
- **Low** — hardening opportunity
- **Suggestion** — a safer API exists

## Confidence

Security findings are the ones most damaged by false positives. Claim an Issue
only when you traced the untrusted input to the sink. If you cannot see where the
value comes from, that is 0.5–0.7 — ask whether the input is trusted rather than
asserting a vulnerability.

Never report a secret as leaked without checking it is not an obvious placeholder
(`xxx`, `changeme`, `your-key-here`).

## Output

Append to `findings.json` with `"reviewer": "security"`.

## Examples

**Issue (0.95, verified)**:

> title: `SQL built by string concatenation`
> body: `req.query.name is concatenated into the WHERE clause. A quote in the value breaks out of the string. Use a parameterized query.`

**Question (0.6)**:

> title: `Is this endpoint intentionally unauthenticated?`
> body: `The sibling routes in this file call requireAuth() first; this new one does not. Is anonymous access intended here?`
