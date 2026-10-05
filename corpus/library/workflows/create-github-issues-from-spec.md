---
type: workflow
description: Parse a feature spec (file or inline text) into a structured
  hierarchy of GitHub issues — epics, stories, and tasks — formatted for
  immediate use with the github-issues-parallel-implementer workflow.
tags:
  - github
  - issues
  - planning
  - spec
  - multi-agent
params:
  repo:
    type: string
    description: Target repository in owner/name form (for example, <owner>/<repo>). Required.
  spec:
    type: string
    description: Inline text describing features or tasks to implement. Provide this or spec_file, not both.
  spec_file:
    type: string
    description: Path to a file containing the feature/task specification. Provide this or spec, not both.
  milestone:
    type: string
    description: Optional milestone name or number to attach to every created issue. Created if absent.
  base_labels:
    type: array
    description: Label names to apply to every issue in addition to type/area labels.
    items:
      type: string
    default: []
  dry_run:
    type: boolean
    description: Print issue payloads without calling gh issue create.
    default: false
  max_parallel:
    type: integer
    description: Maximum issues the downstream parallel implementer may run concurrently.
    default: 3
steps:
  - id: validate-inputs
  - id: bootstrap-labels
  - id: analyze-spec
  - id: create-issues
  - id: emit-summary
updated: 2026-05-11
when_to_use: Use this workflow when you have a feature spec as inline text or a
  file and need epics, stories, and tasks created in GitHub for immediate
  implementation hand-off.
---

# Workflow: Create GitHub Issues from Spec

Parse a natural-language or structured specification into a hierarchy of GitHub issues (epics → stories → tasks), create them via the `gh` CLI, wire up parent/child relationships, and emit the issue-number array that `github-issues-parallel-implementer` expects as its `issues` parameter.

## validate-inputs

Validate Inputs

### Instructions

Resolve and validate every parameter before touching the repository or spec.

1. **Resolve spec source** — exactly one of `spec` or `spec_file` must be provided.
   - If `spec_file` is given, confirm the file exists and is readable (`cat "{{ spec_file }}" | head -5` to spot-check). Read the full contents into memory and treat it as the raw spec text for all downstream steps.
   - If `spec` is given, use that string directly as the raw spec text.
   - If neither is provided, or both are provided, abort with a `blocked` state and a clear error message.

2. **Confirm `repo` is reachable** — run `gh repo view {{ repo }} --json name,defaultBranchRef` and verify the output parses correctly. If the CLI is unauthenticated or the repo is not found, surface the error verbatim and block the run.

3. **Resolve or create `milestone`** (if provided).
   - List existing milestones: `gh api repos/{{ repo }}/milestones | jq -r '.[].title'`.
   - Resolve a milestone name to its number: `gh api repos/{{ repo }}/milestones | jq -r '.[] | select(.title == "{{ milestone }}") | .number'`.
   - If a matching milestone exists, record its number.
   - If it does not exist and `dry_run` is `false`, create it and capture the number:
     ```sh
     MILESTONE_NUM=$(gh api repos/{{ repo }}/milestones | jq -r '.[] | select(.title == "{{ milestone }}") | .number')
     if [ -z "$MILESTONE_NUM" ]; then
       MILESTONE_NUM=$(gh api repos/{{ repo }}/milestones -f title="{{ milestone }}" | jq '.number')
     fi
     ```
   - If `dry_run` is `true`, skip creation and note that the milestone would be created.

4. **Validate `base_labels`** — parse as a JSON array (default `[]`). For each label, confirm it exists on the repo via `gh label list --repo {{ repo }} --search <name>`. Record any missing labels — they will be created in the next step.

5. **Check required tools** — confirm `gh` and `jq` are available: `which gh && which jq`.

6. **Record resolved values** in run notes: spec source, spec length in characters/lines, repo, milestone number (if any), base labels, dry_run mode, max_parallel.

