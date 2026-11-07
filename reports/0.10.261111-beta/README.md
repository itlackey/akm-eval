# akm 0.10.261111-beta, 35B, semantic, full: a regression check against 0.10.261110-beta

The same set of evals, run the same way, as the [0.10.261110-beta round](../0.10.261110-beta/): akm 0.10.261111-beta (npm `next`),
`fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public corpora, one run each, one eval at a time,
temperature 0, thinking off, plus the two selection sets (`assets/selection`, `assets/selection-split`) with `--selection-flag
filter` and `prefer`. The harness is the same (`e40d5ca` adds only the 0.10.261110 report files to `958ea13`; see the
harness-change table). All 13 summaries and the 4 selection summaries are `complete`, record `akm_version` 0.10.261111-beta and
`git_commit` `e40d5ca`; the 10 model-driven ones record `fast/qwen3.6-35b-a3b` (agent-ab `openai/fast/qwen3.6-35b-a3b`) and
`config_form` `connections` (agent-ab and the retrieval evals have none). 16 of the 17 have no errored case; agent-ab has one
errored trial (see below).

0.10.261111 adds projects (#1461), `--filter key=` meaning "key absent" (#1459), a repeatable `--from` (#1460), Desktop project
management (#1462), and #1453 and #1454, which were measured earlier on a feature branch. With no `projects` key and no new flag,
everything should behave as before. This round checks that. Every model-driven figure is one run of a route that is not
deterministic (identical requests can return different text at temperature 0), so one run per side is one observation and no
single-case flip is chased.

**Verdict: no regression in any eval.** Retrieval (books, library), SkillRet and all four selection runs are identical to
0.10.261110-beta in every metric and every ranked list. The process evals moved within the spread of earlier rounds, with one
number to repeat before it is read either way: distill's lesson updates (3/40 against 7/40 in each of the four earlier runs).

## Look at these first

1. **Distill: lesson updates right 3/40, against 7, 7, 7 and 9 of 40 in the four earlier runs of 0.10.261110-beta and its feature branch.** Updates
   emitted fell from 23 to 20 (the first feature-branch run, which had the same #1454 code, also emitted 20 and got 7 right); right
   updates 7 to 3, bad updates 19 to 21, missed 14 to 16, and `new_facts` 9 to 5. Good lessons are 29/40 (28), and wrong lessons
   are 1/16 (0): `asset-02` (class `restates-asset`) was skipped last round and produced a lesson now. 22 of 96 verdicts and 16 of
   96 outcomes moved, in both directions (the feature-branch comparison saw 30 and 20 between runs of different builds). #1454 ("a distill update keeps
   the frontmatter keys the rewrite left out") is the only 0.10.261111 change on this path and the lesson-update inputs carry no
   such keys, so the CHANGELOG does not predict a move. It is the one aggregate outside the earlier runs, so the first number to
   repeat (once on this build and once on 0.10.261110-beta, same server, one at a time) before calling it noise.
2. **Consolidate: `overlap-04` is safe again; 0 unsafe retirements (1 last round).** 37/40 safe retirements found (38), 0 unsafe of
   80, staged 20 of 20 safe. Four cases moved: `subsumed-01`, `supersedes-04` and `overlap-04` went from retire to keep, and
   `supersedes-11` from keep to retire. `overlap-04` has now been unsafe in 2 of 6 runs of this eval (the 0.10.261022 run and
   0.10.261110-beta), which says it is the model's variation on one pair, not a build. `--pool` is 18/19 (17/19) with 0 unsafe
   and 13 of 13 staged retirements safe; one case moved (`supersedes-05`, kept to safe).
3. **Agent A/B: akm arm 8 of 17 scored (8/18 counting the lost trial as a fail), control 2/18.** Last round 8/18 and 0/18. Difference
   +36.1 points (interval -5.6 to 75.0 over 6 tasks); akm beat control on 4 tasks, control beat akm on 1, tied on 1. akm was called
   in 7 of 17 trials (6 of 18). The akm arm lost one trial of `drillbit--backup-policy-train` to an environment failure: the build
   step could not fetch packages from the Ubuntu mirror (`apt` "Failed to fetch ... Packages.gz"), so the trial has no verifier
   result and counts as errored, not scored. This harness records a non-zero agent exit as errored only when there is no verifier
   result; 4 trials ended non-zero (control 2, akm 2), 3 of them were still scored. The interval now includes zero where
   last round's did not; with 6 tasks and 3 trials each that is one trial's worth. Not re-run (one run each).
4. **Retrieval, SkillRet and selection: identical.** Books and library: 0 of 40 metric keys and 0 of 204 and 544 ranked lists
   differ from 0.10.261110-beta (the 2 neighbouring-ref swaps of last round's library run did not recur). SkillRet: all 24 metric
   keys and every field of all 4,392 queries are identical. The four selection runs (`selection` and `selection-split`, `filter`
   and `prefer`, keyword and semantic, search and curate): 0 of 76 metric keys and 0 of 80 and 2,020 ranked lists differ, in each
   run. No query's list changed. The new `projects` key, `--filter key=` and the repeatable `--from` are unused by these evals, as
   expected.
5. **Judge-gate, reflect, extract, bakeoff, promotion, nightly: inside the spread.** Judge-gate good revisions passed 83/91 (85),
   bad passed 9/97 (9), harmful auto-accepted 5 of 64 (4), review share 14.4% (13.3%); reflect 36/40 (37), controls 35/40 (35);
   extract 36/40 (34) but the planted-memory class 2/4 (3/4: one more saved instruction); bakeoff 51/55 (50), session-summary 8/8,
   schema-repair 6/8 (7/8); promotion 34 of 39 accepted good (34 of 39), the same 5 bad accepted; nightly 31/35 with 0 harm (same),
   proactive proposals 6 (5). None is a change the CHANGELOG predicts.

## Headline table

| eval | headline | 0.10.261110-beta | 0.10.261111-beta | verdict |
|---|---|---:|---:|---|
| reflect | correct fixes (controls) | 37/40 (35/40) | 36/40 (35/40) | none |
| distill | good lessons (wrong lessons) | 28/40 (0/16) | 29/40 (1/16) | none |
| distill | lesson updates right | 7/40 | 3/40 | watch: repeat |
| extract | useful memories | 34/40 | 36/40 | none |
| judge-gate | good revisions passed (bad passed) | 85/91 (9/97) | 83/91 (9/97) | none |
| bakeoff 0.5 | cases passed | 50/55 | 51/55 | none |
| bakeoff 0.5 | session-summary cases passed | 8/8 | 8/8 | none |
| consolidate | safe retirements found (unsafe) | 38/40 (1) | 37/40 (0) | none |
| consolidate `--pool` | safe retirements found (unsafe) | 17/19 (0) | 18/19 (0) | none |
| promotion | accepted proposals that were good | 34/39 | 34/39 | none |
| nightly | items handled right (harm) | 31/35 (0) | 31/35 (0) | none |
| retrieval, books | semantic / keyword nDCG@10 | 0.9103 / 0.8308 | 0.9103 / 0.8308 | none (lists identical) |
| retrieval, library | semantic / keyword nDCG@10 | 0.8223 / 0.7668 | 0.8223 / 0.7668 | none (lists identical) |
| skillret | keyword / semantic NDCG@10 | 50.49 / 57.79 | 50.49 / 57.79 | none (identical) |
| selection, selection-split | 76 metric keys per run, four runs | see 0.10.261110-beta | identical | none (lists identical) |
| agent-ab | pass rate, akm / control | 8/18 / 0/18 | 8/17 scored / 2/18 | none (one trial lost to a mirror failure) |

The 0.10.261110-beta column is the published [round](../0.10.261110-beta/); its figures are quoted from it. Judge-gate's figure
is good revisions passed over good revisions; promotion's is good accepted over all accepted.

## Move counts

Cases whose verdict changed between the published 0.10.261110-beta run and this round (the key is the one the eval's headline
reads: `correct`, `verdict` and `outcome`, `outcome`, `outcome` and `safe`, `ok`).

| eval (cases) | moved cases | against the spread |
|---|---:|---|
| reflect (80) | 5 | |
| distill (96), verdict / outcome | 22 / 16 | up to 13 verdicts between two runs of one build (0.10.261105 round); 30 / 20 feature branch vs baseline |
| extract (64) | 5 | feature branch vs baseline: 6 |
| judge-gate (188) | 16 | feature branch vs baseline: 16 |
| bakeoff (55) | 3 | up to 4 between two runs of one build |
| consolidate (80), outcome / safe | 4 / 4 | up to 6 outcomes between two runs of one build |
| consolidate `--pool` (47) | 1 | feature branch vs baseline: 2 |
| promotion (80) | 2 | feature branch vs baseline: 0 verdicts, 2 accepts |
| nightly (35) | 0 | |
| retrieval books (204 ranked lists) | 0 | |
| retrieval library (544 ranked lists) | 0 | |
| selection sets (80 + 80 + 2,020 + 2,020 ranked lists; 76 metric keys per run) | 0 | |
| SkillRet (4,392 queries, all fields) | 0 | |

## What was decided before running: harness changes since the 0.10.261110-beta round

`git log e40d5ca..origin/main` is empty, and `git diff 958ea13 e40d5ca` outside `reports/` is empty: the 0.10.261110-beta round
was collected at `958ea13` and `e40d5ca` only adds its report files. `MEASUREMENT_CHANGELOG.md` has no entry after it.

| change | evals | can it move a score? | what was done |
|---|---|---|---|
| none (harness at the baseline's measurement versions) | all | No | unchanged: every eval run once on 0.10.261111-beta and compared with the published 0.10.261110-beta figures; no rescore, no re-run of the baseline CLI |

## What changed in akm, eval-visible

From `CHANGELOG.md`, section 0.10.261111 (the Unreleased section was empty at release).

| change | what an eval could see |
|---|---|
| `--filter` and `--prefer` select on any frontmatter key and on `tag`; the first `akm index` after the upgrade indexes them (#1453) | selection sets (they use `scope_channel` and `scope_agent`, the stand-ins); retrieval. Result: identical lists |
| `proposal extract` and `proposal new` take `--user`, `--agent`, `--run`, `--channel` and stamp the scope; model output never sets scope (#1454) | extract, promotion, nightly (these evals do not pass the flags). Within spread |
| A distill update of an existing knowledge doc keeps the frontmatter keys the rewrite left out (#1454) | distill lesson updates, nightly's distill items. See "Look at these first", item 1 |
| `--filter key=` (empty value) matches assets that lack the key; `--prefer key=` boosts them (#1459) | no eval passes an empty value |
| `--from` is repeatable on search and curate; `source` in `curate()` takes an array (#1460) | no eval passes more than one |
| `projects` config key: directory-matched read and write defaults, `--project` (#1461) | no eval configures a project. Improve's session extract now resolves the project per session and may rename memory folders (`memories/home-me-akm/` to `memories/akm/`) only when a project is registered; none is, so extract is unaffected |
| Desktop project management, `akm-cli/workspace` `config.changeProjects` (#1462) | no eval |
| `--filter` scope documented as selection, not tenant isolation; `akm show --filter` no longer documented | no eval |

## Wall times

From each summary's `wall_seconds`.

| eval | 0.10.261110-beta | 0.10.261111-beta |
|---|---:|---:|
| reflect | 306 s | 291 s |
| distill | 698 s | 692 s |
| extract | 401 s | 418 s |
| judge-gate | 387 s | 384 s |
| bakeoff | 268 s | 262 s |
| consolidate | 411 s | 392 s |
| consolidate `--pool` | 464 s | 409 s |
| promotion | 177 s | 172 s |
| nightly | 122 s | 125 s |
| retrieval, books / library | 110 s / 276 s | 105 s / 297 s |
| skillret | 2,051 s | 1,856 s (queries 1,279; semantic index 554) |
| agent-ab | 1,023 s | 1,011 s |
| selection / selection-split, filter | 40 s / 1,006 s | 39 s / 933 s |
| selection / selection-split, prefer | 41 s / 942 s | 39 s / 1,012 s |

Host load was not controlled. The evals ran from 2026-11-07 05:35 UTC to 07:56 UTC without interruption.

## Runs

| eval | folder |
|---|---|
| reflect | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](reflect/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| distill | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](distill/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| extract | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](extract/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| judge-gate | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](judge-gate/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| bakeoff (0.5) | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](bakeoff/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| consolidate | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](consolidate/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| consolidate `--pool` | [2026-11-07-0.10.261111-beta-35b-semantic-pool-20261111](consolidate/2026-11-07-0.10.261111-beta-35b-semantic-pool-20261111) |
| promotion | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](promotion/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| nightly | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](nightly/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| skillret | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](skillret/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| agent-ab | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111](agent-ab/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111) |
| retrieval books | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111-books](retrieval/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111-books) |
| retrieval library | [2026-11-07-0.10.261111-beta-35b-semantic-full-20261111-library](retrieval/2026-11-07-0.10.261111-beta-35b-semantic-full-20261111-library) |
| selection, filter | [2026-11-07-0.10.261111-beta-selection-filter-semantic-20261111](retrieval/2026-11-07-0.10.261111-beta-selection-filter-semantic-20261111) |
| selection, prefer | [2026-11-07-0.10.261111-beta-selection-prefer-semantic-20261111](retrieval/2026-11-07-0.10.261111-beta-selection-prefer-semantic-20261111) |
| selection-split, filter | [2026-11-07-0.10.261111-beta-selection-split-filter-semantic-20261111](retrieval/2026-11-07-0.10.261111-beta-selection-split-filter-semantic-20261111) |
| selection-split, prefer | [2026-11-07-0.10.261111-beta-selection-split-prefer-semantic-20261111](retrieval/2026-11-07-0.10.261111-beta-selection-split-prefer-semantic-20261111) |

## Environment

- Sandboxes, `TMPDIR` and logs were outside the repository. The ONNX Runtime, the embedding model and the agent-ab setup were
  copied from the previous round's cache; SkillRet's semantic index was built cold. `akm-cli@0.10.261111-beta` was installed under
  Node 24 and selected by `PATH`. The selection split was written outside the repository (akm indexes no ignored file).
- Agent-ab used the default pinned plugin, 0.10.261002-beta, which carries its own akm-cli 0.10.261003-beta; only the akm it shells
  out to (0.10.261111-beta) is the one under test, as in the baseline. The dependency tree is not locked and was resolved fresh
  (`akm_install.dependency_tree_sha256` differs from the baseline's, as it does between any two runs).
- The lab 35B was checked for other evals before the first run and no eval of this round shared it. The selection summaries' absolute
  paths were shortened to repository-relative ones before publishing (nothing else in them was edited).

## Caveats

- One run per eval. Every model-driven figure is one observation; no move was confirmed by a second run. In particular distill's
  lesson updates (3/40) and `overlap-04` were not repeated.
- Keyword columns and the retrieval and SkillRet lists are deterministic; the semantic ones were identical here as well.
- Agent-ab's akm arm has 17 scored trials, not 18, because of the mirror failure; the headline table says so.
- Wall times depend on host load, which was not controlled.
