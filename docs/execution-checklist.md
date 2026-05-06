# Execution checklist

This checklist translates `docs/purpose.md` into a concrete implementation sequence without inventing benchmark results.

## Rules

- Do not publish fabricated benchmark scores.
- Do not use illustrative baseline-vs-AKM numbers in repo-facing documentation.
- Do not add public score tables until real artifacts are committed.
- Do not weaken the trust policy to make smoke tests or demos easier.

## Phase 1: Make current support explicit

- [x] Update the top-level README so it lists supported packs and current runner limitations.
- [x] Add a runner support matrix covering `opencode` and `openai-compatible` by pack.
- [x] Correct documentation so it does not imply `swe-bench` defaults to Verified while the current path still defaults to Lite.
- [x] Rewrite stale pack READMEs so they match actual implementation status.

## Phase 2: Harden the result contract

- [x] Expand `docs/result-schema.md` beyond the current placeholder text.
- [x] Document the normalized artifact set produced by shipped packs.
- [x] Document which fields are required for reference-quality results.
- [x] Document any pack-specific caveats that affect comparison or reproducibility.

## Phase 3: Prepare evidence publication surfaces

- [x] Create `runs/reference/` subdirectory conventions for shipped packs.
- [x] Define the metadata required in each reference result folder:
- [x] model identifier
- [x] runner type
- [x] config path or committed config
- [x] repo commit SHA
- [x] benchmark source/version/snapshot
- [x] run date

## Phase 4: Publish real evidence

- [x] Commit one real memory-pack reference run.
- [x] Commit one real `terminal-bench` reference run.
- [x] Commit one real `swe-bench` reference run.

## Phase 5: Add minimum automation

- [x] Add GitHub Actions to run `bun test` on every PR.
- [x] Add GitHub Actions to run `bun run check:boundary` on every PR.
- [x] Add one cheap scheduled smoke path.
- [x] Keep smoke automation separate from published benchmark evidence.

## Phase 6: Expand only after credibility exists

- [x] Choose exactly one expansion pack: `GAIA` or `τ-bench`.
- [x] Prefer whichever has the cleanest official harness path.
- [x] Publish real evidence for that pack before adding another one.

## Definition of ready for v1.0

`akm-eval` is ready to call v1.0 when all of the following are true:

- The shipped pack set is documented accurately.
- Runner support boundaries are documented accurately.
- The normalized result contract is documented beyond a placeholder.
- At least one real reference artifact exists for each shipped benchmark family represented in the repo-facing story.
- The README links to real artifacts and does not contain placeholder scores.
- CI enforces tests and trust-policy boundary checks.

Current status:

- All checklist items above are complete.
- Real reference artifacts now exist under `runs/reference/locomo/baseline`, `runs/reference/terminal-bench/baseline`, `runs/reference/swe-bench/baseline`, and `runs/reference/tau-bench/baseline`.

## Explicit non-checklist items

These are intentionally not required before the repo becomes credible:

- Example benchmark numbers
- Synthetic comparison tables
- Full containerization
- A dashboard or hosted leaderboard
- Multiple new packs in parallel
