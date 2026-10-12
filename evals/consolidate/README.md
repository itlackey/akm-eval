# consolidate

Does consolidate retire only notes whose every claim the replacement keeps?

`akm improve` runs consolidate on your memories. Its pair pass finds two notes that say nearly the same thing, has a model list the claims each one holds that the other lacks, and proposes retiring one of them. A note is safe to retire when it holds no claim that the other lacks. A retirement that loses a claim loses knowledge, and that is the failure this eval counts. It gives consolidate 60 pairs of notes whose right outcome is known by construction, and counts the retirements it proposes that lose a claim.

The model under test is consolidate's engine. The pair prompt, the rule and the proposals are akm's: the eval runs `akm improve --strategy consolidate` and reads the retire proposals it makes. It is written for akm 0.9.26, whose pair judge lists the claims each note holds alone and never retires a note that has one. Earlier releases have a pair pass with another rule and are not tested. akm is on `PATH`, or named in `AKM_BIN`. The eval records the akm version it used. What this README says of akm's behaviour is 0.9.26's. The one figure it quotes from another release is the time of a pool run, which was measured with akm 0.9.30 (see "Run on a whole pool") and has not been repeated on 0.9.26.

## How consolidate pairs notes

Consolidate has two passes. The eval is about the pair pass. The other proposes promoting memories to knowledge, and its proposals are ignored here (see `../promotion/README.md` for what happens to them).

- The pair pass reads memories, lessons and flat knowledge notes. The eval uses memories, the type consolidate works on.
- It does not compare every pair. For each note it takes the nearest neighbours by embedding, at most 5, and keeps those with a cosine of 0.93 or more. The floor is 0.95 for an older note that it has not judged before. A note less than a week old, by git or by file time, gets 0.93, and the eval's notes are 1 to 3 days old.
- Only those pairs reach the judge. A pair below the floor is kept whole, so notes that share no subject are never retired. That is the right outcome, and the eval counts it as a keep.
- The judge lists what each note holds alone, then labels the pair `duplicate`, `subsumed`, `supersedes`, `contradicts`, `overlap` or `unrelated`. akm retires a note only for the first three labels, and only when the judge listed nothing that note holds alone.
- It proposes the retirement, and a person accepts it. akm stages a duplicate with no claim of its own on either side, after a second look, and a triage run accepts a staged proposal with no one looking.

Pairing needs embeddings. The eval turns semantic search on (`semanticSearchMode: auto`) and embeds the notes one of two ways, chosen with `--embedder`:

- `deterministic` (the default) sets akm's deterministic embedder (`AKM_EMBED_DETERMINISTIC=1`) in the sandbox. That embedder hashes words. It needs no embedding model and no download, it pairs the same notes on every run, and `src/lib.test.ts` can compute which pairs it will pair. It is akm's switch for reproducible benchmarks, not what a real bundle uses. A real embedding model gives other cosines, so a pair that clears the floor here may not clear it there.
- `real` leaves that switch off and sets the config's `embedding` as `semanticConfig` in `lib/akm` does, which retrieval and promotion use: akm's built-in embedder, `Xenova/bge-small-en-v1.5`, with a long wait for a query's embedding. The sandbox keeps the model in the repository's `.cache/`, and the first run downloads it (133 MB). This is the geometry a real bundle has. The cases were made to pair in the hash space, so the real embedder may pair others, or not pair some that the hash one does: `paired` and the retirements can move for that reason alone. Read a `real` run as how consolidate behaves with the production embedder on these notes. It is not comparable with a `deterministic` run, and `summary.json` records which one ran as `embedder`.

## Run

```
evals/consolidate/run --corpus public
evals/consolidate/run --corpus custom                  # the seeded rewrite in private/consolidate/assets
evals/consolidate/run --cases ~/notes/consolidate      # a custom corpus of your own
evals/consolidate/run --corpus all
```

