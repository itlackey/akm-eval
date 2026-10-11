---
title: Designer-Eye Visual Review (Batched-Capture Method)
description: General-purpose visual quality gate for Paged.js print books. Explains why automated validators cannot substitute for a designer's eye, defines a four-tier per-spread verdict scheme (OK/MINOR/AWKWARD/BROKEN), and provides a batched-capture model and prompt template that any gutterpress project can use as its final pre-ship gate.
two-sentence-summary: Automated validators catch named structural signals; they cannot catch whether a page reads well. This document defines the designer-eye review method — batched Puppeteer capture, per-spread verdicts in plain design language, and comparison against a baseline — as the canonical pre-ship quality gate for Paged.js books.
tags:
  - print
  - paged
  - review
  - visual
  - designer-eye
  - batched-capture
  - puppeteer
  - quality-gate
  - anti-pattern
  - rollup
  - workflow
priority: high
updated: 2026-07-17
---

# Designer-Eye Visual Review

## The failure mode this method counters

Automated validators answer a binary question: "Is this named signal present or absent?" They do not answer: "Does this page read well to a trained eye?" These are different questions.

In a documented campaign, an automated validator suite reported zero violations on a book that had eleven structurally broken spreads — chapter intro pages collapsed into a narrow left strip with the opposite page completely blank. Four different validator families (whitespace, columns, images, structural) all missed the pattern, because none of them were written to detect the specific dead-column collapse that had occurred. Designer-eye review surfaced every broken spread on first capture. The validator suite reported clean both before and after the fix campaign; only designer-eye distinguished the broken state from the fixed state.

**Hard rule:** A clean validator report is NOT evidence of ship-readiness. After any non-trivial fix campaign, run designer-eye batched-capture review against a baseline before publishing a GO/PASS claim.

---

## Project spec compliance check (Step Zero)

Before applying any visual verdict, verify each rendered element against the project's own design spec or style guide if one exists. Visual quality judgments assume the element is rendering the intended design — a component that looks "acceptable" while silently omitting a required element is not visually OK, it is broken by spec.

If the project has a design guide or template reference: check each element type on the spread against its spec before rating. Structural non-compliance (missing required element, wrong heading hierarchy, incorrect counter) rates the spread **BROKEN** regardless of visual appearance. Color or typographic deviations from spec without documented approval rate **AWKWARD**.

If no design spec exists: skip this step and rate purely on visual quality principles.

---

## Verdict scheme

Four verdicts, applied per spread, in increasing severity.

**OK** — the spread could appear in a professionally published book without editorial comment. Every page must have purposeful content density — not merely absence of BROKEN flags. A page that is 40% or more blank (outside of intentional art pages or deliberate negative space) cannot be OK. Type hierarchy must be visible and correct. Brand identity must be coherent across the spread. The reviewer must be able to state a positive reason the spread is publish-ready; "looks fine" is not sufficient.

**MINOR** — any single flaw a professional art director would mark up on first pass. Ragged-bottom exceeding 20%. A single heading that drifts. One card that clips. The spread stays in the book but must be fixed before press.

**AWKWARD** — any spread where a reader would notice quality problems without being told what to look for. Ragged-bottom exceeding 40%. Interior dead space — a blank zone in the middle of a page that breaks visual rhythm. Column-split content — a sentence or specimen that starts in one column and continues in the next with no visual bridge; body prose split mid-sentence across a gutter is always AWKWARD. Lopsided spread where one page is more than twice the fill of the other. Under-filled pages with no design justification. When in doubt between MINOR and AWKWARD, choose AWKWARD.

**BROKEN** — does not function as a designed spread. Content occupies less than 40% of the spread, any completely blank page that should have content, any card or component clipped mid-word at a page edge, any column with zero rendered content, body text reformatting to two or three words per line. A reader cannot read or navigate the content. Any BROKEN count greater than zero blocks GO.

### Tier rubric — generic examples

The following examples use generic content types to illustrate tier boundaries. Substitute the content types relevant to your book.

