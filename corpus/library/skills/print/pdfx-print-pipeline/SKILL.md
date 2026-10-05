---
name: pdfx-print-pipeline
description: Build print-ready PDF/X output and run print-on-demand preflight/validation with the gutterpress CLI. Covers PDF/X-1a/X-3 builds, CMYK + ICC output intent, embedded-font/bleed/page-size checks, and TAC/ink-coverage checks, for printers such as DriveThruRPG.
when_to_use: Use when a task needs a print-ready PDF/X export, CMYK/ICC conversion, print-on-demand preflight, TAC/ink-coverage checking, or DriveThruRPG-style print validation, and gutterpress is (or can be) the build tool.
updated: 2026-09-15
---

# PDF/X Print Pipeline (gutterpress)

[gutterpress](https://github.com/dimm-city/gutterpress) is a markdown-to-PDF tool
(desktop app + `gutterpress` CLI) with a native print-on-demand pipeline built
in. This skill is a map of its commands, manifest keys, and validation checks
for producing and preflighting print-ready PDF/X output — it is not a
separate pipeline. If gutterpress doesn't provide something, that is called
out explicitly below rather than invented.

## When to use

- Building a print-ready PDF/X-1a or PDF/X-3 file (CMYK, ICC output intent)
  from a markdown/HTML project.
- Running technical preflight before submitting a book to a print-on-demand
  service such as DriveThruRPG.
- Checking or explaining TAC/ink-coverage, embedded fonts, bleed, page size,
  color space, or transparency findings from a gutterpress build.

For the human visual/layout QA pass (not technical preflight), use
`skills/print/pdf-review` or `skills/print/pdf-layout-reviewer` instead.

## Install and system requirements

The CLI always needs a Chromium-based browser (via `puppeteer-core`, which
drives an already-installed browser — it never downloads one). PDF/X output
additionally needs **Ghostscript** (`gs`) for the RGB→CMYK conversion, ICC
output-intent embedding, and ink-coverage measurement, and **qpdf** for
annotation stripping and PDF/X marker/metadata validation. A plain `--format
pdf` build needs only the browser.
(`packages/cli/README.md:55-61`, `examples/gutterpress-user-guide/07-system-setup.md:1-19`)

```bash
gutterpress doctor
```

Reports the gutterpress version, platform, config directory, and which
optional tools (`gs`, `qpdf`, a Chromium-based browser) are present, missing,
or where they resolved from. (`packages/cli/README.md:329-335`)

Tool resolution and overrides: `CHROMIUM_PATH` / `PUPPETEER_EXECUTABLE_PATH`
for the browser, `GHOSTSCRIPT_PATH` for Ghostscript; `qpdf` has no override
env var and must be on `PATH`. These are local tool-path settings, not
credentials. (`examples/gutterpress-user-guide/07-system-setup.md:206-229`)

## Scaffold a project

```bash
gutterpress new "<project>" --preset dtrpg
```

`--preset` is required and is one of `dtrpg` (DriveThruRPG print-on-demand),
`book` (neutral 6x9in trade book), or `custom` (you supply
`--page-width`/`--page-height` in points). This is how the book is
*designed*; where it is *published* is a separate `targets:` setting (see
below). (`packages/cli/src/commands/new.ts:74-76`, `packages/cli/README.md:144-169`)

## Manifest and the `dtrpg` preset

`manifest.yaml` carries everything not authored in markdown: title, page
size, styles, extensions, publish targets, and PDF/X configuration. Setting
`preset: dtrpg` fills in DriveThruRPG-ready defaults for every other section —
you don't have to hand-write them:

| Manifest key | `dtrpg` preset default | Source |
|---|---|---|
| `pdfx.flavor` | `x1a` | `packages/cli/src/lib/presets.ts:45-49` |
| `pdfx.icc` | `profiles/CGATS21_CRPC1.icc` (bundled with the CLI) | `packages/cli/src/lib/presets.ts:47` |
| `pdfx.stripAnnotations` | `true` | `packages/cli/src/lib/presets.ts:48` |
| `page.width` / `page.height` | `621` / `810` (points) | `packages/cli/src/lib/presets.ts:50-54` |
| `ink.maxTac` / `ink.tacTolerance` | `240` / `0.5` (percent) | `packages/cli/src/lib/presets.ts:55-58` |
| `targets` (when the manifest has none) | `[dtrpg]` | `packages/cli/src/lib/presets.ts:30` |
| required validate checks | `pdf.structure.qpdf`, `pdf.print.pdfx-markers`, `pdf.print.pdfx-metadata`, `pdf.print.embedded-fonts` | `packages/cli/src/lib/presets.ts:63-82` |

Every leaf is overridable in the manifest (`cli flags > manifest.yaml >
target > preset` precedence). The `book` preset is the same shape with no
default publish target, `ink.maxTac: 400` (i.e. effectively no TAC cap), and
PDF/X-only checks left off by default. (`packages/cli/src/lib/presets.ts:113-134`)

`page.width`/`page.height` are validation bounds, not the real trim size —
the actual PDF page size comes from the `@page` rule in your CSS. Set them to
match what your CSS produces so a CSS mistake gets caught by
`pdf.print.page-size`. (`docs/schema-autocomplete.md:294`)

### Signature padding (build-time, not a check)

Set `print: { signature: 4 }` (or `6`) in the manifest and gutterpress pads
the interior with blank pages at build time until the page count is a
multiple of that number. DriveThruRPG documents 4-page signatures at
6.69in x 9.61in and larger; books at 6.14in x 9.21in and smaller may use 4 or
6. Confirm the exact value for every format and binding choice in the generated
cover template. Once selected, padding is handled at build time rather than by
a separate validation check afterward.
(`packages/cli/src/schema/manifest.types.ts:122-129,233-235`,
`packages/cli/src/engine/compiler/postprocess.ts:57-63`)

## Build print-ready PDF/X

```bash
gutterpress build ./my-book --format pdfx --pdfx-flavor x1a --icc path/to/profile.icc
```

Relevant `build` flags (`packages/cli/src/commands/build.ts:17-30`,
`packages/cli/README.md:203-221`):

| Flag | Meaning |
|---|---|
| `--format pdfx` | Build PDF/X instead of plain PDF or HTML |
| `--pdfx-flavor x1a\|x3` | PDF/X flavor (`--format pdfx` only) |
| `--icc <path>` | ICC profile for the output intent |
| `--strip-annotations` | Strip PDF annotations for PDF/X compliance |
| `--skip-lint` / `--skip-pre-validate` / `--skip-post-validate` | Skip the corresponding pipeline stage |
| `--allow-shrink` | Build anyway when content overflows the page box, instead of failing |
| `--out <path>` | Output file (may be a `.pdf` path) or directory |

Pipeline order: `lint → validate:pre-build → convert → assets → build →
validate:post-build`. The `validate:post-build` stage (PDF/X structural and
print-compliance checks) only runs for `--format pdfx`; a plain `--format
pdf` build stops after `build`.
(`examples/gutterpress-user-guide/06-validation.md:16-25`, `packages/cli/README.md:205`)

One-shot alternative for a quick look: `gutterpress preview ./my-book
--format pdfx --icc path/to/profile.icc` builds and opens the PDF/X directly.
(`packages/cli/README.md:181-201`)

### ICC profile default

If you omit `--icc` and the manifest resolves to the default filename
`CGATS21_CRPC1.icc` (true for the `dtrpg`/`book` presets) and no local file by
that name exists next to the manifest or in the working directory, gutterpress
falls back to its own bundled copy automatically — you only need to pass
`--icc` to use a *different* profile. The bundled file is the same
`CGATS21_CRPC1.icc` kept in `references/` here.
(`packages/cli/src/lib/build-runner.ts:536-565`)

### What the PDF/X conversion actually does

`gutterpress build --format pdfx` shells out to Ghostscript once, converting
the Chromium-rendered RGB PDF straight to a CMYK `pdfwrite` PDF/X file:
`-sProcessColorModel=DeviceCMYK -sColorConversionStrategy=CMYK
-dOverrideICC=true -sOutputICCProfile=<your icc>`, with a generated PostScript
preamble that sets the `/OutputIntent` (`GTS_PDFX`, your ICC as
`/DestOutputProfile`) and `GTS_PDFXVersion`/`GTS_PDFXConformance` DOCINFO
entries, plus font embedding/subsetting flags.
(`packages/cli/src/lib/ghostscript.ts:206-282,304-367`)
`--strip-annotations` (default `true` under the `dtrpg`/`book` presets) runs
`qpdf --flatten-annotations=all` plus an in-process pass to delete remaining
link annotations, since PDF/X forbids them. (`packages/cli/src/lib/ghostscript.ts:165-204`)

Live CSS transparency (opacity, blend modes, RGBA images) has nothing to map
to in PDF/X-1a/X-3 (both PDF 1.3-based); Ghostscript's only compliant option
is to flatten the affected page to a raster image, which drops its embedded
fonts and searchable text. gutterpress detects this ahead of time so the
build can warn about it precisely. (`packages/cli/src/lib/ghostscript.ts:82-163`)

## Validate, audit, and preflight

```bash
# Full validation pipeline (pre- and/or post-build, depending on flags given)
gutterpress validate --pdf dist/my-book/my-book-pdfx.pdf --target dtrpg

# Source/asset checks only, before a build exists
gutterpress validate --input ./my-book

# Asset-only checks (images: DPI, color space, alpha, file size)
gutterpress audit ./my-book

# Deterministic GO/FIX/NO-GO preflight report (JSON + Markdown)
gutterpress preflight --pdf dist/my-book/my-book-pdfx.pdf --target dtrpg
```

`validate` flags: `--pdf <path>` (post-build checks), `--input <dir>`
(pre-build checks; the positional directory does the same unless `--input`
is also given), `--manifest`, `--category source,pdf,asset,heuristic`,
`--only <ids>` / `--skip <ids>` (comma-separated, `*` wildcards), `--format
text|json`, `--phase pre|post|all`, `--target <ids>` (comma-separated,
overrides the manifest's `targets:`).
(`packages/cli/src/commands/validate.ts:10-56`, `packages/cli/README.md:278-296`)

`preflight` flags: `--pdf <path>` (required), `--input <dir>`, `--manifest`,
`--target <ids>`, `--report-dir <dir>` (default: next to the PDF), `--name
<base>`. Writes `<name>.json` and `<name>.md`; exits `1` (`NO-GO`) when there
are errors or a target's required check was skipped instead of running.
(`packages/cli/src/commands/preflight.ts:188-284`)

Status is computed as: any error, or any required check skipped ⇒ **NO-GO**;
otherwise any warning or missing tool ⇒ **FIX**; otherwise **GO**.
(`packages/cli/src/commands/preflight.ts:53-62`)

### Publish targets

A **target** is *where you publish*, separate from `preset:` (*how the book
is designed*). List them in the manifest to validate every destination in
one run:

```yaml
targets:
  - dtrpg
  - itch
```

| Target | Policy | Required checks | Required tools |
|---|---|---|---|
| `dtrpg` (DriveThruRPG) | PDF/X markers+metadata, embedded fonts, CMYK/Grayscale art, 240% TAC | `pdf.structure.qpdf`, `pdf.print.pdfx-markers`, `pdf.print.pdfx-metadata`, `pdf.print.embedded-fonts` | `qpdf`, `gs` |
| `itch` (itch.io, digital) | Well-formed PDF, embedded fonts; PDF/X/ink/CMYK-only rules do not apply | `pdf.structure.qpdf`, `pdf.print.embedded-fonts` | none |

(`packages/cli/src/lib/targets.ts:71-138`)

With `dtrpg` selected but `qpdf`/`gs` missing, its required checks are
reported as **errors**, not silently skipped — "validated for DriveThruRPG"
is meant to guarantee the checks actually ran.
(`examples/gutterpress-user-guide/06-validation.md:60-65`)

## Print-relevant checks

36 built-in checks run across four categories (`source`, `pdf`, `asset`,
`heuristic`) at two phases (pre-build, post-build); the ones that map to
print-file correctness:

| Check id | What it verifies | Tool needed | Source |
|---|---|---|---|
| `pdf.print.pdfx-markers` | PDF/X `OutputIntent` structure via qpdf JSON | `qpdf` | `packages/cli/src/checks/pdf/pdfx-markers.ts:11` |
| `pdf.print.pdfx-metadata` | PDF/X DOCINFO metadata (`GTS_PDFXVersion` etc.) via qpdf JSON | `qpdf` | `packages/cli/src/checks/pdf/pdfx-metadata.ts:11` |
| `pdf.print.embedded-fonts` | All fonts in the PDF are embedded | none (in-process) | `packages/cli/src/checks/pdf/embedded-fonts.ts:6` |
| `pdf.print.page-size` | PDF dimensions match `page.width`/`page.height` | none | `packages/cli/src/checks/pdf/page-size.ts:7` |
| `pdf.print.bleed` | MediaBox vs. TrimBox/BleedBox | none | `packages/cli/src/checks/pdf/bleed.ts:20` |
| `pdf.print.color-spaces` | Color spaces used in the PDF | none | `packages/cli/src/checks/pdf/color-spaces.ts:6` |
| `pdf.print.image-resolution` | DPI of images embedded in the built PDF | none | `packages/cli/src/checks/pdf/image-resolution.ts:6` |
| `pdf.print.transparency` | Live PDF transparency (groups, soft masks, alpha) | none | `packages/cli/src/checks/pdf/transparency.ts:6` |
| `pdf.print.ink-coverage` | Total ink coverage (TAC) per page | `gs` | `packages/cli/src/checks/pdf/ink-coverage.ts:6` |
| `pdf.structure.qpdf` | PDF parses and every page is traversable (id kept for compat; no longer calls qpdf itself) | none | `packages/cli/src/checks/pdf/qpdf-structure.ts:6-10` |
| `asset.image.resolution` | Source image DPI from embedded density metadata | none | `packages/cli/src/checks/asset/image-resolution.ts:7` |
| `asset.image.color-space` | Source image color space against an allowed list | none | `packages/cli/src/checks/asset/image-color-space.ts:15` |
| `asset.image.alpha-channel` | Alpha channels in source PNG/TIFF images | none | `packages/cli/src/checks/asset/image-alpha.ts:6` |
| `asset.image.tac-raster` | Per-image TAC on source raster images | `gs` | `packages/cli/src/checks/asset/image-tac.ts:10` |

All of these except the two `qpdf`-based PDF/X checks and the two
`gs`-based TAC checks run in-process with no external tool
(`examples/gutterpress-user-guide/07-system-setup.md:21-26,160-204`).
Disable or re-tag any check's severity under `validate.checks` in the
manifest; run/skip a subset with `validate`'s `--only`/`--skip`.
(`examples/gutterpress-user-guide/06-validation.md:171-200`)

## TAC / ink coverage, corrected

gutterpress measures total area coverage (TAC) two ways, and **both are page-
or image-level Ghostscript `inkcov` sums, not a per-pixel maximum**:

- `pdf.print.ink-coverage` (post-build): runs `gs -q -dBATCH -dNOPAUSE
  -sDEVICE=inkcov <pdf>` and reads Ghostscript's per-page CMYK coverage
  percentages directly — the same page-averaged numbers `gs -sDEVICE=inkcov`
  has always produced.
  (`packages/cli/src/checks/pdf/ink-coverage.ts:1-88`,
  `packages/cli/src/lib/pdf-parse.ts:23-27,68-102`)
- `asset.image.tac-raster` (pre-build): runs the same `gs -sDEVICE=inkcov`
  against each source raster image individually.
  (`packages/cli/src/checks/asset/image-tac.ts:1-86`)

Both compare against the resolved `ink.maxTac` plus `ink.tacTolerance` —
**top-level** manifest keys, not values nested under `validate:`. The `dtrpg`
preset resolves these to `240` and `0.5`; the vendor-neutral `book` preset
uses `400` and `0.5`:

```yaml
ink:
  maxTac: 240
  tacTolerance: 0.5
```

(`examples/gutterpress-user-guide/06-validation.md:193-200`)

gutterpress does **not** provide a true per-pixel peak-TAC validator (reading
raw CMYK bytes per pixel and tracking the single worst pixel across a raster,
as opposed to a page/image average). If you need that specific measurement,
say so and treat it as outside what gutterpress checks — do not assume the
`inkcov`-based checks above are doing it.

## DriveThruRPG guided publishing

DriveThruRPG has no upload API, so `gutterpress publish --provider
drivethrurpg` does what it can headlessly: it validates the book and prepares
an upload package (the PDF plus a generated `LISTING.md`). Add `--open` to
open DriveThruRPG's upload page and finish manually.
(`examples/gutterpress-user-guide/08-publishing.md:1-16`,
`packages/cli/src/commands/publish.ts:145-150`)

```bash
gutterpress validate --target dtrpg --pdf dist/my-book/my-book-pdfx.pdf
gutterpress publish --provider drivethrurpg --open ./my-book
```

Other `publish` flags: `--list` (providers + connection status), `--connect`
/ `--disconnect` (store/forget a provider API key), `--file <path>`,
`--dry-run` (preflight only), `--json`, `--open`.
(`packages/cli/src/commands/publish.ts:105-138`, `packages/cli/README.md:223-254`)
For providers that do use an API key in CI, gutterpress reads it from a
provider-specific environment variable (e.g. itch.io's `BUTLER_API_KEY`) —
supply yours from your own credential store as an env ref such as
`env/itch-butler-api-key`; never write the value into the manifest or this
skill. (`examples/gutterpress-user-guide/08-publishing.md:103-110`)

The manual DriveThruRPG Publisher Hub walkthrough in
`references/drivethrurpg-upload-steps.md` still applies for the parts
gutterpress can't automate (premedia review, ordering/checking a proof,
activating the listing).

## Exit codes

`0` clean, `1` findings (validate/preflight/audit findings, or a build
quality-gate rejection), `2` usage error, `3` pipeline failure (I/O, missing
tool, renderer crash). Uniform across `build`, `preview`, `lint`, `validate`,
`preflight`, `audit`, `publish`, `ext`, `new`, `doctor`.
(`packages/cli/README.md:429-440`, `packages/cli/src/lib/build-error.ts:28-33`)

## References

- `references/DRIVETHRURPG.md` — DriveThruRPG POD file specs, bleed/margin
  diagram, black values, TAC limits, signature/page-count rules, and
  production notes.
- `references/TRIM_SIZES.md` — Standard trim sizes with bleed, margin/gutter
  guidelines by page count.
- `references/drivethrurpg-upload-steps.md` — The manual Publisher Hub
  walkthrough (account setup, cover template generator, premedia review,
  proofing, going live) for the parts `gutterpress publish` doesn't automate.
- `references/CSS_PRINT.md` — General CSS-for-print techniques (`@page`
  margins, shape-outside, drop caps, running headers, PDF/X compatibility
  notes). Written pipeline-agnostically; gutterpress renders through the same
  Chromium-based CSS Paged Media engine, but also has its own page-template
  and cascade conventions layered on top — see gutterpress's own
  `docs/native-engine-styling-guide.md` and
  `docs/contextual-cascade-principle.md` in its repo before assuming a
  technique here applies as-is.
- `references/CGATS21_CRPC1.icc` — The CGATS21 CRPC1 ICC profile.
  Byte-identical to the copy gutterpress bundles at
  `packages/cli/profiles/CGATS21_CRPC1.icc` and used as the default
  `--icc` for the `dtrpg`/`book` presets.