- `--corpus public|custom|all` picks the corpus. `public` is the committed cases. `custom` is a folder of cases with a `corpus.json`: `--cases DIR`, or the default, the rewrite in `private/consolidate/assets`. `all` runs `public` and the default custom corpus and prints the two results side by side, never as one number. See "Corpora" in the root README. `--corpus private` still works for one more release, as `--corpus custom`.
- `--cases DIR` is the folder of a custom corpus (it is `--corpus custom`). The folder holds a `cases.jsonl` in the format of `assets/cases.jsonl` (see `assets/README.md`) and a `corpus.json`. A corpus of your own notes is private: a run sends them only to a model that `models.json` marks `"private": true`.
- `--limit N` runs N cases, taking the first case of each relation in turn. Use it to check a setup.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. See "Repeat a run" in the root README.
- `--embedder deterministic|real` picks how akm embeds the notes to find the pairs it judges: its word-hash embedder (the default) or its built-in model. See "How consolidate pairs notes". It works with `--pool` too.
- `--strategy NAME` runs the akm strategy NAME in place of `consolidate`. It can be a strategy that `--config-patch` defines, or one akm ships. `summary.json` records it as `strategy`.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. `summary.json` records `config_patch`: the path and its SHA-256.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.
- `--pool` runs the whole pool in one sandbox instead of the cases. See the next section.

The default custom corpus reads `private/consolidate/assets/`. Make it first with `./generate-assets --only consolidate`. The run stops with an error when the assets are missing, when `private/consolidate/generated.json` is missing, when the public cases have changed since the assets were made (the `inputs_sha256` in `generated.json` is no longer the digest of `assets/cases.jsonl`), or when the generator has changed since (the `generator_sha256` in `generated.json` is no longer the digest of `src/generate.ts`, `src/inputs.ts`, `src/cases.ts` and `lib/rewrite`, or is missing). The message says to rerun `./generate-assets --only consolidate`.

Each run writes two files to `evals/consolidate/results/<UTC date>-<label>/`, or to `private/consolidate/results/` for a custom corpus:

- `summary.json`: the metrics, how many cases ran, were scored, errored and paired, the model name and the names the endpoint reported for its calls (a gateway may serve one name from several providers), the akm version and build (`akm_bin`, `akm_build`), the corpus and the git commit. It also holds:
  - `status` and `aborted_reason`: `"complete"` and null, or `"aborted"` and the reason, when the run ended in a failure: the endpoint kept rate limiting, the first 5 cases got no verdict, or akm paired none of the notes. The file is written before the run fails, so a run that was cut short does not look like a whole one: `n_run` is below `n_cases` and every count is that of the cases that ran. Take an aborted summary for no result.
  - `embedder`: `deterministic` or `real`. It is also recorded in the manifest as a treatment hint, so the comparison tools read it from there.
  - `corpus`, `corpus_kind`, `corpus_private` and `corpus_folder`: `public` or `custom`, the kind of a custom corpus (`rewrite` or `own`), whether it is private, and the folder of a custom corpus from the repository root (`private/consolidate/assets`) when it is inside the repository, else null (never an absolute path). `scripts/rescore` reads the cases of a custom run from `corpus_folder`. A `--pool` run records `corpus_folder: null`, since its pool is the committed one.
  - `manifest`: what the run was made of, to be compared with another (see "How results stay comparable" in the root README): the collector and scorer versions of `MEASUREMENT.lock`, the digest of every case's input and label, the settings, the engine and which cases were scored.
  - `timeouts`: how many of the errored cases were ones in which the eval killed akm for running past its time limit (2 minutes for `index` and `proposal list`, 30 for `improve`; 30 for `index` with the real embedder, which loads its model). They are counted in `n_errored` too, and a timed-out case has `timed_out: true` in `samples.jsonl`, so a slower akm or model shows up as timeouts and not as unexplained errors.
  - `config`, `engine`: the akm config the eval wrote (with `--config-patch` merged in), with every secret redacted (`$MODEL_API_KEY` is a name and stays) and the endpoint written as `<MODEL_BASE_URL>`; and the settings of the engine it names as the default: `engine`, `model`, `endpoint` (scheme, host, port and path, no credentials), `temperature`, `enableThinking` and `timeoutMs`.
  - `assets_sha256`: one digest over the files the run read, with their paths relative to the assets folder: `cases.jsonl`, or for `--pool` `labels.json` and the notes. Two runs with another digest read other cases.
  - `seed`: the seed the private assets were made from (the one in `generated.json`, else `private/seed`), null for the public ones.
