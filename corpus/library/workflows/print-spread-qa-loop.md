---
type: workflow
description: Iterative visual QA loop for a range of print spreads in any
  gutterpress project. Captures screenshots, runs parallel visual review agents,
  dispatches tier-gated fix teams for issues found, restarts the preview, and
  repeats until every spread is approved as print-production-ready or the
  iteration cap is reached. Accepts optional per-run instructions (goals, focus
  areas) and constraints (CSS architecture rules, file restrictions) so it can
  be targeted to any book without hardcoding project details.
tags:
  - print
  - review
  - fix
  - paged
  - chrome-devtools
  - qa
  - loop
params:
  project_path:
    type: string
    description: Absolute path to the gutterpress project directory (e.g. `<project-dir>`). Required.
  spread_range:
    type: string
    description: Inclusive page range to review, e.g. `1-20`. The workflow derives spread pairs automatically (1-2, 3-4, ...). Must be even-span or end on a singleton. Required.
  port:
    type: integer
    default: 3579
    description: Preview server port. Default 3579.
  max_iterations:
    type: integer
    default: 3
    description: Maximum fix to review cycles before giving up and writing the final report. Default 3.
  instructions:
    type: string
    description: Optional goals, focus areas, or quality targets for reviewers and fix agents (e.g. 'prioritise art bleed and heading orphans', 'verify all skill cards are unclipped'). Forwarded verbatim to every review and fix dispatch. Empty = full review with no special focus.
  constraints:
    type: string
    description: Optional file-level or architectural constraints for fix agents (e.g. 'do not edit design-system files', 'CSS changes go in one layer stylesheet only', 'do not re-enable a disabled legacy stylesheet'). If empty, fix agents use general best-practice defaults. Injected as HARD RULES into every fix-team prompt.
steps:
  - id: setup
  - id: ensure-preview
  - id: capture-spreads
  - id: review-spreads
  - id: dispatch-fixes
  - id: restart-preview-loop
  - id: final-report
updated: 2026-06-19
---

# Workflow: Print Spread QA Loop

Iterative visual QA for a range of spreads in a gutterpress project. Each iteration:
captures every spread in the range via Chrome DevTools, runs parallel visual-review
agents (one per spread), aggregates all findings, dispatches tier-gated fix agents,
restarts the preview server, and loops. Exits when all spreads are rated GO/OK or
the `max_iterations` cap is reached.

---

## setup
Step ID: setup

### Instructions

1. **Resolve parameters:**
   - `project_path`   → `{{ project_path }}` (must exist; abort if not a directory)
   - `project_name`   ← `basename({{ project_path }})`
   - `parent_dir`     ← `dirname({{ project_path }})`
   - `spread_range`   → `{{ spread_range }}` (parse into `firstPage` / `lastPage`)
   - `port`           → `{{ port }}` (default 3579)
   - `max_iterations` → `{{ max_iterations }}` (default 3, parse as integer)
   - `instructions`   → `{{ instructions }}` (may be empty — forwarded to reviewers and fix agents)
   - `constraints`    → `{{ constraints }}` (may be empty — injected as HARD RULES into fix prompts)
   - `runId`          → `{{ runId }}`
   - `preview_url`    ← `http://localhost:{{ port }}/preview.html`

2. **Derive spread pairs** from `spread_range`:
   - Parse `firstPage` and `lastPage` from the range string (e.g. "1-20" → 1, 20).
   - Build a list of L-R spread pairs: `[(1,2), (3,4), (5,6), …]`.
   - If `lastPage - firstPage + 1` is odd, the last entry is a singleton `(N,N)`.
   - Record the full list as `spreadPairs` in run notes.

3. **Create the working directory tree:**
   ```bash
   working_dir="{{ project_path }}/.reviews/qa-loop-{{ runId }}"
   mkdir -p "$working_dir/screenshots" "$working_dir/reports" "$working_dir/fixes" "$working_dir/scratch"
   ```
   Write `"iteration": 0` to `$working_dir/scratch/state.json`.

4. **Load design references** using `akm curate "print layout QA visual review"` to surface the most relevant assets for this project. Load each knowledge doc below with `akm show <ref>`. At minimum load:
   - `knowledge/print/fix-team-dispatch-template` — **REQUIRED** for fix dispatch
   - `knowledge/print/pipelines/preview-qa-guide` — Paged.js troubleshooting + known QA gotchas (not part of this bundle; provide it in your own stash)
   - Any project-specific design guides returned by curate (e.g. brand guides, print specs)

