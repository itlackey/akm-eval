# reflect

Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims?

`akm improve` has reflect revise an asset after negative feedback. Since akm 0.9.21 it acts only on assets that have negative feedback. Since 0.9.25-alpha.3 it edits frontmatter only: the model proposes a `description`, a `when_to_use` and a title, and akm applies them as a patch. akm keeps the body byte for byte, and adds a title only as a `# heading` when the body has none. This eval gives reflect 50 notes whose right result is known and counts what it gets right.

The model under test is reflect's engine. The prompt, the patch and the proposal queue are akm's own: the eval drives the installed akm CLI. It needs akm 0.9.25-alpha.3 or later (on `PATH`, or named in `AKM_BIN`) and records the akm version it used. It was run with akm 0.9.26.

## Run

```
evals/reflect/run --corpus public
evals/reflect/run --corpus custom
evals/reflect/run --cases ~/notes/reflect
evals/reflect/run --corpus all
```

- `--corpus` picks the assets: `public`, `custom`, or `all`, which runs both and prints the two results side by side, never as one number. `custom` is the seeded rewrite in `private/reflect/assets`, or the folder `--cases DIR` names (`--cases` alone is `--corpus custom`). See "Corpora" in the root README and "Run your own set" below.
- `--limit N` runs the first N cases. The first ten hold each class once and the first five mix defects and controls. Use it to check a setup.
- `--repeat N` runs the corpus N times into `<label>-r1` to `<label>-rN` folders and writes the `min`, `max` and `mean` of each metric to `<UTC date>-<label>-repeat-summary.json` beside them. See "Repeat a run" in the root README.
- `--retrieval-queries` records the retrieval eval's labelled queries for each note (grade 2 or 3 in `evals/retrieval/assets/qrels.jsonl`, at most 5, best first; 46 of the 50 public cases have some) as searches that found it, so the retrieval check of akm's reflect has queries to grade. The queries are those of the public notes, matched to a corpus by public ref: a rewrite gets them for the same cases as the public corpus, with the words its own `private/reflect/map.json` renamed written in them, as in its notes, and the retrieval eval's private assets are not read. The run stops before anything runs, naming the file and saying to run `./generate-assets --only reflect`, when `map.json` or a file of the retrieval eval is missing. It does not apply to an own corpus. The searches are part of what each note is given, so the `input_sha256` of those notes in the manifest covers them: a run with the flag and a run without it, or two runs made with other `queries.jsonl` or `qrels.jsonl`, differ in the input of the notes whose searches differ, and `scripts/compare` leaves those out or refuses the pair (see "How results stay comparable" in the root README). See "Measure the gates of akm's reflect".
- `--strategy NAME` runs the akm strategy NAME in place of `reflect-only`. It can be a strategy that `--config-patch` defines, or one akm ships. `summary.json` records it as `strategy`.
- `--config-patch FILE` deep-merges the JSON file into the config the eval writes: objects merge and arrays replace, as in akm's own config merge. A relative FILE is from the repository root. `summary.json` records `config_patch`: the path and its SHA-256.
- `--label NAME` names the results folder, `<UTC date>-<label>`. The default is the model name.

The default custom run reads `private/reflect/assets/`. Make it first with `./generate-assets --only reflect`. The run stops with an error when it is missing, and the error says to make it. `generate` writes `generated.json` beside the assets, with the `seed`.

Each run writes two files to `evals/reflect/results/<UTC date>-<label>/`, or to `private/reflect/results/` for a custom corpus:

- `summary.json`: the metrics, how many cases ran, were scored and errored, how many had retrieval queries recorded (`retrieval_queries`, null without `--retrieval-queries`), the model name, the model names that answered, the akm version and build (`akm_bin`, `akm_build`), the corpus and the git commit. It also says what the run was made of, and whether it finished:
  - `config`: the akm config the eval wrote, strategy and `--config-patch` included, with the value of every credential field replaced by `<redacted>` (`credentialField` in `lib/provenance.ts` decides by the name: `apiKey`, `api_key`, `token`, `secret`, `password`, `authorization` and the like) and the model's endpoint written as `<MODEL_BASE_URL>`.
  - `engine`: the settings of the engine in that config: its name, `model`, the `endpoint` (the host and port, never the path), `temperature` (0), `enableThinking` (false) and `timeoutMs`.
  - `manifest`: what the run was made of, for `scripts/compare` and `scripts/rescore`: the collector and the scorer of this eval (version and digest), the digest of the input and of the labels of every case it selected, the akm, the config without the engine settings, the engines, the strategy and the config patch, and which cases were scored and which errored. See "The collector, the scorer and the golden files".
  - `assets_sha256`: the digest of the corpus's `cases.jsonl`, so two runs on the same cases have the same digest wherever the repository is. A change to a case changes it, and `--limit` does not.
  - `corpus`: `public`, or `custom` for any other folder of cases. `corpus_folder` is the folder of a custom corpus from the repository root, which `scripts/rescore` reads the cases from again; it is `null` for the public corpus, and for a folder outside the repository, whose name can say what is in it, and then `scripts/rescore` takes the folder with `--cases DIR`.
  - `seed`: for a rewrite, the seed its assets were made with (from its `generated.json`); `null` for every other corpus.
  - `status`: `complete`, or `aborted` when the run stopped because the first five cases got no outcome. Then `n_run` may be less than the cases selected, and `aborted_reason` says why (otherwise `null`). The file is written before the run fails, so a folder that holds an aborted summary is not a whole run: do not compare it.
  - `timeouts`: how many of the errored cases ended because an akm command ran past its timeout (15 minutes) and was killed, or because the model call of akm's retrieval check timed out (see below). They are counted in `n_errored` too, and their rows have `timed_out: true`, so an akm or an endpoint that got slower shows as timeouts and not as unexplained errors.
- `samples.jsonl`: one line per case, with the outcome, each check, the fields reflect changed and their new text, the proposal itself, the model name that answered, akm's reason when it made no proposal, and the time it took. The raw output of the case is `outcome`, `reason`, `proposal`, `served`, `seconds`, `error` and `timed_out`; the checks, `correct`, `changed` and `values` are scored from it and the case, so `scripts/rescore` can score a run again when the checks change, with no akm and no model.

## How a case runs

Each case gets a new temporary akm folder with its own config, so the eval never reads or writes your bundle. The note goes into the bundle at its path, and these commands run:

```
akm index
akm feedback <ref> --negative --reason "<the feedback>"
akm improve <ref> --strategy reflect-only --json-to-stdout
akm proposal list
akm proposal show <id> --detail full
```

`reflect-only` is a strategy the eval writes into that config. It runs reflect and nothing else, with the model under test as the one engine, and it turns reflect's quality judge off, so every proposal reaches the checks. judge-gate scores the judge. akm exits 0 whatever reflect did, so the outcome comes from the reflect action in the improve result, and the proposal's text from the queue. Cases run one at a time.

## What it needs from a model

Set `MODEL_BASE_URL`, `MODEL_API_KEY` (empty for a local server) and `MODEL_NAME` in `.env`, for any OpenAI-compatible chat endpoint. `JUDGE_*` is not used.

- It must follow an instruction to return one JSON object with three fields. akm asks for a JSON schema reply. When the endpoint refuses that, it asks for a one-line frame instead, and it gives the model one repair turn. A reply it still cannot read is `unusable`.
- A case is up to about 6k tokens, so 16k of context is safe.
- The eval sets temperature 0 and `enableThinking: false` on the engine, as distill does, and `summary.json` records both under `engine`. akm's own default is a temperature of 0.3. If your model thinks anyway, turn it off in the server: a thinking model can spend its output before the JSON. `--config-patch` can change either setting, and the summary then records the patched value.
- Cloud endpoints that reject unknown request fields may refuse the thinking switches akm sends. Run those through a local gateway, or expect errors in `samples.jsonl`.
- A case takes about ten seconds on a 27B model on a local GPU, so a full run takes under ten minutes.

To serve a model locally with llama.cpp:

```
llama-server -m ./Qwen3-27B-Q4_K_M.gguf --alias qwen3-27b --port 8080 -c 16384 -np 1 -ngl 99 --jinja
```

and in `.env`:

```
MODEL_BASE_URL=http://localhost:8080/v1
MODEL_API_KEY=
MODEL_NAME=qwen3-27b
```

## Measure the gates of akm's reflect