- `samples.jsonl`: one line per case. Beside the verdict, a row holds the raw output of akm that the scorer reads (`pair_pass`, `retire_proposals`, `usage`, `hint`, or for a case that errored the error), so `scripts/rescore` can score the run again without akm (see "Measurement"). A line has the relation, the sides that were safe, whether akm paired the notes, the label its judge gave, the side it proposed to retire, whether that side was safe, whether akm staged it, the judge's reason, the claims it found only in the retired note and only in the kept one (`only_in_retired`, `only_in_successor`; null for a kept pair and on an akm build that does not record them), the time it took and, when the endpoint rate limited the case, how many times it was tried again. A case that timed out has `timed_out: true`.

## Run on a whole pool (`--pool`)

The per-case run gives consolidate one pair at a time. A real night gives it a whole pool: the pair pass finds the pairs among all the notes, the promote pass cuts the pool into chunks, and akm adds a few random notes to the chunks (`consolidate.antiCollapse`, which does nothing for a bundle of two memories or fewer, so it never acts in a case). `--pool` measures that:

```
evals/consolidate/run --pool
evals/consolidate/run --pool --timeout-ms 600000 --label short-budget
evals/consolidate/run --pool --strategy catchup --label catchup
evals/consolidate/run --pool --config-patch antiCollapse-off.json --repeat 3
```

It writes the 80 memories of `assets/pool/` into one sandbox, indexes them, runs a single `akm improve --strategy consolidate --no-sync` and scores the retire proposals against the labels. The strategy is `POOL_STRATEGY` in `src/pool.ts` unless `--strategy` names another; `--config-patch` and `--repeat` work as in the per-case run (`summary.json` records `strategy` and `config_patch`, and a repeat summary spreads the pool metrics). `--pool` reads the public pool only: it refuses `--corpus private`, `--corpus all` and `--limit`. A call that the endpoint rate limits is not tried again; it shows in `calls.failures`.

`--timeout-ms N` is akm's own wall-clock budget for the run (akm's default is 2 hours). A short one makes akm cut the pool to what the budget covers, using `consolidate.p90ChunkSecondsDefault` (30 seconds a chunk unless set), and akm says so in its "cold-start budget" warning. Without it that warning cannot appear.

The pool has 47 clusters, each with a known right outcome (`assets/pool/README.md`): 7 pairs of duplicates, 2 triples of duplicates, 5 subsumed pairs, 5 supersedes pairs, 7 near-duplicates that each hold a claim of their own, 2 contradictions, 3 look-alikes of different things, and 16 notes on their own subject. A retirement is scored against the labels:

- safe: the cluster allows that note to be retired, for the successor akm named;
- wrong successor: the cluster allows the note, but akm kept another note than the allowed ones;
- unsafe: the note holds a claim no other note has, or is a single note. This is the number to watch, as in the per-case run.

`summary.json` has `mode: "pool"` and the keys of the per-case summary where they apply (`embedder`, `config`, `engine`, `manifest`, `assets_sha256` over `labels.json` and the 80 notes, a `seed` that is always null and a `corpus_folder` that is always null). `n_cases`, `n_run` and `n_scored` count the one pool run, `n_errored` is 1 when the run failed (a failed akm command, a timeout, or a result without a pair pass), and `n_paired` is the pairs akm's judge looked at. A failed run has `status: "aborted"`, with the error as `aborted_reason`, and `timeouts` is 1 when the failure was the eval killing akm for running past its time limit (the budget plus 10 minutes). `metrics`:

