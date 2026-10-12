# Which akm each eval runs on

Every eval that uses akm runs the `akm` command (from `--akm`, `AKM_BIN` or `PATH`) and reads the JSON it prints. "Or later" means the run stops on an older akm (`MIN_AKM` in the eval's source). A bare version is the release the eval was written for; nothing is checked. No eval has a ceiling.

| Eval | akm | Last run on |
|---|---|---|
| `evals/retrieval` | 0.9.26. Works on 0.9 and 0.10 (reads the projection flag from `search --help`) | 0.9.26 |
| `evals/judge-gate` | 0.9.25-alpha.2 or later | contract smoke only |
| `evals/reflect` | 0.9.25-alpha.3 or later | 0.9.26 |
| `evals/distill` | 0.9.26 and 0.9.31. The `lesson-update` class needs 0.10.0; an older akm scores 0 on it | contract smoke only (0.9.26, 0.9.31) |
| `evals/consolidate` | 0.9.26, the first release whose pair judge lists the claims each note holds alone | contract smoke only; pool timings on 0.9.30 |
| `evals/extract` | 0.9.26 or later | contract smoke only |
| `evals/nightly` | 0.9.26 or later | contract smoke only |
| `evals/promotion` | 0.9.26. It writes into akm's `state.db` and stops with a message when the table layout differs | 0.9.26 (2026-10-07) |
| `evals/agent-ab` | akm-cli 0.9.26 with the akm-opencode plugin 0.9.26202610051302 (`PINS` in `lib/harbor/harbor.ts`), or what `--akm` names | the current tasks have not been run |
| `evals/bakeoff` | 0.9.26 or later | a scripted model only |
| `benchmarks/longmemeval` | 0.9.26 | 0.9.26 |
| `benchmarks/skillret` | 0.9.26 | 0.9.26 (2026-10-06) |
| `benchmarks/terminal-bench` | as agent-ab | 0.9.26, opencode 1.18.34, Harbor 0.24.0 (2026-10-06) |

The contract smoke (`scripts/smoke/run --contract`) has passed for retrieval, judge-gate, reflect, distill, consolidate, extract and nightly on 0.9.26, 0.9.30, 0.9.31 and 0.10.26101201-alpha, and for promotion on 0.9.26. It shows that an eval can reach and read a success on a release, not that its scores are right. Nothing has been run with a real model on a release above 0.9.26.

## When a new akm ships

1. Run `scripts/smoke/run --contract`, then `scripts/smoke/run --strict`, with `--akm` naming the new akm. A canned reply that was never used means akm sent a request the smoke was not written for.
2. Read akm's `STABILITY.md` and CHANGELOG. The evals rely on a few surfaces akm marks Experimental or Internal: the `improve.strategies.*` config, `AKM_EMBED_DETERMINISTIC`, `AKM_CLAUDE_PROJECTS_DIR`, and, for `evals/promotion`, the tables of `state.db`.
3. Run each eval you track with `--repeat 3` on the old and the new akm, with the same model and config, and compare: `scripts/compare/run --repeats <old> --against <new> --treatment build`.
4. Update this table.

`.github/workflows/akm-smoke.yml` runs the contract smoke every night on the release pinned in `lib/harbor/harbor.ts`, and the startup smoke with `--strict` on the latest release (advisory).