5. **Load project-local context:** read `{{ project_path }}/CLAUDE.md` and `{{ parent_dir }}/CLAUDE.md` if they exist. These may contain project-specific CSS architecture rules, known Paged.js workarounds, and fix constraints — they take precedence over general guidance.

6. **Record initial state:**
   ```json
   {
     "runId": "{{ runId }}",
     "iteration": 0,
     "spreadPairs": [...],
     "instructions": "{{ instructions }}",
     "constraints": "{{ constraints }}",
     "verdicts": {},
     "allApproved": false
   }
   ```
   Write to `$working_dir/scratch/state.json`.

### Completion Criteria
- `project_path` exists and is a directory.
- `spreadPairs` list is derived and recorded (non-empty).
- Working directory tree (`screenshots/`, `reports/`, `fixes/`, `scratch/`) exists.
- Design references loaded (or noted as missing).
- `state.json` written with `iteration: 0`.

---

## ensure-preview
Step ID: ensure-preview

### Instructions

1. Check if the server is already serving:
   ```bash
   curl -sf "{{ preview_url }}" >/dev/null && echo OK
   ```
   If OK, record `preview_started_by_run = false` and skip to Completion Criteria.

2. If not running, start it from `parent_dir`:
   ```bash
   cd "{{ parent_dir }}" && nohup gutterpress preview "{{ project_name }}" \
     --port {{ port }} --open false \
     > "$working_dir/scratch/preview.log" 2>&1 &
   echo $! > "$working_dir/scratch/preview.pid"
   ```

3. Poll up to 45 s:
   ```bash
   for i in $(seq 1 45); do
     curl -sf "{{ preview_url }}" >/dev/null && break
     sleep 1
   done
   ```
   Final confirm: `curl -sf "{{ preview_url }}" >/dev/null && echo LIVE || echo FAILED`

4. If still down after 45 s, abort with `--state blocked` and surface the tail of `preview.log`.

5. **After server confirms live**, wait an additional 3 s for Paged.js to start rendering before the capture step. Do NOT start capturing while the page count is still 0.

### Completion Criteria
- `curl` to `preview_url` returns 200.
- `preview_started_by_run` recorded as `true` or `false`.
- If started: `preview.pid` exists under `scratch/`.

---

## capture-spreads
Step ID: capture-spreads

### Instructions

This step captures screenshots and metrics ONLY — no analysis. Keeping capture separate from review prevents stream-idle timeouts on large books where Paged.js rendering alone can take 2-5 minutes.

**IMPORTANT:** Do NOT open a new browser tab for each spread — open ONE tab, wait for full render, then scroll and screenshot each spread in sequence. Multiple tabs cause memory/context pressure and are slower.

**IMPORTANT:** Do NOT combine capture + review in one agent for ranges > 5 spreads. A book of several hundred pages takes 2-5 minutes to render, and adding 10 per-spread review reports to the same agent context causes stream-idle timeouts (~640 s). Capture is fast once rendering is complete; review is dispatched separately in the next step.

1. Open a Chrome DevTools page: `mcp__chrome-devtools__new_page` with `url={{ preview_url }}`

2. **Wait for full render** — Paged.js must complete before any screenshots:
   ```js
   // Poll until stable page count AND render flag
   let prev = 0;
   for (let i = 0; i < 60; i++) {
     const count = document.querySelectorAll('.pagedjs_page').length;
     if (count > 0 && count === prev && window.__PAGED_RENDERED__ === true) break;
     prev = count;
     await new Promise(r => setTimeout(r, 1000));
   }
   ```
   Record the total page count in `state.json` (`totalPages`).

3. If `totalPages < lastPage`, abort with a note: "Preview rendered fewer pages than requested range — possible Paged.js layout loop." Surface the Paged.js console errors.