| Metric | Meaning |
|---|---|
| `unsafe` | `n` of `of` retirements akm proposed lost a claim; `staged` is how many akm staged for unattended retirement. |
| `staged` | `n` retirements akm staged, which a triage run accepts with no one looking, and `safe` of them that were. This is the precision of staging: the retirements nobody reads. |
| `precision` | Of the retirements proposed, the share that were safe: `safe` of `retired`. |
| `recall` | Of the clusters that have a note to retire (19 of 47), the share where akm proposed at least one safe retirement. A cluster counts once, so a triple is hit by one retirement. |
| `wrong_successor` | Retirements of an allowed note for a note outside the allowed ones. |
| `classes` | For each kind of cluster: `clusters`, `with_safe_retirement`, `hit`, `retired_safe`, `retired_unsafe`, `wrong_successor` and `untouched` (clusters akm proposed nothing for). |
| `pairs` | `initiators`, `considered`, `judged` and `failed` pairs, and the labels the judge gave. A judgment fails when the model gives no verdict, and also when akm refuses a retirement because one of its notes already took part in another this run (below). |
| `calls` | Model calls, failures and tokens, from akm's usage report for the whole run: the pair judge, the second look at a staged duplicate and the promote pass. |
| `chunks` | The promote pass: `total` chunks, `failed`, `deferred_memories` and `promote_ops`, which are not scored. |
| `anti_collapse_injected` | N of akm's warning "Anti-collapse: injected N ...", or null when it did not say so (antiCollapse off). |
| `cold_start_budget` | `from`, `to` and `safe_chunks` of akm's "cold-start budget" warning, or null. |
| `warnings` | Every warning akm printed for the consolidation. |

`samples.jsonl` has one line per cluster: its kind, the notes akm may retire, the worst verdict (`kept` when akm proposed nothing), and each retirement with the judge's label, reason and claim lists. Every line also holds `run`, the raw output of the one improve run (the same on each line), and the cluster's own `retire_proposals`, which is what lets `scripts/rescore` score the pool again. `improve.json` is akm's own result, for reading what the summary leaves out.

Notes on reading it:

- akm retires one note per chain in a run: a note used as a successor cannot be retired in the same run, and a note already retired cannot be a successor. So a triple of duplicates ends the run with one retirement and two failed judgments, and the next night takes the rest. That is why `recall` counts clusters.
- The pool is small enough for one run to be noise: one cluster is 5 points of the recall. Repeat a run before you trust a gap.
- The notes are 1 to 3 days old, so akm pairs them at its floor of 0.93 for new material. A pool of old notes with no ledger row needs 0.95, which this one does not test.
- Time and calls: measured once, with akm 0.9.30 and a 27B model on the local gateway, before the engine's temperature and thinking switches were set (see "What it needs from a model") and not on 0.9.26, the release this eval is written for. One run took about 4.5 minutes and 56 model calls (31 pairs judged, 7 promote chunks). The default akm budget is 2 hours, so the run is never cut. A 120 second `--timeout-ms` took 2 minutes: akm's pair pass ran to the end on the budget, so it judged the same pairs and made the same retirements, and by then too little of the budget was left for the promote pass, so akm cut the pool for that pass to 0 memories ("cold-start budget"; nothing was chunked and antiCollapse injected nothing). `consolidate.p90ChunkSecondsDefault` affects the promote pass only, not the pair pass.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used: the model under test is consolidate's engine. With the default `--embedder deterministic` no embedding model is needed. `--embedder real` uses akm's own, which it downloads once (133 MB) into `.cache/`; it runs in the akm process and needs no model service.

- It must follow an instruction to return one JSON object. akm asks for JSON that fits a schema, retries without the schema if the endpoint refuses it, and retries once more when it cannot read the reply. A pair that still gets no verdict counts as errored.
- A call is about 1k tokens, so any context length will do.
- A hosted endpoint may rate limit. When akm reports a 429, the eval waits 10 seconds and tries the case again, doubling the wait each time, up to four more times. If the endpoint is still limiting, the run stops and says so.
- The config sets the engine's `temperature` to 0 and `enableThinking` to false, as distill and extract do, so requests use temperature 0 and ask the server to turn thinking off. Without them akm sends its own default temperature. `summary.json` records both in `engine`. A model that thinks anyway is slow. If yours does, turn it off in the server.
- A case is up to three calls: the pair judge, the second look at a duplicate that is about to be staged, and the other pass's proposal for the memories. On a 27B model a case takes 10 to 25 seconds, and the 60 cases about 15 minutes. The eval runs one case at a time.

