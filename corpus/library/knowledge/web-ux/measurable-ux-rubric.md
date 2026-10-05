---
title: Measurable UX + Web-Design Rubric
description: "The canonical standards-anchored rubric for any web-UI visual/UX change. Every dimension has a numeric or boolean signal and a cited standard, so the gate decision is evidence-based, not taste-based. Pairs with skills/web-ux/ux-dom-audit (deterministic floor) and the three web-ux judge agents."
tags:
  - web-ux
  - design
  - accessibility
  - wcag
  - typography
  - measurable-rubric
  - rubric
  - quality-gate
priority: high
updated: 2026-09-15
when_to_use: Apply this asset before merging any web-UI change that alters
  layout, components, typography, color, navigation, or responsive behaviour.
generated:
  by: akm/0.9.0-rc.13.local.20260801T222152264Z.pbc6cd9cfc9c9
  at: 2026-08-01T22:43:30.284Z
verified:
  - by: akm/0.9.0-rc.13.local.20260801T222152264Z.pbc6cd9cfc9c9
    at: 2026-08-01T22:43:30.284Z
---

# Measurable UX + Web-Design Rubric

Good UX and good visual design are **measurable**. The patterns and thresholds below come from documented sources — WCAG 2.2, Bringhurst, Müller-Brockmann, Williams (CRAP), Nielsen's usability heuristics, Fitts's law, and the Refactoring-UI body of practice — not from individual taste. This rubric is the gating signal for any web-UI change.

The failure pattern this asset exists to stop: a change is declared "approved" by a self-graded review of a few cherry-picked screenshots, while obvious, *measurable* defects (clipped controls, full-bleed body text far past the readable measure, sub-threshold contrast) ship anyway. Every claim of quality here must be backed by a recorded measurement.

The rubric has three layers, evaluated in order:

- **Part 1 — Deterministic floor.** Machine-checked, binary. Run by `skills/web-ux/ux-dom-audit`. ANY floor failure = global FAIL. No judge can override the floor; it gates before judges are even dispatched.
- **Part 2 — Measurable design.** Judge-checked, but each verdict must cite a numeric measurement (computed style, bounding rect, ratio), never a vibe.
- **Part 3 — Heuristic evaluation.** Nielsen's 10 heuristics + task-flow walkthrough. Judge-checked against the live, real-data UI.


## Part 1 — Deterministic floor (binary, machine-checked)

Checked at a **viewport width sweep** of 320, 360, 375, 414, 480, 640, 768, 900, 1024, 1280, 1440 px, in **both light and dark** themes, on the **live rendered UI with real data** (not empty states, not mocks). Each check emits a JSON finding with the offending selector and the measured value.

### F1. No clipping / no overflow — WCAG 2.2 §1.4.10 (Reflow, AA)
- **Signal**: any element whose content is cut off, or any horizontal scrolling of the document at ≤ 320px (reflow target is 320 CSS px / 1280@400%).
- **FAIL if**: for any element, `scrollWidth > clientWidth + 1` AND its overflow is not an intentional, scroll-affordanced container; OR `document.documentElement.scrollWidth > window.innerWidth + 1` at any swept width; OR an interactive element's bounding rect extends beyond the viewport.
- **Measure**: per element `scrollWidth - clientWidth`; per page `scrollWidth - innerWidth`.
- **This is the "navbar clips buttons" check.** It is a bug with a test, not an opinion.

### F2. Measure / line length — Bringhurst (*Elements of Typographic Style*)
- **Signal**: characters-per-line of any flowing text block (paragraphs, chat message bodies, prose, descriptions).
- **Threshold**: 45–85 characters per line; ideal ~66. Single-column body text must not exceed 85ch.
- **FAIL if**: a text block's rendered line holds > 90 characters (hard fail) at any width ≥ 768px, i.e. the container has no effective `max-width`/measure cap. Warn at 86–90.
- **Measure**: `getComputedStyle(block).width / (fontSize * 0.5)` as a ch proxy, or count characters in the longest rendered line.
- **This is the "full-width chat conversation breaks every typography rule" check.**

### F3. Target size — WCAG 2.2 §2.5.8 (Target Size Minimum, AA)
- **Signal**: rendered size of every interactive target (button, link, input, icon-button, tab).
- **Threshold**: ≥ 24×24 CSS px (AA minimum) with adequate spacing; ≥ 44×44 is the recommended touch target (Apple HIG / WCAG 2.5.5 AAA).
- **FAIL if**: any interactive element's rect is < 24px in either dimension and is not within 24px exemption (inline link in a sentence, or an equivalent adjacent control). Warn at 24–43px for primary controls.
- **Measure**: `el.getBoundingClientRect()` width/height.

### F4. Contrast — WCAG 2.1 §1.4.3 (AA) + §1.4.11 (Non-text)
- **Signal**: contrast ratio of text vs background; UI component/state vs adjacent colors.
- **Threshold**: ≥ 4.5:1 normal text, ≥ 3:1 large text (≥24px or ≥18.66px bold), ≥ 3:1 for UI component boundaries and graphical objects.
- **FAIL if**: axe-core reports any `color-contrast` violation in either theme.
- **Measure**: axe-core `@axe-core/playwright` violation report.

### F5. Visible focus — WCAG 2.1 §2.4.7 + 2.2 §2.4.11 (Focus Appearance)
- **Signal**: keyboard focus indicator on every focusable control.
- **FAIL if**: tabbing to an interactive element produces no perceptible focus change (no outline/ring/background delta), or focus is obscured.
- **Measure**: focus the element, diff computed `outline`/`box-shadow`/`bg` against unfocused; require a non-empty delta.