4. **For each spread pair `(L, R)`** in `spreadPairs`:
   a. Scroll left page into view:
      ```js
      document.querySelector('.pagedjs_page[data-page-number="{{ L }}"]')
        ?.scrollIntoView({ block: 'start' });
      ```
   b. Resize viewport: `mcp__chrome-devtools__resize_page` → 1600×1100 (if not already)
   c. Screenshot: `mcp__chrome-devtools__take_screenshot`
      Save to: `$working_dir/screenshots/spread-{{ L }}-{{ R }}.png`
   d. Pull metrics via `mcp__chrome-devtools__evaluate_script`:
      ```js
      const L = document.querySelector('.pagedjs_page[data-page-number="{{ L }}"]');
      const R = document.querySelector('.pagedjs_page[data-page-number="{{ R }}"]');
      const s = el => el && {
        n: el.dataset.pageNumber, cls: el.className,
        blank: el.innerText.trim() === '',
        widows: [...el.querySelectorAll('h1,h2,h3,h4')].filter(h => !h.nextElementSibling).length
      };
      JSON.stringify({ l: s(L), r: s(R) });
      ```
      Save to: `$working_dir/scratch/metrics-{{ L }}-{{ R }}.json`

5. Confirm all screenshots and metrics files exist, then close the browser tab.
   ```bash
   ls "$working_dir/screenshots/"
   ls "$working_dir/scratch/"
   ```
   Do NOT begin any analysis here. This step is complete when files are on disk.

### Completion Criteria
- One `.png` file per spread pair exists under `screenshots/`.
- One metrics `.json` per spread pair exists under `scratch/`.
- Total page count recorded in `state.json`.
- No "Paged.js layout loop" abort triggered.
- No analysis or review performed in this step.

---

## review-spreads
Step ID: review-spreads

### Instructions

Dispatch one visual-review agent per spread. Run them in parallel where the harness supports it; otherwise run sequentially and note the order.

**Capture and review are intentionally separate steps.** The screenshots and metrics files are already on disk from the previous step. Review agents read files from disk — they do NOT open a browser. This separation prevents stream-idle timeouts.

**EXECUTE-DON'T-SUMMARIZE CONTRACT — mandatory in every dispatched reviewer prompt:**
- HARD RULE: DO NOT just read references and return a summary. PRODUCE the canonical reviewer schema.
- HARD RULE: Every finding MUST cite a concrete page number AND a named element/CSS rule.
- HARD RULE: If screenshot is missing or unreadable, return STATUS: BLOCKED with precise diagnostic.
- HARD RULE: Rate the spread using the designer-eye rubric: OK / MINOR / AWKWARD / BROKEN.

For **each spread pair `(L, R)`**, dispatch a reviewer with:
- Screenshot path (already on disk): `$working_dir/screenshots/spread-{{ L }}-{{ R }}.png`
- Metrics path (already on disk): `$working_dir/scratch/metrics-{{ L }}-{{ R }}.json`
- Design references (already loaded in context — pass refs, not full content)
- Instructions: `{{ instructions }}` — if non-empty, this scopes or focuses the review; otherwise do a full review
- Iteration context: "This is iteration N of a QA loop."
- Output report path: `$working_dir/reports/spread-{{ L }}-{{ R }}-iter-N.md`

Each reviewer must produce a report in this schema (render headings as real markdown when writing the file; shown here as `H1:`/`H2:` placeholders so this workflow stays valid):

- `H1: Spread Review — pp.{{ L }}-{{ R }} — Iteration N`
- Frontmatter bullets: `**Status**: GO | FIX | NO-GO`, `**Designer-eye verdict**: OK | MINOR | AWKWARD | BROKEN`
- `H2: Top Fixes` (highest impact first, max 5): `1. [Fix] — [Page] — [Why: brand/safety/readability/pagedjs]`
- `H2: Patterns`: bulleted list
- `H2: Page Callouts`: `p.{{ L }}: [issues]`, `p.{{ R }}: [issues]`

After all reviewer reports are written:

1. **Aggregate** all findings into `$working_dir/scratch/issues-iter-N.json`:
   ```json
   {
     "iteration": N,
     "spreadVerdicts": {
       "1-2": "GO", "3-4": "FIX", "5-6": "NO-GO", ...
     },
     "designerEyeVerdicts": {
       "1-2": "OK", "3-4": "MINOR", "5-6": "BROKEN", ...
     },
     "counts": {
       "goCount": N,
       "fixCount": N,
       "noGoCount": N,
       "awkwardCount": N,
       "brokenCount": N
     },
     "issues": [
       {
         "spread": "5-6",
         "severity": "HIGH",
         "designerEye": "BROKEN",
         "title": "...",
         "affectedFiles": [...],
         "suggestedFix": "..."
       }
     ]
   }
   ```

