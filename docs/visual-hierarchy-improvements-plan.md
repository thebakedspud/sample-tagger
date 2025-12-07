# Visual Hierarchy Improvements Plan

**Status:** Implementation complete, pending commit

## Background

User testing insight #3:

> **Visual hierarchy and colour differentiation are weak.**
> Evidence: Users 1, 2, 5 all referenced struggles with color, contrast, or UI "pop".
> Implication: Not a full redesign - but UI differentiation (sections, buttons, states) likely needs tightening before broader testing.

This plan addresses that feedback with targeted, low-effort improvements that work within the existing design token system.

## Goals

- Increase visual distinction between interactive and static elements
- Improve scannability by clarifying section boundaries
- Strengthen feedback states (hover, focus, active) for better affordance
- Maintain accessibility (WCAG AA contrast ratios)

## Non-Goals

- Full visual redesign or new colour palette
- Adding new dependencies (icon libraries, animation frameworks)
- Changing layout structure significantly

## Key Files / Touchpoints

- `src/styles/primitives.css` - button styles, base components
- `src/styles/app.css` - section styles, nav, cards
- `src/styles/tokens.css` - CSS custom properties (new tokens will be added here)

---

## New Tokens Required

Before implementing changes, add these tokens to `src/styles/tokens.css`:

```css
:root {
  /* Accent colour variants */
  --accent: #5ab4ff;
  --accent-hover: #4a9ee6;           /* Darkened for hover - maintains contrast */
  --accent-soft-bg: rgba(90, 180, 255, 0.24);
  --accent-soft-border: rgba(90, 180, 255, 0.5);
  --accent-soft-shadow: rgba(90, 180, 255, 0.2);

  /* Surface variants */
  --surface-subtle: rgba(255, 255, 255, 0.03);
  --surface-subtle-hover: rgba(255, 255, 255, 0.06);
}

/* Dark theme overrides if needed */
[data-theme='dark'] {
  --surface-subtle: rgba(255, 255, 255, 0.03);
}

[data-theme='light'] {
  --surface-subtle: rgba(0, 0, 0, 0.02);
}
```

---

## Proposed Changes

### 1. Primary Button Style (High Impact, Low Effort)

**Problem:** The "Import playlist" button uses the same styling as secondary actions - `background: var(--card)` with a subtle border. It doesn't stand out as the primary CTA.

**Solution:** Add a `.btn.primary` variant with solid accent background.

```css
.app .btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #000;
  font-weight: 600;
}

.app .btn.primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.app .btn.primary:focus-visible {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.app .btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Note:** Hover darkens rather than lightens to maintain WCAG AA contrast with dark text. Avoid `color-mix()` for broader browser support unless targeting latest evergreen only.

**Files:** `src/styles/primitives.css`

**Usage:** Add `primary` class to "Import playlist" button in `src/App.jsx`

---

### 2. Navigation Active State Contrast (Medium Impact, Low Effort)

**Problem:** The active nav button uses `rgba(90, 180, 255, 0.16)` - a very subtle tint. Users may not immediately see which section they're in.

**Solution:** Increase active state opacity using tokens. Add underline indicator for desktop; rely on background-only at mobile to avoid clipping issues.

```css
.app-nav__btn.is-active {
  background: var(--accent-soft-bg);
  border-color: var(--accent-soft-border);
  color: var(--fg);
  box-shadow: 0 0 0 1px var(--accent-soft-shadow);
  position: relative;
}

/* Underline indicator - desktop only to avoid clipping on mobile */
@media (min-width: 640px) {
  .app-nav__btn.is-active::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 50%;
    transform: translateX(-50%);
    width: 60%;
    height: 2px;
    background: var(--accent);
    border-radius: 1px;
  }
}
```

**Files:** `src/styles/app.css`

**Mobile consideration:** Test that active state is clearly recognisable with background alone on small viewports where nav may wrap or overflow.

---

### 3. Section Heading Weight (Medium Impact, Low Effort)

**Problem:** `#landing-title` is `1.25rem` / `600` weight - not much heavier than body text. The hierarchy isn't pronounced.

**Solution:** Create a reusable heading class and apply to landing title. This scales to other screens.

```css
/* Reusable section title style */
.section-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.01em;
  margin: 0 0 var(--space-2) 0;
}

/* Apply to existing ID for backwards compatibility */
#landing-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.01em;
}
```

**Files:** `src/styles/app.css`

**Follow-up:** Migrate other section headings to use `.section-title` class for consistency across screens (account, playlist header, etc.).

---

### 4. Import Form Card Container (Medium Impact, Low Effort)

**Problem:** The import form (input + button + chip) floats without visual grouping. Users scanning the page may not immediately identify it as an action area.

**Solution:** Wrap the form in a subtle card container using the new surface token.

```css
.import-form-card {
  background: var(--surface-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  padding: var(--space-3);
  margin-top: var(--space-2);
  margin-bottom: var(--space-3);
}
```

**Files:** `src/styles/app.css`, `src/App.jsx` (add wrapper div with class)

