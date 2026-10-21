# Which akm each eval runs on

Every eval that uses akm runs the `akm` command (from `--akm`, `AKM_BIN` or `PATH`) and reads the JSON it prints. Nightly and reflect also read `data/index.db` to resolve each planted file's indexed ref, using `entries(file_path, concept_id)`; promotion writes to `state.db`. The indexed-ref lookup was checked on 0.9.26 and 0.10.261003-beta and fails explicitly when a file has no unambiguous identity. Versions below a tested minimum produce a warning; the requested build still runs, and actual command/output failures remain visible. A bare version is a release the eval was checked against. No eval has a version ceiling. The flags of the shared driver (`--concurrency`, `--timeout-ms`) are run settings: they pace a run and change nothing an eval asks akm, so they change no compatibility. The exception is `--timeout-ms` in nightly and `consolidate --pool`, which pass it to `akm improve --timeout-ms` as akm's own budget.

| Eval | akm | Last run on |
|---|---|---|
| `evals/retrieval` | 0.9.26. Works on 0.9 and 0.10 (reads the projection flag from `search --help`) | 0.10.261003-beta: three full keyword repeats; library semantic run aborted on missing curate `searchMode`, which is fixed since: a curate that abstains, with no results and no `searchMode`, is an empty answer |
| `evals/judge-gate` | 0.9.25-alpha.2 or later | 0.10.261003-beta: three full real-model repeats, no errors |
| `evals/reflect` | 0.9.25-alpha.3 or later | 0.10.261003-beta on v0.4: three full real-model repeats; indexed-ref errors repaired, six AKM file-layout refusals each, 44/50 cases scored; bounded validation pilots pass. The six notes have since moved into their type's folder, where akm reflects on them |
| `evals/distill` | 0.9.26 and 0.9.31. The `lesson-update` class needs 0.10.0; an older akm scores 0 on it | 0.10.261003-beta: three full real-model repeats, no errors, including lesson updates |
| `evals/consolidate` | 0.9.26, the first release whose pair judge lists the claims each note holds alone | 0.10.261003-beta: three full real-model pair repeats, no errors, including crash recovery; default deterministic embedder |
| `evals/extract` | 0.9.26 or later | 0.10.261003-beta: three full real-model repeats, no errors, including two replacement runs after the crash |
| `evals/nightly` | 0.9.26 or later | 0.10.261003-beta on v0.4: three full 35-case real-model repeats, no collection errors or failed model calls; earlier setup failure repaired |
| `evals/promotion` | 0.9.26. It writes into akm's `state.db` and stops with a message when the table layout differs | 0.10.261003-beta on v0.4: three full 20-case real-model repeats, no errors |
| `evals/agent-ab` | akm-cli 0.10.261003-beta with the akm-opencode plugin 0.10.261002-beta (`PINS` in `lib/harbor/harbor.ts`), or what `--akm` names. CLI 0.9.26 selects its compatible plugin 0.9.26202610051302 | 0.10.261003-beta: one-task GPT-120 pilot, no errors; full run stopped after gateway HTTP 429 |
| `evals/bakeoff` | 0.9.26 or later | 0.10.261003-beta on v0.4: three full 15-case real-model repeats, no errors; all outputs valid, 12/15 cases pass each time |
| `benchmarks/longmemeval` | 0.9.26 | 0.10.261003-beta: full retrieval-only run, no errors; five-question GPT-120 pilot with one errored arm |
| `benchmarks/skillret` | 0.9.26 | 0.10.261003-beta: all 4,392 queries in keyword and semantic modes, no errors; both curate checks pass |
| `benchmarks/terminal-bench` | as agent-ab | 0.10.261003-beta, opencode 1.18.34, Harbor 0.24.0: one-task GPT-120 pilot, no errors |

The contract smoke (`scripts/smoke/run --contract`) has passed for retrieval, judge-gate, reflect, distill, consolidate, extract and nightly on 0.9.26, 0.9.30, 0.9.31 and 0.10.26101201-alpha, and for promotion on 0.9.26. The expanded nine-eval contract smoke, including bakeoff, passed on both 0.9.26 and 0.10.261003-beta; strict startup smoke also passed on the requested beta. It shows that an eval can reach and read a success on a release, not that its scores are right. The [2026-10-12–13 real runs](reports/0.10.261003-beta/README.md) record full coverage, pilot limits, and compatibility failures separately.

## When a new akm ships

1. Run `scripts/smoke/run --contract`, then `scripts/smoke/run --strict`, with `--akm` naming the new akm. A canned reply that was never used means akm sent a request the smoke was not written for.
2. Read akm's `STABILITY.md` and CHANGELOG. The evals rely on a few surfaces akm marks Experimental or Internal: the `improve.strategies.*` config, `AKM_EMBED_DETERMINISTIC`, `AKM_CLAUDE_PROJECTS_DIR`, the `entries` table of `index.db` for nightly and reflect, and the tables of `state.db` for promotion.
3. Reuse a compatible saved run of the old AKM, run the eval once on the new AKM with the same cases and model, then compare: `scripts/compare/run <old-results-folder> <new-results-folder>`. Repeat only when variability needs investigation.
4. Update this table.

`.github/workflows/akm-smoke.yml` runs the contract smoke every night on the release pinned in `lib/harbor/harbor.ts`, and the startup smoke with `--strict` on the latest release (advisory).

## Memory lifecycle integration

The [manual, opt-in lifecycle checks](evals/nightly/README.md#opt-in-memory-lifecycle-checks)
use `AKM_EVAL_REAL_AKM=1` and the exact command in `AKM_BIN`. They do not select
the Harbor pin, impose version equality, or skip unsupported opted-in builds. They
also read `entries(file_path, document_json)` from the real index and the public
proposal/archive output. See the [result summary](reports/memory-lifecycle-125/README.md)
for the akm build tested.