A proposal passes three gates before it is queued, and the eval runs with the first one on and the other two off, so every proposal that passes the first reaches the checks. `patches/` holds the config patches that change that (`--config-patch`).

| Gate | What it does | How to measure it |
|---|---|---|
| The defect filter | Refuses an edit before any judge sees it when it adds placeholder text, talk about the edit itself, or frontmatter copied into the body. On by default. | `evals/reflect/defect-filter`, below. A run with `patches/defect-filter-off.json` turns the filter off, so the edits it would refuse become proposals that the checks score. |
| The quality judge | Refuses an edit whose score is not 4 or more on every criterion. Off in `reflect-only`. | `patches/judge-on.json` turns it on. judge-gate scores the judge on labelled edits. |
| The retrieval check | After the judge passes an edit, grades the old and the new note on up to five of the queries that retrieved the note, and refuses the edit when the new one grades lower. It runs only when the note has queries in the usage log. | `patches/judge-on.json` with `--retrieval-queries`. Without the flag the notes have no queries, the check has nothing to grade, and the same run is the baseline. |

`metrics.refused` counts the refused edits by what refused them: `filter`, `judge`, `retrieval` or `other`. A refused edit never reaches the note, so it is scored by the note as it ends up: as a note left alone, right for a control and a miss for a defect. A gate that refuses a bad edit of a control saves it, and one that refuses a fix of a defect costs it. The comparison that shows what a gate is worth is the one with it on and off, with `--repeat`, on the same model.

```
evals/reflect/run --repeat 3 --config-patch evals/reflect/patches/judge-on.json --label judge
evals/reflect/run --repeat 3 --config-patch evals/reflect/patches/judge-on.json --retrieval-queries --label judge-queries
```

### Replay the defect filter

`evals/reflect/defect-filter --akm-src DIR` runs the filter of the akm checkout DIR on edits whose quality is known and counts what it refuses, by label. akm cannot be asked to run only its filter, so the tool loads `findReflectDefect` from `src/commands/improve/reflect-noise.ts` of the checkout and calls it as akm does. It takes two kinds of edit:

- `--reflect RESULTS_DIR`: the proposals of a reflect run, good when the case was correct. The run must have been made with the filter off. Make it with `evals/reflect/run --config-patch evals/reflect/patches/defect-filter-off.json`, and replay its folder. With the filter on, it refuses an edit before the edit is a proposal, so every proposal in the run has already passed it, and a replay would count 0 refused whatever the filter does. The tool reads the `config` the run recorded, and refuses a run whose `defectFilter` lists (`placeholders`, `metaCommentary` and `frontmatterKeys`) are not all empty for the strategy it ran, or whose `summary.json` records no config. It exits 2 and says to run reflect again with the patch. `--rescore` does not waive this.
- `--judge-gate public` or `private`: the 106 labelled reflect proposals of the judge-gate eval, 11 good and 95 bad under its rubric version 2, real edits of akm's earlier reflect, which also rewrote bodies.

It prints JSON: for each set, `good` and `bad` with `n`, how many the filter `refused` and by which rule, and the refused edits. A good edit refused is a fix lost for 14 days. Both kinds are small, so read a single hit as a case to look at, not a rate.

A run keeps no copy of the notes it was given, so `--reflect` reads each note from `cases.jsonl` as it is now, by case id. It does that only when the run read the same notes and was labelled by the same checks. For a run with a `manifest`, the `input_sha256` of each case in it must be that of the case as it is now (for a run that recorded searches, its `label_sha256`, since the digest of its input includes them), and its `scorer` digest must be that of the checks here: a run scored by other checks is scored again with `scripts/rescore`, and the folder that writes is replayed. A change to the collector or to `lib/` does not stop a replay, since a replay reads proposals and not what made them. For a run without a manifest, the `summary.json` must hold the `assets_sha256` of the corpus folder as it is now (the digest the reflect run computes, over `cases.jsonl`) and the `harness_sha256` of the code here. In both, every case id in `samples.jsonl` must be in the corpus. Otherwise the tool exits 2 and says what differs, with both digests. A corpus regeneration that leaves `cases.jsonl` as it was, or any other eval's change, does not stop it.

