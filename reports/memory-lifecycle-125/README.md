# Memory lifecycle coverage (akm-eval #125)

Status: draft. Opt-in checks; not run in CI. Tracks
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

akm built from `release/0.10.0` at `79cf3236a` (`0.10.261008`), with #1196 (`859b3cc90`), #1198 (`79cf3236a`), #1197 and #1195 merged. 10 of 12 tests pass.

| Test | Result | Open issue |
|---|---|---|
| Assertions reject missing/corrupted evidence (self-test) | pass | |
| Session evidence survives extraction, acceptance, indexing, show, search, improve | **fail**, last assertion only (see below) | #1196 |
| Complete long duplicate retires, archives, recovers | pass | |
| Distinct tail prevents unattended retirement | pass | |
| Different scopes stay separate | pass | |
| Same scope consolidates | pass | |
| Search: current correction and historical evidence | pass | |
| Curate: current correction and historical evidence | **fail**: `Unknown flag "--filter"` | #1199 (fix in progress) |
| Ineligible neighbours cannot starve Alice (keyword) | pass | |
| Ineligible neighbours cannot starve Alice (hybrid) | pass | |
| Failed judgment and stale acceptance preserve content | pass | |
| Interrupted acceptance resumes without a second archive | pass | |

Contract smoke (`scripts/smoke/run --contract --only retrieval,extract,consolidate,nightly`) against the same build: 4 of 4 reach their outcomes.

### The #1196 test still fails

Every content check passes: the pending payload, accepted Markdown, indexed document, `show` output and the note after improve all keep the claim, evidence and session identity. The test then fails on its final line, which requires the same evidence and session identity in the consolidation judge's pair and check requests. akm sends the judge only the description and the body with frontmatter stripped (`pair-pass.ts`, `stripFrontmatterBody`), where the evidence and session xref live. So this is not an evidence-loss regression; the assertion goes beyond what #1196 asks for. Whether the judge should see evidence is the owner's decision: either drop that line or keep it and change akm. Left unchanged here.

## Before this can be finalised

- The #1199 fix lands in akm; re-run against that build.
- Decide the #1196 judge-visibility assertion above.
- The owner decides whether to wire these opt-in tests into CI. No workflow sets `AKM_EVAL_REAL_AKM`.
- Real-model extract, consolidate and nightly pilots are separate from these scripted-stub checks.
