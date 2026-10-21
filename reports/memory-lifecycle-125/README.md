# Memory lifecycle coverage (akm-eval #125)

Manual, opt-in checks; not run in CI. Tracks
[akm-eval #125](https://github.com/itlackey/akm-eval/issues/125).

## What the tests cover

`evals/nightly/src/memory-lifecycle.test.ts` drives a real akm CLI through the
public commands against the existing loopback stub model, in isolated
HOME/XDG/akm directories. It checks that defined claims, evidence and scopes
survive the lifecycle. It does not measure model quality.

- Session extraction, acceptance, indexing, show, search and improve, with the claim, evidence and session identity checked at each step (#1196).
- Long notes: the complete note reaches the consolidation judge, duplicates are archived and can be reverted, and a distinct tail prevents unattended retirement (#1195).
- Different-user notes stay separate, same-scope notes still consolidate (#1197).
- Search and curate with current and historical (belief) controls (#1199).
- 121 ineligible neighbours cannot starve an eligible result, with keyword and deterministic-hybrid search (#1198).
- A failed judgment and a stale acceptance leave content unchanged.
- An interrupted acceptance resumes through `proposal accept` without a second archive, and `proposal revert` restores the content.
- One self-test (runs without akm) that the evidence assertions reject missing or corrupted content.

## How to run

```sh
AKM_EVAL_REAL_AKM=1 AKM_BIN='bun /path/to/akm/dist/cli.js' \
  bun test evals/nightly/src/memory-lifecycle.test.ts --timeout=120000
```

Without `AKM_EVAL_REAL_AKM=1` the 11 real-akm tests are skipped; only the self-test runs. Raw commands, model requests and sandbox files go to the gitignored `evals/nightly/results/memory-lifecycle-<timestamp>/`.

## Result

akm built from `release/0.10.0` at `d2369845a` (`0.10.261008`), which includes the #1195, #1196, #1197, #1198 and #1199 fixes. All 12 tests pass.

| Test | Result | akm issue |
|---|---|---|
| Assertions reject missing/corrupted evidence (self-test) | pass | |
| Session evidence survives extraction, acceptance, indexing, show, search, improve | pass | #1196 |
| Complete long duplicate retires, archives, recovers | pass | #1195 |
| Distinct tail prevents unattended retirement | pass | #1195 |
| Different scopes stay separate | pass | #1197 |
| Same scope consolidates | pass | #1197 |
| Search: current correction and historical evidence | pass | #1199 |
| Curate: current correction and historical evidence | pass | #1199 |
| Ineligible neighbours cannot starve Alice (keyword) | pass | #1198 |
| Ineligible neighbours cannot starve Alice (hybrid) | pass | #1198 |
| Failed judgment and stale acceptance preserve content | pass | #1195 / #1197 |
| Interrupted acceptance resumes without a second archive | pass | |

Contract smoke (`scripts/smoke/run --contract --only retrieval,extract,consolidate,nightly`) against the same build: 4 of 4 reach their outcomes.

The #1196 test checks the claim, evidence and session identity in the pending payload, accepted Markdown, indexed document, `show` output and the note after improve. It does not require them in the consolidation judge's requests: akm deliberately sends the judge the body without frontmatter.

## Scope

The tests are manual and opt-in. No CI workflow sets `AKM_EVAL_REAL_AKM`. They are scripted-stub path checks; they say nothing about real-model extraction or consolidation quality.
