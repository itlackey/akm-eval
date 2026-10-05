---
name: print-utilities
description: Standalone print-pipeline utilities that gutterpress does not provide, such as PDF-to-PDF regression comparison.
when_to_use: Use when a print pipeline needs a capability gutterpress's build/validate/audit/preflight commands don't cover.
updated: 2026-09-16
---

# Print Utilities

Small, self-contained scripts for print-pipeline needs that fall outside gutterpress's own commands (`build`, `validate`, `audit`, `preflight`, `publish`). If gutterpress covers something, use gutterpress directly instead of a script here — see `skills/print/pdfx-print-pipeline`.

This skill includes executable scripts in `scripts/`:

| Script | Purpose | Requires |
|---|---|---|
| `scripts/compare-pdf.ts` | Compares two PDFs' core metadata (page count, page size, PDF version, encryption) and embedded fonts, and writes a `.reviews/compare-pdf.<timestamp>.md` report | Bun, `pdfinfo`/`pdffonts` (poppler-utils) |

Run scripts from this skill's own directory in the akm bundle, e.g.:

```bash
bun run scripts/compare-pdf.ts <pdfA> <pdfB>
```

`compare-pdf.ts` writes its report to `.reviews/` relative to the current working directory (the project being worked on), not this skill's directory.
