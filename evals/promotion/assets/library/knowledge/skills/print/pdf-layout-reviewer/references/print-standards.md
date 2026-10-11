---
description: Thresholds and rules for automated print quality review pipeline.
updated: 2026-06-19
---

# Print Production Standards (Pipeline Reference)

This file provides the print standards thresholds used by the automated review pipeline (passed to Claude via `generate_report.py --standards-file`).

**Canonical source for full print specs**: `knowledge/print/pipelines/print-specs` (not part of this bundle; provide it in your own stash and load it with `akm show knowledge/print/pipelines/print-specs`)

---

## When to Use This Asset

Use this document when configuring or validating inputs for the automated print quality review pipeline. It defines the specific numerical thresholds and categorical rules that trigger severity classifications (Critical, Major, Minor) during report generation.

---

## Key Thresholds for Automated Review

### Margins and Safe Zones

- **Bleed**: 0.125" (3mm) beyond trim edge
- **Safe zone**: 0.25" inside trim edge (no critical content)
- **Inner (gutter)**: 0.75" - 1.0" minimum (1.0" - 1.25" for TTRPG books)
- **Outer**: 0.5" - 0.75" minimum
- **Top**: 0.5" - 0.75" minimum
- **Bottom**: 0.5" - 0.75" minimum

### Typography

- **Body text**: 9-11pt (optimal 10pt, minimum readable 9pt)
- **Line spacing (leading)**: 1.2-1.5x font size
- **Column width**: 4.5" - 6.0" (~45-75 characters per line)
- **Heading hierarchy**: minimum 3pt difference between levels
- **Tables**: 8pt minimum (9pt preferred)
- **Widows/orphans**: avoid, minimum 2 lines together

### Technical Requirements

- **Color mode**: CMYK (K:100 for body text, C:60 M:40 Y:40 K:100 for rich black)
- **Image resolution**: 300 DPI minimum
- **Fonts**: all embedded, no Type 3
- **PDF format**: PDF/X-1a:2001 (DriveThruRPG default)
- **Max TAC**: 240%

### Page Balance

- **Text coverage**: 40-70% of page area typical
- **Column height variance**: <20% acceptable
- **Multi-column gutter**: 0.25" minimum (0.3"-0.5" optimal)

## Severity Classification

### Critical (Will Cause Print Failure)
1. Content in trim zone (will be cut off)
2. Gutter too narrow (text hidden in binding)
3. Font too small (<9pt, unreadable)
4. Low resolution images (<300 DPI, pixelated)
5. RGB color mode (incorrect colors)

### Major (Quality Issues)
1. Inconsistent margins across pages
2. Widows/orphans
3. Tight line spacing (<1.2x)
4. Column width outside 4.5"-6" range
5. Heading orphans (heading at bottom with <2 lines following)

### Minor (Best Practices)
1. Excessive whitespace (<40% coverage)
2. Typography rivers
3. Unbalanced columns (>20% height difference)
4. Inconsistent heading hierarchy

---

**Version**: 2.0
**Last Updated**: 2026-02-12
**Note**: For complete print specs, trim sizes, ICC profiles, and tooling limitations, see `knowledge/print/pipelines/print-specs`.
