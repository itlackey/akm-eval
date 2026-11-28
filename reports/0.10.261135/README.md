# akm 0.10.261135, 35B, semantic, full: a regression check against 0.10.261112-beta

The same set of evals, run the same way, as the [0.10.261112-beta round](../0.10.261112-beta/): stable akm 0.10.261135,
`fast/qwen3.6-35b-a3b` through the lab gateway, `--semantic` on every eval, full public corpora, one run each, one eval at a time,
temperature 0, thinking off, plus the two selection sets with `--selection-flag filter` and `prefer`, and, new to the round, the three
judge evals `lesson-judge`, `pair-judge` and `drain-judge`. The harness is akm-eval `origin/main` at `11719bc0`, which is ahead of the
previous round's `0861517` (see the harness-change table). All 19 runs exited 0; all 16 summaries and the 4 selection summaries are
`complete`, record `akm_version` 0.10.261135 and `git_commit` `11719bc0-dirty` (the dirt is this branch's `RELEASE_PLUGINS` line
`"0.10.261135": "0.10.261141"`); the model-driven ones record `fast/qwen3.6-35b-a3b` (agent-ab `openai/fast/qwen3.6-35b-a3b`) and
`config_form` `connections` (agent-ab and the retrieval evals have none). No run has an errored case. Nightly is published as collected
(scoring 0.4) and rescored with this branch's nightly scoring 0.5 (item 1); the rescored run is the one read here. Every
model-driven figure is one observation, and this round the lab route was less repeatable than last round (item 6), so no single-case
flip is chased.

**Verdict: no akm regression. Nightly 32/35 items right with 0 harm (31/35 and 0), rescored with nightly scoring 0.5; as collected,
with scoring 0.4, it read 26/35 with 6 harmed, and all six were correct fixes that akm now dates (`updated` set to the write date,
akm#1834), which the old scoring counted as an extra change. Agent-ab's akm arm passed 11/18 (6/18) with akm called in 7 of 18 trials
(3), on a new plugin, so it is not like-for-like.** Bakeoff's 48/55 (51/55) is not comparable: `remember-enrich` is
measured through a new path (collection 0.5, scoring 0.7); the 47 comparable cases give 42 against 43. Retrieval's keyword and SkillRet
numbers hold; akm indexes 253 assets of the public library where it indexed 251, which moves 13 keyword and 14 semantic lists of 136 at
their tail. The three judge evals match their 2026-11-04 baseline (same prompts, same cases) within or at the edge of its three-repeat
spread.

## Look at these first

1. **Nightly: 32/35 items right, 0 harmed (31/35, 0), after a scorer fix; as collected it read 26/35 with 6 harmed.** The six are the drain-accepted
   reflect fixes `description-period-01`, `description-truncated-01`, `description-missing-01`, `description-quote-01`,
   `when-to-use-missing-01` and `title-missing-01`. Each one's `defect_fixed`, `body_kept` and `no_invented` hold; only `no_extra_change`
   fails, and the one extra key in every case is `updated` (for example `updated: 2026-07-26` became the write date). Cause: akm
   0.10.261134 "sets frontmatter dates itself when it writes an asset. Every create and update sets `updated` to today's date" (#1834,
   commit `16e04aba8`). On 0.10.261112-beta the drain kept the note's `updated`. The nightly scorer took `no_extra_change` from the
   reflect scorer (`evals/reflect/src/score.ts`, `BOOKKEEPING = type, generated, verified`), while nightly's own list of akm-stamped keys
   (`AKM_KEYS` in `evals/nightly/src/score.ts`) already included `updated`. This branch makes nightly pass its `AKM_KEYS` to the reflect
   checks (nightly scoring 0.4 -> 0.5, `MEASUREMENT_CHANGELOG.md`), and leaves the reflect eval's own keys as they were: reflect scores
   the proposal, which akm does not stamp (all 45 proposals of its run carry the source's `updated` unchanged, and 0 of its 80 rows list
   `updated`), so a changed `updated` there would be the model's, and reflect's scoring (0.4) does not change. Both nightly runs were
   rescored: this round's six rows turn right and nothing else moves; the 0.10.261112-beta run is unchanged (31/35, 0 harm, 0 rows
   differ), published as [a `-rescored` folder](../0.10.261112-beta/nightly/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112-rescored)
   beside the original for the comparison column. Rescored, the night is 32/35 with 0 harm (reflect 10/10, distill 5/7, pair 7/7, fix
   1/1, untouched 4/4, silent 5/6). Against last round one item moves: `asset-01`, lesson pending to `update_nothing_added`, now right;
   `dup-04` is right both times by a different skip.
