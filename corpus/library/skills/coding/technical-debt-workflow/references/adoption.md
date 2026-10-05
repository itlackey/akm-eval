# Technical Debt Refactoring Pack

A reusable, evidence-first workflow for assessing and reducing technical debt
without silently changing observable behavior.

The pack is intentionally dependency-free. Its fail-closed deterministic
tooling requires Linux with `/proc`, Python 3.11 or newer, and Bash. Git is
optional for content assessment and required for branch lineage, worktree
isolation, and the included pilot integration check.

## Quick Start

1. Run tooling from the stash root and always pass `--root <repository-root>`
   for a target repository; omitting `--root` assesses the stash itself.
2. Adapt `knowledge/coding/technical-debt/refactoring-policy.md` to the target's
   real boundaries, public contracts, generated paths, and verification
   commands.
3. Configure target checks in
   `config/technical-debt-workflow/refactoring.toml`, the same root-relative
   location used by the stash.
4. Run
   `scripts/skills/coding/technical-debt-workflow/refactoring/baseline --root <repository-root>`
   before code changes.
5. Invoke `skills/coding/technical-debt-workflow` with the target scope.
6. Approve one bounded slice before running
   `skills/coding/refactoring-executor`.
7. Run
   `scripts/skills/coding/technical-debt-workflow/refactoring/verify --root <repository-root>`
   and
   `scripts/skills/coding/technical-debt-workflow/refactoring/report --root <repository-root>`
   before review.

The baseline and verification commands write ignored evidence to
`.refactoring/`. A failed or skipped required check remains visible in the
report and cannot be represented as passing.

CI uses
`scripts/skills/coding/technical-debt-workflow/refactoring/verify --current-only`:
it runs the identical check matrix but explicitly makes no baseline or
regression claim. Local slice verification requires a valid comparable baseline
before it can pass.

## Layout

- `knowledge/coding/technical-debt/`: canonical policy and reviewed reports
- `skills/coding/`: portable Agent Skills
- `agents/coding/technical-debt/`: AKM orchestration agent
- `commands/coding/technical-debt/`: AKM command entry points
- `workflows/coding/technical-debt-lifecycle.md`: AKM lifecycle workflow
- `scripts/skills/coding/technical-debt-workflow/`: deterministic tooling,
  tests, and evaluations
- `config/technical-debt-workflow/refactoring.toml`: stash verification matrix

## Cross-Agent Entry Points

- Codex and compatible agents:
  `skills/coding/technical-debt-workflow/assets/client-entrypoints/AGENTS.md`
- Claude Code:
  `skills/coding/technical-debt-workflow/assets/client-entrypoints/CLAUDE.md`
- GitHub Copilot:
  `skills/coding/technical-debt-workflow/assets/client-entrypoints/copilot-instructions.md`
- Cursor:
  `skills/coding/technical-debt-workflow/assets/client-entrypoints/refactoring-policy.mdc`
- GitHub Actions:
  `skills/coding/technical-debt-workflow/assets/client-entrypoints/refactoring.yml`

Each entry point delegates to the canonical policy. The skill folders remain
the single source of truth; do not copy their full bodies into client-specific
configuration.

## Target Repository Locations

When installing into a target repository, copy the adapted assets to the
locations each agent actually reads, then update every copied entry point so
its policy reference points at the target's canonical policy path:

- Canonical policy: `docs/agents/refactoring-policy.md`
- `AGENTS.md` and `CLAUDE.md`: repository root
- GitHub Copilot: `.github/copilot-instructions.md`
- Cursor: `.cursor/rules/refactoring-policy.mdc`
- CI workflow: `.github/workflows/refactoring.yml`
- Verification wrappers: `scripts/refactoring/baseline`, `verify`, and `report`
- Reviewed inventory and roadmap: `docs/technical-debt/inventory.md` and
  `docs/technical-debt/roadmap.md`

The policy stays the single source of truth; entry points remain thin
bootstrap files at every destination.

## AKM

AKM recognizes the conventional `skills/`, `agents/`, `commands/`,
`workflows/`, and `scripts/` directories. Skills use strict Agent Skills
frontmatter; AKM-specific information is stored as strings under `metadata` so
the same files remain portable.

Example lookup and invocation from the stash root:

```sh
akm search "technical debt assessment" --type skill
akm show skills/coding/technical-debt-workflow
scripts/skills/coding/technical-debt-workflow/refactoring/baseline --root /path/to/target
```

The native stash owns the top-level `updated` field used by AKM. The matching
`metadata.akm-updated` string is retained for clients that consume the portable
metadata map.

## Initial Invocation

```text
Use skills/coding/technical-debt-workflow.

Begin with a read-only repository assessment. Do not edit code yet. Establish
the current verification baseline, identify architectural boundaries,
inventory technical debt with file-level evidence, rank the findings, and
propose the smallest high-value pilot refactor.

For each recommendation, state the expected benefit, affected files,
regression risk, required tests, verification commands, and stop conditions.
Wait for approval before executing any high-risk or behavior-changing work.
```

## Adoption Gate

Do not run a refactor in a target repository until all placeholder assumptions
in its policy have been replaced with observed facts. If commands, public
contracts, generated paths, or ownership boundaries remain unknown, assessment
may continue read-only but execution must stop.