**Note:** Uses `--surface-subtle` token which adapts to light/dark themes. Margins match existing card spacing patterns.

---

### 5. Standardised Focus Ring (High Impact, Medium Effort)

**Problem:** Focus states are inconsistent - some elements use `box-shadow`, some use `outline`, some use both with different colours. This affects accessibility and visual polish.

**Solution:** Apply consistent focus ring via global selectors on interactive element types.

```css
/* Global focus ring for interactive elements */
.app button:focus-visible,
.app [role='button']:focus-visible,
.app a[href]:focus-visible,
.app input:focus-visible,
.app textarea:focus-visible,
.app select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  box-shadow: none; /* Remove competing shadows */
}

/* Primary CTA gets slightly thicker ring for emphasis */
.app .btn.primary:focus-visible {
  outline-width: 3px;
}
```

**Files:** `src/styles/primitives.css`

**Pre-implementation audit required:**
Search existing styles for `:focus`, `:focus-visible`, and `box-shadow` on interactive elements. Remove or simplify per-component overrides to avoid specificity conflicts. Key files to check:
- `src/styles/app.css` (nav buttons, tag chips, recent cards)
- `src/styles/primitives.css` (base button, input)
- Any component-specific styles

**Coverage:** `button`, `[role='button']`, `a[href]`, `input`, `textarea`, `select`. Add additional selectors if audit reveals other interactive patterns.

**Custom focus exceptions:** If a component absolutely needs a custom focus treatment (e.g., a pill-shaped chip or inline tag input), it should still use `outline` rather than replacing with `box-shadow` only. Custom treatments may adjust `outline-offset` or `border-radius` but must maintain equivalent or better visibility to avoid accessibility regression.

---

### 6. Recent Card Border Accent (Low Impact, Low Effort)

**Problem:** Recent playlist cards use very subtle gradients that may be invisible on some displays.

**Solution:** Add a left accent using a pseudo-element to avoid box model changes that could cause misalignment.

```css
.recent-card__button {
  position: relative;
}

.recent-card__button::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}

.recent-card__button:hover::before,
.recent-card__button:focus-visible::before {
  opacity: 1;
}
```

**Files:** `src/styles/app.css`

**Note:** Uses pseudo-element instead of `border-left` to preserve box model and alignment with other cards. Inset from top/bottom (`12px`) matches card padding.

**Alternative (simpler):** Increase gradient opacity instead:
```css
.recent-card__button {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.04));
}
```

---

## Implementation Priority

| Priority | Change | Effort | Impact | Addresses |
|----------|--------|--------|--------|-----------|
| 1 | Primary button style | Low | High | CTA visibility |
| 2 | Nav active state | Low | Medium | Current location clarity |
| 3 | Section heading weight | Low | Medium | Scannability |
| 4 | Import form card | Low | Medium | Visual grouping |
| 5 | Focus ring standardisation | Medium | High | Accessibility, keyboard nav |
| 6 | Recent card accent | Low | Low | Card visibility |

**Recommendation:**
- Start with priorities 1-4 (all low effort, can be done in one pass)
- Tackle #5 as a separate pass since it requires auditing existing styles
- #6 is optional polish - implement if time permits

---

## Verification

### Functional checks
- [ ] Primary button visually distinct from secondary buttons
- [ ] Active nav state clearly visible without squinting
- [ ] Section headings create clear hierarchy when scanning
- [ ] Import form reads as a grouped action area
- [ ] Focus states consistent across all interactive elements
- [ ] Recent cards have visible accent/differentiation

### Accessibility checks
- [ ] Primary button text passes WCAG AA contrast (4.5:1 minimum)
- [ ] Primary button hover state maintains contrast
- [ ] Focus rings are at least as visible as before (never less prominent)
- [ ] All changes work in both light and dark themes via tokens

### Mobile/responsive checks
- [ ] Nav active state recognisable on mobile (without underline)
- [ ] Import form card doesn't create awkward spacing on small viewports
- [ ] No regressions on mobile viewport

### Heuristic check
- [ ] At a glance, users can identify the primary CTA and the currently active view within 1 second

---

## Out of Scope (Future)

- Dark/light theme colour refinement
- Animation and micro-interactions
- Icon system updates
- Typography scale overhaul
- Extracting all headings to reusable classes (follow-up to #3)

## Implementation Notes

**Recommended file edit order** (minimises churn and makes PR review easier):

1. **`src/styles/tokens.css`** - Add new tokens first so they're available to subsequent files
2. **`src/styles/primitives.css`** - Add `.btn.primary` styles and global focus ring
3. **`src/styles/app.css`** - Nav active state, section title, import form card, recent card accent
4. **`src/App.jsx`** - Add `primary` class to Import button, wrap form in `.import-form-card` div

**Pre-commit checklist:**
- Run focus audit (search for `:focus`, `:focus-visible`, `box-shadow` on interactive elements)
- Remove conflicting per-component focus overrides found in audit
- Test in both light and dark themes
- Test on mobile viewport (especially nav active state)

---

## Related

- `docs/landing-visual-refresh-plan.md` - addresses insight #2 (unclear purpose)