2. **Agent A/B: akm arm 11/18, control 1/18 (6/18 and 1/18).** Difference +55.6 points (interval 22.2 to 83.3 over 6 tasks); the akm
   arm beat the control on 5 tasks and tied on 1 (2 and 4). The gain is in `inkwell--new-service-train` and
   `inkwell--new-service-scaled-train` (0/3 to 2/3 each) and `drillbit--scale-replicas-train` (1/3 to 2/3). akm was called in 7 of 18
   trials (curate 6, show 11, search 1 calls; 3 of 18 last round) and all 7 passed; 4 of the 11 that did not call it passed (3 of 15).
   Not like-for-like: the akm arm runs plugin 0.10.261141 (0.10.261111-beta), and the harness seed now sets `improve.enabled false`
   (`89405ec0`) and writes akm's `paths` only on 0.11 (`912f7575`). 11 is inside the 6 to 13 of 18 the arm has given. The control arm
   passed the same 1 trial, but ran longer: one trial timed out at 600 s (`drillbit--backup-policy-train`) and one ran 418 s, so its
   agent time is 1.4 minutes per trial (0.3) and its input tokens 3.7 M (1.0 M). All 36 trials scored; no CLI or plugin lockfile
   (`akm_install.locked` false), so the tree was resolved fresh. One observation.
3. **Bakeoff 48/55 (51/55) is not like-for-like.** `remember-enrich` moved to collection 0.5 and scoring 0.7 (harness `d755eea7`, #226):
   on an akm with `experimental.memoryEnrichment` it writes with `akm remember`, runs `akm improve memories/<name>` with only reflect,
   and reads the tags proposal; `metadata covers <keyword>` now reads the tags only. It passed 6/8 (8/8 on the old `--enrich` path):
   `enrich-signing-memory` has the tag `artifact-signing` but not "signature", `enrich-ios-certificate-memory` has `code-signing` but
   not "certificate". The date checks all hold (akm sets `observed`, improve keeps it). The comparable 47 cases are 42 against 43:
   memory-inference 21/23, schema-repair 6/8 and session-summary 8/8 unchanged, consolidate-promote 7/8 (8/8). The one miss,
   `prod-consolidate-full-pool`, did not plan `memories/artifact-signing-observation` (8 memories planned against 10); 5 of the 8
   consolidate-promote cases planned a different set. The plan comes from the model through `consolidate-system.md`, which lost its
   paragraph about `updated` in #1834 (item 5). Model calls 89 (74): the improve path adds calls. Side observation, not scored: the
   description akm derives for a remembered memory keeps the body's line break (`The Worker` / `Service rejects …` folds to a newline
   inside `description`); not checked against akm's docs.
4. **Distill: headline inside the spread, but 29 verdicts and 20 outcomes moved.** Good lessons 28/40 (29), wrong lessons 0/16 (1:
   `asset-02` is now skipped), lesson updates right 9/40 (6; 3 to 9 on earlier builds), `new_facts` 14 (12), `knowledge-update` 2/3 as
   before. 19 updates were proposed in both rounds, not the same 19: 7 cases went update to skipped and 6 skipped to update. The
   verdict moves are 19 `lesson-update`, 6 `over-claim`, 3 `lesson-worthy`, 1 `restates-asset`. The akm changes that reach distill's
   calls are the retry message that tells the writer why the last attempt was refused (0.10.261130) and #1834's date handling; neither
   is shown to cause a given move, and the route moved single-call evals on identical prompts this round (item 6). Mean prompt per call
   1,164.0 tokens (1,168.8) over 212 calls (210), which cannot tell a changed prompt from a changed retry count. Not repeated.