| Tier | Spread description |
|---|---|
| OK | Chapter opener: full-bleed heading, prose fills left page, art fills right — deliberate and balanced composition |
| OK | Rules tables spread: two dense tables with headers, good column spacing, no ragged-bottom, clear hierarchy |
| OK | Ability/skill cards: four cards over two pages, consistent density, no clipping, headings and body both readable |
| OK (intentional) | Colophon or end-of-book page — intentionally sparse, correct design intent |
| MINOR | Single-column page: content fills ~60%, bottom ~40% empty — slight ragged-bottom, otherwise readable |
| MINOR | Heading orphan: h3 stranded at top of right page with no content following it on the same page |
| AWKWARD | Rules page: body prose specimen splits mid-sentence across a column gutter; large interior blank zone between sections |
| AWKWARD | Table spread: column widths cramped, hyphenated word breaks throughout, ragged and choppy |
| AWKWARD | Card layout: two cards on a full page, bottom 45% blank — under-filled without design intent |
| BROKEN | Chapter intro squeezed into narrow left strip; right page completely blank — content block never rendered |
| BROKEN | Component card severely truncated — card box cut off mid-word at gutter edge, text in an unreadably narrow column |
| BROKEN | Body text reflows into a 2-word-per-line column — deeply cramped and nearly unreadable |

---

## Designer language

Findings must be written in plain designer language. The reviewer is reading pages, not interpreting metrics. Using the vocabulary below keeps findings actionable and prevents validator-language contamination.

| Word | Meaning |
|---|---|
| **stranded** | Content fragment isolated by white space; orphaned from its siblings |
| **cramped** | Insufficient breathing room; columns, cells, or text packed too tight |
| **lopsided** | Spread reads heavy on one side; left and right page fills are unbalanced |
| **orphan** | A heading or one to two lines hanging at the top of a page with the rest of its block elsewhere |
| **ragged** | Bottom of page ends without resolution; ragged-bottom = more than 25% empty bottom |
| **ragged-bottom** | Same as ragged; common in short-card layouts and ability chapters |
| **left-heavy** | Content collapses to the left of the spread; right is mostly empty |
| **narrow-strip-collapse** | Multi-column or wide content reflows into a narrow strip (25–30% width) with vast empty space adjacent |
| **dead-column** | Column or page that should hold content but is blank with only a faint outline box |
| **dead-page** | Whole page rendered empty inside the page-box outline — content block was lost |
| **blocked** | Reading flow obstructed (image clipping text, nested box overlapping content, etc.) |
| **buried** | Content placed where the eye cannot find it (e.g. critical row at the bottom of an otherwise empty column) |
| **wonky** | Off-axis, inconsistent rhythm, sloppy alignment |
| **drifting** | Element placed where it shouldn't be — heading drifting off baseline, card drifting off grid |
| **clipped** | Visible truncation at a hard edge (gutter, page edge, or component edge) |
| **collapsed** | Layout that has lost a column or section; content merging where it shouldn't |
| **stuck** | Element that didn't move when it should have — e.g. a counter that didn't increment |
| **floating** | Element with no anchor — a text fragment floating in empty space |
| **squeezed** | Content compressed below comfortable reading width |

---

## Forbidden language

The reviewer must not use validator IDs or metric vocabulary in designer-eye findings. These are different review modes; mixing their language contaminates the finding and defeats the purpose.

Never use in a designer-eye finding:

- Kebab-cased validator IDs: `interior-whitespace`, `page-fill-ratio`, `trailing-dead-space`, `widow-heading`, `safe-area-clearance`, `image-overflow`, `binding-edge-art`, `column-count-mismatch`, etc.
- Family names: "whitespace family", "structural family", "image family"
- Numeric threshold expressions: "gap > 96px", "fill ratio 0.55", "TAC 240%"
- Validator severity labels: NO-GO, FIX, advisory, ambiguous (these are validator severities; designer-eye uses OK/MINOR/AWKWARD/BROKEN only)

