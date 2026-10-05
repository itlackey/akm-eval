---
type: workflow
description: "Binary PASS/FAIL gate for any web-UI change. Runs the deterministic floor (skills/web-ux/ux-dom-audit) first; if it is clean, dispatches three independent UX judges (a11y, IA/flow, visual) against the live rendered UI, the audit findings, and screenshots; then the orchestrator casts a final binary verdict that may only WITHHOLD a pass, never manufacture one. Writes a timestamped decision JSON."
tags:
  - web-ux
  - design-review
  - accessibility
  - quality-gate
  - workflow
params:
  ui_dir: { type: string, description: "Absolute path to the UI package where Playwright and @axe-core/playwright resolve and the dev server runs." }
  audit_config: { type: string, description: "Absolute path to the ux-dom-audit config JSON (baseUrl, states, widths, themes, auth)." }
  base_url: { type: string, description: "Origin of the live UI under test; must match audit_config.baseUrl." }
  password_env_value: { type: string, description: "How to obtain the login password for OP_UI_LOGIN_PASSWORD. Never hard-code it." }
  change_summary: { type: string, minLength: 1, description: "One paragraph describing what changed and the design intent." }
  task_list: { type: string, minLength: 1, description: "Top operator tasks for the surface under review, required for IA judging." }
  out_dir: { type: string, description: "Absolute directory for findings, screenshots, and decision JSON artifacts." }
  max_iterations: { type: integer, minimum: 1, description: "Maximum fix-to-gate cycles before escalating.", default: 5 }
steps:
  - id: the-rule
  - id: required-inputs
  - id: floor
  - id: judges
  - id: decision
  - id: iteration
  - id: scope
updated: 2026-06-06
when_to_use: Run before merging any change that alters layout, components,
  typography, color, navigation, responsive behaviour, or any operator-visible
  web UI; run again after fixes until PASS.
---

# Workflow: Web UX Validation Gate

## the-rule

### Instructions
1. The gate is **binary PASS/FAIL**. There is no "passes with minor tweaks".
2. **Floor first, un-gameable.** Run `skills/web-ux/ux-dom-audit`. If it reports ANY P0 finding, the gate is **FAIL** immediately and judges are NOT dispatched. The P0 list is the backlog.
3. **Three independent judges, AND-gate.** If the floor is clean, dispatch `agents/web-ux/ux-a11y-judge`, `agents/web-ux/ux-ia-flow-judge`, and `agents/web-ux/ux-visual-judge` in parallel. ALL three must return PASS.
4. Treat any single judge **FAIL** as a blocked merge. Treat **INSUFFICIENT EVIDENCE** as FAIL until the missing capture is provided.
5. **Orchestrator is the final synthesizer but cannot launder a pass.** The orchestrator reviews the floor report + all judge verdicts and casts the final verdict. It may only WITHHOLD a PASS (confirm a judge FAIL, or FAIL despite judge PASS when a measured floor-class defect was missed). It may NEVER turn a floor failure or a judge FAIL into a PASS.
6. **Separation of roles.** The agent/session that implemented the change must not act as a judge. Judges are independent dispatches.
7. This workflow exists to stop the failure pattern where a UI is declared "approved" by a self-graded review of cherry-picked screenshots while measurable defects ship.

### Completion Criteria
- Binary policy, floor-first ordering, judge AND-gate, and the orchestrator's withhold-only authority are all explicit.

## required-inputs

### Instructions
1. Validate `ui_dir`, `audit_config`, `base_url`, `change_summary`, `task_list`, `out_dir`, `max_iterations`.
2. Confirm `@axe-core/playwright` and `playwright` resolve from `ui_dir` (install `@axe-core/playwright` if missing).
3. Confirm the rubric and assets are registered:
   `akm show knowledge/web-ux/measurable-ux-rubric --detail brief`,
   `akm show skills/web-ux/ux-dom-audit --detail brief`, and the three judge
   agents. Abort if any are missing.
4. Treat an empty `change_summary` or `task_list` as invalid (the IA judge needs
   the task list; all judges need the change intent).
5. **New Requirement:** Ensure `base_url` matches the origin of the running dev server exactly, including trailing slashes and protocol. Mismatches will cause audit resolution failures.

### Completion Criteria
- All params present; tooling resolves; rubric + skill + 3 judges registered.

## floor

### Instructions
1. Ensure the UI is serving at `base_url`. If not, start it from `ui_dir`
   (`npm run dev` or `node build/index.js`) in the background, poll until the
   readySelector responds, and record that the run started it (so it can be
   stopped after).
2. Generate a `runId` and an ISO `generatedAt` (pass both into the audit so the
   run is reproducible — the script generates no timestamps itself).
3. Run the audit from `ui_dir` so node_modules resolves:
   ```bash
   OP_UI_LOGIN_PASSWORD="<resolved>" UX_AUDIT_RUN_ID="<runId>" \
   UX_AUDIT_GENERATED_AT="<iso>" \
   bun run <stash>/skills/web-ux/ux-dom-audit/scripts/audit.ts <audit_config>
   ```
   The audit writes `<out_dir>/findings.json`, `audit-summary.md`, and
   `shots/`. Exit code is non-zero when P0 > 0.
