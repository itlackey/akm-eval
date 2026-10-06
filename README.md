# akm-eval

One public repository for every akm evaluation and benchmark.

It holds our own evals, the published benchmarks we run akm against, and a public akm library the evals use: a snapshot of the shared bundle our lab's agents read. Every eval runs the same way against any OpenAI-compatible model, local or cloud.

This layout replaces the earlier harness. The old content stays under the tag `legacy-2026-10`.

## Evals and benchmarks

Each row is a folder, the question it answers, which corpora it has, and its status. The library and the evals marked ready exist today. The others are planned, and each will follow the layout and commands below.

| Folder | Question it answers | Corpus | Status |
|---|---|---|---|
| `corpus/library` | The public akm library the evals use: a snapshot of our lab's shared bundle | public | ready |
| `evals/retrieval` | Does akm search put the assets an agent needs at the top? | public + private | ready |
| `evals/judge-gate` | Does the quality judge pass good improve proposals and refuse bad ones? | public + private | ready |
| `evals/reflect` | Does reflect fix the frontmatter defects akm names, without rewriting the body or inventing claims? | public + private | ready |
| `evals/distill` | Do distilled lessons say only what the source memory says? | public + private | ready |
| `evals/consolidate` | Does consolidate retire only notes whose every claim the replacement keeps? | public + private | ready |
| `evals/extract` | Does extraction pull durable insights and preferences from session logs, and leave routine sessions empty? | public + private | ready |
| `evals/nightly` | Does a full nightly improve run give good results unattended, with no model-call failures? | public + private | ready |
| `evals/agent-ab` | Does the akm plugin change how often an agent completes tasks where retrieval is the only way in? | public + private | ready |
| `evals/bakeoff` | Which model runs akm's model-backed jobs best: valid output, correct facts, real quotes, speed? | public + private | ready |
| `benchmarks/longmemeval` | How does akm do as a memory backend on LongMemEval, next to a full-context baseline? | public (fetched) + private | ready |
| `benchmarks/terminal-bench` | Does akm change pass rates on Terminal-Bench tasks? | public (fetched) + private | planned |
| `benchmarks/skillret` | Given a request, does akm rank the right skills first from a large skill library (SkillRet)? | public (fetched) + private | ready |

## Layout

```
README.md          this file
LICENSE            MPL-2.0, for everything here
NOTICE             third-party items under their own licences
generate-assets    makes every eval's private assets in private/
.env.example       model and judge settings
corpus/library/    the shared akm bundle (a working akm library)
evals/             our evals
benchmarks/        published benchmarks
lib/akm/           the akm sandbox the evals that use akm share
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

Private assets are made from the public ones with a seed, by the rewrite in `lib/rewrite`, so a model can be tested on assets it cannot have trained on. The rewrite changes:

- names, and the names of tools, products and projects (Docker, GitHub, Qwen, akm), in every form they are written;
- hosts, addresses, ports, ids and dates;
- numbers and versions, such as counts, sizes, durations and percentages. Each keeps its order relative to the others, its digits and its range, so "up from 18 to 21" stays an increase and a percentage stays between 0 and 100.

It leaves the ordinary prose, the words a text rests on (programming languages, file formats, protocols, operating systems and core commands: Python, TypeScript, JSON, YAML, Markdown, HTTP, SQL, git, npm, bash), single digits, years, HTTP status codes, step and list numbers, and hosts under well-known domains. Every label, case and expected answer goes through the same mapping as its text, so the meaning and the difficulty stay the same, and the `generate` of each eval whose labels depend on the text checks that they still hold. `lib/rewrite/README.md` has the full lists.

Most of a text is prose, so a private copy differs from its public one by a few percent of its words: about 3 to 5 percent for the evals, about 1 percent for LongMemEval, which keeps its numbers (`--keep-values`) because its answers are counted from the text.

```
./generate-assets                          # make private assets for every eval
./generate-assets --only retrieval,nightly # make them for some evals
./generate-assets --seed 42                # use this seed for one run
```

The first run creates `private/` and `private/seed`, a random 64-bit integer. `private/` is gitignored. It is never published, so never commit it or upload it.

Each eval's `generate` script gets `--seed <seed> --out private/<name>`. The scripts share the rewrite in `lib/rewrite`. It needs [bun](https://bun.sh).

Run private evals on a local model, or on an API that does not train on your data. A model may have seen the public assets in training. A gap between the public and private scores points to that.

## Licence

Everything here, code and assets alike, is MPL-2.0. See `LICENSE`. The few third-party items keep their own licences and are listed in `NOTICE`. Third-party benchmark data is fetched when you run the benchmark; it is never committed here and stays under its own licence.

## Use the library as an akm bundle

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
