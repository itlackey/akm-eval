---
title: Measurable Design + CSS Architecture Rubric for Gutterpress
description: The canonical pre-commit rubric for any gutterpress visual change.
tags:
  - print
  - paged
  - design
  - css-architecture
  - measurable-rubric
  - rubric
  - design-guide
  - quality-gate
priority: high
updated: 2026-09-15
when_to_use: Apply this asset immediately before committing any CSS change or
  visual fix to a gutterpress project to ensure compliance with design thresholds
  and paged.js architecture constraints.
---

# Measurable Design + CSS Architecture Rubric for Gutterpress

A recurring failure pattern (taste-based judgment of designs) is a misframing of the problem. Good design IS measurable — Bringhurst, Müller-Brockmann, Tschichold, Williams, and the WCAG group documented the patterns and the thresholds. This rubric makes those patterns the gating signal for any gutterpress change.

## Part 1 — Design measurement (per spread / per component)

Every visual fix must satisfy at least one of these patterns. The proof verdict file records WHICH pattern was being addressed and the BEFORE / AFTER measurement.

### D1. Proximity (Williams)
- **Signal**: pixel gap between elements that share a parent and a semantic relationship.
- **Threshold**: related elements within 1× body line-height (~14–24px). Unrelated elements > 2× line-height apart.
- **Measure**: `nextEl.getBoundingClientRect().top - prevEl.getBoundingClientRect().bottom` in browser.
- **Common pattern**: chapter heading + section body must read as one unit → gap target ≤ line-height.

### D2. Whitespace fill (designer-eye-method)
- **Signal**: content vertical extent / page vertical extent.
- **Threshold**: 0.60 ≤ fill ≤ 0.85 for body pages. ≥ 0.40 minimum to avoid BROKEN. Intentional pause pages (chapter splash, art interstitial, colophon) are excluded.
- **Measure**: `maxContentBottom - contentTop` over `pageContentHeight`.

### D3. Typographic color (Bringhurst)
- **Signal**: even gray density across a column of body text. High variance = ragged spacing / hyphenation / orphaned punctuation.
- **Threshold**: visual variance < ~15% across line widths for a justified column; < 10% deviation in line-fill ratio.
- **Measure**: per-line text length / available width across consecutive lines.
- **Quick proxy**: examine for trailing single-word lines, hyphen ladders, and "rivers" of whitespace.

### D4. Modular type scale (Bringhurst, Brown)
- **Signal**: ratio between adjacent heading sizes follows a chosen scale (major-second 1.125, major-third 1.25, perfect-fourth 1.333, golden 1.618, etc.).
- **Threshold**: every consecutive ratio in the type stack within ±5% of the chosen base ratio.
- **Measure**: computed font-sizes for h1, h2, h3, h4, h5, h6, body. Compute h1/h2, h2/h3, etc.

### D5. Vertical rhythm / baseline grid (Müller-Brockmann)
- **Signal**: vertical spacing between content blocks is an integer multiple of the base line-height.
- **Threshold**: margin-top, margin-bottom, padding-block on every component is one of {0.5, 1, 1.5, 2, 3} × base line-height.
- **Measure**: extract computed margin/padding values, divide by base line-height (24px default), check for integer or half-integer.

### D6. Contrast (WCAG AA)
- **Threshold**: text contrast ≥ 4.5:1 for body, ≥ 3:1 for large text (≥18pt or ≥14pt bold). Decorative elements exempt.
- **Measure**: relative luminance formula, applied to every foreground/background pair.
- **Measurement code**: `knowledge/print/visual-review/designer-eye-method` contains a JS measurement snippet. Load it with `akm show knowledge/print/visual-review/designer-eye-method`.

### D7. Grid adherence (Müller-Brockmann)
- **Signal**: major elements (sections, callouts, images) snap to a column grid (1, 2, or 3 columns per page-template).
- **Threshold**: left and right edges of major elements within ±2px of grid column boundaries.
- **Measure**: `boundingClientRect.left` and `.right` values for all major elements; compare to page column edges.

### D8. Type-family count
- **Threshold**: maximum 3 type families per book (display, body, mono). Anything beyond requires explicit justification.
- **Measure**: unique values of computed `font-family` across all rendered text.

