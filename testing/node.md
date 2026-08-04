# Test: Node / Express backend

**PR:** https://github.com/O-Thinkitive-M/kavach/pull/5
**File:** `testing/fixtures/node/src/auth.js`
**Expect Kavach to route to:** `security`, `business-logic`, `performance`

## Project setup to test with

```
/kavach-init
```

Answer:
- **Project**: "Authentication service for a customer portal"
- **Focus areas**: `authentication, credential handling, injection`
- **Rules**:
  - Passwords must be hashed with bcrypt or argon2, never a fast hash
  - Never interpolate request input into SQL or a shell command
  - Error responses must not echo user-supplied values back

## What is planted in the PR

| Line area | Defect | Expected severity |
|---|---|---|
| `WHERE email = '${email}'` | SQL injection on the login path | **Critical** |
| `exec(\`tar -czf ... ${req.query.dir}\`)` | Shell command injection | **Critical** |
| `crypto.createHash('md5')` for passwords | Broken password hashing | **Critical** |
| `JWT_SECRET = 'dev-secret-change-me'` | Hardcoded secret, and it is returned to the client | **Critical** |
| `res.json({ token, secret: JWT_SECRET })` | Secret leaked in the response body | **Critical** |
| `hash === user.password_hash` | Timing-unsafe comparison | **Medium** |
| `user` used without checking `rows[0]` exists | Crash on unknown email | **High** |
| `randomBytes(8)` for a session token | 64 bits is weak for a token | **Medium** |
| `/profile/:id` returns any user by id | IDOR, no ownership check | **High** |
| Error message echoes `${email}` | User enumeration | **Medium** |
| `/bulk` loops `findUser` per id | N+1 | **High** |

## What to check in the result

- [ ] This PR should produce **more than 15 findings** — use it to test the comment cap
- [ ] Every **Critical** finding is posted inline despite the cap, not buried in the summary
- [ ] The review body explains the cap and lists the overflow
- [ ] Raise the cap with `/kavach-config review.maxComments=30` and re-run to compare