Correct: "Left page ~40% fill, right page ~60% fill — both loose and under-loaded."
Incorrect: "interior-whitespace violation on p.41."

---

## Batched-capture model

One Puppeteer session. All spreads captured in one pass. No serial single-screenshot loops driven from the orchestrator's context — orchestrator-driven scroll-and-snap loops consume context budget for zero quality gain.

Steps for any gutterpress project:

1. Launch headless Chrome, viewport 1600×1100, window 1600×2000 so the full document Y range can be clipped at any offset.
2. Navigate to the preview URL; wait for `networkidle0`.
3. Wait for a project-specific last-content marker — the final sentence or heading of the book's last page — to appear in the DOM. Paged.js renders incrementally and `__PAGED_RENDERED__` does not guarantee final pagination on long books. Poll every 5 seconds with a 600-second ceiling.
4. Enumerate `.pagedjs_page` elements; pair pages by equal `offsetTop` (Y-pairing — left and right pages of a spread share the same Y offset after Paged.js lays them out side by side).
5. For each spread, screenshot with `clip: { x: 0, y: spread.offsetTop - 10, width: 1600, height: 1100 }`. JPEG quality 70 keeps file sizes at roughly 150–300 KB; PNG inflates artifact size five to ten times without adding value for a designer-eye pass.
6. Save as `spread-NNN-pp-LL-RR.jpg` so file order matches reading order.

A reference capture script for any gutterpress project should enumerate `.pagedjs_page` elements, pair by Y-coordinate offset, clip one viewport per spread, and save as JPEG at quality 70. For a 300-page book (~150 spreads), this captures in two to three minutes and produces 30–40 MB of JPEGs.

---

## Comparison-vs-baseline protocol

After a fix campaign, the confirmation pass must diff against the baseline. Tag each finding with one of three labels:

- **CARRY-OVER** — present in baseline, still present at the same verdict tier. The campaign did not address it.
- **NEW** — was OK in baseline, now MINOR/AWKWARD/BROKEN. This is a regression introduced by the campaign and must be surfaced as a blocker.
- **DIFFERENT-ISSUE** — same spread reads differently than the baseline did. Note the change explicitly even if both states are OK; this catches silent layout drift.

The post-fix rollup must report:

- Verdict-count delta vs baseline (e.g. `OK +22, MINOR −1, AWKWARD −4, BROKEN −11`)
- Confirmed-fixed table (baseline issue → new state)
- Carry-over table (issues the campaign did not fix)
- New-regressions table (must be empty for GO; any entry blocks)

---

## When to use

Mandatory in these situations:

- After every non-trivial fix campaign (any campaign touching at least one structural or visual cluster), before publishing a GO/PASS claim.
- Before any "ship-ready" or "press-ready" declaration.
- When validators report clean but the orchestrator or user has uncertainty about quality ("looks better than before but I'm not sure", "validator says PASS but the rendered preview still feels off").
- When a campaign claims to fix a structural pattern (dead-column, narrow-strip-collapse, partial-card-clip, body-reflow). Validators rarely catch these; the reviewer's eye is the canonical authority.

## When NOT to use

- Config-only or single-line CSS changes. Designer-eye review is overhead for those — a standard DOM validator pass is sufficient.
- Mid-iteration spot-checks on a single fix. Use the per-spread visual reviewer for that; designer-eye is the campaign-level gate.
- Initial book bring-up before the validator suite is configured. Tune the validator suite first; designer-eye assumes a stable baseline exists.

---

## Concrete prompt template

Paste verbatim into `agents/print/visual-design-contest-judge` or an equivalent visual-design reviewer available to the caller. Fill `<placeholders>` from the orchestrator context.

