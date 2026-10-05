---
type: command
name: validate-links
description: Validates local markdown links and image references by running.
  gutterpress validation tool and summarizing results.
agent: qa-coordinator
when_to_use: When verifying that all relative paths to images and internal
  markdown files in a repository resolve correctly before building.
updated: 2026-06-19
---

## Instructions

1. Run the validation command to check local markdown links and image references:
   ```bash
   gutterpress validate --phase pre-build --only source.links.local-refs --format json
   ```
2. Review `.reviews/validate-links.*.md` for previous analysis results if available.
3. Summarize missing links and propose fixes.

## Output

- Confirm GO / FIX / NO-GO status.
- Provide the smallest set of changes that resolves blockers.
