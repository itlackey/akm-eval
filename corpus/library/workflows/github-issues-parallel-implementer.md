---
type: workflow
description: Drive a batch of GitHub issues to merged PRs using a multi-agent
  development, review, and testing loop on isolated git worktrees.
tags:
  - example
  - github
  - multi-agent
  - parallel
  - worktrees
params:
  repo: { type: string, description: "Target repository in owner/name form (e.g. <owner>/<repo>)." }
  issues: { type: array, items: { type: integer, minimum: 1 }, minItems: 1, description: "GitHub issue numbers to implement. The workflow orders and batches them." }
  base_branch: { type: string, description: "Branch to cut feature branches from and ultimately open PRs against.", default: main }
  integration_branch: { type: string, description: "Optional long-lived branch name used when multiple issues must be delivered together." }
  max_parallel: { type: integer, minimum: 1, description: "Maximum number of issues the implement step may run in parallel.", default: 3 }
  reviewers: { type: array, items: { type: string }, description: "Reviewer agent roles required to approve each issue." }
  required_checks: { type: array, items: { type: string }, description: "Required status checks that must pass before an issue is complete." }
  env: { type: string, description: "Optional akm env ref with credentials needed for CI, deploy previews, or private package registries (for example, env/github)." }
steps:
  - id: intake
  - id: plan-and-order
  - id: prepare-worktrees
  - id: implement-review-test
  - id: integration-and-pr
  - id: cleanup-and-reporting
updated: 2026-05-11
when_to_use: Use this when you have a list of specific GitHub issues that need
  to be implemented and want to execute them in parallel while maintaining
  isolation, dependency awareness, and rigorous review cycles.
---

# Workflow: GitHub Issues Parallel Implementer

## intake

### Instructions

You are the **orchestrator agent** for this run. Before doing any coding work, establish a clean baseline and confirm every parameter is actionable.

#### Verify parameters
1. Parse `issues` as JSON. Abort the run with `--state blocked` if it is not a non-empty array of positive integers.
2. Confirm `repo` is reachable via `gh repo view {{ repo }}`. If `env` was provided, run the command as `akm env run {{ env }} -- gh repo view {{ repo }}`. If the CLI is unauthenticated, surface the error verbatim and block the run — do not attempt to log in silently.
3. Resolve `base_branch` (default `main`) and confirm it exists on the remote with `git ls-remote --heads origin {{ base_branch }}`.
4. If `env` is provided, call `akm env list` and verify that the exact ref exists and declares every key the downstream tooling needs. `akm env list` reports key names only; never print values or read the raw env file. If the ref or a required key is missing, block the run and list only the missing key names. Run every credential-dependent downstream command through `akm env run {{ env }} -- <command>`.

#### Capture ground truth for every issue
For each issue number in `issues`:

- Fetch the full issue body, labels, assignees, and linked PRs via `gh issue view <n> --json number,title,body,labels,assignees,comments,closedByPullRequestsReferences`.
- Record the payload in the run notes so later steps can replay context without another API round-trip.
- Flag issues that are already `closed`, have a merged linked PR, or are marked `blocked` / `needs-triage`. These are removed from the working set and reported back to the user before planning.

#### Prepare a shared workspace
- Create a scratch directory under `.akm-run/{{ runId }}/` (outside of any existing worktree). Store issue payloads, plan artefacts, and per-issue logs here.
- Ensure the repo has no uncommitted changes on the current branch. If it does, abort with a `blocked` state — never stash or discard user work.
- Fetch the latest `base_branch` with `git fetch origin {{ base_branch }}` so subsequent worktrees branch from fresh commits.

#### Hand-off contract
The next step can assume:

- Every issue in the working set has a cached payload on disk.
- `base_branch` is up to date locally.
- Required secrets are declared (but not loaded into the agent context).

### Completion Criteria
- `issues` parsed to a non-empty list of open, actionable GitHub issues.
- `repo`, `base_branch`, and (if provided) `env` all pass their health checks.
- Working set, scratch directory, and cached issue payloads are recorded in the run notes.
- Any excluded issues are listed with the reason they were dropped.

## plan-and-order

### Instructions

Produce a dependency-aware execution plan. This step runs **exclusively in planning mode** — no code changes, no branches, no worktrees.

#### Dispatch the planner agent
Launch one planner agent with the cached issue payloads plus the current codebase index. Instruct it to:

