---
type: command
name: preview-qa-workflow
description: Run the full automated visual quality assurance loop across all
  preview spreads of a gutterpress project, handling server checks, iterative
  image-based reviews, and consolidated reporting.
agent: qa-coordinator
when_to_use: Use this command to perform a comprehensive visual QA pass on a
  gutterpress book project's preview spreads, ensuring professional publication
  standards.
updated: 2026-06-19
---

# Print QA Workflow for Iterating Preview Spreads

Run the complete print QA workflow for a book project by iterating through preview spreads with the improved `qa-spread` command.

This workflow is designed for **full-spread visual quality assurance** across a gutterpress project. It handles server checks, iterative image-based reviews, and consolidated reporting.

**Note:** This command is for broad visual QA. For debugging HMR splice/swap protocols or incremental preview reload watchers, use the specific debugging workflows instead.

Example:
`preview-qa-workflow <project-path> [spreads N] [port PORT] [focus FOCUS]`

## Inputs

- **PROJECT PATH**: required. Path to the gutterpress project root.
- **SPREADS**: optional. Total number of spreads to review. Default from the live preview page count when available; otherwise derive it from the project's expected page count (for example from project-specific guardrails, `knowledge/print/project-guardrails`, if you provide them in your own stash; load with `akm show knowledge/print/project-guardrails`), with the last page potentially standing alone.
- **PORT**: optional. Preview server port (default: 3579).
- **FOCUS**: optional. Global focus phrase passed to each spread review.

## Quality Bar

Every spread is judged against a professional RPG publication standard — D&D 5e, Pathfinder 2e, Cyberpunk RED. Technical CSS validity is not the bar. Visual quality is.

The `qa-spread` command handles visual review. Each per-spread review MUST:
1. Take a screenshot of the spread.
2. Read the screenshot as an image via the Read tool before making any judgment.
3. Rate using the BROKEN / AWKWARD / MINOR / OK rubric.

**Do not accept a spread review that only inspects CSS or describes expected content without reading the image.**

## PHASE 1: CHECK PREVIEW SERVER

1. Check if preview is available at `http://localhost:PORT/preview.html`.
2. If not available, start the gutterpress preview server:
   - `gutterpress preview <project-path> --port PORT --open false`
3. Wait for preview to be ready and confirm Paged.js rendered all pages successfully.
4. Determine total page count from the live preview.
5. Use the live page count as the source of truth for spread count when available.
6. If the project has an expected page count (for example in `knowledge/print/project-guardrails`, if you provide it), use it as the baseline expectation.
7. If the live page count is unexpectedly far from the baseline, flag it before reviewing spreads.

## PHASE 2: ITERATE SPREADS WITH QA-SPREAD

8. For each spread N from 1 to SPREADS:
   - Calculate page numbers: L = (N x 2) - 1, R = N x 2
   - Run the spread QA workflow:
     ```
     qa-spread <project-path> pages L-R [focus FOCUS]
     ```
   - Treat the current `qa-spread` command as the source of truth for the per-spread loop.
   - `qa-spread` now includes a hard cap of 3 fix-review iterations per spread.
   - When a fix pass is needed, ensure the fix-agent dispatch explicitly references `knowledge/print/fix-team-dispatch-template` so the execute-don't-summarize boilerplate is applied.
   - The spread workflow handles screenshot capture, image reading, design review, fix dispatch, recapture, and re-review.
   - Wait for each spread run to finish before marking that spread complete.
   - Log the final verdict for spread N, including:
     - Page index
     - Screenshot description (what the image actually shows)
     - Rating (BROKEN / AWKWARD / MINOR / OK)
     - Final verdict (GO / FIX / NO-GO)

9. Small parallel batches are allowed only if the environment and agents can support them safely.
10. Keep each spread's fix loop isolated from the others.
11. Do not bypass the per-spread 3-iteration cap by redispatching extra fix loops outside `qa-spread`.

## PHASE 3: CONSOLIDATE RESULTS

12. After all spreads complete, gather results:
    - Read all `.reviews/qa-spread-pages-*.review.md` files.
    - Count spreads by final verdict (GO / FIX / NO-GO).
    - Count spreads by rubric rating (BROKEN / AWKWARD / MINOR / OK).
    - List any spreads that did not reach GO status.

13. Create a consolidated report at `.reviews/qa-workflow-summary.md` with:
    - Total spreads reviewed
    - Total pages implied by reviewed spreads
    - Live preview page count
    - Expected page-count baseline note (if the project has one)
    - Spreads passed (GO) by count and rating breakdown
    - Spreads with remaining issues — listed with page index, rating, and top issue
    - Specific failure modes found (blank pages, raw markdown, missing specimens, density issues)
    - Files modified during fix loops
    - Next steps (rebuild PDF, run preflight, targeted re-review, etc.)

## PHASE 4: FINAL VERIFICATION (OPTIONAL)

14. If all spreads passed:
    - Recommend rebuilding the PDF: `gutterpress build <entry> -o <pdf> --format <pdf|pdfx>`
    - Recommend running preflight: `gutterpress preflight --pdf <pdf> --target dtrpg`

15. If any spreads still have remaining issues:
    - List the problematic spreads with their final review status and rubric rating.
    - Note whether they exhausted the 3-iteration `qa-spread` cap.
    - Prioritize: BROKEN issues before AWKWARD before MINOR.
    - Recommend re-running QA only on those specific spreads with tighter focus.

Report progress after each spread completes.

## Arguments

Project path, spread count, port, and focus:

$ARGUMENTS

### See Also

Load each knowledge ref below with `akm show <ref>`. Apart from `knowledge/print/fix-team-dispatch-template`, they are not part of this bundle; provide them in your own stash.

- commands/print/qa-spread.md
- knowledge/print/fix-team-dispatch-template
- knowledge/print/pipelines/preview-qa-guide
- knowledge/print/design/gutterpress-styling-guide
- knowledge/print/design/print-design-guide
