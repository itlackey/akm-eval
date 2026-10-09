# consolidate

Does consolidate retire only notes whose every claim the replacement keeps?

`akm improve` runs consolidate on your memories. Its pair pass finds two notes that say nearly the same thing, has a model list the claims each one holds that the other lacks, and proposes retiring one of them. A note is safe to retire when it holds no claim that the other lacks. A retirement that loses a claim loses knowledge, and that is the failure this eval counts. It gives consolidate 60 pairs of notes whose right outcome is known by construction, and counts the retirements it proposes that lose a claim.

The model under test is consolidate's engine. The pair prompt, the rule and the proposals are akm's: the eval runs `akm improve --strategy consolidate` and reads the retire proposals it makes. It is written for akm 0.9.26, whose pair judge lists the claims each note holds alone and never retires a note that has one. Earlier releases have a pair pass with another rule and are not tested. akm is on `PATH`, or named in `AKM_BIN`. The eval records the akm version it used.

## How consolidate pairs notes

Consolidate has two passes. The eval is about the pair pass. The other proposes promoting memories to knowledge, and its proposals are ignored here (see `../promotion/README.md` for what happens to them).

- The pair pass reads memories, lessons and flat knowledge notes. The eval uses memories, the type consolidate works on.
- It does not compare every pair. For each note it takes the nearest neighbours by embedding, at most 5, and keeps those with a cosine of 0.93 or more. The floor is 0.95 for an older note that it has not judged before. A note less than a week old, by git or by file time, gets 0.93, and the eval's notes are 1 to 3 days old.
- Only those pairs reach the judge. A pair below the floor is kept whole, so notes that share no subject are never retired. That is the right outcome, and the eval counts it as a keep.
- The judge lists what each note holds alone, then labels the pair `duplicate`, `subsumed`, `supersedes`, `contradicts`, `overlap` or `unrelated`. akm retires a note only for the first three labels, and only when the judge listed nothing that note holds alone.
- It proposes the retirement, and a person accepts it. akm stages a duplicate with no claim of its own on either side, after a second look, and a triage run accepts a staged proposal with no one looking.

Pairing needs embeddings. The eval turns semantic search on (`semanticSearchMode: auto`) and sets akm's deterministic embedder (`AKM_EMBED_DETERMINISTIC=1`) in the sandbox. That embedder hashes words. It needs no embedding model and no download, it pairs the same notes on every run, and `src/lib.test.ts` can compute which pairs it will pair. It is akm's switch for reproducible benchmarks, not what a real bundle uses. A real embedding model gives other cosines, so a pair that clears the floor here may not clear it there.

## Run

```
evals/consolidate/run --corpus public
evals/consolidate/run --corpus private
evals/consolidate/run --corpus all
```

- `--corpus` picks the assets. `all` runs both and prints the two results side by side, never as one number.
- `--limit N` runs N cases, taking the first case of each relation in turn. Use it to check a setup.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. See "Repeat a run" in the root README.
- `--strategy NAME` runs the akm strategy NAME in place of `consolidate`. It can be a strategy that `--config-patch` defines, or one akm ships. `summary.json` records it as `strategy`.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. `summary.json` records `config_patch`: the path and its SHA-256.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.
- `--pool` runs the whole pool in one sandbox instead of the cases. See the next section.

The private run reads `private/consolidate/assets/`. Make it first with `./generate-assets --only consolidate`. The run stops with an error when it is missing.

Each run writes two files to `evals/consolidate/results/<UTC date>-<label>/`, or to `private/consolidate/results/` for the private corpus:

- `summary.json`: the metrics, how many cases ran, were scored, errored and paired, the model name and the names the endpoint reported for its calls (a gateway may serve one name from several providers), the akm version and build (`akm_bin`, `akm_build`), the corpus and the git commit.
- `samples.jsonl`: one line per case, with the relation, the sides that were safe, whether akm paired the notes, the label its judge gave, the side it proposed to retire, whether that side was safe, whether akm staged it, the judge's reason, the claims it found only in the retired note and only in the kept one (`only_in_retired`, `only_in_successor`; null for a kept pair and on an akm build that does not record them), the time it took and, when the endpoint rate limited the case, how many times it was tried again.

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

`summary.json` has `mode: "pool"` and the keys of the per-case summary where they apply. `n_cases`, `n_run` and `n_scored` count the one pool run, `n_errored` is 1 when the run failed (a failed akm command, a timeout, or a result without a pair pass), and `n_paired` is the pairs akm's judge looked at. `metrics`:

| Metric | Meaning |
|---|---|
| `unsafe` | `n` of `of` retirements akm proposed lost a claim; `staged` is how many akm staged for unattended retirement. |
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

`samples.jsonl` has one line per cluster: its kind, the notes akm may retire, the worst verdict (`kept` when akm proposed nothing), and each retirement with the judge's label, reason and claim lists. `improve.json` is akm's own result, for reading what the summary leaves out.

Notes on reading it:

