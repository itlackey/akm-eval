# akm-eval

AKM Eval is a benchmark harness for measuring AKM impact on real eval packs.

Trust policy:

- No benchmark pack should silently fall back to synthetic or heuristic success metrics.
- If an official harness or evaluator is not wired, the pack must fail clearly.
- Baseline and AKM variants should both use real model providers; the comparison axis is memory behavior, not fake vs real generation.

## Quick start

```bash
bun install
bun run download:datasets
bun test
bun run check:boundary
bun src/cli.ts doctor
```

## Datasets

Dataset files are not committed to the repository due to their size. Download them before running evals:

```bash
# Download all datasets
bun run download:datasets

# Download a specific dataset
bun scripts/download-datasets.ts LongMemEval
bun scripts/download-datasets.ts LoCoMo
```

Datasets are auto-downloaded on first use if not present, but pre-downloading is recommended.

## BEAM Benchmark

The BEAM pack requires the official BEAM repo. Clone it into `vendor/BEAM`:

```bash
git clone https://github.com/mohammadtavakoli78/BEAM vendor/BEAM
```

Alternatively, set `pack.config.repoPath` in your config to point to an existing BEAM checkout.

## Terminal-Bench

`terminal-bench` is executed only through the official `tb` harness.

- Install the official harness with `uv tool install terminal-bench` or `pip install terminal-bench`.
- Ensure `Docker` and `python3` are available in `PATH`.
- Use an opencode-backed provider config so akm-eval can pass your configured model through to Terminal-Bench.
- For AKM variants, set `variants[].akm.configPath` to an AKM-specific opencode config. The repo fails clearly instead of pretending the baseline config enables AKM.
