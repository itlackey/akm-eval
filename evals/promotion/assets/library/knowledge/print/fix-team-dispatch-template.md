---
title: Fix-Team Dispatch Template
description: Dispatch template for print-fix subagents that must edit owned
  files, verify with before/after evidence, and avoid summary-only or
  metadata-only false success.
when_to_use: Use this asset when dispatching a subagent to make a concrete
  print-layout, CSS, or markdown fix that must change files and prove the
  result.
tags:
  - print
  - paged
  - dispatch
  - fix-team
  - prompt-template
  - validator
  - visual-review
  - tiering
  - orchestration
updated: 2026-09-15
refs:
  - knowledge/print/visual-review/designer-eye-method
---

# Fix-Team Dispatch Template

## What This Solves
Some fix agents treat a dispatch as a research brief: they read AKM references, summarize the issue, and return without editing files. This template makes execution the default by forcing:

- owned-file reads before edits
- measurable before/after verification
- a valid `BLOCKED` outcome when the planner scoped the cluster wrong
- visual confirmation for non-trivial fixes
- explicit separation of content fixes from metadata-only calibration

## Core Rules
Apply these rules before building any worker prompt:

- Put `HARD RULES` before any AKM references or background notes.
- If the workflow supports render-health checks, run that pre-flight before validator measurement. Clean validator output against a broken Paged.js render is not evidence.
- Stay inside `ownedFiles`. If the controlling rule is elsewhere, stop and report `BLOCKED`.
- Do not tune validators, thresholds, allowlists, or config to make a content fix look successful.
- Do not mask problems with `opacity:0`, `visibility:hidden`, `z-index` tricks, or `overflow:hidden` unless that exact masking behavior is the intended fix.
- For visual or styling issues, verify the project's design template files before editing. If the fix would deviate from the design guide, escalate instead of improvising.
- For T2 and T3 work, `PASS` requires all three of these conditions:
  - the team explicitly reports `PASS`
  - at least one owned file changed during the dispatch window
  - the visual spot-check is `OK` or `MINOR` and not worse than baseline

## Tier Selection
Use the smallest tier that can honestly prove the fix.

### T1: Direct Edit
Use for a one-file fix of at most 5 lines with no meaningful cascade or regression risk.

Typical cases:
- allowlist or threshold extension in analyzer config
- single named-page directive
- single known-safe CSS property on an existing selector
- padding or divisibility adjustment with isolated scope

Rules:
- no team-style orchestration
- one verify run
- no iteration loop
- result is always `METADATA-ONLY` for wave-rollup claims

### T2: Limited Fix
Use for a small, low-risk fix that still needs proof.

Typical cases:
- single-file CSS change up to about 10 lines
- small markdown adjustment with visible layout effect
- mechanical identical edits across several files

Rules:
- include before/after verification
- include one visual spot-check
- maximum one attempt, then escalate to T3

### T3: Full Team
Use for multi-file changes, cascade fights, cross-validator regression risk, or uncertainty about the true controlling rule.

Typical cases:
- 3 or more files
- interacting CSS rules across shared and book layers
- Paged.js regressions or render fragility
- clusters with multiple root causes across affected pages

Rules:
- use the full stepwise prompt
- permit up to 3 attempts
- require visual spot-check and explicit evidence

### Escalation
Escalation is a correct outcome, not a failure.

- T1 to T2: validator did not move as expected, or any unrelated regression appeared
- T2 to T3: first attempt failed, owned files did not contain the real rule, or the fix interacted with shared/page-rule behavior

Decision rule:

> If the fix is at most 5 lines in one file and has no cross-validator regression risk, use T1 and do not dispatch a full team.

## Status Meanings
Use these statuses consistently:

- `PASS`: validator moved as required, evidence is present, and visual spot-check is `OK` or `MINOR`
- `METADATA-ONLY`: analyzer/config moved, but no reader-facing content improvement is proven
- `PARTIAL`: some movement happened, but pass criteria were not fully met
- `BLOCKED`: planner scoped the cluster to the wrong files or wrong root cause
- `FAIL`: validator did not improve enough, visual result regressed, or a new no-go issue appeared

