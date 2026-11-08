# akm 0.10.261112-beta, 35B, semantic, full: a regression check against 0.10.261111-beta

The same set of evals, run the same way, as the [0.10.261111-beta round](../0.10.261111-beta/): akm 0.10.261112-beta (npm `next`),
`fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public corpora, one run each, one eval at a time,
temperature 0, thinking off, plus the two selection sets (`assets/selection`, `assets/selection-split`) with `--selection-flag
filter` and `prefer`. The harness is akm-eval `origin/main` at `0861517`, which is ahead of the previous round's `e40d5ca` (see the
harness-change table). All 13 summaries and the 4 selection summaries are `complete`, record `akm_version` 0.10.261112-beta and
`git_commit` `0861517-dirty` (the dirt is this branch's `RELEASE_PLUGINS` line); the 10 model-driven ones record
`fast/qwen3.6-35b-a3b` (agent-ab `openai/fast/qwen3.6-35b-a3b`) and `config_form` `connections` (agent-ab and the retrieval evals have
none). None has an errored case. Every model-driven figure is one run of a route that is not deterministic in general, so one run per
side is one observation and no single-case flip is chased.

**Verdict: no regression. One improvement, predicted by the akm commits though not by its CHANGELOG: distill lesson updates right
6/40 (3/40 on 0.10.261111-beta).** Retrieval's ranked lists change only where akm#1481 says they should (books: 16 of 51 lists, every
one a `.derived` twin collapsed into its parent; library, SkillRet and all four selection runs: 0 lists differ). The other process
evals are inside the spread, five of them case for case identical to last round.

## Look at these first

1. **Distill: lesson updates right 6/40, against 3/40 on 0.10.261111-beta (7, 7, 7, 9 on earlier builds); `new_facts` 12 against 5.**
   19 updates were emitted (20); 19 of 96 verdicts and 15 of 96 outcomes moved, every moved verdict in the `lesson-update` class.
   Good lessons 29/40 (29), wrong lessons 1/16 (1: `asset-02`, as in the README run of 0.10.261111-beta; 0 in both of that
   build's feature runs), `knowledge-update` class 2/3 as on 0.10.261111-beta (`know-01` missed, `know-02`/`know-03` right). Cause, from the
   akm tree and not from this run: two commits between the `v0.10.261111-beta` and `v0.10.261112-beta` tags change the lesson-update
   writer (`8ce086e78`, "hand the lesson-update writer the memory's figures and names the lesson lacks", and `56cf58a27`, which tightens
   and lists the candidate facts per lesson). Neither is in the CHANGELOG. The three other runs of 0.10.261111-beta (the README run
   and the two feature runs) differ from each other by at most 1 verdict, so 20 moved verdicts is not the run-to-run noise seen there. Not repeated (one run each).
2. **akm prints about half as much for the same lists.** The retrieval summaries' `calls.out_tokens` (characters akm printed, over 4):
   library search 3,433 to 1,720, curate 3,738 to 1,667; books search 2,628 to 1,310, curate 3,156 to 1,385; the selection sets the
   same, and their `results` per call are unchanged. That is the removal of the `results` alias (#1476, "list results are serialized
   once") and of the curate `reason` line (#1482), as the CHANGELOG says; the collectors read `hits` and `items` only, so no collector
   needed a change. The ranked lists are identical (item 3).
3. **Retrieval books: 16 of 51 semantic lists and 12 of 51 keyword lists changed, every one is akm#1481 (one result per memory family).**
   In each, a `.derived` twin in the old top 10 was dropped (its parent was already a hit) or replaced by its parent (the parent was
   ranked lower), and the freed slot took the next hit; after mapping each twin to its parent and dropping duplicates, the new list is
   the old list in the same order plus a new tail item, for all 12 and 16. Rescored 0.10.261111-beta against current scoring (0.8)
   semantic/keyword nDCG@10 0.9123/0.8371 (stored, scoring 0.5: 0.9103/0.8308), this run 0.9129/0.8382; `judged_10` 0.986/0.990
   (it was 1.0; the new tail items are not graded: the `judged_10` fall is the honest cost of that and has not been graded here).
   Library (544 lists), SkillRet (4,392 queries, every field but timing) and the four selection runs (76 metric keys each; 112, 112,
   2,020 and 2,020 ranked lists): 0 differ.
4. **Agent A/B: akm arm 6/18, control 1/18.** Last round's akm arm 8/17 scored (8/18) and 8/18 on the matched-plugin repeat, control 2/18
   both; 6 is below the 8 to 13 of 18 the akm arm has given. Difference +27.8 points (interval -5.6 to 66.7 over 6 tasks); the akm arm
   beat the control on 2 tasks and tied on 4. akm was called in 3 of 18 trials (curate 3, show 5 calls; 5 of 18 on the repeat): all 3
   that called it passed, 3 of the 15 that did not. All 36 trials scored, none errored, no timeout, no non-zero agent exit. The akm arm
   runs plugin 0.10.261111-beta (the release that pins this CLI) as the matched-plugin repeat ran 0.10.261110-beta. Per-trial agent
   time was shorter (0.3 and 0.6 minutes against 1.1 to 2.1; wall 820 s against 1,493 s). One observation; the engagement fall
   (3 of 18) is the likely reason the arm sits lower. **The first attempt of this eval failed in the environment** (next item).
5. **Agent-ab, first attempt: the akm arm completed 0 of 18 trials, because of the lockfile this round committed.** `npm ci` from a
   committed lockfile of akm-cli 0.10.261112-beta runs better-sqlite3 13.0.3's inferred `node-gyp rebuild` (npm 10.9.9 does not take
   `gypfile: false` from a lockfile entry), which fails in the task image, npm drops the optional dependency, and akm stops at
   `[index:preflight]` with "could not load 'better-sqlite3'". Reproduced in the task image with the cached Node 22.23.4 (39 packages
   installed, 41 locally). Fix: no CLI lockfile is committed (the plugin's lockfile is), as for 0.10.261111-beta; the run above is
   the second attempt, from scratch, and the published one. The failed attempt's control arm was 2/18 (it ran; unpublished).
   Recorded in the akm-eval issue log; `npm ci --ignore-scripts` for the CLI, as the plugin install does, would be the fix.
6. **Judge-gate, consolidate, `--pool`: inside the spread.** Judge-gate good revisions passed 84/91 (83), bad passed 7/97 (9),
   harmful auto-accepted 4 of 64 (5), review share 12.8% (14.4%); 12 verdicts moved, in both directions. Consolidate 38/40 safe
   retirements (37), 0 unsafe of 80, staged 21 of 21 safe; one case moved (`subsumed-01`, keep to retire). `--pool` 17/19 (18/19),
   0 unsafe, staged 14 of 14 safe; one case moved (`supersedes-05`, retired safe to kept).
7. **Reflect, extract, bakeoff, promotion, nightly: case for case identical to last round** (0 moved verdicts in each; reflect 36/40
   with controls 35/40, extract 36/40 with planted 2/4, bakeoff 51/55 with session-summary 8/8 and schema-repair 6/8, promotion 34 of 39
   accepted good with the same 5 bad accepted, nightly 31/35 with 0 harm). Their rows are not byte for byte the same files (the
   seconds differ), and the lab route returned the same text in all of them. Last round they moved 5, 5, 3, 2 and 0 cases (reflect, extract, bakeoff, promotion, nightly).
8. **The selection numbers are unchanged from the 0.10.261111-beta feature runs** (selection set 0.5, `team`/`project` keys):
   0 of 76 metric keys and 0 of 112 and 2,020 ranked lists differ, in each of the four runs. The `project-filter` arm and the project
   config are not in this round's set.

## Headline table

The baseline is the 0.10.261111-beta column named in the decision table: its published round, except for the books (that run
rescored with current scoring), distill's `knowledge-update` class and the selection sets (its feature runs at the same collection
version), and agent-ab (its published round and the matched-plugin run).

| eval | headline | 0.10.261111-beta | 0.10.261112-beta | verdict |
|---|---|---:|---:|---|
| reflect | correct fixes (controls) | 36/40 (35/40) | 36/40 (35/40) | none |
| distill | good lessons (wrong lessons) | 29/40 (1/16) | 29/40 (1/16) | none |
| distill | lesson updates right | 3/40 | 6/40 | improvement (one run) |
| distill | `knowledge-update` right (feature run, distill 0.3) | 2/3 | 2/3 | none |
| extract | useful memories | 36/40 | 36/40 | none |
| judge-gate | good revisions passed (bad passed) | 83/91 (9/97) | 84/91 (7/97) | none |
| bakeoff 0.5 | cases passed | 51/55 | 51/55 | none |
| bakeoff 0.5 | session-summary cases passed | 8/8 | 8/8 | none |
| consolidate | safe retirements found (unsafe) | 37/40 (0) | 38/40 (0) | none |
| consolidate `--pool` | safe retirements found (unsafe) | 18/19 (0) | 17/19 (0) | none |
| promotion | accepted proposals that were good | 34/39 | 34/39 | none |
| nightly | items handled right (harm) | 31/35 (0) | 31/35 (0) | none |
| retrieval, books | semantic / keyword nDCG@10 | 0.9123 / 0.8371 (rescored, 0.8) | 0.9129 / 0.8382 | none (16 / 12 lists moved by #1481, all explained) |
| retrieval, library | semantic / keyword nDCG@10 | 0.8223 / 0.7668 | 0.8223 / 0.7668 | none (lists identical) |
| skillret | keyword / semantic NDCG@10 | 50.49 / 57.79 | 50.49 / 57.79 | none (identical) |
| selection, selection-split | 76 metric keys per run, four runs | feature runs, same version | identical | none (lists identical) |
| agent-ab | pass rate, akm / control | 8/17 scored / 2/18 (matched plugin: 8/18 / 2/18) | 6/18 / 1/18 | none (watch: one observation, fewer akm calls) |

Judge-gate's figure is good revisions passed over good revisions; promotion's is good accepted over all accepted. The books'
0.10.261111-beta published figures (0.9103 / 0.8308) were scored before the family grade; the rescored ones are the like-for-like column.

## What was decided before running: harness changes since the 0.10.261111-beta round

`git log e40d5ca..origin/main` is 43 commits. The ones that reach a measurement are in `MEASUREMENT_CHANGELOG.md` ("Unreleased"). The table
says what was done for each; it was applied unchanged. The old CLI was not collected again for any row.

| change | evals | can it move a score? | what was done |
|---|---|---|---|
| retrieval 0.5 -> 0.6, scoring 0.7 -> 0.8 (akm#1481): books qrels grade a memory family once (`alias_of`), the books' three `.derived` twins respelled | retrieval books | Yes, the books' scores and (with akm#1481) lists | rescored the saved 0.10.261111-beta books run with current scoring (allowed: queries, qrels judgments and assets are unchanged; the changelog says rescore saved books runs) and compared with that; the stored figures are shown beside it |
| retrieval library, SkillRet | library, skillret | No (library qrels, queries and assets unchanged) | unchanged: compared with the published 0.10.261111-beta runs |
| retrieval 0.4 -> 0.5, scoring 0.6 -> 0.7: selection sets gain the empty value, a project-filter arm and `team`/`project` keys (run before this round, in its feature runs) | selection, selection-split | Yes (more queries, renamed keys, new qrels for 50 split pairs) | compared with the feature runs of 0.10.261111-beta at the same collection and scoring version (semantic, `filter`, `prefer`), by query id; the published README's selection rows (earlier set) are not comparable by totals. The `project-filter` arm is not in this round's set |
| distill 0.2 -> 0.3 (akm#1454): 99 cases, new class `knowledge-update` | distill | The 96 earlier cases, labels and digests are unchanged | headline keys compared with the published 0.10.261111-beta round (96 cases) by case; the `knowledge-update` class and the verdict moves compared with the 0.10.261111-beta feature full run at distill 0.3 (99 cases) |
| agent-ab, terminal-bench 0.4 -> 0.5: each beta gets its matching plugin (`RELEASE_PLUGINS`) | agent-ab | Yes (the plugin) | added `"0.10.261112-beta": "0.10.261111-beta"` and the plugin's lockfile on this branch, with a MEASUREMENT_CHANGELOG line; compared with the published round (plugin 0.10.261002-beta) and the matched-plugin feature run (0.10.261110-beta). No CLI lockfile (item 5) |
| judge-gate, bakeoff, reflect, extract, consolidate, promotion, nightly | | No change since the last round | unchanged: compared with the published 0.10.261111-beta runs |
| project-intent 0.3, cli-ratification 0.1, harbor shared network | project-intent, cli-ratification (agent-ab uses the shared network) | agent-ab's jobs run on the shared Docker network (`akm-eval-trials`); the trials are the same | none needed |

## What changed in akm, eval-visible

From `CHANGELOG.md`, section 0.10.261112, and the commits between the two tags.

| change | what an eval could see |
|---|---|
| One result per memory family: a `.derived` twin is dropped when its parent is also a hit, or replaced by its parent (#1481) | retrieval books: 16 of 51 semantic and 12 of 51 keyword lists moved, all explained by it; the library and the selection sets have no twin in the lists |
| The `results` alias is gone from every list output; the curate item loses its repeated `reason` line except for historical context (#1476, #1482, #1490) | no collector reads either (checked: retrieval, SkillRet and the process evals read `hits`, `items`, `proposals`; cli-ratification's verifier falls back to `results` after `hits` and `runs`); akm prints about half as many characters for the same lists |
| curate keeps historical context only when marked (#1482) | no eval asks for it |
| `akm search` help no longer lists the global flags (#1486) | the harness's `--detail`/`--shape` probe prints "could not tell how `akm` spells the agent projection of search; using --detail agent" on retrieval, `--pool` and SkillRet; the fallback is the right spelling for 0.10, so no result is affected (recorded in the issue log) |
| distill: lesson-update writer gets the memory's figures and names the lesson lacks (`8ce086e78`, `56cf58a27`; not in the CHANGELOG) | distill lesson updates 3/40 to 6/40, `new_facts` 5 to 12 |
| improve: distill runs on the memories the pass plans; the recent-feedback and bare-positive skips are gone (#1479) | nightly, promotion: no change (0 moved verdicts) |
| env: `#` in an unquoted value warns once per key (#1488) | no eval writes env files |
| `curate --pack`, the project view (`project.from`, `filters`, `prefer` as applied) (#1472, #1473) | no eval uses `--pack` or a project |
| `akm config`, `bundle`, `env`, `proposal`, `registry`, `workflow` with no subcommand list and exit 0 (#1485); install.sh, help text, error codes (#1457, #1486, #1475, #1487) | none in this set |

## Move counts

Cases whose verdict changed between the baseline run and this round (the key is the one the eval's headline reads: `correct`,
`verdict` and `outcome`, `correct`, `outcome`, `correct`, `outcome` and `safe`, `outcome`, `ok`).

| eval (cases) | moved cases | against the spread |
|---|---:|---|
| reflect (80) | 0 | 5 last round |
| distill (96 earlier cases), verdict / outcome | 19 / 15 | 1 / 1 between the README run and the feature run of 0.10.261111-beta; 0 between its two repeats |
| distill (99 cases) against the 0.10.261111-beta feature run, verdict / outcome | 20 / 16 | all in the `lesson-update` class but one outcome |
| extract (64) | 0 | 5 last round |
| judge-gate (188) | 12 | 16 last round |
| bakeoff (55) | 0 | 3 last round |
| consolidate (80), outcome / safe | 1 / 1 | 4 / 4 last round |
| consolidate `--pool` (47) | 1 | 1 last round |
| promotion (80) | 0 | 2 last round |
| nightly (35) | 0 | 0 last round |
| retrieval books (51 queries x 4 lists) | 12 keyword, 16 semantic (search and curate alike) | all #1481 |
| retrieval library (544 ranked lists) | 0 | |
| selection sets (112 + 112 + 2,020 + 2,020 ranked lists; 76 metric keys per run) | 0 | |
| SkillRet (4,392 queries, all fields but timing) | 0 | |

## Books: where each changed list comes from

The three twins that left a list are `memories/client-nexus-exposure-review.derived`, `memories/mise-en-place-workflow.derived` and
`memories/wound-care-cleaning-protocol.derived`. Search and curate lists are equal. Of the 51 queries, 12 keyword lists and 16 semantic lists
changed (the semantic lists add `culinary-beurre-noisette-exact-name`, `culinary-kitchen-fire-pinned-fact`,
`culinary-sous-chef-service-timing`, `legal-standard-deduction-current`, `medical-adv-belief-state-bp-threshold` and
`medical-hydration-guidance-query`; the keyword lists add `legal-extension-payment-deadline` and `legal-tax-filing-checklist-exact`). Two kinds of change:

- twin dropped, its parent already in the list, the next hit appended: 8 of the 12 keyword lists and 14 of the 16 semantic lists;
- twin replaced by its parent in the twin's rank (the parent was not in the old top 10): keyword `legal-citation-convention`,
  `medical-exact-name-first-aid-response-skill`, `culinary-dinner-party-menu-planning`, `legal-conflict-check-adversarial`; semantic
  `legal-citation-convention` and `culinary-beurre-noisette-exact-name`.

Test used for "every change is #1481": map each `.derived` ref to its parent ref in both lists, drop duplicates keeping the first, and
require the new list to equal the old one on its common prefix, with at least one twin gone from the list. It held for every changed list in
all four columns (12, 12, 16, 16); the other lists are identical. No non-twin ref changed rank.

## Wall times

From each summary's `wall_seconds`.

| eval | 0.10.261111-beta | 0.10.261112-beta |
|---|---:|---:|
| reflect | 291 s | 311 s |
| distill | 692 s | 748 s |
| extract | 418 s | 426 s |
| judge-gate | 384 s | 383 s |
| bakeoff | 262 s | 263 s |
| consolidate | 392 s | 416 s |
| consolidate `--pool` | 409 s | 455 s |
| promotion | 172 s | 176 s |
| nightly | 125 s | 127 s |
| retrieval, books / library | 105 s / 297 s | 116 s / 341 s |
| skillret | 1,856 s | 2,472 s (semantic index built cold, 11.7 min) |
| agent-ab | 1,011 s | 820 s (second attempt; the first failed after 11 min) |
| selection / selection-split, filter | 39 s / 933 s | 73 s / 1,120 s |
| selection / selection-split, prefer | 39 s / 1,012 s | 59 s / 1,269 s |

Host load was not controlled (load average about 28 during SkillRet). The evals ran from 2026-11-08 05:53 UTC to 08:45 UTC.

## Runs

| eval | folder |
|---|---|
| reflect | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](reflect/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| distill | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](distill/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| extract | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](extract/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| judge-gate | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](judge-gate/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| bakeoff (0.5) | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](bakeoff/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| consolidate | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](consolidate/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| consolidate `--pool` | [2026-11-08-0.10.261112-beta-35b-semantic-pool-20261112](consolidate/2026-11-08-0.10.261112-beta-35b-semantic-pool-20261112) |
| promotion | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](promotion/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| nightly | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](nightly/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| skillret | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](skillret/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| agent-ab | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112](agent-ab/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112) |
| retrieval books | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112-books](retrieval/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112-books) |
| retrieval library | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112-library](retrieval/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112-library) |
| selection, filter | [2026-11-08-0.10.261112-beta-selection-filter-semantic-20261112](retrieval/2026-11-08-0.10.261112-beta-selection-filter-semantic-20261112) |
| selection, prefer | [2026-11-08-0.10.261112-beta-selection-prefer-semantic-20261112](retrieval/2026-11-08-0.10.261112-beta-selection-prefer-semantic-20261112) |
| selection-split, filter | [2026-11-08-0.10.261112-beta-selection-split-filter-semantic-20261112](retrieval/2026-11-08-0.10.261112-beta-selection-split-filter-semantic-20261112) |
| selection-split, prefer | [2026-11-08-0.10.261112-beta-selection-split-prefer-semantic-20261112](retrieval/2026-11-08-0.10.261112-beta-selection-split-prefer-semantic-20261112) |

