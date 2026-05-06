# Workflows

- `ci-pr.yml`: runs `bun test` and `bun run check:boundary` on pull requests
- `smoke-schedule.yml`: runs a weekly LoCoMo baseline smoke path with a real model provider if `OPENAI_API_KEY` is configured

The smoke workflow is intentionally separate from published benchmark evidence.
