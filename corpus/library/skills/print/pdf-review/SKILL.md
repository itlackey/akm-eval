---
name: pdf-review
description: Human visual QA protocol for print-ready PDFs (TTRPG-focused). Best
  for final sign-off and page-numbered fixes before POD submission.
when_to_use: Use for the final human-style visual review of a rendered PDF when
  you need a GO/FIX/NO-GO verdict and page-numbered callouts before submission
  or proofing.
updated: 2026-06-19
---

# PDF Review (Human Visual QA)

## Skill Routing

Use this table first so you pick the right review mode for the stage of work.

| Skill | Use when | Primary output | Do not use when |
| --- | --- | --- | --- |
| `pdf-review` | The PDF is close to done and needs a final human-style visual sign-off before proofing, POD upload, or release. | GO / FIX / NO-GO verdict with page-numbered visual issues and fix guidance. | You are still actively iterating spreads, or you want an automated batch pipeline report. |
| `pdf-layout-reviewer` | You want an automated batch preflight pipeline across a full PDF using heuristics, VLM checks, and structured reporting. | Repeatable machine-generated report for broad preflight coverage. | A human-style final sign-off is needed, or you only need to inspect a few active problem spreads. |
| `qa-spread` | You are in active layout work and need a tight spread-by-spread review/fix loop on current pages. | Iterative spread-level findings and immediate correction workflow. | You need final submission readiness approval, or you want a full automated batch preflight run. |

**Default rule:** if layout is still changing and you are fixing live spreads, use `qa-spread` first. Do not run the more expensive `pdf-layout-reviewer` pipeline when the task is really an active spread-by-spread fix loop.

## When to Use This Skill

**Use for final sign-off before POD submission.** This is the right skill when a human (or human-style AI reviewer) needs to do a visual pass over the rendered PDF and produce a GO/FIX/NO-GO verdict with page-numbered callouts.

Use this skill when you need:
- Final "does this look right" pass before upload.
- Targeted checks: margins/safe zones, typography, page breaks, tables/stat blocks, maps.
- Capturing page-numbered issues so fixes are easy to implement.
- A GO/FIX/NO-GO decision for submission readiness.

**Not this skill?**
- For automated, repeatable analysis with heuristics + VLM + deep review reports, use `pdf-layout-reviewer`.
- For iterative review while actively fixing current spreads, use `qa-spread`.
- For technical preflight (PDF/X, TAC, embedded fonts), pair with `pdfx-print-pipeline`.

## Method (3 passes)

1. **Structural pass**: fast flip for missing pages, bad section breaks, broken numbering.
2. **Detailed pass**: review representative pages + any flagged pages.
3. **Edge pass**: TOC, chapter openers, tables/stat blocks, dense pages, last pages.

## Severity

- **CRITICAL**: will print wrong / unusable at table / violates POD spec
- **HIGH**: professional-quality issue worth fixing before proof
- **MEDIUM**: polish if time
- **LOW**: optional refinement

## Output format

- **GO / FIX / NO-GO**
- **Top patterns**: fix once, improves many pages
- **Page callouts**: `p.<n> | severity | issue | fix`

## Print Standards

For shared print production standards (margins, bleed, typography, color, resolution, trim sizes), refer to the canonical source: `knowledge/print/pipelines/print-specs` (not part of this bundle; provide it in your own stash and load it with `akm show knowledge/print/pipelines/print-specs`).

## References (skill-specific)

- `references/print-quality-checklist.md` - Visual review methodology and checklists
- `references/ttrpg-standards.md` - TTRPG-specific layout standards and red flags