1. Read each issue and classify it by **type** (bug, feature, refactor, docs, infra) and **blast radius** (single-file, module, cross-cutting).
2. Identify **hard dependencies** — issue B explicitly says "after #A", a shared schema change, a migration that must land first. Represent these as a directed acyclic graph. Abort with `blocked` if a cycle is found and surface the cycle in notes.
3. Identify **soft conflicts** — two issues that touch overlapping files, tests, or public APIs. These may still run in parallel but must be flagged so the integration step can merge in a deterministic order.
4. Produce an ordered list of **batches**. A batch is a set of issues with no hard dependency between members and no high-risk soft conflict. Batch size must not exceed `max_parallel`.
5. For each issue, draft a short **implementation brief**: acceptance criteria pulled from the issue body, files likely to change, test surfaces that must be exercised, and any risk callouts (perf, security, data migration).

#### Validate the plan with a second agent
Spawn an independent **plan reviewer agent** with no memory of the planner's reasoning. Give it only the issue payloads and the planner's output. Ask it to:

- Challenge every dependency edge — is it real, or could the issues run in parallel?
- Challenge every parallel grouping — is there a hidden conflict the planner missed (shared migrations, shared feature flags, shared API contracts)?
- Confirm each brief's acceptance criteria are testable. Reject vague criteria like "it should feel faster".

Iterate until the reviewer signs off or escalate to the user when the two agents cannot converge within three rounds.

#### Persist the plan
Write the final plan to `.akm-run/{{ runId }}/plan.json` with this shape:

- `batches`: ordered array; each batch is an array of issue numbers.
- `briefs`: map of issue number to `{ acceptance, files, tests, risks }`.
- `soft_conflicts`: list of `[issueA, issueB, reason]` tuples for the integration step.

Record the batch count, total issue count, and any escalations in the run notes so an interrupted run can resume from this artefact alone.

### Completion Criteria
- A plan.json artefact exists with batches, briefs, and soft-conflict annotations.
- The plan has been independently reviewed by a second agent and signed off.
- No dependency cycles remain; every dropped or re-ordered issue has a reason recorded.
- At least one testable acceptance criterion per issue.

## prepare-worktrees

### Instructions

Create one git worktree per issue in the current batch so implementation agents are fully isolated.

#### For every issue in the current batch
1. Derive a branch name from the issue: `agents/{{ runId }}/issue-<n>-<slug>` where `<slug>` is a kebab-cased, length-capped form of the issue title.
2. Create the worktree: `git worktree add .akm-run/{{ runId }}/wt/<n> -b <branch> origin/{{ base_branch }}`.
3. Seed the worktree with any run-scoped context files it needs (the brief, the acceptance criteria, the relevant test commands). Do not copy secrets.
4. Inside the worktree, run the project bootstrap: install dependencies, run a baseline build, and run the full test suite once. Record the baseline results (pass/fail counts, duration) so regressions introduced by the implementer are unambiguous.

#### Failure handling
- If bootstrap or the baseline test run fails on an untouched worktree, the issue is marked `blocked` with the failing output in notes. The workflow does not pretend a broken baseline is acceptable.
- If a worktree already exists from a previous run, reuse it only after running `git worktree prune` and confirming the branch head matches the expected commit. Otherwise remove and re-create it.

### Completion Criteria
- Every issue in the current batch has a dedicated worktree on a fresh branch from `base_branch`.
- A green baseline build and test run is recorded for each worktree.
- Any issue that failed bootstrap is explicitly marked `blocked` with a diagnostic excerpt.

## implement-review-test

### Instructions

For each issue in the current batch, drive a closed loop between **implementer**, **reviewer(s)**, and **tester** agents until the issue is either accepted or escalated. Issues in a batch run concurrently up to `max_parallel`; the loop itself is per-issue.

#### Roles
- **Implementer**: owns the code changes for one issue inside its worktree. May consult skills, run tooling, and inspect the codebase, but never bypasses tests or linters.
- **Reviewers**: one agent per role listed in `reviewers`. Each reviewer reads only the diff, the brief, and the test output — not the implementer's reasoning. Reviewers vote independently.
- **Tester**: runs the `required_checks` suite, reports raw results, and never fixes failures themselves. The tester is the source of truth for whether checks pass.
- **Loop captain**: a lightweight orchestrator agent that routes between the above, tracks iteration count, and enforces termination.

#### Iteration protocol
Each round proceeds in this order. Do not skip steps even when a round feels trivial.

