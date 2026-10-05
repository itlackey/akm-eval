---
name: pagedjs
description: HTML/CSS print layout with Paged.js (paged media, breaks, counters.
  running headers/footers) for producing book PDFs.
when_to_use: Use when designing or debugging HTML/CSS layouts rendered with
  Paged.js, especially for pagination, running headers/footers, counters, and
  print-specific layout failures.
updated: 2026-09-15
---

# Paged.js

Use this skill to design and debug HTML/CSS layouts rendered with Paged.js.

## Establish the runtime first

Record the exact Paged.js version and rendering path (polyfill, API, CLI, or a
wrapper such as gutterpress) before diagnosing a layout problem. Paged.js
0.4.3's published feature table supports `break-inside: avoid`, but not
`break-inside: avoid-page`; later prereleases and custom handlers can behave
differently. Reproduce against the project's pinned version.

A consumer may provide `knowledge/print/pagedjs-failure-modes` with verified
project-specific failures. Load it when present, but apply its workarounds only
to the runtime it documents. A `data-break-inside="avoid"` attribute, for
example, has no built-in meaning unless that pipeline registers a handler for
it.

## Core Loop

1. Edit HTML/CSS.
2. Preview in browser with Paged.js.
3. Fix fragmentation/layout issues.
4. Render PDF.
5. Review PDF, iterate.

## Common Tasks

- **Page setup**: `@page` size/margins, recto/verso variants.
- **Fragmentation**: `break-before/after`, `break-inside: avoid`, `orphans`, and `widows`; verify the rendered result because support varies by element and version.
- **Running headers/footers**: `string-set` + margin boxes.
- **Counters**: page numbers, chapter counters.

## Compatibility constraints

- Prefer selectors supported by the project's pinned Paged.js version. Test advanced selectors such as `:has()` with a minimal reproduction before using them in a production book.
- Use `break-inside: avoid` for the standard keep-together case. Do not substitute `avoid-page`, which Paged.js 0.4.3 does not support. Oversized elements still must be allowed to split.
- Treat left/right placement as a rendered-output assertion. Front matter, blank pages, and custom handlers can shift the apparent spread, so inspect page numbers and facing pages instead of assuming parity from a class name alone.
- A custom `data-*` workaround is portable only with the handler that implements it. Document and load that handler before relying on the attribute.

## Scripts

- Validate: `python skills/print/pagedjs/scripts/validate_pagedjs.py document.html --css styles.css`
- Minimal repro: `python skills/print/pagedjs/scripts/preview_template.py --css styles.css --output preview.html`

## References

- Paged.js supported-feature table: <https://pagedjs.org/en/documentation/14-supported-feature-of-the-w3c-specifications/>
- Optional consumer failure modes: `knowledge/print/pagedjs-failure-modes`
- Patterns: `skills/print/pagedjs/references/css-patterns.md`
- Troubleshooting: `skills/print/pagedjs/references/troubleshooting.md`
