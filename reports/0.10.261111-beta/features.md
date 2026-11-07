# 0.10.261111-beta: the new features, one eval each

Each akm change of 0.10.261111-beta measured with the eval built for it, next to 0.10.261110-beta ("before") where the eval can tell them apart. Model: the lab 35B, `fast/qwen3.6-35b-a3b`, thinking off, one eval at a time. Harness: akm-eval main `81b9f74` (#199, #203, #201 and #202 merged); the runs were made on a local branch with the same tree, so the summaries record `git_commit` `996a657`. akm: `akm-cli@0.10.261111-beta` and `akm-cli@0.10.261110-beta` from npm. The full 261110 vs 261111 regression round is in `reports/0.10.261111-beta/README.md` (a separate PR); this page repeats none of it except the distill check below.

## Claims

| akm change | Claim | Verdict | Numbers |
|---|---|---|---|
| #1453 `team` / `project` frontmatter keys | On 261111 the team and project selection metrics are scored; on 261110 they are unsupported | **proven** | 261111: all 28 + 505 selection queries scored, 0 errored, `leaked` 0. 261110: 23 of 28 and 404 of 505 queries `unsupported` on `filter` and on `prefer` (`Unknown scope key "team" in --filter. Valid keys: user, agent, run, channel`). |
| #1459 empty filter value | `checks.empty_value` is 1 on the `filter` and `project-filter` arms | **proven** on 261111 (keyword); the "refused on 261110" half is **not isolated** | 261111: `empty_value` 1 on `filter` and 1 on `project-filter`, search and curate. 261110 refuses the `e01`-`e04` queries, but for the key (`team` is not a valid scope key there), so it says nothing about the empty value itself. Keyword columns only by design (`null` on semantic and on `prefer`). |
| #1461 projects (selection) | The `project-filter` arm's ranked lists are byte-identical to the `filter` arm's | **proven** | 0 differing lists of 28 queries x search, curate (small set) and of 505 x search, curate (split set), keyword and semantic (including `semantic_search` and `semantic_curate`), compared ref by ref. The metrics are identical too. |
| #1461 projects (agent) | A bare project entry earns its place by the README's rule | **unproven** | `bare - none` +0.098 (95% interval -0.054 to +0.250, sign p 0.096); `explicit - none` +0.080 (-0.071 to +0.223). Tokens per correct outcome fall 16.5% under `bare` (157,779 vs 188,986), general pass rate is not lower (0.688 vs 0.563), but the interval holds 0, so by the rule the convention is not shown. `other project` falls 9.4% (`none`) to 1.0% (`bare`) to 0% (`explicit`). |
| #1454 knowledge update keeps host frontmatter | `know-02` and `know-03` keep `team`, `project`, `owners`, `review_cycle` | **proven** for the two cases that reach an update | 261110: `bad update` 3 of 3 attempts on each (lost `team`, `project`, `owners`, and `review_cycle` on `know-03`). 261111: `right` 3 of 3 on each. `know-01` is `missed` on all 6 runs (akm's judge rejects the lesson, `nonRedundancy 2/5`) and so tests nothing on either version. The class does separate the two versions with this model. |
| plugins #153 (session cwd) | Plugin `0.10.261110-beta` vs `0.10.261002-beta` on akm 261111, agent-ab | **no difference seen** (one observation) | akm arm 8/18 (0.444) vs 8/17 (0.472); delta vs the control +0.333 (0.000 to +0.722) vs +0.361 (-0.056 to +0.750); engagement 0.278 vs 0.412. Control 2/18 in both. The two intervals overlap almost entirely. |
| regression check | Distill "lesson updates right" 3/40 on 261111 is noise, not an akm regression | **not an akm regression** | 261110 on today's harness also gives 3/40; see below. |

## Selection sets (#1453, #1459, #1461)

`selection.*` is the selection subset of the column (16 of the 28 queries, 303 of 505), `ndcg` its nDCG@10, `nonmatch` its `nonmatch_recall_10`. Keyword and semantic columns are the same for `filter` and `project-filter`. Harness runs: `retrieval/*-keyword-selection-*` and `retrieval/*-semantic-selection-*`.

| set | akm | arm | `selection.n` | `selection.ndcg` | `nonmatch` | first match rank | `unchanged` | `leaked` | `empty_value` |
|---|---|---|---|---|---|---|---|---|---|
| selection (28) | 261110 | filter, prefer | unsupported (23 of 28) | - | - | - | - | - | - |
| selection | 261111 | filter | 16 | 0.395 | 0 | 1 | 0 | 0 | 1 |
| selection | 261111 | prefer | 16 | 0.948 (keyword) / 0.971 (semantic) | 0.938 | 1.36 | 1 | 0 | null |
| selection | 261111 | project-filter | 16 | 0.395 | 0 | 1 | 0 | 0 | 1 |
| selection-split (101 x selections) | 261110 | filter, prefer | unsupported (404 of 505) | - | - | - | - | - | - |
| selection-split | 261111 | filter | 303 | 0.143 | 0 | 1.38 | 0 | null | null |
| selection-split | 261111 | prefer | 303 | 0.759 (keyword) / 0.819 (semantic) | 0.731 / 0.826 | 3.05 / 2.94 | 1 | null | null |
| selection-split | 261111 | project-filter | 303 | 0.143 | 0 | 1.38 | 0 | null | null |

By intent (261111, keyword): small set `filter` ndcg team 0.765 (n 2), mixed 0.532 (n 9), general 0.000 (n 5); `prefer` team 1.000, mixed 0.957, general 0.910 (semantic 0.984). Split set `filter` team 0.791 (n 42), mixed 0.302 (n 24), general 0.012 (n 237); `prefer` team 0.842, mixed 0.703, general 0.750. The hard filter drops general-intent answers (nonmatch recall 0), `prefer` keeps them lower, as designed; whether `prefer` meets the selection pass rule is a separate question (`evals/retrieval/README.md`), not asked here. `unchanged` is 0 for `filter` because a hard filter on a selection that matches nothing returns nothing.

Keyword and semantic `filter` columns are equal on the small set (`semantic_search` ndcg 0.550 as `search`); the split set's semantic column differs (0.251 vs 0.239 overall).

## Distill: #1454 and the 3/40 check

`know-01..03` were run as a custom corpus of just those cases (the cases and bundles of `evals/distill/assets`; the run has no id filter), 3 attempts per version, `--semantic`. Wall time: 19 s each. `distill/*-know-r{1,2,3}`.

| case | 261110 (3 attempts) | 261111 (3 attempts) |
|---|---|---|
| know-01 | missed, judge `nonRedundancy 2/5` | missed, judge `nonRedundancy 2/5` |
| know-02 | bad update, lost `team`, `project`, `owners` | right, nothing lost |
| know-03 | bad update, lost `team`, `project`, `owners`, `review_cycle` | right, nothing lost |

The three attempts agree on each version, so 3 attempts is as much as the 35B shows here.

Full set (99 cases, `--semantic`, same harness and settings, 11.5 min each), next to the round's runs (PR #204, harness `e40d5ca`/`9b063ab`):

| run | akm | lesson updates right | updates emitted | bad updates | good lessons | wrong lessons | `knowledge-update` |
|---|---|---|---|---|---|---|---|
| round, 2026-11-05 | 261110 | 7/40 | 23 | 16 | 28/40 | 0/16 | n/a (class not yet in the harness) |
| round, 2026-11-07 | 261111 | 3/40 | 20 | 17 | 29/40 | 1/16 | n/a |
| this page | 261110 | 3/40 | 20 | 17 | 29/40 | 0/16 | 0/3 |
| this page | 261111 | 3/40 | 20 | 17 | 29/40 | 0/16 | 2/3 |
| this page, repeat | 261111 | 3/40 | 20 | 17 | 29/40 | 0/16 | 2/3 |

"Bad updates" is emitted minus right (the update class has no separate counter; the per-check counts in `summary.json` `metrics.lesson_updates.checks` are identical in all three runs of this page). Per-check, every count equals the round's 261111 run: `update_proposed` 20, `existing_kept` 20, `new_facts` 5, `not_copied` 17.

**Verdict: noise on the akm side, not a regression of 261111.** 261110, run today on the same harness, falls to the same 3/40 and 20 emitted updates as 261111, and the three runs of this page agree on every count. The change from 7 (four earlier runs: 7, 7, 7, 9) to 3 therefore happened with the akm held fixed, so it comes from the lab model server or its state (or the day's harness), not from 0.10.261111. The one wrong lesson in the round's 261111 run does not repeat (0/16 in both of this page's 261111 runs). No older version or further repeat was run to find out which.

## agent-ab: the plugin (#153)

`evals/agent-ab/run --semantic --model fast/qwen3.6-35b-a3b --akm akm-cli@0.10.261111-beta`, the round's settings (6 tasks, 3 attempts per arm), measurement 0.5. The only change from the round's run is `pins.akm_plugin`, from `0.10.261002-beta` (the round, harness `e40d5ca`) to `0.10.261110-beta` (`RELEASE_PLUGINS` in #202). 25 min.

| | plugin | akm arm | control | delta (95% interval) | better akm/control/same | engagement | errored |
|---|---|---|---|---|---|---|---|
| round | 0.10.261002-beta | 8/17 (0.472) | 2/18 | +0.361 (-0.056 to +0.750) | 4/1/1 | 0.412 | 1 |
| this page | 0.10.261110-beta | 8/18 (0.444) | 2/18 | +0.333 (0.000 to +0.722) | 3/0/3 | 0.278 | 0 |

One observation of 18 trials per arm; the intervals cover each other, and the plugin's effect on a different working directory is what project-intent measures, not this pair.

## project-intent (#1461)

`evals/project-intent/run --model fast/qwen3.6-35b-a3b --semantic`, 28 tasks x 3 arms x 4 attempts = 336 trials, 4 at a time, 5 h 10 min. `pins`: `akm_cli` 0.10.261111-beta, `akm_plugin` 0.10.261110-beta, opencode 1.18.34, Harbor 0.24.0; `akm_install.locked` false for the CLI (as the README describes). All 336 trials were scored, none errored in the harness's sense. 10, 11 and 14 of the 112 trials of `none`, `bare` and `explicit` ended in a non-zero agent exit (5, 8, 8), an agent timeout (5, 2, 6) or one rate-limit error (`bare`) and count as 0, as the README says; they are in every arm, so they do not bias the differences, but they lower all three pass rates.

| arm | pass rate (95%) | conflict | general | passed | other project | akm called | tokens / trial | tokens / correct |
|---|---|---|---|---|---|---|---|---|
| none | 0.616 (0.536-0.696) | 0.625 | 0.563 | 69/112 | 9.4% | 63% | 116,429 | 188,986 |
| bare | 0.714 (0.634-0.795) | 0.719 | 0.688 | 80/112 | 1.0% | 66% | 112,699 | 157,779 |
| explicit | 0.696 | 0.677 | 0.813 | 78/112 | 0% | 68% | 125,401 | 180,063 |

| difference | value | 95% interval | tasks better / worse / same | sign p |
|---|---|---|---|---|
| bare - none | +0.098 | -0.054 to +0.250 | 13 / 5 / 10 | 0.096 |
| explicit - none | +0.080 | -0.071 to +0.223 | 12 / 6 / 10 | 0.238 |
| explicit - bare | -0.018 | -0.161 to +0.125 | 8 / 9 / 11 | 1.00 |

By the README's rule the name convention is **unproven**: the interval of `bare - none` holds 0, although the point estimate is positive, `bare`'s tokens per correct outcome are 16.5% below `none`'s, and its general pass rate is not lower. Unproven is dropped by default. `explicit - none` is no clearer, so there is no evidence that the filter alone helps either. What the projects do show is the other-project rate, which falls from 9.4% to 1.0% to 0%. The sizing note in the README applies: a smaller effect than +0.25 on the conflict tasks is likely to read as unproven at this size.

## Runs and wall time

| run | wall |
|---|---|
| selection + selection-split, keyword, 261110 (filter, prefer) | 0.4 + 0.5 + 7.9 + 5.8 min |
| selection + selection-split, keyword, 261111 (filter, prefer, project-filter) | 0.3 x 3 + 6.1 + 6.5 + 5.5 min |
| same, semantic, 261110 | 0.6 + 0.5 + 9.3 + 9.0 min |
| same, semantic, 261111 | 0.8 x 3 + 14.7 + 15.5 + 14.5 min |
| distill know-01..03, 6 runs | 0.3 min each |
| distill full, 3 runs | 11.4, 11.5, 11.5 min |
| agent-ab | 24.9 min |
| project-intent | 309.8 min |

## Notes

- `scripts/check` on the integration branch passed typecheck, the Python suite and 3,411 of 3,412 tests. The one failure (`memory-utility --split`) came from linking `models.json` and `.env` into the worktree, which that test assumes absent (the file is gitignored); with both removed it passes, and the runs here need them.
- Absolute checkout and scratch paths in the retrieval summaries' bundle `path` were shortened to relative paths before publishing; no hash in the summaries covers them.
- Semantic retrieval uses akm's built-in embedder in the akm process; no embedding service was involved.
- The 261110 selection runs here use the current harness (`assets/selection` of #203 and the new keys), so they are not the 261110 round's selection rows (which used the earlier 20-query set).
- The ledger (`bun run build:site`) lists the agent-ab, the three full distill and the project-intent runs; it leaves out the selection runs and the `know-0x` runs, because they were run on `--cases` folders (`corpus` is `custom`), as the ledger does for every custom corpus. They are published here for the record. `bun run test:site`, `bun run build:site`, `tsc` and Playwright (`LEDGER_PORT=4174`, 20 tests) pass on this branch.