1. **Implement**: the implementer applies focused changes mapped to the brief's acceptance criteria. Diffs must stay on-topic — drive-by refactors are rejected by the reviewer unless the brief asks for them.
2. **Self-check**: the implementer runs lint, typecheck, and the fast test subset locally before requesting review. If any fail, iterate before handing off.
3. **Test**: the tester runs every command in `required_checks`, captures the full output to `.akm-run/{{ runId }}/logs/<n>/round-<k>.log`, and returns a structured pass/fail map. Flaky tests are re-run once and annotated.
4. **Review**: each reviewer agent renders an independent verdict of `approve`, `request_changes`, or `block`. Reviewers cite file paths and line numbers. Reviews are posted as structured comments on the worktree branch for auditability.
5. **Adjudicate**: the loop captain merges the verdicts. The round passes only when **all** reviewers approve **and** every required check is green. Any `block` verdict halts the loop and escalates.
6. **Next round**: if the round did not pass, the implementer receives the union of reviewer comments plus tester failures, addresses them, and the cycle repeats.

#### Termination and escalation
- The loop has a hard ceiling of **eight rounds** per issue. On round nine the issue is marked `blocked` with the last round's artefacts and escalated to the user.
- If two consecutive rounds produce no diff reduction in reviewer comments, the loop captain must request human input — progress has stalled and more rounds will not help.
- If a reviewer posts `block` (as opposed to `request_changes`), the issue goes to `blocked` immediately; a `block` verdict means the approach itself is wrong and more iteration will not fix it.

#### Quality gates that must be enforced every round
- No test is skipped, `.only`-focused, or commented out to make the suite pass.
- Public API changes include updated type definitions and documentation in the same diff.
- Any new dependency requires an explicit note in the PR description explaining why an existing one did not suffice.
- Security-sensitive diffs (auth, crypto, shell invocation, SQL, deserialization) require the `security` reviewer to approve explicitly even when not listed by default.
- Performance-sensitive paths include a before/after measurement captured by the tester.

## integration-and-pr

### Instructions

Once all issues in a batch have passed their respective loops, merge them into the `integration_branch` (if specified) or prepare individual PRs against `base_branch`.

#### Merge Strategy
1. **If `integration_branch` is set**:
   - Create or update the `integration_branch` from `base_branch`.
   - Merge each issue's branch into `integration_branch` sequentially, respecting the order defined in `plan.json` to handle soft conflicts deterministically.
   - Resolve any merge conflicts manually if they arise, documenting the resolution in the commit message.
   - Run the full test suite on the `integration_branch` to ensure no cross-issue regressions occurred.

2. **If `integration_branch` is NOT set**:
   - For each issue, create a Pull Request from the issue's branch to `base_branch`.
   - Use `gh pr create` with a title and body generated from the issue brief and the final diff summary.
   - Assign the reviewers listed in the `reviewers` param to each PR.

#### PR Content Requirements
Each PR must include:
- A clear title linking to the issue number (e.g., `Fix #142: Resolve race condition in cache`).
- A body that includes:
  - The issue number and link.
  - A summary of changes based on the implementation brief.
  - A checklist of completed acceptance criteria.
  - Any relevant screenshots or logs for UI/performance changes.
  - A note on any soft conflicts resolved during integration.

#### Final Validation
- Ensure all required checks (`required_checks`) pass on the PR(s).
- Verify that the PR(s) are linked to the original GitHub issue(s).
- If using `integration_branch`, create a single PR from `integration_branch` to `base_branch` with a summary of all included issues.

### Completion Criteria
- All issues in the batch have associated PRs created and linked to their original issues.
- If `integration_branch` was used, it is merged into `base_branch` or has a PR ready for merge.
- All required checks are passing on the target branch(es).
- Run notes are updated with PR URLs and final status for each issue.

## cleanup-and-reporting

### Instructions

After successful integration, clean up the workspace and report results.

#### Cleanup
1. **Delete Worktrees**: Remove all worktrees created in `.akm-run/{{ runId }}/wt/` using `git worktree remove`.
2. **Delete Remote Branches**: Delete the remote feature branches for each issue unless they are needed for long-term maintenance (default: delete).
3. **Archive Run Data**: Move `.akm-run/{{ runId }}/` to an archive directory (e.g., `.akm-archive/`) to keep the workspace clean, preserving logs and artefacts for audit.

#### Reporting
- Generate a summary report including:
  - Total issues processed.
  - Issues successfully merged.
  - Issues blocked/escalated and reasons.
  - Total time taken.
  - Any soft conflicts encountered and how they were resolved.
- Post the summary to the relevant communication channel (e.g., Slack, email) if configured.
- Update the original GitHub issues with a comment linking to the merged PR(s) and marking them as complete.

### Completion Criteria
- All worktrees and remote branches are cleaned up.
- Run data is archived.
- A summary report is generated and distributed.
- All GitHub issues are updated with PR links and status.
- The workflow state is set to `completed`.