```
You are reviewing a Paged.js print preview for visual layout quality. This is
DESIGNER-EYE review, not validator review. You will rate every spread in the
book against the four-tier rubric (OK / MINOR / AWKWARD / BROKEN) and write a
findings.md file with a per-spread roster.

CAPTURED ARTIFACTS

Working directory: <working_dir>

All <N> spreads have already been captured to JPEG via Puppeteer
(`spread-NNN-pp-LL-RR.jpg`). Read them in file-order — file order matches
reading order. Do NOT re-launch the browser; the captures are final.

<if confirmation pass>
Baseline: <baseline_findings_path>
Baseline verdict counts: <e.g. 96 OK / 23 MINOR / 16 AWKWARD / 11 BROKEN>
Compare each spread against the baseline. Tag each finding CARRY-OVER, NEW,
or DIFFERENT-ISSUE.
</if>

VERDICT RUBRIC

- OK — earns OK only if the spread could appear in a professionally published
  book without editorial comment. Every page must have purposeful content
  density. A page that is 40%+ blank (outside of intentional art pages) cannot
  be OK. Type hierarchy must be visible and correct. Brand identity must be
  coherent across the spread.
- MINOR — any single flaw a professional art director would mark up on first
  pass. Ragged-bottom >20%. A single heading that drifts. One card that clips.
- AWKWARD — any spread where a reader would notice quality problems. Ragged-
  bottom >40%. Under-filled pages with no design justification. Lopsided spread
  where one page is >2x the fill of the other. When in doubt between MINOR and
  AWKWARD, choose AWKWARD.
- BROKEN — content <40% of spread, any completely blank page that should have
  content, any component clipped mid-word at a page edge, any column with zero
  rendered content, body text reformatting to 2-3 words per line. Reader cannot
  read or navigate the content.

DESIGNER LANGUAGE — use these words

stranded, cramped, lopsided, orphan, ragged, ragged-bottom, left-heavy,
narrow-strip-collapse, dead-column, dead-page, blocked, buried, wonky,
drifting, clipped, collapsed, stuck, floating, squeezed.

FORBIDDEN LANGUAGE — never use

- Validator IDs (kebab-cased): interior-whitespace, page-fill-ratio,
  trailing-dead-space, widow-heading, safe-area-clearance, image-overflow,
  binding-edge-art, column-count-mismatch, etc.
- Family names: "whitespace family", "structural family"
- Numeric threshold expressions: "gap > 96px", "fill ratio 0.55"
- Validator severities: NO-GO, FIX, advisory, ambiguous

Use OK/MINOR/AWKWARD/BROKEN. Use plain designer prose for the description.

DELIVERABLE

Write `<working_dir>/findings.md` with this structure:

  # Visual QA Findings — <project>
  **Date:** <ISO date>
  **Spread count:** <N> (spread-001 through spread-NNN)
  <if confirmation pass>
  **Comparison baseline:** <baseline_findings_path>
  **Baseline verdict counts:** <baseline counts>
  </if>

  ## Current Verdict Counts
  | Verdict | Count <if confirm>| Baseline | Delta</if> |
  |---|---|<if confirm>---|---|</if>|
  | OK | ... |
  | MINOR | ... |
  | AWKWARD | ... |
  | BROKEN | ... |

  <if confirmation pass>
  ## Improvement Summary
  <one paragraph: what got fixed, what got worse, what stayed the same>

  ## Campaign Fix Verification

  ### CONFIRMED FIXED
  <table: Issue | Baseline | New Status>

  ### CARRY-OVER ISSUES
  <table: Issue | Spreads | Severity>

  ### NEW REGRESSIONS
  <table or "None confirmed.">
  </if>

  ## Spread Roster
  | Spread | Pages | Verdict | Description |
  |---|---|---|---|
  | 001 | 1-2 | OK | <one-sentence designer description> |
  | 002 | 3-4 | MINOR | <description with flaw named in designer language> |
  | ... |

  ## Top 5 Leverage Fixes Still Needed
  <numbered list, each: spread numbers + concrete fix recommendation>

  ## Honest Disclosure
  <bullets for spreads that look sparse/asymmetric but are confirmed
   intentional design — chapter openers, colophons, full-bleed art pages>

HARD RULES

- READ EVERY JPEG. Do not skip spreads.
- One verdict per spread. Use OK / MINOR / AWKWARD / BROKEN exactly. No
  intermediate grades, no slashes ("OK/MINOR" is forbidden — pick one).
- Description in plain designer prose. Name what's on the spread, name the
  flaw if any, in designer language. No validator IDs.
- WHEN IN DOUBT between two verdicts, always choose the harsher one. "Looks
  OK to me" is not sufficient — the reviewer must be able to articulate a
  positive reason the spread is publish-ready. If no clear reason exists,
  it is AWKWARD.
- NO CONSECUTIVE OKs without evidence: if rating 3 or more spreads OK in a
  row, add a brief justification note for each one explaining what
  specifically makes it publish-ready — not just "reads well."
- BROKEN > 0 blocks campaign GO. Surface every BROKEN explicitly in the
  Top 5 if confirmation pass, even if the campaign claimed to have fixed it.
- NEW regressions block GO. If a previously-OK spread is now MINOR/AWKWARD/
  BROKEN, list it under NEW REGRESSIONS and the campaign cannot ship.
- If a JPEG is unreadable or missing, mark the spread BLOCKED and report it
  in pipeline notes; do NOT fabricate a verdict.

When done, print one line to stdout:
DESIGNER-EYE STATUS: <OK|FIX|NO-GO> — <BROKEN count> broken / <NEW count> regressions — <findings.md path>
```