### F6. Keyboard operability — WCAG 2.1 §2.1.1 (Keyboard) + §2.1.2 (No Trap)
- **Signal**: every action reachable and operable by keyboard; focus never trapped except in a modal that releases on Escape.
- **FAIL if**: a primary action is unreachable by Tab, or a Tab cycle never returns to the document (trap) outside a dismissible dialog.

### F7. Resize / no fixed micro-type — WCAG 2.1 §1.4.4 (Resize Text)
- **Signal**: base body font size and zoom resilience.
- **FAIL if**: body text computed size < 12px, or content is lost/overlapped at 200% zoom (re-run F1 at 200%).

> The floor is the part of this rubric that **cannot be gamed**: it is produced by a deterministic script and the same input always yields the same findings.


## Part 2 — Measurable design (judge-checked, measurement-backed)

Every judge verdict in this part MUST quote the measured value. "Looks unbalanced" is not a finding; "h2/h3 ratio is 1.05, below the 1.2 minimum of the declared scale" is.

### D1. Visual hierarchy / modular type scale — Bringhurst, Brown (*Modular Scale*)
- **Signal**: ratio between adjacent type sizes follows one declared scale (minor-third 1.2, major-third 1.25, perfect-fourth 1.333, etc.).
- **Threshold**: every consecutive ratio (h1/h2, h2/h3, h3/body) within ±10% of the chosen base ratio; the primary heading on a view is the largest text.
- **Measure**: computed `font-size` of h1–h4, body; compute ratios.

### D2. Spacing system / vertical rhythm — Müller-Brockmann (grid)
- **Signal**: margins/paddings are multiples of a base unit (4px or 8px grid).
- **Threshold**: ≥ 90% of spacing values on a view are integer multiples of the base unit; block spacing is one of {0.5, 1, 1.5, 2, 3}× the rhythm unit.
- **Measure**: sample computed margin/padding; divide by base unit; check integer/half-integer.

### D3. Proximity & grouping — Williams (CRAP)
- **Signal**: gap between elements reflects their semantic relationship.
- **Threshold**: related elements within ~1× line-height; unrelated groups separated by > 2× line-height.
- **Measure**: `next.top - prev.bottom` between related/unrelated pairs.

### D4. Alignment — Williams (CRAP)
- **Signal**: shared edges; controls and labels align to a consistent axis.
- **Threshold**: form fields, headers, and action rows share left/right edges (≤ 2px drift). No element placed without an alignment relationship.

### D5. Color & brand discipline (project token contract)
- **Signal**: semantic use of color.
- **Threshold**: the brand accent (e.g. the project's accent token, such as `--color-primary`) is used ONLY for primary-action fills, never for status; status uses warning/error/success tokens; neutral chrome stays neutral.
- **Measure**: enumerate elements painted with the accent token; confirm each is a primary action.

### D6. Component consistency — design-system integrity
- **Signal**: the same role uses the same component everywhere.
- **Threshold**: buttons, inputs, badges, cards, empty-states, tab strips share one implementation; no one-off variants for the same role.

### D7. Affordance & state coverage — Norman (*Design of Everyday Things*)
- **Signal**: every interactive element looks interactive and exposes hover/active/focus/disabled/loading/empty/error states.
- **Threshold**: each interactive component defines all applicable states; empty and error states are designed (icon + sentence + next action), not blank.


## Part 3 — Heuristic evaluation (judge-checked, on live real-data UI)

Run a **cognitive walkthrough**: pick the top operator tasks for the view and attempt them on the real running UI. Score Nielsen's 10 heuristics; each violation is a finding with the task, the step, and the observed breakdown.

1. Visibility of system status
2. Match between system and the real world (labels in user language)
3. User control and freedom (undo/cancel/back)
4. Consistency and standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility and efficiency of use
8. **Aesthetic and minimalist design** (no irrelevant/competing content)
9. Help users recognize, diagnose, recover from errors
10. Help and documentation

Plus **Information Architecture**: do the navigation groupings map to real operator tasks, or to the implementer's mental model? Groupings must be derived from a task list, not aesthetic convenience.


## Part 4 — Scoring & gate rule

The gate is **binary PASS / FAIL**. There is no "passes with minor tweaks."

1. **Floor first.** If `skills/web-ux/ux-dom-audit` reports ANY Part-1 failure, the gate is **FAIL** immediately. Judges are not dispatched. The failing findings are the backlog.
2. **Judge AND-gate.** If the floor is clean, dispatch the three independent judges (a11y, IA/flow, visual). Each returns **PASS** or **FAIL** with measurement-backed findings. A judge returning **INSUFFICIENT EVIDENCE** is treated as **FAIL**.
3. **All three must PASS** for the gate to PASS. Any single judge FAIL blocks.
4. **Synthesis (human/orchestrator final call).** The orchestrator reviews the floor report + all judge findings and casts the final binary verdict. The orchestrator may **only withhold** a PASS (e.g. confirm a judge FAIL, or fail despite judge PASS if a judge missed a measured floor-class defect). The orchestrator may **never manufacture** a PASS over a floor failure or a judge FAIL.
5. **Decision record.** Every run writes a timestamped decision JSON: `{ status, floor: {...}, judge_verdicts: {a11y, ia, visual}, blocking, backlog }`.

### Severity for the backlog
- **P0** — floor failure (Part 1) or a task the user cannot complete.
- **P1** — measurable design defect (Part 2) that degrades a core task.
- **P2** — heuristic/polish issue (Part 3) with no task-blocking impact.

P0 and P1 block PASS. P2 is recorded but non-blocking.

See `skills/web-ux/ux-dom-audit`, `agents/web-ux/ux-a11y-judge`, `agents/web-ux/ux-ia-flow-judge`, `agents/web-ux/ux-visual-judge`, and `workflows/web-ux-validation-gate`.