T1 outcomes are `METADATA-ONLY` by definition for wave-rollup claims.

## Visual Gate For T2 And T3
Validator movement is necessary but not sufficient. Every T2 and T3 cluster must include a designer-eye spot-check using `knowledge/print/visual-review/designer-eye-method`.

Minimum spot-check:
1. Pick at least one page or spread from `affectedPages`.
2. Capture one post-fix screenshot.
3. Rate it `OK`, `MINOR`, `AWKWARD`, or `BROKEN` using designer language, not validator IDs.
4. Compare it to the pre-fix baseline as `better`, `same`, or `worse`.

Verdict rules:
- `PASS` requires `OK` or `MINOR` and `better` or `same-if-already-OK`
- `AWKWARD`, `BROKEN`, or no visual check means the cluster is not a layout-improvement pass

## Wave Rollup Disclosure
Every wave rollup must disclose what actually changed:

```
Wave N outcome: M clusters dispatched
  - X content fixes   (book CSS / markdown edited; visual spot-check confirmed)
  - Y metadata fixes  (analyzer config / allowlist / threshold tuned only)
  - Z no-ops          (team confirmed nothing to fix and returned)
  - W escalations     (T1->T2 / T2->T3)
  - V failed
```

If `X = 0`, the wave is `Calibration`, not `Layout improvement`.

## Dispatcher Checklist
Before dispatching any T2 or T3 worker, confirm:

- the correct tier
- the correct design template, if the issue is visual/styling
- the correct CSS layer or markdown file
- that `ownedFiles` contain the controlling rule or likely source of truth
- the verify command and target validators
- at least one affected page for visual review
- whether a render-health pre-flight is required

## Prompt Templates

### T1 Template
```
Edit <absolute-path-to-owned-file>

Change <key-or-selector>:
  from: <before-value>
  to:   <after-value>

Then run: <verify-command>

Pass = <validator-id> moves from <before-count> to <after-count>.
If anything else regresses, STOP and report.
Report:
- STATUS: METADATA-ONLY | BLOCKED | FAIL
- BEFORE: <count>
- AFTER: <count>
- FILE EDITED: <path>
- NOTE: <one-line explanation>
```

### T2 Template
```
You are fixing {{cluster_id}}.

HARD RULES:
- DO NOT summarize AKM references instead of editing files.
- Touch only these files: {{owned_files}}.
- If the controlling rule is not in those files, STOP and return BLOCKED.
- Do NOT mask the issue with opacity, z-index, or overflow tricks.
- Do NOT modify validator thresholds or allowlists to create a fake pass.

OPTIONAL REFERENCES:
{{akm_refs_if_any}}

VALIDATORS:
{{primary_validators}}

PASS CRITERIA:
{{pass_criteria}}
- One designer-eye spot-check from {{affected_pages}} is required.

VERIFY COMMAND:
{{verify_command}}

STEP 1 - MEASURE BEFORE
Run the verify command and capture baseline counts.

STEP 2 - READ OWNED FILES
Read every owned file end-to-end. Confirm the controlling rule is present.

STEP 3 - APPLY ONE SMALL FIX
Make the smallest correct edit.

STEP 4 - VERIFY ONCE
Re-run the verify command.
If the validator moved and nothing regressed, capture one screenshot and rate it OK / MINOR / AWKWARD / BROKEN.
If the validator did not move enough, or the visual result is worse, STOP and recommend T3.

STEP 5 - REPORT
Return:
- STATUS: PASS | METADATA-ONLY | BLOCKED | FAIL
- BEFORE: <counts>
- AFTER: <counts>
- FILES EDITED: <paths>
- VISUAL CHECK: <page/spread + verdict + better/same/worse>
- RECOMMENDATION: <none or escalate to T3>
```