`--rescore` is the explicit way to replay the stored proposals against the cases and the code that are here now: for a run whose digests differ, a `summary.json` that has none of the digests the check needs, or a case that has since been dropped (its proposals are left out). A set from `--reflect` carries `inputs` in the output either way: the `mode` (`stored` or `rescore`), the corpus folder read, the `stored` and `current` value of `assets_sha256` and of `harness_sha256` (`null` when the summary has none), the `differences` a replay without `--rescore` would have stopped on, the `missing_cases` left out, and for a run with a manifest `manifest`: the stored and current digest of the scorer and what the cases were compared on. The labels are still the run's own `correct`, scored by its checks. Only the source the filter sees is today's.

## The collector, the scorer and the golden files

The eval is on the run manifest (see "How results stay comparable" in the root README). Its files are split by what a change to them does:

- `src/collect.ts` is the **collector**: the sandbox, the akm config (`reflectConfig`), the commands, the searches it records, and how it reads akm's answer into `outcome`, `reason`, `proposal` and the rest. `lib/akm/akm.ts`, `lib/akm/overrides.ts` and `lib/cli.ts` are listed with it. A change to any of them changes what akm is asked or what is kept of its answer: bump the collector (`scripts/measurement/run bump reflect collector --reason "..."`), and earlier runs are no longer comparable with later ones.
- `src/score.ts` is the **scorer**: the checks, `makeRow` and `metrics`. A change to it changes what the eval scores: bump the scorer, and update the golden files in the same change. No run is invalidated: `scripts/rescore` scores any stored run again, and `scripts/compare` does so before it compares two runs that were scored differently.
- `src/queries.ts` reads the files that `--retrieval-queries` needs and gives `searchesFor` (in `src/collect.ts`) the queries of a rewrite written through its `map.json`. It is in neither part: what it records for a note shows in that case's `input_sha256`, which digests the searches.
- `src/measurement.ts` declares both lists, the cases' `input` and `labels` that are digested per case, and how a stored row is read back into its raw output (`rawOf`). `src/lib.ts` re-exports the scorer and the collector, with how a defect is injected and the checks on the cases themselves.
- `golden/` holds ten cases, one of each class, with 59 raw outputs for them (a realistic answer of a model: the right one, and each way to get it wrong), and the row the scorer must give for each. `src/golden.test.ts` fails when a scorer change alters one. `UPDATE_GOLDEN=1 bun test evals/reflect/src/golden.test.ts` writes the expected rows again, and the files say which scorer version they are for.

```
scripts/rescore/run evals/reflect/results/<UTC date>-<label>      # writes <UTC date>-<label>-rescored beside it
```

A run from before the manifest (made before akm-eval 0.2) is refused. A run of a custom corpus is rescored against the cases in `corpus_folder` of its `summary.json`; one whose folder was outside the repository needs `--cases DIR` (see "Rescore" in the root README).

## Run your own set

`--cases DIR` runs reflect on notes of your own. `DIR` holds a `cases.jsonl` in the format of `assets/cases.jsonl` (see `assets/README.md` for its fields) (see "Corpora" in the root README). It asks before it sends the cases to the model (`-y` skips the question: see "Corpora" in the root README). The results go to `private/reflect/results/`. `--retrieval-queries` does not apply to it: the queries are those of the public notes.

## Assets

- `assets/cases.jsonl`: 50 cases. 32 carry one injected defect of a kind akm names, in six classes. 18 are controls, in four. Each has the note, the feedback a user leaves and what a correct result is. The classes, the fields and how the cases were made are in `assets/README.md`. The cases carry a canary string: do not train on them.
- `private/reflect/assets/cases.jsonl`, the default custom corpus: the same cases with names, tool names, hosts, ids, dates, numbers and versions rewritten from a seed by `lib/rewrite`. A case's note, its path, its feedback, its forbidden terms and its anchors go through one mapping, so a name, a date, a number or a version changes the same way in all of them. `generate` checks that each rewritten note still holds the defect its class names, and only that one, and writes nothing when one does not. It writes into a temporary folder and moves the result into place only when every check passes, so a generation that fails leaves the earlier assets, map and `generated.json` as they were. It is made by `generate` and never published.

## The checks

No judge model scores a case. Each check looks at the proposal and the note.

