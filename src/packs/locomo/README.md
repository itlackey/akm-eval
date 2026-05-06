# locomo

This folder contains the official LoCoMo QA integration for `akm-eval`.

- `adapter.ts`: runs LoCoMo prompts through akm-eval's own provider/model path
- `dataset.ts`: resolves the official `locomo10.json` dataset, downloading it on demand
- `parse.ts`: validates the official-score wrapper output
- `scorer.ts`: maps authoritative LoCoMo QA scores into `NormalizedRunResult`

Notes:

- The benchmark uses the official `snap-research/locomo` dataset and QA scoring rules.
- Answer generation stays inside akm-eval so baseline and memory variants still use the configured real model provider.
- If the bundled Python evaluator dependencies are missing, the pack fails clearly instead of falling back to proxy scoring.
- The official dataset URL is `https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json`.
- The bundled evaluator wrapper lives at `scripts/locomo-evaluator.py`.
- Both `opencode` and `openai-compatible` runners are supported for answer generation.
