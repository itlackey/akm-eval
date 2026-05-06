# akm-eval

AKM Eval is a benchmark harness for measuring AKM impact on real eval packs.

Trust policy:

- No benchmark pack should silently fall back to synthetic or heuristic success metrics.
- If an official harness or evaluator is not wired, the pack must fail clearly.
- Baseline and AKM variants should both use real model providers; the comparison axis is memory behavior, not fake vs real generation.

## Quick start

```bash
bun install
bun test
bun run check:boundary
bun src/cli.ts doctor
```

## Terminal-Bench

`terminal-bench` is executed only through the official `tb` harness.

- Install the official harness with `uv tool install terminal-bench` or `pip install terminal-bench`.
- Ensure `Docker` and `python3` are available in `PATH`.
- Use an opencode-backed provider config so akm-eval can pass your configured model through to Terminal-Bench.
- For AKM variants, set `variants[].akm.configPath` to an AKM-specific opencode config. The repo fails clearly instead of pretending the baseline config enables AKM.