### T3 Template
```
You are fixing {{cluster_id}} in {{project_name}}.

CONTEXT:
{{context_paragraph}}

HARD RULES:
- DO NOT just read AKM memories and return a summary. EDIT FILES.
- Touch only these files: {{owned_files}}.
- If the controlling rule is not in those files, STOP and return BLOCKED.
- Do NOT mask the issue with opacity, visibility, z-index, or overflow tricks.
- Do NOT modify validator code, thresholds, or allowlists to make the result look clean.
- Match the design guide unless the dispatch explicitly authorizes a design change.

OPTIONAL REFERENCES:
{{akm_refs_if_any}}

VALIDATORS:
{{primary_validators}}

PASS CRITERIA:
{{pass_criteria}}
- Designer-eye spot-check required from {{affected_pages}}.

VERIFY COMMAND:
{{verify_command}}

PUPPETEER PROFILE:
{{puppeteer_profile}}

STEP 0 - RENDER HEALTH PRE-FLIGHT
If the workflow has a render-health gate, run it first. If render health fails, stop and report that before validator work.

STEP 1 - MEASURE BEFORE
Run {{verify_command}}.
Capture exit code and baseline counts for {{primary_validators}}.

STEP 2 - READ OWNED FILES
Read each owned file end-to-end.
Locate the controlling selector, directive, or rule.
If it is not present, STOP and return BLOCKED.

STEP 3 - APPLY FIX
Edit the owned files only.
Use the smallest correct fix.
Preserve existing style and indentation.

STEP 4 - VERIFY AND ITERATE
Re-run {{verify_command}} after each attempt.
PASS requires validator improvement, no new no-go regressions, and a clean visual spot-check.
Maximum 3 attempts.
After attempt 3, stop guessing and return PARTIAL or BLOCKED with a precise diagnostic.

STEP 5 - VISUAL CHECK
Capture at least one screenshot from {{affected_pages}}.
Rate it OK / MINOR / AWKWARD / BROKEN using designer language.
Compare to baseline as better / same / worse.

STEP 6 - DISTILL
If a real new lesson emerged, run the cluster's AKM distill commands.
Do not persist noise.

STEP 7 - REPORT
Return:
- STATUS: PASS | PARTIAL | BLOCKED | FAIL
- BEFORE: <validator JSON excerpt>
- AFTER: <validator JSON excerpt>
- DROP: <per-validator change>
- FILES EDITED: <absolute path + one-line summary per file>
- ITERATIONS: 1 | 2 | 3
- VISUAL CHECK: <page/spread + verdict + better/same/worse>
- AKM PERSISTED: <refs or none>
- HONESTY NOTES: <anything that did not go to plan>
```

## Planner Field Mapping
When assembling worker prompts from cluster data, map these fields directly:

| Template placeholder | Cluster field |
|---|---|
| `{{cluster_id}}` | `id` |
| `{{owned_files}}` | `ownedFiles` |
| `{{primary_validators}}` | `primaryValidators` |
| `{{pass_criteria}}` | `testerPassCriteria` |
| `{{verify_command}}` | `analyzerVerifyCommand` |
| `{{puppeteer_profile}}` | `puppeteerProfile` |
| `{{affected_pages}}` | `affectedPages` |
| `{{akm_refs_if_any}}` | planner-rendered references block |

Recommended planner outputs:

- `dispatchTier`: `T1`, `T2`, or `T3`
- `workerPromptBoilerplate`: fully materialized prompt stored verbatim
- `visualSpotCheckPages`: one or more concrete pages/spreads to review
- `designTemplate`: the governing file among the project's design template files, when relevant

Persisting the final prompt in `workerPromptBoilerplate` makes review and replay easier than regenerating it later from prose.

## Project CSS Routing
Route each CSS fix to the stylesheet layer the project designates for that kind of change. Project-specific guardrails, including a project's CSS layer routing, come from the consumer's own `knowledge/print/project-guardrails`, if it provides one.

If the dispatch points at the wrong layer, fix the scope before sending the worker.