| Check | Applies to | Passes when |
|---|---|---|
| `body_kept` | every case | The body is the note's body, byte for byte. The one heading akm adds for a missing title is allowed there. |
| `defect_fixed` | defects | The defect is repaired and what the note said stays. A split description keeps the same words in the same order, so that only the break changes: akm tells the model to repair only the break, and a rewrite that keeps the old words and adds others is not a repair. An escaped-quote one keeps every word. A cut-off one keeps its names, numbers and paths, and a restatement in other words is fine. The rest of the per-class rules are in `assets/README.md`. |
| `no_extra_change` | every case | No field changes except the one the class allows. A change to any other field is churn. A `type:` line akm adds does not count. |
| `no_invented` | every case | Each number, name with two capitals, path or dotted name in a new value is in the note, and the new values hold none of the case's forbidden terms. |
| `not_current` | `historical` | A new `when_to_use` names a version or date the note records, or says the note is historical, and does not offer the note for current work: wording such as current, recommended, today, latest, for new work or replaces fails, unless the clause takes the note back ("not for current work", "superseded by the current release"). Leaving it alone passes. |

A case is correct when reflect gave a usable answer and every check that applies passes, on the note as it ends up: a refused edit leaves the note as it was.

## Read the results

| Metric | Meaning |
|---|---|
| `defects` | `correct` of `n` defect cases. This is how often reflect fixes what akm names. |
| `controls` | `correct` of `n` control cases. This is how often reflect leaves a note alone when it should, or changes it with care. |
| `proposals` | How many proposals reflect made, and how many of them touched the body. |
| `classes` | The same per class, with the `outcomes` and the `failed` checks. |

`outcomes` splits each class by what reflect did: `proposal`, `none` (it proposed no change), `refused` (a gate of akm refused the revision: its filter, for placeholder text, talk about the edit itself or frontmatter copied into the body, the quality judge, or the retrieval check), `unusable` (the reply was not the JSON akm asked for, even after its repair turn) and `error`. An unusable answer is never correct: the model failed. A refused edit is scored as the note left alone, so the gate that refused it is what made a control right or a defect missed. A timeout, a provider error or an akm failure is `error` and is left out of the counts. So is an edit that akm's retrieval check could not grade: akm 0.9.26 reports a timeout or a failure of the model call it makes there as a refusal ("retrieval check could not grade the old content (timeout)"), but nothing was judged, so the scorer reads it as an error, not as a refusal by the retrieval gate. Only `retrieval regression` is that gate refusing. `failed` counts, for each check, the cases that failed it.

`touched_body` should be 0. With akm 0.9.26 the body changes only by the heading akm adds for a missing title, and that is not counted. A count above 0 means akm edited a body, and this guards against that.

For scale, run with akm 0.9.26 and a scripted model: one that never proposes a change fixes 0 of 32 defects and keeps 18 of 18 controls. One that rewrites every field fixes none and keeps none. A useful model fixes most defects and keeps most controls. The `historical` class is a known weak spot, so read it on its own.

The set is small. One defect case is 3.1 points of `defects` and one control is 5.6 points of `controls`. Read a change of a case or two as noise, and rerun before you trust a gap.

A model may have seen the public cases in training. A much better public score than rewritten score points to that. Run the custom corpus on a local model, or on an API that does not train on your data.

## Notes

- A note with frontmatter but no description gets one from akm when the model gives none, made from the note's title or first heading. That does not count as a fix: the `description-missing` cases ask for the model's own description.
- `description-truncated` and `body-defect` are defects akm's rules reject, but its list of problems does not name them: the prompt tells the model that akm found nothing wrong. Reflect cannot change a body at all, so for `body-defect` the right result is no change.
- The library has no memories or lessons, so the cases cover knowledge, skills, agents, commands and workflows.
- What reflect does changes with akm. Compare results only between runs with the same akm version.
- akm's error messages name the endpoint it called. The eval writes `<MODEL_BASE_URL>` in its place, so `samples.jsonl` can be shared.
- A gateway may serve one model name from several providers. `served` in `summary.json` counts the names the responses gave, so you can see when a run was split.
- The private cases keep their ids, so a private case pairs with its public one by id. `private/reflect/map.json` lists what was renamed.

## Licence

MPL-2.0, like the rest of this repository. See `../../LICENSE`.
