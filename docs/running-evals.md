# Running evals

Use `akm-eval run` for a single pack/variant and `akm-eval matrix` for a comparison matrix.

If you want a guided starter config first, run `bun run setup`.

Direct `version: 1` configs should declare provider connections once under top-level `providers`, have each run select one with `agentProvider`, and use `agentModel` only for per-run model overrides. Planned `schemaVersion: "akm.eval.config.v1"` configs keep using `variants[].agent.providerRef` plus `variants[].agent.model`, which resolve to the same normalized runtime provider config during load.

For repo-local operator workflows, prefer these script entrypoints over raw `bun src/cli.ts ...` commands:

- `bun run setup`
- `bun run doctor`
- `bun run eval -- --pack <pack> --variant <variant> --config <config-path> --out <output-dir>`
- `bun run matrix -- --config <config-path>`
- `bun run report -- --run <run-dir>`
- `bun run summary -- --runs <runs-dir> --format markdown`
- `bun run compare -- --baseline <run-dir> --candidate <run-dir>`
- `bun run downloads [DatasetName]`

## Runner support boundaries

- `locomo`: `opencode` and `openai-compatible`
- `longmemeval`: prefer `openai-compatible`; `opencode` is partial because large prompts are passed through CLI argv
- `beam`: `opencode` and `openai-compatible`
- `swe-bench`: `opencode` and `openai-compatible`
- `tau-bench`: `openai-compatible`
- `terminal-bench`: `opencode` only in this repo
- `akm-bench`: blocked

Important constraints:

- Baseline runs for real benchmarks must still use a real model provider and `memory.backend: none`; do not use `provider: none`. `memory.backend: akm` now fails explicitly with AKM runtime/config detail instead of silently returning empty retrieval, and `akm-eval run` now blocks benchmark execution up front for `akm`, `mem0`, `openviking`, and `zep` because no truthful evaluated repo-side retrieval path exists for them yet.
- The current AKM-specific blocker is concrete: this repo can verify `akm --help` and `akm info --format json`, but `akm memory --help` still does not reveal a documented indexing/query contract that would let `src/memory/backends/akm.ts` truthfully implement `add()` and `search()`.
- `longmemeval` requires `pack.config.evaluatorCommand` so scoring comes from the official evaluator flow. This repo ships `scripts/longmemeval-evaluator.py` as the default wrapper used by setup/examples. `pack.config.datasetPath` is optional when you want to use the repo-managed or built-in dataset resolver.
- `locomo` uses the official `locomo10.json` dataset and the bundled `scripts/locomo-evaluator.py` scorer. If `datasets/locomo/locomo10.json` is absent, akm-eval downloads it from the official Snap Research repository on first run.
- `locomo` supports `pack.config.maxContextTokens` for baseline conversation truncation and `pack.config.topK` for memory-backed retrieval mode.
- For LongMemEval, prefer an `openai-compatible` provider today. The current `opencode run` CLI path passes prompts as argv and can reject very large LongMemEval histories.
- `swe-bench` requires Docker plus the official `swebench` Python package. The adapter generates prediction patches with the configured variant/provider, then runs `python -m swebench.harness.run_evaluation` and trusts only the harness artifacts.
- `beam` requires a local checkout of the official `mohammadtavakoli78/BEAM` repo plus its prepared official dataset directories. akm-eval generates BEAM answer files with the configured model/provider path, then runs `python -m src.evaluation.run_evaluation` from the upstream repo and trusts only those evaluation artifacts.
- `beam` also requires `OPENAI_API_KEY` for the upstream BEAM judge model and optionally `pack.config.evaluatorModel` to choose that judge.
- `beam` runtime preflight now checks repo layout, prepared dataset presence, and judge configuration before the run proceeds. Use `bash scripts/setup-beam-runtime.sh --check --require-judge`, plus `--require-10m` when the run includes `10M`. Add `--print-fingerprint` when you want a JSON record of the repo/dataset/judge/runtime inputs that were actually detected. `BEAM_REPO_PATH`, `BEAM_DATASET_PATH`, `BEAM_DATASET_10M_PATH`, and `BEAM_PYTHON_BIN` can be used as env-backed overrides.
- `tau-bench` requires the official Python package plus a real model endpoint for both the agent model and user simulator model. In this repo, the first integration path uses `openai-compatible` config values mapped to upstream `openai` mode. Blank API keys are accepted for local compatible endpoints that do not require auth.
- The shipped tau-bench smoke/setup path runs a single task (`smoke: true`); treat it as a smoke-only runtime example rather than a full-run duration expectation. The wrapper also normalizes model strings for checkpoint/result filenames only, while preserving the original configured model names for API calls and metadata.
- `terminal-bench` runs only through the official `tb run` harness. It requires `tb`, Python, Docker, and an opencode-backed provider config. If any requirement is missing, `doctor` and runtime fail clearly.
- `terminal-bench` AKM-enabled but non-retrieval runs must set `variants[].akm.configPath` to a real AKM-specific opencode config, but repo-facing AKM comparison claims remain blocked because `src/memory/backends/akm.ts` still does not implement a truthful evaluated retrieval path, so benchmark runs selecting `memory.backend: akm` fail fast before harness execution.
- `akm-bench` still fails fast with an explicit runtime error instead of producing proxy metrics.

See also:

- `README.md` for the current support matrix
- `docs/operator-guide.md` for the consolidated operator entrypoint
- `docs/benchmark-packs.md` for pack-by-pack constraints
- `src/packs/*/README.md` for pack-local implementation notes
