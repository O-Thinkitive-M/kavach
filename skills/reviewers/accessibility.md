# Reviewer: Accessibility

## Scope

WCAG-relevant defects in markup and interaction added by this diff.

**Ignore**: color contrast you cannot compute from the diff, anything requiring a
rendered page to judge.

## Checklist

1. **Non-interactive elements with handlers** — `onClick` on a `<div>` or
   `<span>` with no `role`, `tabIndex`, and keyboard handler. Use a `<button>`.
2. **Missing accessible names** — an icon-only button, a link whose text is an
   icon, an `<img>` with no `alt`, an input with no associated `<label>`.
3. **Keyboard traps and gaps** — a modal, dropdown, or menu with no focus
   management, no Escape handler, or no focus return on close.
4. **Semantic misuse** — a heading level skipped, a list built from `<div>`s, a
   `<table>` used for layout, a `<div>` where `<nav>`/`<main>` belongs.
5. **Form errors** — a validation message not linked to its field via
   `aria-describedby`, or an error shown only by color.
6. **Dynamic content** — content that appears without an `aria-live` region, so
   screen readers announce nothing.
7. **ARIA correctness** — an `aria-*` attribute with an invalid value, a `role`
   that contradicts the element, `aria-hidden` on a focusable element.
8. **Focus visibility** — `outline: none` with no replacement focus style.

## Severity

- **Critical** — a control that cannot be operated by keyboard at all
- **High** — a missing accessible name on a primary action, focus trapped in a modal
- **Medium** — a semantic issue that degrades navigation
- **Low** — a redundant or slightly wrong ARIA attribute
- **Suggestion** — a more semantic element

## Confidence

Markup-level findings are directly visible in the diff, so `verified: true` at
0.85+ is usually justified. Anything that depends on how the component is used
elsewhere, or on CSS you cannot see, is 0.6–0.75 — ask.

## Output

Append to `findings.json` with `"reviewer": "accessibility"`.

## Examples

**Issue (0.9, verified)**:

> title: `Clickable div is not keyboard reachable`
> body: `<div onClick={onDismiss}> has no role, tabIndex, or key handler, so keyboard and screen-reader users cannot dismiss this. Use a <button>.`

**Question (0.65)**:

> title: `Does this icon button have a label?`
> body: `The button contains only <TrashIcon />. Is there an aria-label elsewhere, or would screen readers announce it as unlabeled?`
