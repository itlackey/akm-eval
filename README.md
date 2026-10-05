# akm-eval

One public repository for every akm evaluation and benchmark.

It holds our own evals, the published benchmarks we run akm against, and a shared library of akm assets that agents read during runs. Every eval runs the same way against any OpenAI-compatible model, local or cloud.

This layout replaces the earlier harness. The old content stays under the tag `legacy-2026-10`.

## Evals and benchmarks

Each row is a folder, the question it answers, which corpora it has, and its status. The library and the evals marked ready exist today. The others are planned, and each will follow the layout and commands below.

| Folder | Question it answers | Corpus | Status |
|---|---|---|---|
| `corpus/library` | What does a shared, working akm bundle look like for agents to read? | public | ready |
| `evals/retrieval` | Does akm search put the assets an agent needs at the top? | public + private | planned |
| `evals/judge-gate` | Does the quality judge pass good improve proposals and refuse bad ones? | public + private | ready |
| `evals/reflect` | Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims? | public + private | planned |
| `evals/distill` | Do distilled lessons say only what the source memory says? | public + private | planned |
| `evals/consolidate` | Does consolidate retire only notes whose every claim the replacement keeps? | public + private | planned |
| `evals/extract` | Does extraction pull durable insights and preferences from session logs, and leave routine sessions empty? | public + private | planned |
| `evals/nightly` | Does a full nightly improve run give good results unattended, with no model-call failures? | public + private | planned |
| `evals/agent-ab` | Does the akm plugin change how often an agent completes tasks where retrieval is the only way in? | public + private | planned |
| `evals/bakeoff` | Which model runs akm's model-backed jobs best: valid output, correct facts, real quotes, speed? | public + private | ready |
| `benchmarks/longmemeval` | How does akm do as a memory backend on LongMemEval, next to a full-context baseline? | public (fetched) + private | ready |
| `benchmarks/terminal-bench` | Does akm change pass rates on Terminal-Bench tasks? | public (fetched) + private | planned |
| `benchmarks/skillret` | Given a request, does akm rank the right skills first from a large skill library (SkillRet)? | public (fetched) + private | planned |

## Layout

```
README.md          this file
generate-assets    makes every eval's private assets in private/
.env.example       model and judge settings
corpus/library/    the shared akm bundle (a working akm library)
corpus/LICENSE     CC BY 4.0
corpus/NOTICE      items under another licence, with attribution
evals/             our evals
benchmarks/        published benchmarks
lib/rewrite/       the seeded rewrite the generate scripts share
reports/           published results: scores only, never private items
private/           your private assets (gitignored, never published)
```

## Run an eval

Every eval and benchmark has a `run` script:

```
evals/retrieval/run --corpus public
evals/retrieval/run --corpus private
evals/retrieval/run --corpus all
```

`--corpus` picks the assets. `all` runs both and shows the public and private results side by side.

Models come from `.env`. Copy `.env.example` to `.env` and fill it in.

- `MODEL_BASE_URL`, `MODEL_API_KEY` and `MODEL_NAME` set the model under test.
- `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_MODEL` set the judge.

Any OpenAI-compatible endpoint works, local or cloud. `.env` is gitignored.

Each eval's README says what else it needs. An eval with Python code needs [uv](https://docs.astral.sh/uv/). An eval that uses akm needs akm on `PATH`, or `AKM_BIN` set in `.env`.

## Private assets

Private assets are made from the public ones with a seed. The usual method is to rewrite incidental names, hosts, ids and dates, so the meaning and difficulty stay the same.

```
./generate-assets                          # make private assets for every eval
./generate-assets --only retrieval,nightly # make them for some evals
./generate-assets --seed 42                # use this seed for one run
```

The first run creates `private/` and `private/seed`, a random 64-bit integer. `private/` is gitignored. It is never published, so never commit it or upload it.

Each eval's `generate` script gets `--seed <seed> --out private/<name>`. The scripts share the rewrite in `lib/rewrite`. It needs [bun](https://bun.sh).

Run private evals on a local model, or on an API that does not train on your data. A model may have seen the public assets in training. A gap between the public and private scores points to that.

## Licences

- Code is MPL-2.0. See `LICENSE`.
- The corpus and the eval assets are CC BY 4.0. See `corpus/LICENSE`. Items under another licence are listed in `corpus/NOTICE`.
- Third-party benchmark data is fetched when you run the benchmark. It is never committed here and stays under its own licence.

## Use the library as an agent's shared bundle

`corpus/library` is a working akm bundle. Add this repository to an agent's akm config as a git bundle, with the component root set to `corpus/library` and the adapter set to `akm`:

```json
{
  "bundles": {
    "akm-eval-library": {
      "git": "https://github.com/itlackey/akm-eval.git",
      "components": { "main": { "root": "corpus/library", "adapter": "akm" } }
    }
  }
}
```

The agent then reads the library's skills, knowledge, commands, agents and workflows through akm refs. See `corpus/library/README.md` for what it holds and what each agent supplies in its own stash.