### Completion Criteria
- Exactly one spec source is resolved and its content is available.
- `repo` passes a live `gh repo view` check.
- Milestone is resolved to a number or confirmed as a planned creation.
- Required tools are present.
- All resolved parameters are recorded in run notes.

## bootstrap-labels

Bootstrap Labels

### Instructions

Ensure every label this workflow will use exists on the target repository. Never fail the run because a label is missing — create it if necessary.

#### Standard label taxonomy

Create the following labels if they do not already exist on the repo. Use the `gh label create` command:

```sh
gh label create "<name>" --repo {{ repo }} --color "<hex>" --description "<desc>"
```

**Type labels** (classify what kind of work the issue represents):
| Label | Hex color | Description |
|---|---|---|
| `type:epic` | `#7057ff` | Large feature spanning multiple stories |
| `type:story` | `#0075ca` | User-facing feature or user story |
| `type:task` | `#e4e669` | Implementation sub-task |
| `type:bug` | `#d73a4a` | Something is broken |
| `type:docs` | `#0075ca` | Documentation only |
| `type:refactor` | `#cfd3d7` | Code improvement without behaviour change |
| `type:infra` | `#e99695` | CI, tooling, infrastructure |

**Status labels** (used by the parallel implementer to track state):
| Label | Hex color | Description |
|---|---|---|
| `status:ready` | `#0e8a16` | Ready for implementation |
| `status:blocked` | `#b60205` | Blocked by a dependency |
| `status:in-progress` | `#fbca04` | Currently being implemented |

