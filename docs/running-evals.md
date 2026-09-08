# Running evals

Use `bin/eval` for a single pack/variant and `bin/matrix` to inspect a config.
All `bin/...` operator commands run in pinned images; the host is not a pack
runtime.

## Default flow

1. Pick a committed config in `config/common/`. For the reusable full-500
   reference protocol, use `bin/reference-eval`; do not invoke its
   `config/reference/` file directly.
2. Pick the exact akm-cli version being evaluated. The wrapper builds its
   version-specific image on first use, or run
   `bin/build-image --akm-version <version>` explicitly.
3. Run `bin/doctor --pack <pack>`.
4. Run `bin/eval --pack <pack> --variant <variant> --config <path>`.
5. Inspect outputs with `bin/report --run <dir>` or `bin/summary --runs <dir>`.

`beam` selects the optional `beam` image target, whose pinned Python environment
is preinstalled. It never creates a host venv.

## Runtime inputs

- Export documented API variables or set `AKM_EVAL_ENV_FILE` to an absolute
  Docker env-file path. The file is consumed by Docker and is not mounted or
  copied into an image. Start from `.env.example`, store the filled copy
  outside the checkout, and never commit it.
- Datasets under `datasets/` are covered by the checkout mount. For an external
  dataset tree, set `AKM_EVAL_DATASET_DIR=/absolute/path` and use paths beneath
  that directory in the config. The wrapper mounts it read-only at the same
  absolute path.
- External BEAM paths in `BEAM_REPO_PATH`, `BEAM_DATASET_PATH`, and
  `BEAM_DATASET_10M_PATH` are mounted read-only automatically.
- To test an unpublished source checkout, use `--akm-source /absolute/path/to/akm`
  with `bin/build-image`, `bin/probe`, or `bin/memory-eval`, or export
  `AKM_EVAL_AKM_SOURCE_DIR` for `bin/eval`. The wrapper creates a sanitized
  Docker context containing only Git-tracked and untracked-nonignored files,
  installs locked dependencies, and builds AKM inside a derivative image. The
  checkout is also mounted read-only for provenance and is never built or
  modified on the host. Source images and result metadata are bound to the Git
  SHA, full tree fingerprint, and dirty state.
- Use `host.docker.internal` rather than `localhost` for an API server running
  on the host.

The checkout is mounted read-only. Dedicated nested mounts keep `runs/`
host-visible and owned by the invoking uid; `datasets/` is read-only during
evaluation and writable only through `bin/downloads`. A no-copy volume masks
checkout `node_modules`; Bun resolves the image-owned locked dependency tree
through `NODE_PATH`.

Generic reporting and baseline commands use an AKM-free `:runtime` image.
Selecting `AKM_EVAL_AKM_VERSION` or `--akm-version` switches to a separately
tagged image containing that exact published CLI. Managed tags also include a
short hash of the evaluator's image inputs, so pulling dependency or container
changes cannot silently reuse an old environment. There is no implicit AKM
version for a retrieval probe or judged `akm-memory` run.

## Common commands

- `bin/build-image (--akm-version <exact-version> | --akm-source <checkout>) [--flavor core|beam]`
- `bin/doctor [--pack <id>]`
- `bin/eval --pack <pack> --variant <variant> --config <config-path> [--out <output-dir>]`
- `bin/matrix --config <config-path>`
- `bin/report --run <run-dir>`
- `bin/summary --runs <runs-dir> --format markdown`
- `bin/compare --baseline <run-dir> --candidate <run-dir>`
- `bin/downloads [DatasetName]`
- `bin/probe (--akm-version <exact-version> | --akm-source <checkout>)`
- `bin/probe-pair --control <dir> --candidate <dir> ...`
- `bin/memory-eval <pack> (--akm-version <exact-version> | --akm-source <checkout>) [--config <path>] [--variant <id>] [--out runs/<stable-id>]`
- `bin/reference-eval verify`
- `bin/reference-eval run-akm (--akm-version <exact-version> | --akm-source <checkout>) --out runs/<stable-id>`
- `bin/reference-eval rerun-controls --confirm-control-rerun --out runs/<stable-id>`
- `bin/reference-model <fetch|verify|up|down|status|logs>`

The current runnable configs are listed in `README.md`.

## Output

Runs write normalized artifacts under the chosen output directory in `runs/`:

- `result.json`
- `summary.md`
- optional `raw-output.json` and harness logs

LongMemEval additionally fsyncs one signature-bound answer checkpoint after
each question and one judge checkpoint after each verdict. Re-running the same
command with the same explicit `--out runs/<stable-id>` resumes exact matches.
Without `--out`, the wrapper creates a new timestamped directory and therefore
starts a new checkpoint lineage. Changes to the dataset/questions, provider
endpoint/model/options, selected memory backend/config/runtime, evaluator code,
or answer prompt produce a different identity and do not reuse stale work. AKM
source identity is scoped to AKM checkpoints: a new AKM release does not
invalidate `none` or `raw-vector` controls. Raw-vector's implementation is
included in its own code hash, so changing it does invalidate vector
checkpoints.

For the official fixed-model 0.9.15/full-500 path:

```bash
bin/reference-eval run-akm --akm-source ../akm \
  --out runs/qwen-reference-akm-0.9.15
```

See [`reference-results.md`](./reference-results.md) for model containers,
frozen-control reuse, intentional control reruns, and publication checks.

The older production-routing screen remains available for exploratory work:

```bash
bin/probe --akm-source ../akm
bin/memory-eval longmemeval \
  --akm-source ../akm \
  --config config/common/longmemeval-akm-fragment-context-0915.json \
  --out runs/longmemeval-0.9.15-rc
```

It compares the explicit `exact` and `lead` context modes on the same
seeded n=200 sample. The `auto` answer-model census must be reviewed in every
result. It is not the official reference and must not be published as the
full-benchmark score.

See also:

- [`docs/operator-guide.md`](./operator-guide.md)
- [`docs/reference-results.md`](./reference-results.md)
- [`docs/benchmark-packs.md`](./benchmark-packs.md)
- [`docs/result-schema.md`](./result-schema.md)