5. **Consolidate: one unsafe retirement proposed (0 last round), not staged; the prompt changed.** 37/40 safe retirements (38), 1 unsafe
   of 80: `overlap-04` was judged `subsumed` and retirement of `b` proposed, with `onlyInRetired` empty although the judge's own reason
   says B replaces A's holiday-pay claim. It waits for a person (staged 20 of 20 safe, 0 unsafe staged). 4 outcomes moved (1 last
   round, 4 the round before). The prompt is shorter by 46.4 tokens per call over the same 188 calls (897.2 to 850.8): #1834 removed
   the `updated` paragraph from `src/assets/prompts/consolidate-system.md`. `--pool`: 18/19 (17/19), 0 unsafe, staged 13 of 13 safe,
   one move (`duplicate-07` kept to retired safe). Its 4 failed pair judgments of last round are now 0 judged-failed and a warning
   "4 retire decisions deferred because a note is already reserved for retirement in this run": #1706 (0.10.261130) reports same-run
   conflicts as deferrals, so the pair counts changed meaning, not quality.
6. **The lab route was less repeatable than last round.** Reflect, extract, promotion and judge-gate sent prompts of the same mean size
   to the decimal as last round (2,401.7, 3,595.6, 2,767.8 and 3,227.7 tokens per call, same call counts) and still moved: reflect 4
   verdicts (36/40 to 37/40 fixes, controls 35/40 to 34/40), extract 3 verdicts and 1 outcome (36/40 both; planted saved 1/4, 2),
   promotion 2 outcomes (35 of 39 accepted good, 34; bad accepted 4, 5), judge-gate 18 outcomes. Last round reflect, extract, bakeoff,
   promotion and nightly were case for case identical. Judge-gate: good passed 85/91 (84), bad passed 10/97 (7; 7 to 9 in earlier
   rounds, 7 to 8 in the 2026-11-04 repeats), harmful auto-accepted 4/64 as in every run, review share 11.7% (12.8%); of the bad passes
   4 are new (`1ae76bf3`, `rf-unsupported-ask-09`, `rf-description-truncated-06`, `rf-historical-06-4a8a612c`) and 1 left. With
   identical prompts these are route moves; watch bad passed.
7. **Retrieval: books, SkillRet and the two small selection runs are identical; the public library indexes 253 assets (251).** The library
   input digest is unchanged (`library_sha256`, queries and qrels equal). The two extra entries appear in no top-10 list of either round.
   13 keyword and 14 semantic lists of 136 changed (search and curate alike): 10 in each are the same set reordered (first difference at
   rank 2 to 9, mostly 6 to 9) and 3 keyword and 4 semantic swap the rank-10 item. Keyword nDCG@10 0.7676 (0.7668), MRR 0.9307 (0.9290);
   semantic nDCG@10 0.8223 both, p@5 0.6059 (0.6079). The selection-split runs (built from the same library, 253 against 251 assets
   too) move the same way: filter 34 keyword and 25 semantic of 505 lists, prefer 40 and 46, nDCG within 0.001. Which two files are
   new was not identified; akm's indexing walk changed in this range (0.10.261130 and 0.10.261131: assets listed through the adapters,
   off-case and symlinked spellings counted), and a larger corpus changes keyword statistics, which fits the reorders, but neither is
   shown. Books (51 queries x 4), `selection` filter and prefer (28 x 4 each, 36 assets) and SkillRet (4,392 queries, every field but
   timing): 0 lists differ. The "could not tell how `akm` spells the agent projection of search" warning of last round is gone.
8. **The three new judge evals match the 2026-11-04 baseline** (`reports/judge-baseline-2026-11-04`, same model, same default sets,
   eval and scoring 0.1, identical case digests and identical mean prompt tokens: 767.5, 1,221.7, 1,085.1; that baseline ran akm main
   `cc4872fe8`, 0.10.261105, three repeats). lesson-judge: new good passed 17/19 (17 in every repeat), new bad passed 1/70
   (`hand-status-01-b`, dated-status; 0), update good passed 7/21 (8 to 11), update bad passed 1/68 (1 to 3); 3 cases differ from all
   three repeats. pair-judge: safe retirements found 50/54 (50 to 52), unsafe 3/72 (2 to 3), relation right 84/92 (86 to 87); 1 case
   differs from all three (`supersedes-09` retire to keep). drain-judge: good accepted 45/45 (45), bad accepted 10/139 (9 to 10; stale
   7, ephemeral 3); 3 cases differ from all three. The judge-gate run compares the same way (good passed 85, repeats 82 to 84; bad
   passed 10, repeats 7 to 8; 9 cases differ from all three). Every value is within or one case outside the three-repeat range, with
   identical prompts, so none is read as an akm change.
