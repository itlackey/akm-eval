---
name: fta-code-quality
description: Use Fast TypeScript Analyzer (FTA) to assess maintainability and
  catch complexity problems in TypeScript or JavaScript code.
when_to_use: '"Use this skill when the task involves TypeScript or JavaScript
  and any of these are true: the user wants high quality or maintainable code;
  the user asks for a review, refactor, cleanup, or simplification; you made
  meaningful TS/JS changes and want a complexity check before finishing; the
  user wants to add or tune a code-quality gate in CI."'
updated: 2026-05-11
---

# FTA Code Quality

Use Fast TypeScript Analyzer from `https://ftaproject.dev/` to measure maintainability in TypeScript and JavaScript code.

FTA is useful because it gives a quick, objective signal about files that are getting too large or too complex to maintain comfortably. Treat it as decision support for refactoring, not as a substitute for judgment.

## When to use this skill

Use this skill when the task involves TypeScript or JavaScript and any of these are true:

- the user wants high quality or maintainable code
- the user asks for a review, refactor, cleanup, or simplification
- you made meaningful TS/JS changes and want a complexity check before finishing
- the user wants to add or tune a code-quality gate in CI

Do not use this as the only quality signal. Combine it with tests, linting, type-checking, and code review reasoning.

## Core workflow

1. Identify the relevant scope.
   - Prefer the changed files, the target package, or the directory the user is working in.
   - Avoid running FTA across a huge unrelated codebase unless the user asked for repo-wide analysis.

2. Run FTA.
   - For a quick one-off analysis, use:

```bash
npx -y fta-cli <path> --json
```

   - If table output is easier for the current task, use:

```bash
npx -y fta-cli <path>
```

3. Read the results and focus on the worst files first.
   - Lower score is better.
   - `> 60` usually means `Needs improvement`.
   - `50-60` usually means `Could be better`.
   - `< 50` is usually `OK`.

4. Turn the findings into action.
   - Look for large files, high branching, overly dense modules, and mixed responsibilities.
   - Suggest or make refactors that reduce concentrated complexity rather than gaming the score.

5. Re-run FTA after meaningful refactors.
   - Show whether the score improved and explain why.

## How to interpret FTA well

- FTA combines lines of code, cyclomatic complexity, and Halstead-derived complexity into an aggregate maintainability score.
- A high score is a smell, not an automatic failure.
- Prefer structural improvements such as splitting modules, simplifying control flow, reducing nesting, and extracting focused helpers.
- Avoid cosmetic changes that move code around without reducing actual complexity.

## Recommended patterns

### For a changed package or app

```bash
npx -y fta-cli ./packages/my-package --json
```

### For CI-style gating

Use a project `fta.json` with a `score_cap` so overly complex files fail the check.

Example:

```json
{
  "score_cap": 90,
  "exclude_directories": ["__fixtures__"],
  "exclude_filenames": ["*.test.{ts,tsx}"],
  "include_comments": false,
  "exclude_under": 10
}
```

Then run:

```bash
npx -y fta-cli <path>
```

## Output expectations

When using FTA for a user task, report:

- what scope you analyzed
- the highest-risk files and their scores
- what the scores suggest in plain English
- the concrete refactors you made or recommend
- whether a follow-up FTA run improved the result

## Report template

Use a compact structure like this:

```text
FTA review for <scope>
- Worst file: <path> (<score>, <assessment>)
- Main issue: <why it is hard to maintain>
- Action: <refactor performed or recommended>
- Result after changes: <new score or pending verification>
```

## Reference material

For thresholds, interpretation, and config details, read `references/fta-reference.md`.
