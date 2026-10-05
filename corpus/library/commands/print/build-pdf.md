---
type: command
name: build-pdf
description: Build a PDF using a deterministic engine wrapper
agent: qa-coordinator
updated: 2026-06-19
---

# Build a PDF with gutterpress

## When to use
- Use this command when you need to generate a final print-ready or digital PDF from a manifest, HTML entry, or book project.
- Use a plain `--format pdf` build for standard document generation, or `--format pdfx` for canonical print production workflows (e.g., PDF/X-1a).
- Invoke the full audit sequence (`audit-assets` -> `build-pdf` -> `preflight-print`) when preparing high-fidelity books requiring strict trim and TAC validation.

## Instructions

1. Run gutterpress build against the project or manifest:
   ```bash
   gutterpress build <input> -o <output> --format pdf
   ```
   For PDF/X output:
   ```bash
   gutterpress build <input> --format pdfx --pdfx-flavor x1a --icc <icc-profile>
   ```
   Trim size, bleed, page size and TAC limits come from the project's `manifest.yaml` (via `preset`/`pdfx`/`page`/`ink` keys), not from CLI flags — see `skills/print/pdfx-print-pipeline`.

2. Read the generated report from `.reviews/build-pdf.*.md`.

3. Interpret the results:
   - If NO-GO, explain the failure and next step.
   - If GO, recommend preflight + visual review.

## Examples

### Standard PDF
```bash
gutterpress build manifest.yaml -o book.pdf --format pdf
```

### PDF/X (print-on-demand)
```bash
gutterpress build <project> --format pdfx --pdfx-flavor x1a --icc profiles/CGATS21_CRPC1.icc -o book-print.pdf
```

### Print-Ready Sequence
```bash
gutterpress audit path/to/images
gutterpress build <project> --format pdfx --pdfx-flavor x1a --icc profiles/CGATS21_CRPC1.icc -o book-print.pdf
gutterpress preflight --pdf book-print.pdf --target dtrpg
```

## Output

- Confirm GO / FIX / NO-GO status.
- Provide the smallest set of changes that resolves blockers.
