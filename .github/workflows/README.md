# Workflows

- `ci-pr.yml`: runs `bun install`, `bun test`, and `bun run check:boundary` on pull requests.
  It never sets `AKM_EVAL_AKM_CMD` — the job has no docker daemon, no real akm CLI, and no sibling
  akm checkout. `tests/memory-backend-akm.integration.test.ts` skips its suite only when running in
  CI *and* that var is unset (`describe.skipIf`), precisely so this job doesn't need one. Locally the
  suite still runs and still **fails rather than skips** when no akm CLI is reachable; see that test
  file and `docs/memory-backends.md` for why the gate is keyed on CI and not on the var alone.
- `smoke-schedule.yml`: runs a weekly LoCoMo baseline smoke path with a real model provider if `OPENAI_API_KEY` is configured
- `on-demand.yml`: manual (`workflow_dispatch`) run of the non-LLM test suite (same steps as
  `ci-pr.yml`). A `run_llm_tests` input optionally also runs the LoCoMo smoke test from
  `smoke-schedule.yml`, failing the job if `OPENAI_API_KEY` isn't configured rather than skipping.

The smoke workflow is intentionally separate from published benchmark evidence.