### D9. Brand identity per chapter
- **Signal**: every chapter has at least one chroma anchor matching its `--section-accent`. Page-level color identity must be coherent.
- **Threshold**: at least one component on every chapter spread uses the chapter's `--section-accent` as its primary fill/border. Two-palette conflicts (e.g. a blue h2 in a chapter whose accent is orange) FAIL.
- **Measure**: per-chapter scope, count of unique chroma anchors. Should equal 1 (the chapter's --section-accent) plus 1 neutral structural color.

### D10. Art-text relationship
- **Signal**: images are either full-bleed-with-caption, floated-with-text-wrap, or inset-with-clear-frame. No in-between (image floating in empty space adjacent to body text without wrap/anchor).
- **Threshold**: every `<img>` is wrapped in a styled container OR has an explicit float / position rule that integrates it with surrounding flow.
- **Measure**: presence of float/position/clip-path/border on every img and on its parent.

### D11. Heading-section adjacency
- **Signal**: heading must visually attach to its following section. Implementation of D1 specifically for h_/section pairs.
- **Threshold**: gap between heading bottom and section top ≤ 0 px (visual overlap) for full-width banner headings; ≤ 4 px for decorative subheadings such as a styled h3.
- **Measure**: as D1.

### D12. Spread cohesion
- **Signal**: facing pages composed as a single unit; left and right page fills within a reasonable ratio.
- **Threshold**: |left_fill - right_fill| < 0.20 for matched body spreads. Chapter-opener spreads exempt.
- **Measure**: D2 applied per-page, compared.

---

## Part 2 — CSS architecture rubric (per file edit)

Every CSS change must satisfy these structural patterns, regardless of what design measurement is being targeted.

### A1. Layer ownership
- **Rule**: each CSS file owns a single concern. The first 50 lines of each file declare its ARCHITECTURAL CONTRACT.
- **Gutterpress canonical layers** (CSS file → concern):
  - the tokens stylesheet — `:root` tokens, `@font-face`, global print-color-adjust
  - the core stylesheet — html/body baseline, element resets, heading defaults
  - the component stylesheet — every `.<prefix>-*` / `.pmd-*` component (base + variants + token contracts)
  - `page-templates.css` — `.page.*` layout rules + `columns: N` (exclusive home for column rules)
  - `page-rules.css` — `@page` declarations + named-page wiring
  - a guide scaffolding stylesheet — guide-only scaffolding (`.chapter`, `.specimen`)
  - a context-scoped override stylesheet — one book's context-scoped tweaks ONLY (chapter-id selectors set tokens)
- **Violation signal**: a rule in the wrong file (e.g. `columns: 2` in the component stylesheet, or a bare `.<prefix>-x { padding: ... }` in a context-scoped override stylesheet).
- **Measure**: grep for cross-cutting patterns. Reusable test: clone the tokens, core and component stylesheets plus `page-templates.css` and `page-rules.css` into a new project — it must render correctly without the guide scaffolding or context-scoped override stylesheets.

### A2. Component portability via token surfaces
- **Rule**: every component exposes a token contract documented above its base rule. Default values reference base tokens (`var(--color-surface)`, never `#fafafa`).
- **Token naming**: `--<prefix>-<component>-<property>` (e.g. `--<prefix>-card-bg`, `--<prefix>-alert-label-color`).
- **Variant overrides set tokens, not properties.** `.<prefix>-group.<variant> .<prefix>-card { --<prefix>-card-accent: var(--brand-accent) }`, not `.<prefix>-group.<variant> .<prefix>-card { border-color: var(--brand-accent) }`.
- **Measure**: grep components for `var(--<prefix>-*-*)` patterns. Every property that could vary by context must be tokenized. Run "drop into sibling project" test: does the component render correctly with only the token defaults?

### A3. Specificity hygiene
- **Rule**: components use single-class selectors. Context tweaks use chapter-id qualifier in override files. No `:has()` (paged.js drops it). No `!important` unless overriding a third-party rule (cite the rule in a comment).
- **Threshold**: every selector specificity ≤ (0,3,0). Exceptions documented inline.
- **Measure**: parse selector list; flag any using `!important`, `:has()`, or specificity > (0,3,0).

### A4. Paged.js compatibility (mechanism check)
- **Rule**: choose a CSS mechanism that survives paged.js's transforms.
- **Known paged.js failure modes**:
  - `A + B` adjacent-sibling selectors get rewritten to `[data-following*]` at specificity (0,1,0) — loses cascade tiebreak to later same-specificity class rules. **Workaround**: apply the property on the trigger element directly.
  - `break-inside: avoid` is unreliable. **Workaround**: `data-break-inside="avoid"` attribute.
  - `:has()` crashes layout. Avoid entirely.
  - `::before` background-image survives page-break cloning; `::before` background-color does NOT. Use direct `background-color` on the element for things that must persist across page breaks.
  - `counter-set` is silently dropped — use `counter-reset` only.
  - `column-span: all` works inside `columns: N` containers; nested in flex/grid it doesn't.
- **Measure**: every CSS edit's mechanism named in the verdict file, with one of {direct-property, adjacency, pseudo-element, attribute-selector, custom-property-cascade}. Adjacency is flagged as risky.

### A5. Reusability across sibling projects
- **Rule**: any component added to the component stylesheet must work in a new project with zero override files. The override files are for THIS project's chapter context only.
- **Test**: copy the tokens, core and component stylesheets plus `page-templates` and `page-rules` to a new project, add one chapter with a single component instance, render — it must work. If not, the component leaked a context dependency.

### A6. Mechanism naming in verdict
- **Rule**: every fix's verdict file names the mechanism (D2 design + A4 paged.js compatibility category). Future agents reading the verdict learn the catalog of patterns.

### A7. CSS comments document the WHY
- **Rule**: any rule that exists to work AROUND a paged.js / browser / cascade quirk gets a `/* WHY: ... */` comment. Future agents must not strip these.
- **Examples**:
  - `/* Margin-bottom -10px (not + sibling margin-top:0) because paged.js rewrites adjacent-sibling to [data-following*] at lower specificity. See knowledge/print/measurable-design-and-css-rubric A4. */`
  - `/* data-break-inside="avoid" plugin output (not break-inside CSS) because paged.js drops the latter on .<prefix>-card. */`

### A8. No regressions across layer ownership
- **Rule**: after every edit, verify the constraint that produced the LAYER OWNERSHIP rule is still satisfied. If a fix touches a context-scoped override stylesheet, the touched selector must be chapter-scoped or page-scoped — never bare `.<prefix>-*`.

---

## Part 3 — How to use this rubric (workflow integration)

For every defect on a user-delivered list:

1. **Identify which design pattern is violated** (pick one from D1–D12). Record the BEFORE measurement.
2. **Propose a CSS edit** that satisfies the corresponding architecture rule (A1–A8).
3. **Generate the proof verdict**: A markdown block containing:
   - `Pattern Addressed`: e.g., "D1 Proximity"
   - `Before Measurement`: numeric value or description.
   - `After Measurement`: numeric value or description.
   - `Mechanism Used`: e.g., "direct-property" (A4 category).
   - `File Modified`: path to the CSS file.
   - `Why`: brief explanation referencing the rubric section.

**Example Verdict Block**:
```
---
pattern: D1 Proximity
before: 28px gap between H2 and paragraph
after: 16px gap (equal to line-height)
mechanism: direct-property
file: <component-stylesheet>
why: "Reduced margin-bottom on .<prefix>-section-header to match line-height per D1/D5."
---
```

4. **Commit** only if the verdict is generated and the change passes a mental check against A1 (Layer Ownership).

### Part 3b — Handling "Taste" Arguments

If a reviewer says "This looks wrong" without citing a pattern:

- **Do not accept** "taste" as a substitute for measurement.
- **Ask**: "Which D-pattern is violated?"
- **If none exists**, explain the design intent and document it in the verdict `why` field, but do not commit if it violates A1 or A4.

### Part 3c — Regression Checklist

Before committing:

- [ ] Did I touch the correct layer (A1)?
- [ ] Did I use a paged.js-safe mechanism (A4)?
- [ ] Is the specificity within bounds (A3)?
- [ ] Does the change maintain token contracts (A2)?
- [ ] Is there a verdict file generated?

---

## Appendix: Common Violations & Fixes

| Pattern | Symptom | Fix Strategy |
| :--- | :--- | :--- |
| D1 | Heading floats above body text with large gap. | Reduce `margin-bottom` on heading or use negative margin on following element (A4-safe). |
| D2 | Page looks empty or cramped. | Adjust `max-content-height` or add padding-block to container (D5 check). |
| A1 | Column rules in the component stylesheet. | Move to `page-templates.css`. |
| A2 | Hardcoded colors (`#fafafa`). | Replace with `var(--color-surface)`. |
| A4 | `break-inside: avoid` on `.card`. | Change to `data-break-inside="avoid"` attribute. |
| A3 | Selector `.chapter-id .<prefix>-card !important`. | Remove `!important`; use chapter-scoped override file if needed. |
