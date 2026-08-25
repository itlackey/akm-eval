# Running evals

Use `bin/eval` for a single pack/variant and `bin/matrix` to inspect a config.

## Default flow

1. Pick a committed config in `config/common/`.
2. Run `bin/build-image` once per machine or after image or wrapper changes.
3. Run `bin/doctor --pack <pack>`.
4. Run `bin/eval --pack <pack> --variant <variant> --config <path>`.
5. Inspect outputs with `bin/report --run <dir>` or `bin/summary --runs <dir>`.

`bin/doctor --pack ...` and `bin/eval --pack ...` create or repair the host-managed pack runtime used by `beam`.

## Common commands

- `bin/build-image`
- `bin/doctor [--pack <id>]`
- `bin/eval --pack <pack> --variant <variant> --config <config-path> [--out <output-dir>]`
- `bin/matrix --config <config-path>`
- `bin/report --run <run-dir>`
- `bin/summary --runs <runs-dir> --format markdown`
- `bin/compare --baseline <run-dir> --candidate <run-dir>`
- `bin/downloads [DatasetName]`

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
