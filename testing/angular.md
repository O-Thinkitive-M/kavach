# Test: Angular frontend

**PR:** https://github.com/O-Thinkitive-M/kavach/pull/4
**File:** `testing/fixtures/angular/src/app/search.component.ts`
**Expect Kavach to route to:** `security`, `typescript`, `accessibility`, `performance`

## Project setup to test with

```
/kavach-init
```

Answer:
- **Project**: "Internal admin search UI built with Angular"
- **Focus areas**: `XSS, memory leaks, accessibility`
- **Rules**:
  - Never call `bypassSecurityTrustHtml` on server-supplied content
  - Every subscription created in `ngOnInit` must be torn down in `ngOnDestroy`
  - Interactive elements must be `<button>`, not `<div (click)>`

## What is planted in the PR

| Line area | Defect | Expected severity |
|---|---|---|
| `bypassSecurityTrustHtml(u.bio)` | Deliberately disables Angular's XSS protection on user content | **Critical** |
| `subscription` assigned but no `ngOnDestroy` | Subscription leak; class does not implement `OnDestroy` | **High** |
| `/api/search?q=${this.query}` | Unencoded user input in a URL | **Medium** |
| `onKey()` fires a request per keystroke | No debounce; floods the backend | **High** |
| `@Input() userId: string` with no initializer | Strict-mode initialization error | **Medium** |
| `<div (click)="clear()">` | Not keyboard reachable | **Medium** |
| Icon-only button `<i class="icon-trash">` | No accessible name | **Medium** |
| `<img [src]="r.thumb" />` | Missing `alt` | **Low** |
| `results: any[]`, `renderedBio: any` | Loose typing | **Low** |

## What to check in the result

- [ ] The `bypassSecurityTrustHtml` finding is **Critical** — this is the Angular-specific trap
- [ ] The missing `ngOnDestroy` is caught even though the class only declares `OnInit`
- [ ] The debounce finding explains *why* (one request per keystroke), not just "add debounce"
- [ ] Angular routes to `react` reviewer or not? Either is acceptable — check the reason given is honest
