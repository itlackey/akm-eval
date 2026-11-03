# Working on akm-eval

A map, not a policy. The instructions live in [`README.md`](README.md), especially
its "Work on the repository" section (worktree files, running akm by hand, `gh`
workaround).

- Read the selected eval's README (`evals/<name>/README.md`) and its collector
  before changing or running it.
- Verify what each arm measures. Keep corpus and scoring compatible, and keep
  failures, coverage gaps and measured versus estimated metrics visible.
- Run a representative pilot before any expensive collection.
- Check with `scripts/check`.
- Never commit `.env`, `models.json`, `private/` or any credentials.
- Follow the current instructions for route, budget and stop/resume.
