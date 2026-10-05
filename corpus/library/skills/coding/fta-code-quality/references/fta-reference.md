---
description: Fast TypeScript Analyzer (FTA) is a static analysis tool that
  evaluates code quality using Halstead metrics, cyclomatic complexity, line
  count, and an aggregate FTA Score to identify maintainability issues in
  TypeScript and JavaScript projects.
when_to_use: Use when performing initial code audits, prioritizing refactoring
  efforts, or establishing baseline complexity thresholds for large codebases.
  Ideal for CI/CD pipelines to gate on score caps or exclude specific
  test/fixtures directories from analysis.
updated: 2026-05-12
---
# FTA Reference

Fast TypeScript Analyzer (FTA) is a static analysis tool for TypeScript and JavaScript.

## One-off usage

The simplest usage is:

```bash
npx -y fta-cli <path>
```

For machine-readable output:

```bash
npx -y fta-cli <path> --json
```

## What FTA measures

FTA uses these core signals:

- Halstead metrics
- Cyclomatic complexity
- Line count
- An aggregate `FTA Score`

Lower is better.

## Default interpretation

- `> 60`: Needs improvement; difficult to maintain
- `50-60`: Could be better; reasonably maintainable
- `< 50`: OK; generally maintainable

These are heuristics. Use them to prioritize review and refactoring, not as a blind rule.

## Configuration ideas

FTA can read an `fta.json` file.

Useful options:

- `score_cap`: fail analysis when a file exceeds a threshold
- `output_limit`: control how many files show in table output
- `include_comments`: include comments in analysis, default `false`
- `exclude_under`: ignore tiny files, default `6`
- `exclude_directories`: add folders to skip
- `exclude_filenames`: add filename globs to skip
- `extensions`: add more file extensions to analyze

Example:

```json
{
  "output_limit": 250,
  "score_cap": 90,
  "exclude_directories": ["__fixtures__"],
  "exclude_filenames": ["*.test.{ts,tsx}"],
  "extensions": [".cjs"],
  "include_comments": false,
  "exclude_under": 10
}
```

## How to use the metrics responsibly

- Prioritize the worst files instead of trying to optimize every file.
- Look for concentrated complexity: large files, many branches, many responsibilities.
- Prefer real simplification over score-chasing.
- Pair FTA with tests, linting, type-checking, and human review.

## Source

Based on `https://ftaproject.dev/`, including the Getting Started, Configuration, and Scoring docs.
