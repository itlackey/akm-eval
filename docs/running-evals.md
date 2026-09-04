# Running evals

Use `bin/eval` for a single pack/variant and `bin/matrix` to inspect a config.
All `bin/...` operator commands run in pinned images; the host is not a pack
runtime.

## Default flow

1. Pick a committed config in `config/common/`.
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
- To probe a source checkout, set
  `AKM_EVAL_AKM_SOURCE_DIR=/absolute/path/to/akm` and pass
  `--cmd '["bun","/absolute/path/to/akm/src/cli.ts"]'`. The source checkout
  must already contain whatever source-only assets that command needs.
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

- `bin/build-image --akm-version <exact-version> [--flavor core|beam]`
- `bin/doctor [--pack <id>]`
- `bin/eval --pack <pack> --variant <variant> --config <config-path> [--out <output-dir>]`
- `bin/matrix --config <config-path>`
- `bin/report --run <run-dir>`
- `bin/summary --runs <runs-dir> --format markdown`
- `bin/compare --baseline <run-dir> --candidate <run-dir>`
- `bin/downloads [DatasetName]`
- `bin/probe --akm-version <exact-version>`
- `bin/probe-pair --control <dir> --candidate <dir> ...`
- `bin/memory-eval <pack> --akm-version <exact-version> [--variant <id>]`

The current runnable configs are listed in `README.md`.

## Output

Runs write normalized artifacts under the chosen output directory in `runs/`:

- `result.json`
- `summary.md`
- optional `raw-output.json` and harness logs

See also:

- [`docs/operator-guide.md`](./operator-guide.md)
- [`docs/benchmark-packs.md`](./benchmark-packs.md)
- [`docs/result-schema.md`](./result-schema.md)