9. **Contract smoke failed bakeoff's `enrich-checkpoint-memory` before the round; that is the smoke script, not akm.** The stub answers
   only the old `--enrich` prompt ("memory tagger") and akm 0.10.261135 sends the improve-enrichment prompts instead; a real-model run of
   two enrich cases worked (1/2 passed, the miss is item 3's `signature`). The smoke also skipped `lesson-judge` and `pair-judge`
   ("needs `akm judge`"), which ran fine in the round.

## Headline table

The baseline is the 0.10.261112-beta round, except the three judge evals (the 2026-11-04 judge baseline, min to max of three repeats).

| eval | headline | 0.10.261112-beta | 0.10.261135 | verdict |
|---|---|---:|---:|---|
| reflect | correct fixes (controls) | 36/40 (35/40) | 37/40 (34/40) | none |
| distill | good lessons (wrong lessons) | 29/40 (1/16) | 28/40 (0/16) | none |
| distill | lesson updates right | 6/40 | 9/40 | none (inside 3 to 9; 29 verdicts moved, item 4) |
| distill | `knowledge-update` right | 2/3 | 2/3 | none |
| extract | useful memories (planted saved) | 36/40 (2/4) | 36/40 (1/4) | none |
| judge-gate | good revisions passed (bad passed) | 84/91 (7/97) | 85/91 (10/97) | none (watch bad passed; harmful auto-accepted 4/64 both) |
| bakeoff | cases passed | 51/55 (collection 0.4, scoring 0.5) | 48/55 (0.5, 0.7) | not comparable as a total |
| bakeoff | the 47 cases outside `remember-enrich` | 43/47 | 42/47 | none (one consolidate-promote case) |
| bakeoff | `remember-enrich` | 8/8 (`--enrich`) | 6/8 (improve enrichment) | not comparable |
| bakeoff | session-summary cases passed | 8/8 | 8/8 | none |
| consolidate | safe retirements found (unsafe) | 38/40 (0) | 37/40 (1, not staged) | none (watch: first unsafe proposal) |
| consolidate `--pool` | safe retirements found (unsafe) | 17/19 (0) | 18/19 (0) | none |
| promotion | accepted proposals that were good | 34/39 | 35/39 | none |
| nightly | items handled right (harm), scoring 0.5 | 31/35 (0) | 32/35 (0) | none (26/35, 6 harmed as collected with scoring 0.4: the `updated` stamp, item 1) |
| retrieval, books | semantic / keyword nDCG@10 | 0.9129 / 0.8382 | 0.9129 / 0.8382 | none (lists identical) |
| retrieval, library | semantic / keyword nDCG@10 | 0.8223 / 0.7668 | 0.8223 / 0.7676 | none (253 assets against 251; 14 / 13 lists moved, item 7) |
| skillret | keyword / semantic NDCG@10 | 50.49 / 57.79 | 50.49 / 57.79 | none (identical) |
| selection, filter / prefer | 76 metric keys per run | | identical | none (lists identical) |
| selection-split, filter / prefer | keyword nDCG@10 | 0.2391 / 0.7621 | 0.2393 / 0.7629 | none (lists moved with the library's two extra assets) |
| agent-ab | pass rate, akm / control | 6/18 / 1/18 | 11/18 / 1/18 | not like-for-like (plugin 0.10.261141; inside 6 to 13) |
| lesson-judge | update good passed (bad passed, new / update) | 8 to 11 of 21 (0 / 1 to 3) | 7/21 (1/70 / 1/68) | none |
| pair-judge | safe retirements found (unsafe) | 50 to 52 of 54 (2 to 3 of 72) | 50/54 (3/72) | none |
| drain-judge | good accepted (bad accepted) | 45/45 (9 to 10 of 139) | 45/45 (10/139) | none |

Judge-gate's figure is good revisions passed over good revisions; promotion's is good accepted over all accepted. Both nightly columns
are the rescored runs (nightly scoring 0.5); the 0.10.261112-beta run scores the same as published.

## Harness changes since the 0.10.261112-beta round

`git log 0861517..11719bc0` is 24 commits (18 without merges). Those that reach a measurement:

| change | evals | like-for-like? |
|---|---|---|
| bakeoff collection 0.4 -> 0.5, scoring 0.5 -> 0.7 (#226): `remember-enrich` through improve's memory enrichment; akm sets `observed`; two keywords respelled | bakeoff | No for `remember-enrich` (8 cases); the other 47 cases compare as before |
| promotion writes proposals into `bundle_id` where akm's migration 031 renamed `stash_dir` (#224), no version change | promotion | Yes (measured equal by the harness on 0.10.261131 and the #1746 branch) |
| replacement forms chosen by the akm under test (`30cfcfdf`): `improve --timeout` for `--timeout-ms`, no `--require-engines`, `doctor judge` for `judge` | nightly, judge-gate, the judge evals, others | Yes (version-gated spelling of the same behaviour, by MEASUREMENT_CHANGELOG's rule) |
| agent arm seed sets `improve.enabled false` (`89405ec0`) and akm's `paths` only on 0.11 (`912f7575`); `RELEASE_PLUGINS` maps 0.10.261135 to plugin 0.10.261141 | agent-ab | No (new plugin, new seed) |
| `AKM_CONFIG_FILE` and an `akm.json` beside `config.json`; listings read `results` before `hits`/`items` (`64436343`, `15cc1625`) | retrieval, skillret, Harbor arms | Yes (0.10 reads `config.json` as before and prints `hits`/`items`) |
| memory-maintenance, memory-utility, ratification, cli-ratification removed | not in this round | n/a |
| nightly scoring 0.4 -> 0.5 (this branch): the reflect checks read nightly's `AKM_KEYS` (`type`, `updated`, `generated`, `verified`) as no change, so akm's `updated` stamp on a write (akm#1834) is not an extra change; reflect's own scoring (0.4) unchanged | nightly | Yes, after rescoring: both nightly runs rescored with scoring 0.5 and compared as rescored (item 1); the 0.10.261112-beta run scores the same |

## What changed in akm, eval-visible

From `CHANGELOG.md` sections 0.10.261113 to 0.10.261135 and the commits between the tags.

| change | what an eval could see |
|---|---|
| akm sets `updated` on every create and update, and `observed` on a new memory; the consolidate prompt loses its `updated` paragraph (#1834, 0.10.261134) | nightly: 6 correct fixes scored as harm with scoring 0.4, fixed in scoring 0.5 (item 1); consolidate prompt 46 tokens shorter per call (item 5); bakeoff's date checks hold |
| `experimental.memoryEnrichment`: improve proposes a memory's tags, judged by `memory.tags`; replaces `remember --enrich` (#1833, #1836, #1837, 0.10.261134) | bakeoff `remember-enrich` 6/8 on the new path |
| consolidate reports same-run retirement conflicts as deferrals; failed pair judgments keep a reason (#1706, 0.10.261130; 0.10.261127) | `--pool`: 4 failed pairs become 4 deferrals with a warning |
| reflect and distill retries tell the model why the last attempt was refused (0.10.261130) | distill and reflect retries; not shown to move a case |
| reflect quality rejections counted as rejected, not failed (0.10.261127) | nightly, reflect: no scored change |
| indexing and listing through the adapters; memories, lessons and knowledge counted as akm lists them (0.10.261130, 0.10.261131) | library and selection-split: 253 assets against 251 (item 7) |
| `akm doctor` replaces `health`, `info`, `judge` (0.10.261119); deprecation notices (0.10.261122) | the harness uses the replacement forms; no score affected |
| curate reranker removed (`30dbb2dfb`), reads never build the index (0.10.261122) | curate lists equal search lists in every retrieval run, as before |

## Move counts

Cases whose headline key changed against the 0.10.261112-beta run.

| eval (cases) | moved | last round |
|---|---:|---|
| reflect (80), correct / outcome | 4 / 3 | 0 |
| distill (99), verdict / outcome | 29 / 20 | 19 / 15 on 96 cases (a writer change) |
| extract (64), correct / outcome | 3 / 1 | 0 |
| judge-gate (188) | 18 | 12 |
| bakeoff (55), correct / outcome | 3 / 0 | 0 |
| consolidate (80), outcome / safe | 4 / 4 | 1 / 1 |
| consolidate `--pool` (47) | 1 | 1 |
| promotion (80) | 2 | 0 |
| nightly (35), ok / harm, both rescored (scoring 0.5) | 1 / 0 (as collected: 7 / 6, 6 are `updated`) | 0 |
| retrieval books (51 x 4) | 0 | 16 semantic, 12 keyword (#1481) |
| retrieval library (136 x 4) | 13 keyword, 14 semantic | 0 |
| selection, filter and prefer (28 x 4 each) | 0 | 0 |
| selection-split filter / prefer (505 x 4 each) | 34 / 40 keyword, 25 / 46 semantic | 0 |
| SkillRet (4,392) | 0 | 0 |

## Wall times

From each summary's `wall_seconds`.

| eval | 0.10.261112-beta | 0.10.261135 |
|---|---:|---:|
| reflect | 311 s | 300 s |
| distill | 748 s | 739 s |
| extract | 426 s | 404 s |
| judge-gate | 383 s | 321 s |
| bakeoff | 263 s | 301 s (89 model calls against 74) |
| consolidate | 416 s | 464 s |
| consolidate `--pool` | 455 s | 513 s |
| promotion | 176 s | 152 s |
| nightly | 127 s | 114 s |
| retrieval, books / library | 116 s / 341 s | 118 s / 318 s |
| skillret | 2,472 s | 2,093 s (semantic index built cold, 9.2 min) |
| agent-ab | 820 s | 1,020 s (control: one 600 s timeout, one 418 s trial) |
| selection / selection-split, filter | 73 s / 1,120 s | 63 s / 1,208 s |
| selection / selection-split, prefer | 59 s / 1,269 s | 63 s / 1,342 s |
| lesson-judge / pair-judge / drain-judge | 152 to 163 s / 90 to 95 s / 266 to 270 s (2026-11-04) | 148 s / 86 s / 271 s |

The round ran from 2026-11-28 03:28 UTC to 06:16 UTC. Host load was not controlled.

## Runs

| eval | folder |
|---|---|
| reflect | [2026-11-28-0.10.261135-35b-semantic-full-20261128](reflect/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| distill | [2026-11-28-0.10.261135-35b-semantic-full-20261128](distill/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| extract | [2026-11-28-0.10.261135-35b-semantic-full-20261128](extract/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| judge-gate | [2026-11-28-0.10.261135-35b-semantic-full-20261128](judge-gate/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| bakeoff (0.5, scoring 0.7) | [2026-11-28-0.10.261135-35b-semantic-full-20261128](bakeoff/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| consolidate | [2026-11-28-0.10.261135-35b-semantic-full-20261128](consolidate/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| consolidate `--pool` | [2026-11-28-0.10.261135-35b-semantic-pool-20261128](consolidate/2026-11-28-0.10.261135-35b-semantic-pool-20261128) |
| promotion | [2026-11-28-0.10.261135-35b-semantic-full-20261128](promotion/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| nightly, as collected (scoring 0.4) | [2026-11-28-0.10.261135-35b-semantic-full-20261128](nightly/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| nightly, rescored (scoring 0.5) | [2026-11-28-0.10.261135-35b-semantic-full-20261128-rescored](nightly/2026-11-28-0.10.261135-35b-semantic-full-20261128-rescored) |
| nightly, 0.10.261112-beta rescored (comparison column) | [2026-11-08-0.10.261112-beta-35b-semantic-full-20261112-rescored](../0.10.261112-beta/nightly/2026-11-08-0.10.261112-beta-35b-semantic-full-20261112-rescored) |
| skillret | [2026-11-28-0.10.261135-35b-semantic-full-20261128](skillret/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| agent-ab | [2026-11-28-0.10.261135-35b-semantic-full-20261128](agent-ab/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| retrieval books | [2026-11-28-0.10.261135-35b-semantic-full-20261128-books](retrieval/2026-11-28-0.10.261135-35b-semantic-full-20261128-books) |
| retrieval library | [2026-11-28-0.10.261135-35b-semantic-full-20261128-library](retrieval/2026-11-28-0.10.261135-35b-semantic-full-20261128-library) |
| selection, filter | [2026-11-28-0.10.261135-selection-filter-semantic-20261128](retrieval/2026-11-28-0.10.261135-selection-filter-semantic-20261128) |
| selection, prefer | [2026-11-28-0.10.261135-selection-prefer-semantic-20261128](retrieval/2026-11-28-0.10.261135-selection-prefer-semantic-20261128) |
| selection-split, filter | [2026-11-28-0.10.261135-selection-split-filter-semantic-20261128](retrieval/2026-11-28-0.10.261135-selection-split-filter-semantic-20261128) |
| selection-split, prefer | [2026-11-28-0.10.261135-selection-split-prefer-semantic-20261128](retrieval/2026-11-28-0.10.261135-selection-split-prefer-semantic-20261128) |
| lesson-judge | [2026-11-28-0.10.261135-35b-semantic-full-20261128](lesson-judge/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| pair-judge | [2026-11-28-0.10.261135-35b-semantic-full-20261128](pair-judge/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| drain-judge | [2026-11-28-0.10.261135-35b-semantic-full-20261128](drain-judge/2026-11-28-0.10.261135-35b-semantic-full-20261128) |
| baseline round | [0.10.261112-beta](../0.10.261112-beta/) |
| judge baseline | [judge-baseline-2026-11-04](../judge-baseline-2026-11-04/) |

The four selection runs hold the public selection sets. They ran with `--cases` and so were written as custom-corpus runs (with an `-own`
suffix, under the ignored `private/`); they are published under `retrieval/` without the suffix, as last round's were. The pre-round
two-case bakeoff check (`smoke-enrich`) is not part of the round and is not published.

## Environment

- `akm-cli@0.10.261135` (stable) installed under Node 24 and selected by `PATH`; the script checked `akm --version` before the first
  eval. Sandboxes, `TMPDIR`, logs and the selection split were outside the repository.
- The library, books and selection semantic indexes were built new for this akm ("a new index"); SkillRet's semantic index was built
  cold (9.2 min).
- Agent-ab used plugin akm-opencode 0.10.261141 (this branch's `RELEASE_PLUGINS` line, with a MEASUREMENT_CHANGELOG line), with no
  committed lockfile for the CLI or the plugin (`akm_install.locked` false), so the dependency tree was resolved fresh; the setup observed
  akm 0.10.261135 and semantic search in the task image.
- Contract smoke before the round: 8 run, 7 reached their outcomes, 7 skipped, bakeoff failed on the stub's old `--enrich` prompt
  (item 9). A real-model run of two `remember-enrich` cases worked.
- The selection summaries' absolute paths were shortened to repository-relative ones before publishing (the selection-split's to
  `selection-split/library/...`, as last round); nothing else in them was edited.

## Checks

Model and `akm_version` were read from every summary at the end: the model-driven ones record `fast/qwen3.6-35b-a3b` (agent-ab
`openai/fast/qwen3.6-35b-a3b`) and `akm_version` 0.10.261135, all `complete`, 0 errored. The nightly fix has a test that reproduces the
case (a correct drain fix with akm's `updated` stamp is right and not harm; it fails without the fix); `bun test evals/nightly
evals/reflect` 305 pass, 14 skip. `scripts/check` (run without the worktree's `.env` and `models.json`): typecheck and the Python suite
(71) pass, `bun test` 3,456 pass, 46 skip, 0 fail. The subnet-refusal test that failed on this host last round now passes: it was made
hermetic in `1a4fdcb3`. `bun run test:site` 42 pass, `bun run build:site` 351 runs (the four selection runs are excluded as custom-corpus
runs, as last round's were), Playwright 20 of 20 with `LEDGER_PORT=4174`. Privacy scan of every published file: no lab host, login name,
home path of the host, private address of the host or key (the corpus text of the extract, reflect and nightly samples and the SkillRet
dataset's queries contain example paths and addresses of made-up machines, as in every earlier round; the SkillRet matches are the same
as last round's).

## Caveats

- One run per eval. Every model-driven figure is one observation, and the route moved verdicts on identical prompts this round (item 6).
- Nightly's as-collected 26/35 and 6 harmed (scoring 0.4) are not a quality reading; read the rescored run (scoring 0.5). The rescore
  reads the stored rows again and calls no model.
- Bakeoff's total and `remember-enrich` are not comparable with any earlier round; agent-ab is not like-for-like (plugin and seed).
- The two assets the library gained were not identified, and the cause of the reordered tails is not shown.
- The judge baseline is three repeats on akm 0.10.261105, three weeks older; the prompts are identical, so it is a spread for the route,
  not for akm.
- Wall times depend on host load, which was not controlled.
