---
name: qa-spread
type: command
description: Review and optionally iterate on a single print preview spread using screenshot-first QA.
when_to_use: Use this when you want a strict screenshot-based QA pass on one preview spread and, if needed, up to three CSS-only fix iterations.
agent: qa-coordinator
updated: 2026-05-17

---

Run a single-spread preview QA loop against `gutterpress` output.

Accepted forms:
- `qa-spread pages 5-6`
- `qa-spread <project-path> pages 5-6`
- `qa-spread <project-path> pages 5-6 port 4000`
- `qa-spread <project-path> pages 5-6 <focus notes>`
- `qa-spread <project-path> pages 5-6 port 4000 <focus notes>`

Argument rules:
- `PROJECT PATH` is optional. Default: current working directory.
- `pages L-R` is required. `L` must be odd. `R` must equal `L + 1`.
- `port N` is optional. Default: `3579`.
- Any remaining text is `FOCUS` and should bias the review, not narrow it.

Non-negotiable constraints:
- Do not change text content, markdown source, or copy. Only CSS/layout changes are allowed.
- Do not rate the spread until you have captured a screenshot and read that image file with the `Read` tool.
- Do not treat CSS inspection as proof of visual quality. Screenshot evidence wins.
- Review exactly one spread only. Do not drift into neighboring pages.

## Phase 1: Resolve Inputs

1. Parse arguments and restate the resolved values:
   - `projectPath`
   - `leftPage`
   - `rightPage`
   - `port`
   - `focus`
2. If the page syntax is invalid, stop with a usage error instead of guessing.

## Phase 2: Ensure Preview Is Running

3. Target preview URL: `http://localhost:<port>/preview.html`.
4. Check whether that preview is already available.
5. If it is not available, start it with:
   - `gutterpress preview <project-path> --port <port> --open false`
6. Wait until the preview loads and Paged.js has rendered pages.
7. If the preview still does not load, stop and report the failure clearly.

## Phase 3: Capture The Exact Spread

8. Open the preview in Chrome DevTools.
9. Confirm the rendered page count by checking `.pagedjs_page` elements.
10. Locate pages `L` and `R`. If either page is missing, stop and report that the requested spread does not exist.
11. Adjust zoom, viewport size, and scroll position so pages `L-R` are fully visible in one screenshot.
12. Capture only that spread. Do not include extra pages, browser chrome, or unrelated whitespace if it can be avoided.
13. Ensure `.reviews/` exists.
14. Save:
   - `.reviews/qa-spread-pages-L-R.png`
15. Create a review-friendly image:
   - Preferred: resize to width `600px`, quality `85`, save as `.reviews/qa-spread-pages-L-R.jpg`
   - If ImageMagick or equivalent is unavailable, keep the PNG and continue with that file
16. Use the actual generated image path as the review input.

## Phase 4: Image-First Review

17. Read the generated screenshot file as an image with the `Read` tool before making any judgment.
18. Describe only what is visibly present in the image. Do not infer missing content from source files or CSS.
19. Apply this rating rubric:

**BROKEN**
- Raw markdown is visibly rendered (`##`, `**bold**`, backticks, frontmatter)
- Most of the spread is unintentionally blank
- Content is cut off, overflowing, or missing
- A code/component example appears without any visible live specimen
- The spread is obviously incomplete or unreadable

**AWKWARD**
- Density is too low for a professional print layout without intentional whitespace design
- Grid or column alignment visibly drifts across the spread
- Documentation prose and specimen/output blocks are hard to distinguish
- Expected specimen details are missing or visually unsupported
- A chapter opener or feature spread reads like an unstyled heading dump

**MINOR**
- Noticeable but non-fatal spacing, alignment, widow/orphan, or contrast issues
- Small polish issues that should be fixed before final proof

**OK**
- Reads as intentional, professional, and publishable
- Visual hierarchy is clear
- Density fits the page type
- Specimens/examples are visually distinct from explanatory text
- No visible overflow, truncation, or structural layout failure

20. Apply the benchmark question: would this spread look acceptable in a professionally produced RPG book? If the honest answer is no, it is not `OK`.
21. If `knowledge/print/design/print-design-guide` exists in your own stash (load it with `akm show knowledge/print/design/print-design-guide`), use it. If it does not, continue with the embedded rubric and note that the external guide was unavailable.
22. Write the formal review to:
   - `.reviews/qa-spread-pages-L-R.review.md`
23. The review must include:
   - `Page index: L-R`
   - `Screenshot reviewed: <actual image path>`
   - `Screenshot description:` concise visual description based on the image only
   - `Rating:` `BROKEN`, `AWKWARD`, `MINOR`, or `OK`
   - `Verdict:` `GO`, `FIX`, or `NO-GO`
   - `Issues:` one actionable line per issue
   - `Focus notes considered:` include supplied focus, if any

Verdict mapping:
- `OK` -> `GO`
- `MINOR` or `AWKWARD` -> `FIX`
- `BROKEN` -> `NO-GO`

## Phase 5: Fix-Review Loop (Max 3 Passes)

24. If the first verdict is `GO`, stop.
25. Otherwise, run at most 3 total fix-review passes.
26. For each pass:
   - Dispatch `ttrpg-print-layout-dev`
   - CSS/layout changes only
   - Do not edit text content
   - Prefer the stylesheet path from `<project path>/manifest.yaml`; it is usually under `<project path>/css`
   - Include `knowledge/print/fix-team-dispatch-template` (load it with `akm show knowledge/print/fix-team-dispatch-template`)
   - If `knowledge/print/design/gutterpress-styling-guide` exists in your own stash (load it with `akm show knowledge/print/design/gutterpress-styling-guide`), include it
   - Require the fix agent to report files touched and the exact layout problems addressed
27. After each pass:
   - Reload preview with cache disabled
   - Re-capture the same spread and overwrite the review images
   - Read the new screenshot as an image again before re-rating
   - Re-run the formal review
   - Report the updated verdict and remaining issues
28. Stop early if a pass reaches `GO`.
29. If 3 passes complete without `GO`, stop and report the latest state as `FIX` with remaining issues. Do not start a 4th pass.

## Output Requirements

Report progress after each phase. End with:
- `Resolved inputs`
- `Preview status`
- `Screenshot files created`
- `Review file created`
- `Final rating`
- `Final verdict`
- `Fix passes used`
- `Files changed` (if any)
- `Remaining issues`