## Environment

- Sandboxes, `TMPDIR` and logs were outside the repository. The ONNX Runtime, the embedding model and the agent-ab setup were copied
  from the previous round's cache; SkillRet's semantic index was built cold. `akm-cli@0.10.261112-beta` was installed under Node 24
  and selected by `PATH`. The selection split was written outside the repository (akm indexes no ignored file).
- Agent-ab used plugin 0.10.261111-beta (the release that pins this CLI) and its committed lockfile (`akm_install.locked` is false: the
  CLI has no lockfile, item 5), so the dependency tree was resolved fresh. The first attempt's results folder is not published.
- The lab 35B was checked for other evals before the first run and no eval of this round shared it. The selection summaries' absolute
  paths were shortened to repository-relative ones before publishing (nothing else in them was edited).
- npm served both `akm-cli@0.10.261112-beta` and `akm-opencode@0.10.261111-beta` (checked with `--prefer-online`) before the first run.

## Checks

Model and `akm_version` were read from every summary after the first eval and again at the end: the 10 model-driven ones record
`fast/qwen3.6-35b-a3b` (agent-ab `openai/fast/qwen3.6-35b-a3b`) and `akm_version` 0.10.261112-beta, all `complete`, 0 errored.
`scripts/check` (run without the worktree's `.env` and `models.json`): typecheck and the Python suite pass, `bun test` 3,492 pass, 46 skip,
1 fail. The failure is `refuses a width above the free subnets of Docker's address pools` in `benchmarks/terminal-bench/src/run.test.ts`; it
fails the same way on a clean `origin/main` worktree on this host (Docker's default address pool here is one /16 cut into /24s) and is
unrelated to this branch (recorded in the issue log). `bun run test:site` 42 pass, `bun run build:site` 319 runs, Playwright 20 of 20 with
`LEDGER_PORT=4174`. Privacy scan of every published file: no lab host, login name, home path of the host, private address of the host or key (the
corpus text of the extract and bakeoff samples contains example paths and addresses of made-up machines, as in every earlier round).

## Caveats

- One run per eval. Every model-driven figure is one observation; the distill improvement and agent-ab's 6/18 were not repeated.
- The books' `judged_10` fell from 1.0 to 0.986 (semantic) and 0.990 (keyword) because the freed tail slots return assets no judge
  has graded; the nDCG@10 figures treat them as not relevant. They were not graded in this round.
- Keyword columns and the retrieval and SkillRet lists are deterministic; the semantic ones were identical here as well wherever
  #1481 does not apply.
- Wall times depend on host load, which was not controlled.