To serve a model locally with llama.cpp:

```
llama-server -m ./Qwen3-27B-Q4_K_M.gguf --alias qwen3-27b --port 8080 -c 8192 -np 1 -ngl 99 --jinja
```

and in `.env`:

```
MODEL_BASE_URL=http://localhost:8080/v1
MODEL_API_KEY=
MODEL_NAME=qwen3-27b
```

Each case runs in a temporary folder with its own akm config and the pair as its only bundle, so the eval never reads or writes your akm bundle. The config names one engine, the model under test, as the default engine.

## Assets

- `assets/cases.jsonl`: 60 pairs of fictional memory notes, 10 for each relation, each with the sides that are safe to retire and the claims that decide it. The fields, how the pairs were made and what each relation means are in `assets/README.md`. The cases carry a canary string: do not train on them.
- `assets/pool/`: 80 fictional memories in 47 clusters with their labels, for `--pool`. See `assets/pool/README.md`. There is no private copy of it.
- `private/consolidate/assets/cases.jsonl` (the default custom corpus): the same cases with the made-up names, the names of tools, hosts, ports, numbers and versions rewritten from a seed by `lib/rewrite`. Relations, safe sides, which note is older and ids are kept. Each case's notes, names, claims and reasons are rewritten with one mapping, so a name changes the same way in all of them, and the claims may not add names to it. `generate` then checks that each deciding claim is still in the note it belongs to and in no other, and writes nothing if one is not. It works in `private/consolidate/.new` and moves `assets/` and `map.json` into place only when the checks have passed, so a failed run leaves the previous private set as it was, and never a new map beside old assets. `private/consolidate/generated.json` beside them holds the `seed`, the `inputs_sha256`, the digest of the public `assets/cases.jsonl` the set was made from, and the `generator_sha256`, the digest of the code that made it (`src/generate.ts`, `src/inputs.ts`, `src/cases.ts` and every `.ts` file of `lib/rewrite` except its tests). `run` stops when it is missing, when the public cases have changed since, or when the generator has: a set made by other code is not the set this checkout would make. The mapping is in `private/consolidate/map.json`. A made-up command name that the notes write only in lowercase (such as `jobq` and `plm`) is left as it is, because the rewrite finds names by their capital letters or by its list of well-known tools. It is made by `generate` and never published.

## Read the results

| Metric | Meaning |
|---|---|
| `unsafe` | `n` of `of` cases in which consolidate proposed retiring a note that held a claim the other lacked. `of` counts the cases that ran without an error. `staged` is how many of the unsafe ones akm staged: a triage run accepts those with no one looking. This is the number to watch. |
| `staged` | `n` retirements akm staged, which a triage run accepts with no one looking, and `safe` of them that were. This is the precision of staging: the retirements nobody reads. |
| `precision` | Of the retirements proposed, the share that were safe: `safe` of `retired`. |
| `recall` | Of the cases that have a safe note to retire (duplicate, subsumed and supersedes), the share in which consolidate proposed retiring a safe one. |
| `classes` | For each relation: `n` cases, `error`, `paired` (akm took the notes as a pair and had its judge look at them), `judged_as` (the labels the judge gave), `retired_safe`, `retired_unsafe` and `kept`. |

For scale: a consolidate that retires the older note of every pair it pairs has 30 unsafe retirements of 60, a precision of 25/55 and a recall of 25/30. One that retires nothing has none, and a recall of 0. A useful consolidate has no unsafe retirements and retires most of the safe ones.