**Risk labels** (used by the parallel implementer's reviewer and PR tagging):
| Label | Hex color | Description |
|---|---|---|
| `risk:low` | `#c2e0c6` | Minimal blast radius |
| `risk:medium` | `#fef2c0` | Moderate blast radius |
| `risk:high` | `#f9d0c4` | High blast radius or security-sensitive |

For each label in `base_labels` that was flagged as missing in the validate-inputs step, create it now with a neutral color (`#cccccc`) and an empty description.

If `dry_run` is `true`, print the label creation commands that would run but do not execute them.

### Completion Criteria
- All type, status, and risk labels are confirmed present on the repo (or printed as dry-run commands).
- All missing `base_labels` entries are created (or queued as dry-run commands).
- A list of all confirmed labels is recorded in run notes.

## analyze-spec

Analyze Spec and Identify Issues

### Instructions

Dispatch a **spec analyst agent** to decompose the raw spec text into a structured hierarchy of work items. This step is purely analytical — no GitHub API calls, no code changes.

#### Analyst instructions

Give the analyst agent the full raw spec text and ask it to produce a JSON document (`spec-plan.json`) with the following schema:

```jsonc
{
  "epics": [
    {
      "id": "E1",                          // internal ref, e.g. E1, E2
      "title": "Short epic title",
      "summary": "One-paragraph description of the epic's goal",
      "acceptance_criteria": [             // testable, specific criteria
        "AC1: ...",
        "AC2: ..."
      ],
      "labels": ["type:epic", "area:..."], // area label inferred from content
      "risk": "low|medium|high",
      "stories": ["S1", "S2"]             // refs to child stories
    }
  ],
  "stories": [
    {
      "id": "S1",
      "parent_epic": "E1",               // or null if standalone
      "title": "Short story title",
      "summary": "What the user can do when this story is done",
      "acceptance_criteria": [
        "AC1: ...",
        "AC2: ..."
      ],
      "technical_notes": "Implementation hints, files likely touched, patterns to follow",
      "labels": ["type:story", "area:..."],
      "risk": "low|medium|high",
      "depends_on": ["S0"],              // story IDs that must land first
      "tasks": ["T1", "T2"]             // refs to child tasks
    }
  ],
  "tasks": [
    {
      "id": "T1",
      "parent_story": "S1",
      "title": "Short imperative task title",
      "summary": "Concrete implementation step",
      "acceptance_criteria": [
        "AC1: ..."
      ],
      "technical_notes": "Specific files, functions, or patterns to change",
      "labels": ["type:task", "area:..."],
      "risk": "low|medium|high",
      "depends_on": ["T0"]              // task IDs that must land first
    }
  ]
}
```

#### Quality requirements the analyst must enforce

- Every acceptance criterion must be **testable** — it must describe a verifiable outcome, not a vague aspiration (e.g. "The CLI returns exit code 0 when X" is good; "It should feel responsive" is rejected).
- Issue titles must be **imperative, concise, and unique** (no two issues with the same title).
- Dependencies (`depends_on`) must form a **directed acyclic graph** — flag any cycles in the notes and resolve them by splitting or reordering before writing the JSON.
- Every issue must have at least one area label inferred from the spec content (e.g. `area:cli`, `area:api`, `area:docs`, `area:auth`, `area:data`, `area:ui`). Create new area labels as needed.
- The hierarchy must be **flat enough to implement** — epics describe goals, stories describe deliverable increments, tasks describe implementation units small enough for a single coding session.
- If the spec has no natural epic structure (e.g. it is a flat list of tasks), create a single synthetic epic titled after the spec's primary goal and attach all stories to it.

#### Plan reviewer validation

After the analyst writes `spec-plan.json`, spawn an independent **plan reviewer agent** with only the raw spec text and the JSON. Ask it to verify:
- Every acceptance criterion is genuinely testable.
- No two issue IDs collide.
- Every `depends_on` reference points to a valid ID in the plan.
- The hierarchy accurately reflects the spec — no work item dropped, no scope invented.

Iterate at most two rounds. If the agents cannot converge, escalate to the user with a diff of the disagreement.

Write the final `spec-plan.json` to `.akm-run/{{ runId }}/spec-plan.json`.

### Completion Criteria
- `spec-plan.json` exists at `.akm-run/{{ runId }}/spec-plan.json`.
- Every item has a unique ID, a title, a summary, at least one acceptance criterion, and at least one label.
- No dependency cycles remain.
- The plan has been independently reviewed and signed off.
- Item counts (epics, stories, tasks) are recorded in run notes.

## create-issues

Create Issues on GitHub

### Instructions

Walk the `spec-plan.json` hierarchy and create one GitHub issue per item. Create **epics first**, then **stories**, then **tasks** — this order ensures parent issue numbers are available for cross-references before children are created.

If `dry_run` is `true`, print the `gh issue create` commands that would run with their full `--body` payloads but do not execute them. Record the dry-run output to `.akm-run/{{ runId }}/dry-run-issues.md` and skip the remaining sub-steps.

#### Issue body template

Every issue body must follow this structure so the parallel implementer's planner agent can parse it consistently. Use bold section headers (not markdown `##` headings) so the body is readable but does not conflict with GitHub's rendering or downstream parsers:

    **Summary**
    
    {{ summary }}
    
    **Acceptance Criteria**
    
    - [ ] AC1: ...
    - [ ] AC2: ...
    
    **Technical Notes**
    
    {{ technical_notes (or "N/A" for epics) }}
    
    **Relationships**
    
    Parent: #<parent_issue_number> (or "None" for top-level epics)
    Depends on: #<issue_number>, ... (or "None")
    Child issues: _to be updated after all issues are created_
    
    **Risk**: {{ risk }}
    
    **Labels**: {{ comma-separated label list }}

#### Creation procedure

For each **epic** in `spec-plan.json`:
1. Build the issue body from the template above (parent = None, depends_on = None).
2. Collect labels: the epic's `labels` array + `status:ready` + `base_labels`.
3. Run:
   ```sh
   gh issue create \
     --repo {{ repo }} \
     --title "<title>" \
     --body "<body>" \
     --label "<label1>,<label2>,..." \
     {{ if milestone }}--milestone "{{ milestone }}"{{ 
   ```

For each **story** in `spec-plan.json`:
1. Build the issue body from the template above.
2. Resolve parent epic reference to its GitHub number (e.g., `E1` → `#EPIC_NUMBER`).
3. Collect labels: story's `labels` array + `status:ready` + `base_labels`.
4. Run:
   ```sh
   gh issue create \
     --repo {{ repo }} \
     --title "<title>" \
     --body "<body>" \
     --label "<label1>,<label2>,..." \
     --milestone "{{ milestone }}" \
     --assignee "{{ assignee }}" \
   ```

For each **task** in `spec-plan.json`:
1. Build the issue body from the template above.
2. Resolve parent story reference to its GitHub number (e.g., `S1` → `#STORY_NUMBER`).
3. Collect labels: task's `labels` array + `status:ready` + `base_labels`.
4. Run:
   ```sh
   gh issue create \
     --repo {{ repo }} \
     --title "<title>" \
     --body "<body>" \
     --label "<label1>,<label2>,..." \
     --milestone "{{ milestone }}" \
   ```

#### Handling Dependencies

If a story or task has `depends_on` entries:
1. Resolve the dependency IDs to their GitHub numbers.
2. Add a comment to the issue body listing dependencies:
   ```markdown
   **Dependencies**
   - #<DEP_NUMBER>: <title>
   ```
3. If a dependency is missing (issue not yet created), add a `status:blocked` label and update the body to reflect the blocker.

### Completion Criteria
- All epics, stories, and tasks are created in GitHub with correct titles, bodies, labels, and milestones.
- Parent/child relationships are documented in issue bodies.
- Dependencies are noted in issue bodies or blocked appropriately.
- Issue numbers for all items are recorded in `.akm-run/{{ runId }}/issue-numbers.json`.

## emit-summary

Emit Hand-off Summary

### Instructions

Generate a summary file that the `github-issues-parallel-implementer` workflow can consume. This file must contain:
1. A list of all issue numbers in order (epics, stories, tasks).
2. The mapping of internal IDs to GitHub issue numbers.
3. The maximum parallelism allowed (`max_parallel`).
4. Any warnings or notes about blocked items.

#### Output format

Write the summary to `.akm-run/{{ runId }}/handoff-summary.json`:

```jsonc
{
  "issues": [
    {"id": "E1", "number": 101, "type": "epic"},
    {"id": "S1", "number": 102, "type": "story", "parent": "E1"},
    {"id": "T1", "number": 103, "type": "task", "parent": "S1"}
  ],
  "max_parallel": 3,
  "warnings": [
    "Issue T2 depends on T1 which is blocked by missing dependency X"
  ]
}
```

If `dry_run` was true, write the same structure to `.akm-run/{{ runId }}/dry-run-summary.json`.

### Completion Criteria
- Hand-off summary file exists at `.akm-run/{{ runId }}/handoff-summary.json`.
- All issue numbers are correctly mapped.
- Warnings about blocked items are included.

#### When to use

Use this workflow when you have a feature spec as inline text or a file and need epics, stories, and tasks created in GitHub for immediate implementation hand-off. It is particularly useful when:
- You have a large specification document that needs to be broken down into actionable items.
- You need to ensure consistent labeling and milestone assignment across all issues.
- You want to establish parent/child relationships before starting implementation.

#### Params

| Param | Description |
|---|---|
| `repo` | Target repository in `owner/name` form (e.g. `<owner>/<repo>`). Required. |
| `spec` | Inline text describing features or tasks to implement. Provide this OR `spec_file`, not both. |
| `spec_file` | Path to a file containing the feature/task specification. Provide this OR `spec`, not both. |
| `milestone` | Optional milestone name or number to attach to every created issue (e.g. `v1.2.0` or `42`). If the milestone does not exist it will be created. |
| `base_labels` | JSON array of label names to apply to every issue in addition to type/area labels (e.g. `["auto-generated", "needs-review"]`). Defaults to `[]`. |
| `dry_run` | When `true`, print the issue payloads that would be created but do not call `gh issue create`. Useful for reviewing the plan before committing. Defaults to `false`. |
| `max_parallel` | Maximum issues the downstream parallel implementer may run concurrently. Passed through to the hand-off summary. Defaults to `3`. |

#### Tags
- github
- issues
- planning
- spec
- multi-agent
