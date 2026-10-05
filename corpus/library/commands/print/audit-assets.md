---
type: command
name: audit-assets
description: Audit image assets for CMYK color space readiness and DPI
  resolution to ensure print production compliance.
agent: qa-coordinator
when_to_use: When verifying if image files in a directory or specific file are
  suitable for print production (CMYK, 300+ DPI).
updated: 2026-06-19
---

Audit image assets for print production readiness using the `audit-assets` tool.

## Instructions

1. Run the `audit-assets` tool against the target `path` (directory or specific file).
   - Note: This delegates to `gutterpress audit --format json`.
2. Review existing analysis in `.reviews/audit-assets.*.md` to avoid redundant work.
3. Interpret the JSON results to determine compliance with print standards.

## Decision Logic

- **CMYK Compliance**: Verify all images use CMYK color space.
- **Resolution**: Verify all images meet the minimum 300 DPI threshold.

## Remediation

If RGB images are detected, suggest the non-destructive conversion script:

```bash
bash skills/cmyk-image-converter/scripts/convert-to-cmyk.sh <input_dir> <output_dir> -r -f tif -p CGATS21_CRPC1.icc
```

## Output Requirements

Provide a clear status verdict:
- **GO**: All assets meet print standards.
- **FIX**: Issues found; provide the minimal set of changes required to resolve blockers.
- **NO-GO**: Critical failures preventing print production.

Include specific file paths and the exact conversion commands needed for any failing assets.