- akm retires one note per chain in a run: a note used as a successor cannot be retired in the same run, and a note already retired cannot be a successor. So a triple of duplicates ends the run with one retirement and two failed judgments, and the next night takes the rest. That is why `recall` counts clusters.
- The pool is small enough for one run to be noise: one cluster is 5 points of the recall. Repeat a run before you trust a gap.
- The notes are 1 to 3 days old, so akm pairs them at its floor of 0.93 for new material. A pool of old notes with no ledger row needs 0.95, which this one does not test.
- Time: the pair pass makes about one judge call per pair plus a second look at each duplicate it stages, and the promote pass about 7 chunks. See the smoke result below for what that took.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used: the model under test is consolidate's engine. No embedding model is needed.

- It must follow an instruction to return one JSON object. akm asks for JSON that fits a schema, retries without the schema if the endpoint refuses it, and retries once more when it cannot read the reply. A pair that still gets no verdict counts as errored.
- A call is about 1k tokens, so any context length will do.
- A hosted endpoint may rate limit. When akm reports a 429, the eval waits 10 seconds and tries the case again, doubling the wait each time, up to four more times. If the endpoint is still limiting, the run stops and says so.
- akm asks the server to turn thinking off. A model that thinks anyway is slow. If yours does, turn it off in the server.
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
- `private/consolidate/assets/cases.jsonl`: the same cases with the made-up names, the names of tools, hosts, ports, numbers and versions rewritten from a seed by `lib/rewrite`. Relations, safe sides, which note is older and ids are kept. Each case's notes, names, claims and reasons are rewritten with one mapping, so a name changes the same way in all of them, and the claims may not add names to it. `generate` then checks that each deciding claim is still in the note it belongs to and in no other, and writes nothing if one is not. The mapping is in `private/consolidate/map.json`. A made-up command name that the notes write only in lowercase (such as `jobq` and `plm`) is left as it is, because the rewrite finds names by their capital letters or by its list of well-known tools. It is made by `generate` and never published.

## Read the results

| Metric | Meaning |
|---|---|
| `unsafe` | `n` of `of` cases in which consolidate proposed retiring a note that held a claim the other lacked. `of` counts the cases that ran without an error. `staged` is how many of the unsafe ones akm staged: a triage run accepts those with no one looking. This is the number to watch. |
| `precision` | Of the retirements proposed, the share that were safe: `safe` of `retired`. |
| `recall` | Of the cases that have a safe note to retire (duplicate, subsumed and supersedes), the share in which consolidate proposed retiring a safe one. |
| `classes` | For each relation: `n` cases, `error`, `paired` (akm took the notes as a pair and had its judge look at them), `judged_as` (the labels the judge gave), `retired_safe`, `retired_unsafe` and `kept`. |

For scale: a consolidate that retires the older note of every pair it pairs has 30 unsafe retirements of 60, a precision of 25/55 and a recall of 25/30. One that retires nothing has none, and a recall of 0. A useful consolidate has no unsafe retirements and retires most of the safe ones.

The eval counts a retire proposal as a retirement of the note it names, whether or not anyone has accepted it. A case that errored is left out of the counts. An error is a failed akm command, a timeout, or a pair that akm paired and its judge gave no verdict for.

A pair akm never paired is a keep. In the public set five of the ten unrelated pairs are on different subjects. akm does not pair them, so `paired` for `unrelated` is 5 at most, and keeping them is the right outcome. Keeping a pair that has a safe note costs recall and nothing else.

Read `judged_as` next to the outcome. akm retires a note only when its judge listed no claim that the note holds alone. A pair labelled `supersedes` or `subsumed` and kept was one where the judge listed a claim for the note, and that costs recall, not safety. An unsafe retirement is a claim the judge missed.

The set is small. One case is 1.7 points of 60, and 10 points of any one relation. Read changes of a case or two as noise, and rerun before you trust a gap.

The notes are short, about 100 words. Real notes run longer and messier, and a judge has more to miss in them, so a clean score here does not promise one on your bundle.

A model may have seen the public cases in training. A much better public score than private score points to that. Run the private corpus on a local model, or on an API that does not train on your data.

## Notes

- The shipped judge changes with akm. Compare results only between runs with the same akm version.
- `samples.jsonl` has no `onlyInA`, `onlyInB` or `redundant` from the pair judge. akm does not print them: a retire proposal keeps the judge's label and reason, the retired and kept refs and the confidence, and `akm improve` reports only label counts. To see the claim lists, replay the judge on the pair; the eval does not.
- akm's errors name the URL it called. The eval writes `<MODEL_BASE_URL>` in its place, in `samples.jsonl` and on the console, so results can be shared.
- consolidate's other pass also calls the model for each case, and may propose promoting a memory to knowledge. The eval never reads, accepts or counts them. That does not make them safe: under a triage config with `applyMode: promote` and judgment on, the drain's judgment tier accepts promotions with no one looking. `../promotion/README.md` tests that tier.
- The notes are dated by file time, 3 days and 1 day old, or 2 days each for a pair from one day, because the sandbox bundle is not a git repository. akm shows its judge each note's date, calls the older note A, and retires the older note of a duplicate or a replacement.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