2. **Determine Next Action**:
   - If `allApproved` (i.e., all spreads are GO): Proceed to Step: Dispatch Fixes.
   - If any spread is NO-GO or BROKEN: Abort with `--state blocked` and surface the worst offenders in `$working_dir/reports/`.
   - If any spread is FIX: Proceed to Step: Dispatch Fixes.

### Completion Criteria
- All reviewer reports written to `$working_dir/reports/`.
- Aggregated issues JSON written to `$working_dir/scratch/issues-iter-N.json`.
- `state.json` updated with current iteration verdicts and counts.
- Decision made on whether to proceed to fix dispatch or abort.

---

## dispatch-fixes
Step ID: dispatch-fixes

### Instructions

This step is only executed if there are spreads requiring fixes (`FIX` or `NO-GO` verdicts).

1. **Load Fix Templates:**
   - Read `$working_dir/scratch/issues-iter-N.json`.
   - Load `knowledge/print/fix-team-dispatch-template` (required; load it with `akm show knowledge/print/fix-team-dispatch-template`) and any project-specific design guides.

2. **Group Issues by Severity/Tier**:
   - **Tier 1 (Critical):** BROKEN, NO-GO, or safety issues (bleed, orphaned text).
   - **Tier 2 (High):** Major layout shifts, broken typography, missing assets.
   - **Tier 3 (Medium):** Minor alignment, spacing, color consistency.
   - **Tier 4 (Low):** Cosmetic tweaks, micro-copy.

3. **Dispatch Fix Agents**:
   - For each tier, dispatch a dedicated fix agent with the following context:
     - Current iteration number.
     - List of issues in that tier.
     - Constraints: `{{ constraints }}` (injected as HARD RULES).
     - Instructions: `{{ instructions }}` (forwarded verbatim).
     - Design references (loaded in Step 1).
   - Fix agents must output changes to a temporary file in `$working_dir/fixes/` before applying.

4. **Apply Fixes**:
   - Review the generated fix files against constraints.
   - Apply fixes to the source project using `gutterpress apply` or equivalent CLI tool.
   - Log all applied changes to `$working_dir/scratch/fix-log-iter-N.txt`.

### Completion Criteria
- All Tier 1 and Tier 2 issues addressed (or documented as blocked).
- Fix files generated in `$working_dir/fixes/`.
- Changes applied to project source.
- `fix-log-iter-N.txt` written with summary of actions.

---

## restart-preview-loop
Step ID: restart-preview-loop

### Instructions

1. **Stop Current Server**:
   ```bash
   if [ -f "$working_dir/scratch/preview.pid" ]; then
     kill $(cat "$working_dir/scratch/preview.pid") 2>/dev/null || true
     rm "$working_dir/scratch/preview.pid"
   fi
   ```

2. **Restart Server**:
   - Call Step: Ensure Preview Server again (from `ensure-preview` step logic).
   - Wait for server to be live and rendering stable.

3. **Update State**:
   - Increment `iteration` in `$working_dir/scratch/state.json`.
   - Record `last_fix_iteration`: N.
   - Clear `verdicts` from previous iteration (will be re-evaluated).

4. **Check Cap**:
   - If `iteration >= max_iterations`, proceed to Step: Final Report.
   - Otherwise, proceed to Step: Capture All Spreads.

### Completion Criteria
- Preview server restarted and live.
- `state.json` updated with new iteration number.
- Loop condition checked (cap reached or not).

---

## final-report
Step ID: final-report

### Instructions

1. **Generate Summary**:
   - Read `$working_dir/scratch/state.json` for final counts.
   - Aggregate all reports from `$working_dir/reports/`.
   - Generate `$working_dir/final-report.md` with:
     - Total iterations run.
     - Spreads approved (GO).
     - Spreads requiring manual review (NO-GO/BROKEN).
     - List of unresolved issues.
     - Recommendations for next steps.

2. **Cleanup**:
   - Archive working directory to `$project_path/.reviews/archive/qa-loop-{{ runId }}`.
   - Remove temporary scratch files if not needed for debugging.

### Completion Criteria
- Final report generated in `$working_dir/final-report.md`.
- Working directory archived.
- Workflow exited successfully.

---

#### When to Use
Use this workflow when you need an automated, iterative visual QA process for a gutterpress project to ensure all spreads are production-ready before final export. It is ideal for books with complex layouts, multiple authors, or strict brand guidelines where manual review is too slow or error-prone.