---

## Quantified evidence

In a documented campaign, the following verdict distribution was observed before and after a structural fix campaign. The validator suite reported a clean PASS at both points; only designer-eye review captured the improvement.

| Metric | Pre-campaign baseline | Post-campaign confirmation |
|---|---|---|
| OK | 96 | 118 (+22) |
| MINOR | 23 | 22 (−1) |
| AWKWARD | 16 | 12 (−4) |
| BROKEN | 11 | 0 (−11) |
| NEW regressions | n/a | 0 |
| Validator suite report | clean PASS (0 violations) | clean PASS (0 violations) |

Without designer-eye review, the campaign would have shipped a book with 11 unreadable spreads while the validator suite continued to report green.

---

## Cross-references

- `knowledge/print/fix-team-dispatch-template` — evidence, execution, and outcome-disclosure contract
- `knowledge/print/fix-team-dispatch-template` — fix-team dispatch contract; T2/T3 visual spot-check applies this rubric

---

## Cited resources

**Robert Bringhurst, *The Elements of Typographic Style* (4th ed.)** — The canonical reference for typographic quality: measure, leading, hierarchy, and the concept of typographic "color" (the even gray density a well-set page should present). The standard against which page fill and type rhythm are judged.

**Josef Müller-Brockmann, *Grid Systems in Graphic Design*** — Baseline grids, column structure, and the systematic approach to layout that underpins the BROKEN/AWKWARD tier definitions. Explains why a dead-column or narrow-strip-collapse is a structural failure, not merely an aesthetic one.

**Jan Tschichold, *The Form of the Book*** — Print page proportion, margin logic, and the spread as the fundamental unit of book design. The spread-level (not page-level) verdict scheme in this document is grounded in Tschichold's framing of facing pages as a single compositional unit.

**Robin Williams, *The Non-Designer's Design Book*** — The four CRAP principles (Contrast, Repetition, Alignment, Proximity) provide a practical diagnostic vocabulary for layout problems. When a spread is AWKWARD, it is usually violating one or more of these principles in a way a reader will feel even if they cannot name it.

**Adobe, *Print Production Guide*** (adobe.com) — Bleed, trim, safe area, and color profile standards for print production. Reference for safe-area compliance and binding-edge clearance when evaluating whether a spread meets production specs.

**Paged.js documentation** (pagedjs.org) — CSS properties for paginated layout, known browser limitations, and print-specific CSS behavior. Required reading for understanding which layout properties Paged.js honors and which it silently ignores — a prerequisite for diagnosing the difference between a CSS error and a Paged.js limitation.