The eval counts a retire proposal as a retirement of the note it names, whether or not anyone has accepted it. A case that errored is left out of the counts. An error is a failed akm command, a timeout, or a pair that akm paired and its judge gave no verdict for. `summary.json` counts the timeouts (akm killed for running past the eval's time limit) separately, in `timeouts`, beside `n_errored`, which includes them.

A pair akm never paired is a keep. In the public set five of the ten unrelated pairs are on different subjects. akm does not pair them, so `paired` for `unrelated` is 5 at most, and keeping them is the right outcome. Keeping a pair that has a safe note costs recall and nothing else.

Read `judged_as` next to the outcome. akm retires a note only when its judge listed no claim that the note holds alone. A pair labelled `supersedes` or `subsumed` and kept was one where the judge listed a claim for the note, and that costs recall, not safety. An unsafe retirement is a claim the judge missed.

The set is small. One case is 1.7 points of 60, and 10 points of any one relation. Read changes of a case or two as noise, and rerun before you trust a gap.

The notes are short, about 100 words. Real notes run longer and messier, and a judge has more to miss in them, so a clean score here does not promise one on your bundle.

A model may have seen the public cases in training. A much better public score than custom score points to that. Run the custom corpus on a local model, or on an API that does not train on your data.

## Measurement

The eval is split into a collector and a scorer, as the other evals on the manifest are (see "How results stay comparable" in the root README). `MEASUREMENT.lock` holds the version of each:

- the collector is what runs akm and stores what it printed: `src/collect.ts` (the sandbox, the config, the improve run, the retire proposals and the usage), `src/sandbox.ts`, `lib/akm`, `lib/cli.ts`. A change to it that can change what akm is asked or how it is run is a collector bump.
- the scorer is what turns that raw output and the case's labels into a row and the rows into the metrics: `src/score.ts` for a case, `src/pool-score.ts` for `--pool`, and `src/cases.ts` for the case and its relations. It imports nothing of the collector. A change to a check, a label rule or a metric is a scorer bump, and its commit says whether scores change.

One declaration, `src/measurement.ts`, serves both modes. `scripts/rescore/run evals/consolidate/results/<folder>` scores a stored run again with the scorer as it is now, from `samples.jsonl` alone. A run made with `--pool` is scored again the same way. `golden/` holds raw outputs (`raw.jsonl`, with the cases they were made for in `cases.jsonl`) and the rows the scorer must give for them (`expected.jsonl`), for the per-case run and in `golden/pool/` for the pool: akm answers that did not go well (a model call that failed, a timeout, no output, a retirement that loses a claim) are among them. `bun test` fails when the scorer gives another row. After a change you meant to make, `scripts/measurement/run bump consolidate scorer --reason "..."` and `UPDATE_GOLDEN=1 bun test evals/consolidate/src/golden.test.ts` write the new version and the new expected rows, and the diff of `expected.jsonl` says what the change did to the scores.

## Notes

- The shipped judge changes with akm. Compare results only between runs with the same akm version.
- `samples.jsonl` holds the judge's claim lists for a pair that akm retired: `only_in_retired` and `only_in_successor`, which the eval reads from the retire proposal's `onlyInRetired` and `onlyInSuccessor`. They are null for a kept pair, because akm records the lists only in a retire proposal (`akm improve` reports only label counts), and null on an akm build whose proposal does not carry them. The judge's own `onlyInA`, `onlyInB` and `redundant` are not kept. To see the claim lists of a pair that was kept, replay the judge on the pair; the eval does not.
- akm's errors name the URL it called. The eval writes `<MODEL_BASE_URL>` in its place, in `samples.jsonl` and on the console, so results can be shared.
- consolidate's other pass also calls the model for each case, and may propose promoting a memory to knowledge. The eval never reads, accepts or counts them. That does not make them safe: under a triage config with `applyMode: promote` and judgment on, the drain's judgment tier accepts promotions with no one looking. `../promotion/README.md` tests that tier.
- The notes are dated by file time, 3 days and 1 day old, or 2 days each for a pair from one day, because the sandbox bundle is not a git repository. akm shows its judge each note's date, calls the older note A, and retires the older note of a duplicate or a replacement.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
