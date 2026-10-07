# akm's old `scripts/akm-eval` toolkit (retired)

The measurement toolkit that lived in the akm repository as `scripts/akm-eval/`, kept here so that it can still be read. It is retired. Nothing here is run, tested or kept up to date: `bunfig.toml` keeps `bun test` out of this folder, and no check of this repository looks at it. The evals in use are in `evals/` and `benchmarks/`.

## What it was

Read-only tools that measured whether `akm improve` worked: shell wrappers in `bin/` over Bun TypeScript in `src/`.

- A case runner and its suites: `akm-eval-run`, `-compare`, `-trend`, `-collect` and the deterministic `-replay`, with the suites `improve-smoke`, `improve-effectiveness`, `memory-regression`, `workflow-compliance` and `judge-calibration` in `cases/`, and an example library in `example-stash/`.
- The twin experiment: `akm-eval-snapshot`, `akm-eval-twin` and `akm-eval-twin-docker`.
- The monthly real-query verdict: `src/gen-real-query-suite.ts` and `akm-eval-proactive-verdict`.
- The state analyzers: `akm-eval-attribution-rollup`, `akm-eval-recombine-analyze` and `akm-eval-graph-ablation`.
- `akm-eval-curate-bench`, a rank-aware benchmark of `akm curate` and `akm search`, and `akm-eval-consolidation-fidelity`.

`scripts/akm-eval/README.md` is its own manual. [`reports/retired-evals.md`](../../reports/retired-evals.md) says what the twin experiment, the monthly real-query verdict (the proactive verdict) and the state analyzers asked, what they found and why they ended. It does not cover the rest of the list above.

## Where it came from

akm commit `f57a7fd44b37bbee4c18d5ae7f79efdba880ca57`, the tip of `main` on 2026-10-06, when the toolkit was copied here. The tag `v0.9.27-alpha.1` holds the same code, with a version bump.

The folders keep akm's own paths:

| Here | Files |
|---|---|
| `scripts/akm-eval/` | 129: the toolkit |
| `tests/integration/akm-eval/`, `tests/fixtures/akm-eval/` | 14 and 1: its integration tests and their fixture |
| `tests/akm-eval-*.test.ts`, `tests/curate-metrics.test.ts` | 4 and 1: its unit tests |
| `tests/fixtures/stashes/curate-golden/` | 18: the golden corpus and hand-labeled judgments that `akm-eval-curate-bench` scored against |
| `ci/akm-eval-smoke.yml` | 1: the CI job that replayed a recorded smoke run. It was `.github/workflows/akm-eval-smoke.yml` in akm. Here it is a file to read, and GitHub does not run it. |

Every file is byte for byte the one at that commit, except `scripts/akm-eval/cases/consolidation-fidelity/README.md`, where a private-network address and a person's first name are replaced by a placeholder. The copy was taken from the commit, not from a working tree, so no ignored file came with it. (akm ignored the real-query suite, because it is mined from a personal index.)

## It runs only inside akm, at that commit

The toolkit imports akm's own code by relative path (`../../../src/core/...`, `../../../src/storage/...`), and its tests use akm's `tests/_helpers/sandbox.ts` and its bunfig preload. None of that is copied here, so the toolkit runs only in a checkout of akm at that commit (or at the tag). Later akm versions have moved on, and the imports no longer match.

It needs [bun](https://bun.sh) (akm's CI used 1.3.14) and `jq`. Make a checkout:

```sh
git clone https://github.com/itlackey/akm.git akm-at-f57a7fd
cd akm-at-f57a7fd
git checkout f57a7fd44b37bbee4c18d5ae7f79efdba880ca57
bun install --frozen-lockfile
```

The toolkit is already in that checkout. To use the copy in this folder instead, copy it over the checkout (`/path/to/akm-eval` is where you cloned this repository):

```sh
cp -R /path/to/akm-eval/retired/akm-scripts-akm-eval/scripts /path/to/akm-eval/retired/akm-scripts-akm-eval/tests .
```

Run the smoke suite and replay it, as the CI job did. This builds akm, indexes the toolkit's example library, and runs everything in a clean environment with its own `HOME`, so it never touches your own akm:

```sh
bun run build && chmod +x dist/cli.js
T=$(mktemp -d) && mkdir "$T/data"
env -i PATH="$PATH" HOME="$T" AKM_DATA_DIR="$T/data" AKM_BUNDLE_DIR="$PWD/scripts/akm-eval/example-stash" bash -e <<'EOF'
./dist/cli.js index
scripts/akm-eval/bin/akm-eval-run --suite improve-smoke --stash "$AKM_BUNDLE_DIR" --akm ./dist/cli.js --format none --record
scripts/akm-eval/bin/akm-eval-replay latest --stash "$AKM_BUNDLE_DIR" --format json | jq -e '.deterministic == true'
EOF
```

Run its own tests:

```sh
bun test --timeout=120000 tests/akm-eval-*.test.ts tests/curate-metrics.test.ts tests/integration/akm-eval
```

On 2026-10-06 the commands above were run from a clone at that commit, with this folder copied over it (bun 1.4.1). The replay printed `true`, and 233 tests passed (31 in the five unit files and 202 in `tests/integration/akm-eval`).

The other commands read the databases of a real akm installation (`state.db`, `index.db`) or need a model endpoint. Read `scripts/akm-eval/README.md` before running one, and do not point it at a library you care about.

## Licence

MPL-2.0, as in akm and in the rest of this repository. The folder holds no third-party code, so `NOTICE` needs no entry.