4. Read `findings.json`. If `summary.P0 > 0`: the gate is **FAIL**. Skip judges.
   Go straight to Decision Record with the P0 (and P1/P2) list as the backlog.
5. If `summary.P0 === 0`, proceed to judges (carry P2 warnings into the judge
   briefs as context).
6. **New Requirement:** Verify that `shots/` contains at least one screenshot for every unique selector found in the audit report. If a selector exists in findings but has no corresponding image, flag this as an evidence gap before proceeding to judges.

### Completion Criteria
- UI confirmed serving; audit ran; `findings.json` + screenshots exist.
- P0 > 0 short-circuits to FAIL without dispatching judges.

## judges

### Instructions
1. Dispatch all three judges **in parallel**, each as an independent agent (not
   the implementer). Give each the same brief:
   - `change_summary`, `task_list`, `base_url`.
   - Absolute path to `findings.json` and to the `shots/` dir (judges must open
     the screenshots as images).
   - Instruction to read `knowledge/web-ux/measurable-ux-rubric` first.
2. `agents/web-ux/ux-a11y-judge` → WCAG 2.2 AA + keyboard/AT.
3. `agents/web-ux/ux-ia-flow-judge` → Nielsen heuristics + IA-fit cognitive
   walkthrough against `task_list`.
4. `agents/web-ux/ux-visual-judge` → measurable visual design (hierarchy,
   measure, rhythm, alignment, brand, consistency), each finding numeric.
5. Collect all three verdicts in their required output shape before deciding.
6. Treat INSUFFICIENT EVIDENCE as FAIL; if it is due to a missing capture you
   can produce, add the state/width to `audit_config` and re-run Stage 1.
7. **New Requirement:** If any judge returns "INSUFFICIENT EVIDENCE" due to a missing screenshot for a specific selector, do not proceed to synthesis. Instead, update `audit_config` to include that selector's state/width/theme, re-run Stage 1 (floor), and re-dispatch judges only if the floor P0 remains 0.

### Completion Criteria
- Three independent verdicts collected, each with BLOCKING/NON_BLOCKING/
  EVIDENCE_GAPS sections.

## decision

### Instructions
1. Compute the verdict:
   - FAIL if floor P0 > 0.
   - else FAIL if any judge verdict is FAIL or INSUFFICIENT EVIDENCE.
   - else PASS.
2. The orchestrator may override **only toward FAIL** (never toward PASS) and
   must record the measured reason.
3. Merge and de-duplicate all blocking findings into one prioritized backlog
   (P0 floor → P1 judge-blocking → P2 polish), each with state/width/theme,
   selector/region, measured value, and standard/clause.
4. Write `<out_dir>/decision.json`:
   ```json
   {
     "status": "PASS | FAIL",
     "runId": "...", "generatedAt": "...", "baseUrl": "...",
     "floor": { "P0": 0, "P1": 0, "P2": 0 },
     "judge_verdicts": { "a11y": "...", "ia": "...", "visual": "..." },
     "blocking": [ { "severity": "P0", "check": "F1", "state": "...", "width": 320, "selector": "...", "measured": {}, "standard": "WCAG 1.4.10", "message": "..." } ],
     "backlog": [ ... ],
     "iteration": 1
   }
   ```
5. If the run started the dev server, stop it.
6. Report the verdict and the top blocking items to the user/caller.
7. **New Requirement:** Ensure the `decision.json` includes a field `evidence_gaps_resolved: boolean` set to true only if all evidence gaps identified in Stage 2 were resolved via re-run of Stage 1 before synthesis.

### Completion Criteria
- `decision.json` written with status, floor counts, all three judge verdicts,
  and a prioritized blocking backlog.
- Dev server stopped if the run started it.

## iteration

### Instructions
1. On FAIL, the implementer fixes the backlog (separate from the judges), then
   re-runs this gate from Stage 1.
2. Cap at `max_iterations` fix→gate cycles. If the SAME disqualifying finding
   survives 3 consecutive iterations, mark it BLOCKED and escalate to the user
   rather than churning.
3. Never bypass the gate because the user is away: a push/merge is authorized
   only on a PASS.
4. Keep every iteration's `decision.json` (suffix with the iteration number) so
   progress is auditable.
5. **New Requirement:** If escalation occurs due to the 3-strike rule, append a timestamped log entry to `<out_dir>/escalation-log.md` detailing the finding, iteration count, and recommended next steps for the user.

### Completion Criteria
- Iteration cap + 3-strike circuit breaker enforced; escalation path defined;
  per-iteration decision records retained.

## scope

### Instructions
1. In scope: edits to components, routes/layouts, CSS/tokens, navigation/IA,
   responsive rules, copy that changes labels/affordances — anything that alters
   the operator-visible rendered UI.
2. Out of scope: server-only logic with no visual effect, CI/build config, docs
   that do not render in the UI, tests.
3. **New Requirement:** Changes to authentication flows (login/logout screens) are explicitly IN SCOPE and require full audit coverage including password field visibility and error message contrast.

### Completion Criteria
- Inclusion/exclusion criteria for triggering the gate are explicit.
