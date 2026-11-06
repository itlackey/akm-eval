# akm 0.10.261110-beta, 35B, semantic, full: the baseline for akm#1453, akm#1454 and akm-eval#198

Every eval but LongMemEval, Terminal-Bench and memory-utility, run once with akm 0.10.261110-beta (npm `next`, published
2026-11-05), `fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public corpora, temperature 0 and
thinking off, one eval at a time, plus the two selection sets (`assets/selection`, `assets/selection-split`) with `--selection-flag
filter` and `prefer`. It is the same set, run the same way, as the [0.10.261105-beta round](../0.10.261105-beta/) (collected at
`bf07f14`); this round is collected at `958ea13` (akm-eval main after #197). All 13 summaries and the 4 selection summaries are
`complete`, record `akm_version` 0.10.261110-beta and `git_commit` `958ea13`, have no errored case, and the 10 model-driven ones
record `fast/qwen3.6-35b-a3b` (agent-ab `openai/fast/qwen3.6-35b-a3b`; agent-ab, like the retrieval evals, has no `config_form`).

The point of the round is to be the figure that later work is compared with: akm#1453 (select on any frontmatter key with
`--filter` and `--prefer`), akm#1454 (improve keeps the frontmatter it does not own; scope flags on `proposal extract` and
`proposal new`) and akm-eval#198 (`--prefer` in hybrid search and with curate's reranker). "Baseline for open work" below says
which figures each should compare with and gives the commands. Every model-driven figure is one run of a route that is not
deterministic: identical requests can return different text at temperature 0. One run per side is one observation, and no
single-case flip is chased.

## Look at these first

1. **Consolidate: one unsafe retirement, against none last round.** 38/40 safe retirements found (0.10.261105-beta: 39/40) and
   `unsafe` 1 of 80 (0). The case is `overlap-04`: the judge labelled the pair `subsumed` and proposed retiring
   `sedgemoor-oncall-rotation-notes` into `sedgemoor-oncall-rotation`, with the reason "B replaces A's holiday pay claim with a
   rotation frequency cap; all other claims are identical". Each note holds a claim the other lacks (the retired one's holiday
   pay rate, the successor's one-in-four cap), the proposal lists `onlyInRetired` as empty, and the eval scores it unsafe. The
   same case was the one unsafe retirement of the published 0.10.261022 run (35/40 with 0 unsafe on its re-run and 0 on the
   0.10.261105-beta run), so it has now appeared in 2 of 4 runs of this eval: it is the model's variation on one overlap
   pair as much as the build. The only consolidate-visible change in the five releases is that the pair judge is now called through
   the judge registry (0.10.261106), which is documented to send the same prompt; that was not isolated. The staged
   retirements are 22 of 22 safe; the other outcome move is `supersedes-11` (retired last round, kept now). `--pool` is
   identical in every outcome to last round: 17/19, 0 unsafe, 11 of 11 accepted retirements safe.
2. **Agent A/B: akm arm 8/18, control 0/18.** Last round 12/18 and 2/18, the stable round 8/18 and 1/18; 8 is the bottom of the 8 to
   13 of 18 range the akm arm has given. Difference +44.4 points (interval 16.7 to 77.8 over 6 tasks); the akm arm beat the
   control on 5 tasks and tied on 1 (sign test p = 0.0625). akm was called in 6 of 18 trials (curate 5, search 1, show 10 calls;
   last round 9 of 18): 5 of the 6 trials that called it passed, 3 of the 12 that did not. 36 of 36 trials were scored; 3 trials
   ended with a non-zero agent exit (control 2, akm 1) and are scored as run. This is the second attempt of this eval in the
   round (see Environment). One run.
3. **Judge-gate has a new baseline and no earlier column.** The harness now scores 188 revisions (91 good, 97 bad; #194 and the
   reflect-quality judge, `akm judge reflect.quality`, measurement 0.5) and refuses an akm without it. 85 of 91 good revisions
   passed (93.4%), 9 of 97 bad ones passed (4 of 64 harmful ones auto-accepted), precision 0.9043, review share 13.3% (25 of 188).
   The 0.10.261105-beta build was run once to record the refusal (exit 2: "this akm has no `akm judge reflect.quality`"), so the
   0.10.261105-beta column is the published run on the old 135-case set and does not compare.
4. **Retrieval and SkillRet: no change.** Books are identical to the 0.10.261105-beta re-run at this head on every search and
   curate metric and list (0 of 51). The library's metrics are identical (keyword 0.7668, semantic 0.8223); 2 of 136 semantic
   lists differ, both by a swap of two neighbouring refs inside the first six (`q002`, `q106`). SkillRet's aggregate is identical
   (keyword NDCG@10 50.49, semantic 57.79) and the top 15 is the same for all 4,392 queries on both. The ref, `wiki-source`
   and content-bound changes of 0.10.261107 and 0.10.261108 do not show here.
5. **Inside the spread of earlier rounds.** Reflect 37/40, controls 35/40 (33); distill good lessons 28/40 (29), lesson updates
   7/40 (7), 0/16 wrong; extract 34/40 (34); bakeoff 50/55 (49), session-summary still 8/8 and schema-repair 7/8 (6); promotion
   34 of 39 accepted good (35 of 40), same 5 bad accepted; nightly 31/35 with 0 harm (30/35, 1 harm). None is a change the CHANGELOG
   predicts, and the 0.10.261105 round already showed spreads of this size between two runs of the same build.
6. **The selection baselines are new** (table in "Baseline for open work"). On the 20-query hand-written set `--prefer`
   keeps the relevant assets that carry no key (non-match recall 0.94 against 0 for `--filter`) and the `unchanged` check is 1.0;
   on the split library set `--prefer` leaves the first full match at rank 3.0 against 1.4 for the hard filter, with non-match
   recall 0.73 (keyword) and 0.83 (semantic).

## Headline table

The first column is the published [0.10.261105-beta round](../0.10.261105-beta/). The second is `akm-cli@0.10.261105-beta` run
again at `958ea13`, where the table below says the harness change reaches the eval (retrieval only); a dash is an eval that was not
run again because the change is a tolerance or visibility change. The third is this round.

| eval | headline | 0.10.261105-beta as published | 0.10.261105-beta re-run at `958ea13` | 0.10.261110-beta |
|---|---|---:|---:|---:|
| reflect | correct fixes (controls) | 37/40 (33/40) | - | 37/40 (35/40) |
| distill | good lessons (wrong lessons) | 29/40 (0/16) | - | 28/40 (0/16) |
| distill | lesson updates right | 7/40 | - | 7/40 |
| extract | useful memories | 34/40 | - | 34/40 |
| judge-gate | good revisions passed (bad passed) | 15/40 (0/95), 135 cases | refused (exit 2) | 85/91 (9/97), 188 cases |
| bakeoff 0.5 | cases passed | 49/55 | - | 50/55 |
| bakeoff 0.5 | session-summary cases passed | 8/8 | - | 8/8 |
| consolidate | safe retirements found (unsafe) | 39/40 (0) | - | 38/40 (**1**) |
| consolidate `--pool` | safe retirements found (unsafe) | 17/19 (0) | - | 17/19 (0) |
| promotion | accepted proposals that were good | 35/40 | - | 34/39 |
| nightly | items handled right (harm) | 30/35 (1) | - | 31/35 (0) |
| retrieval, books | semantic / keyword nDCG@10 | 0.9103 / 0.8308 | 0.9103 / 0.8308 | 0.9103 / 0.8308 |
| retrieval, library | semantic / keyword nDCG@10 | 0.8245 / 0.7689 (qrels before #197) | 0.8223 / 0.7668 | 0.8223 / 0.7668 |
| skillret | keyword / semantic NDCG@10 | 50.49 / 57.79 | - | 50.49 / 57.79 |
| agent-ab | pass rate, akm / control | 12/18 / 2/18 | - | 8/18 / 0/18 |

Judge-gate's figure is good revisions passed over good revisions; the 0.10.261105-beta figure is on the old 135-case set
(40 good, 95 bad) and is the published run, not a like-for-like column. Promotion's is good accepted over all accepted. The
library's published 0.10.261105-beta figure was scored before the 50 team-intent pairs of #197 were graded, so the second column
re-runs the same build at this head: that is the library column to compare with. `model` is `fast/qwen3.6-35b-a3b` and `config_form`
is `connections` on every model-calling summary of this round.

## Move counts

Cases whose verdict changed between the published 0.10.261105-beta run and this round (the key is the one the eval's headline
reads: `correct`, `verdict` and `outcome`, `outcome`, `outcome` and `safe`, `ok`).

| eval (cases) | moved cases |
|---|---:|
| reflect (80) | 4 |
| distill (96), verdict / outcome | 17 / 16 |
| extract (64) | 2 |
| judge-gate | not comparable (case set changed) |
| bakeoff (55) | 3 |
| consolidate (80), outcome / safe | 2 / 2 |
| consolidate `--pool` (47) | 0 |
| promotion (80) | 1 |
| nightly (35) | 3 |
| retrieval library, semantic lists against the re-run at this head (136) | 2 (both inside the first 6; metrics equal) |
| retrieval books, lists against the re-run (51) | 0 |
| SkillRet, top 15 (4,392 queries) | 0 |

For scale, the two stable runs of the 0.10.261105 round differed by up to 13 distill verdicts, 10 judge-gate outcomes, 6 consolidate
outcomes and 4 bakeoff cases with the same build.

## What was decided before running: harness changes since `bf07f14`

`git diff bf07f14 origin/main` (`958ea13`) with `MEASUREMENT_CHANGELOG.md`. The table was written before any run and applied as written.

| change (PR) | evals | can it move a score? | what was done |
|---|---|---|---|
| Reflect defect-filter docs and test only (188 judge-gate proposals) | reflect | No | published 0.10.261105-beta figures used |
| Pass bar goes through `lib/judge.ts` `applyRule` (same rule), README note | distill | No | published figures used |
| None | extract, promotion | No | published figures used |
| Judge-gate collection 0.5 / scoring 0.5: new cases (188), `akm judge reflect.quality`; refuses an akm without schemaVersion 2 (0.10.261106+) | judge-gate | Collection: the earlier 13 rounds cannot be rescored | the earlier column does not compare; 0.10.261105-beta run once to record the refusal; the baseline is this run |
| Collector reads the schema-repair ref with or without `.md` (tolerance) | bakeoff | No label change | published figures used |
| `nameOfRef` and `conceptId` strip `.md` (tolerance); memory-lifecycle test only | consolidate, `--pool`, nightly | No | published figures used |
| Retrieval collection 0.3 to 0.4 (selection arguments, `out_chars`/`out_tokens`, a `calls` block, old-spelling ref normalisation), scoring 0.4/0.5 to 0.6, 50 more library qrels (#197) | retrieval books and library | Collection and labels | re-run on `akm-cli@0.10.261105-beta` at `958ea13` right after the beta's run (public library and books) |
| `akm.ts` strips `/SKILL` from printed refs (tolerance); no collection, scoring or model change | SkillRet | No | published figures used |
| Summary gains `agent_exits` (visibility only) | agent-ab | No | published figures used |
| New: selection sets (#194, #196, #197) | selection, selection-split | New | beta only, `--selection-flag filter` and `prefer`, `--semantic` |
| Pair-judge, lesson-judge, drain-judge, memory-utility, code set, dated set | none of the 13 | Not in the round | not run |

## What changed in akm since 0.10.261105-beta, eval-visible

From `CHANGELOG.md` (0.10.261106 to 0.10.261110). Only entries an eval could see are listed.

| release | change | what an eval could see |
|---|---|---|
| 0.10.261110 | `akm search --prefer key=value` and `akm curate --prefer`: a ranking preference (score x 1.02 for a local hit, matches first in listings), never drops or admits a hit (#1437) | selection sets with `--selection-flag prefer`; first baseline |
| 0.10.261109 | `--filter` with a repeated key matches any of its values (OR within a key) | selection sets (a key with several values) |
| 0.10.261109 | A bundle-root `.scratch/` folder is never indexed | no eval has one |
| 0.10.261109 | `remember` merges a frontmatter block in its body; `distill` stamps its output with the input's scope and skips merging into a doc of another scope; model-written scope keys in distill and `proposal new` output are replaced or removed with a warning | distill (inputs have no scope: no sign); nightly's distill items |
| 0.10.261108 | Markdown under `raw/` of an LLM Wiki inside a bundle is type `wiki-source`; reflect skips it by default; `search --type knowledge` no longer returns it | retrieval library and reflect, if the corpora hold such a wiki (no sign in the aggregates) |
| 0.10.261107 | A ref is the file's path in its bundle minus the type's suffix (#1432); the old spelling still resolves; `curate` re-checks each hit against the filters (#1413 removes `show --filter`); one content bound for every adapter's indexed document; `node_modules` skipped by every walk | retrieval (the collector normalises old spellings), SkillRet; no sign |
| 0.10.261107 | OpenCode 1 model work limited to reading and searching (#1428) | agent-ab runs the plugin pinned at 0.10.261002-beta; akm's own model work is not used by it; no sign |
| 0.10.261106 | `akm judge <name>`; the pipeline calls each judge through the same registry entry; the reflect judge's rubric says adding a missing field is not churn (#1308); `reflect.quality` marks `reviewNeeded` from a mean of 3.5 in the verdict (schemaVersion 2) | judge-gate (requires it); reflect and nightly's reflect items; consolidate's pair judge (same prompt, not isolated) |
| 0.10.261106 | Reflect no longer writes the text `null` into a field (#1420); `proposal extract` honours `extract.enabled: false`; `accept` reports `PROPOSAL_STALE` / `PROPOSAL_NOT_PENDING`; a retire accept refuses a symlinked archive path | no sign (reflect 37/40; extract, nightly and promotion within spread) |
| 0.10.261106 to 0.10.261110 | `akm ui` and HTML reports removed, `akm-cli/workspace`, Desktop, `code-project` adapter, `akm migrate` content-ref step | no eval |

## Wall times

From each summary's `wall_seconds`: 0.10.261105-beta (this round).

| eval | 0.10.261105-beta | 0.10.261110-beta |
|---|---:|---:|
| reflect | 308 s | 306 s |
| distill | 681 s | 698 s |
| extract | 404 s | 401 s |
| judge-gate | 249 s (135 cases) | 387 s (188 cases) |
| bakeoff | 267 s | 268 s |
| consolidate | 401 s | 411 s |
| consolidate `--pool` | 401 s | 464 s |
| promotion | 172 s | 177 s |
| nightly | 113 s | 122 s |
| retrieval, books / library | 102 s / 281 s | 110 s / 276 s |
| skillret | 3,075 s (queries 2,391; semantic index 651) | 2,051 s (queries 1,466; semantic index 563) |
| agent-ab | 944 s | 1,023 s |
| selection / selection-split, filter | - | 40 s / 1,006 s |
| selection / selection-split, prefer | - | 41 s / 942 s |

SkillRet's call time is 0.89 s (keyword) and 1.60 s (semantic) here against 1.44 s and 2.66 s last round, which was run while the
host's load average was near 31; the lower figure says nothing about akm. The evals ran from 2026-11-05 22:27 UTC to 2026-11-06
18:52 UTC with an interruption (see Environment).

## Baseline for open work

Compare a candidate with the figures below, collected with the commands below, on the same harness head (`958ea13`) and the same
model route, one eval at a time. Keyword search is deterministic (no model call, no embeddings): a keyword figure that moves
means the build moved. Semantic figures and every model-driven figure are one observation.

Commands, from an akm-eval checkout at `958ea13`, with `akm-cli@0.10.261110-beta` installed under Node 24 and first on `PATH`
(for a candidate, add `--akm "bun <checkout>/src/cli.ts"`; for agent-ab `--akm akm-cli@<version>`):

```
evals/retrieval/split <dir-outside-any-ignored-folder>            # the split set; akm indexes no ignored file
evals/retrieval/run --cases evals/retrieval/assets/selection --semantic --selection-flag filter --label <label>
evals/retrieval/run --cases evals/retrieval/assets/selection --semantic --selection-flag prefer --label <label>
evals/retrieval/run --cases <dir> --semantic --selection-flag filter --label <label>    # <dir> = the split set
evals/retrieval/run --cases <dir> --semantic --selection-flag prefer --label <label>
evals/retrieval/run --semantic --label <label>                    # public books and library
evals/{reflect,distill,extract,judge-gate,bakeoff,consolidate,promotion,nightly}/run --semantic --model fast/qwen3.6-35b-a3b --label <label>
evals/consolidate/run --semantic --model fast/qwen3.6-35b-a3b --pool --label <label>
evals/agent-ab/run --semantic --model fast/qwen3.6-35b-a3b --akm akm-cli@<version> --label <label>
benchmarks/skillret/run --semantic --label <label>
```

Pass `--model` explicitly (a value in `.env` beats the environment). The selection sets write to `private/retrieval/results/`
(a custom corpus); the published copies are in `retrieval/` of this round's folder.

**akm#1453 (any frontmatter key in `--filter` and `--prefer`).** Compare the four selection runs below with the same runs after the
sets' stand-in keys `scope_channel` and `scope_agent` are renamed `team` and `project`. Keyword columns must be identical (checked:
`leaked` is 0 for every keyword column); `--prefer` and `--filter` on the stand-in keys already work in 0.10.261110-beta, so the
change must not move them. The public books and library keyword lists without a selection must stay identical to the table above
(books 0.8308, library 0.7668 nDCG@10; semantic 0.9103 and 0.8223).

**akm#1454 (improve keeps the frontmatter it does not own).** The process evals do not carry unowned keys, so they are the
no-regression baseline: reflect 37/40 (controls 35/40), distill 28/40 good lessons and 7/40 updates, 0/16 wrong, consolidate 38/40
with 1 unsafe (`overlap-04`, see above), `--pool` 17/19 with 0 unsafe, nightly 31/35 with 0 harm, extract 34/40. Moves of a few cases
are inside the spread; a rise in unsafe retirements or harm items is not. The survival of keys is the PR's focused tests, not an eval here.

**akm-eval#198 (`--prefer` in hybrid search and with curate's reranker).** The columns to move are the semantic search and semantic
curate rows of the `prefer` runs; the keyword rows are the control and must not move. On the split set the semantic `prefer` rows
have a higher non-match recall (0.83 against 0.73), a lower irrelevant-match share (0.07 against 0.09) and a first match at rank
2.9 against 3.0 than the keyword rows; on the 20-query set the semantic rows have the same first-match rank and non-match recall as
the keyword rows and a higher irrelevant-match share (0.20 against 0.14 in search).

| set | flag | column | queries (selection) | nDCG@10 | pref nDCG@10 | match P@k | irrelevant match@k | first match rank | non-match recall@10 | unchanged | leaked |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| selection | filter | keyword search | 19 (16) | 0.3850 | 0.5049 | 0.1625 | 0.1625 | 1.00 | 0.0000 | 0 | 0 |
| selection | filter | keyword curate | 19 (16) | 0.3850 | 0.5049 | 0.2031 | 0.2031 | 1.00 | 0.0000 | 0 | 0 |
| selection | filter | semantic search | 19 (16) | 0.3850 | 0.5049 | 0.1625 | 0.6875 | 1.00 | 0.0000 | 0 | n/a |
| selection | filter | semantic curate | 19 (16) | 0.3850 | 0.5049 | 0.2031 | 0.6563 | 1.00 | 0.0000 | 0 | n/a |
| selection | prefer | keyword search | 19 (16) | 0.9560 | 0.9273 | 0.1625 | 0.1375 | 1.36 | 0.9375 | 1 | 0 |
| selection | prefer | keyword curate | 19 (16) | 0.9560 | 0.9273 | 0.2031 | 0.1563 | 1.36 | 0.9375 | 1 | 0 |
| selection | prefer | semantic search | 19 (16) | 0.9754 | 0.9536 | 0.1625 | 0.2000 | 1.36 | 0.9375 | 1 | n/a |
| selection | prefer | semantic curate | 19 (16) | 0.9754 | 0.9536 | 0.2031 | 0.1563 | 1.36 | 0.9375 | 1 | n/a |
| selection-split | filter | keyword search | 505 (303) | 0.2390 | 0.1592 | 0.1208 | 0.6568 | 1.38 | 0.0000 | 0 | n/a |
| selection-split | filter | keyword curate | 505 (303) | 0.2390 | 0.1592 | 0.1295 | 0.6840 | 1.38 | 0.0000 | 0 | n/a |
| selection-split | filter | semantic search | 505 (303) | 0.2507 | 0.1605 | 0.1155 | 0.7512 | 1.30 | 0.0000 | 0 | n/a |
| selection-split | filter | semantic curate | 505 (303) | 0.2507 | 0.1605 | 0.1262 | 0.7904 | 1.30 | 0.0000 | 0 | n/a |
| selection-split | prefer | keyword search | 505 (303) | 0.7621 | 0.7529 | 0.0990 | 0.0904 | 3.05 | 0.7312 | 1 | n/a |
| selection-split | prefer | keyword curate | 505 (303) | 0.7621 | 0.7529 | 0.1056 | 0.0792 | 3.05 | 0.7312 | 1 | n/a |
| selection-split | prefer | semantic search | 505 (303) | 0.8203 | 0.8099 | 0.0950 | 0.0739 | 2.94 | 0.8257 | 1 | n/a |
| selection-split | prefer | semantic curate | 505 (303) | 0.8203 | 0.8099 | 0.0974 | 0.0677 | 2.94 | 0.8257 | 1 | n/a |

Columns: `queries (selection)` is the queries scored and, in brackets, those whose selection matches some asset (the selection
metrics cover only those); `unchanged` is the share of `same_as` queries whose list equals their partner's (a hard filter
returns nothing for a selection that matches nothing, so it reads 0; `--prefer` reads 1); `leaked` must be 0 (`n/a` where the
set has no leak query or the column is semantic). `--filter` is today's hard filter, so its non-match recall is 0 by construction.
No query of either set is unsupported on this build.

## Runs

| eval | folder |
|---|---|
| reflect | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](reflect/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| distill | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](distill/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| extract | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](extract/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| judge-gate | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](judge-gate/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| bakeoff (0.5) | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](bakeoff/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| consolidate | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](consolidate/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| consolidate `--pool` | [2026-11-05-0.10.261110-beta-35b-semantic-pool-20261105](consolidate/2026-11-05-0.10.261110-beta-35b-semantic-pool-20261105) |
| promotion | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](promotion/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| nightly | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](nightly/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| skillret | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105](skillret/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105) |
| agent-ab | [2026-11-06-0.10.261110-beta-35b-semantic-full-20261105](agent-ab/2026-11-06-0.10.261110-beta-35b-semantic-full-20261105) |
| retrieval books | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105-books](retrieval/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105-books) |
| retrieval library | [2026-11-05-0.10.261110-beta-35b-semantic-full-20261105-library](retrieval/2026-11-05-0.10.261110-beta-35b-semantic-full-20261105-library) |
| selection, filter | [2026-11-06-0.10.261110-beta-selection-filter-semantic-20261105](retrieval/2026-11-06-0.10.261110-beta-selection-filter-semantic-20261105) |
| selection, prefer | [2026-11-06-0.10.261110-beta-selection-prefer-semantic-20261105](retrieval/2026-11-06-0.10.261110-beta-selection-prefer-semantic-20261105) |
| selection-split, filter | [2026-11-06-0.10.261110-beta-selection-split-filter-semantic-20261105](retrieval/2026-11-06-0.10.261110-beta-selection-split-filter-semantic-20261105) |
| selection-split, prefer | [2026-11-06-0.10.261110-beta-selection-split-prefer-semantic-20261105](retrieval/2026-11-06-0.10.261110-beta-selection-split-prefer-semantic-20261105) |

The 0.10.261105-beta re-run at `958ea13` (books and library) is in [`../0.10.261105-beta-rerun-958ea13/`](../0.10.261105-beta-rerun-958ea13/).

## Environment

- Sandboxes, `TMPDIR` and logs were outside the repository (the system temporary folder is small). The ONNX Runtime and the embedding
  model were fetched or copied once and shared; SkillRet fetched its pinned dataset and the semantic indexes were built cold.
  `akm-cli` 0.10.261110-beta and 0.10.261105-beta were installed under Node 24 into two folders and selected by `PATH`.
- Agent-ab ran twice in the round. The first attempt was interrupted before it finished and was discarded with its containers,
  networks, images and temporary files. The second started with Docker's address pools exhausted by stale networks, every trial
  failed to create its network, and the eval aborted after one minute with "the akm arm completed none of its 18 trials"; it was
  discarded too. The published run is the third, started from scratch with the settings of the 0.10.261105-beta round, after the
  interrupted run's own four networks were removed. The other stale networks belong to other projects and were left alone.
- Both selection sets ran with the split written outside the repository (akm indexes no ignored file). No other eval used the lab
  35B during the round.

## Caveats

- One run per eval. Every model-driven figure is one observation; no move was confirmed by a second run, and `overlap-04` was not
  re-run on its own.
- The judge-gate and library columns do not compare with last round's published figures (new cases; 50 more qrels); the library's
  like-for-like column is the re-run at this head, judge-gate has none.
- The selection runs are the first on this build: the "spread" of those figures is not known. Keyword columns are deterministic.
- Wall times, and SkillRet's per-call time especially, depend on host load, which was not controlled.
- The four selection summaries list their asset folders; the absolute paths were shortened to repository-relative ones before publishing (nothing else in them was edited).
