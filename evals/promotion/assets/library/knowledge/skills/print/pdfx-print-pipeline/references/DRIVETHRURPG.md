# DriveThruRPG Print-on-Demand Reference

**Last Updated:** September 15, 2026

This is the consolidated, token-efficient reference for DriveThruRPG POD requirements, including practical lessons from production builds.

Primary references:
- [Quick Specifications for Print Books](https://help.drivethrupartners.com/hc/en-us/articles/12780800178583-Quick-Specifications-for-Print-Books)
- [Correcting Most Common Print Errors](https://help.drivethrupartners.com/hc/en-us/articles/12780799485335-Correcting-Most-Common-Print-Errors)
- [Book Formats and Sizes FAQ](https://help.drivethrupartners.com/hc/en-us/articles/12780763819031-Book-Formats-and-Sizes-FAQ)
- [Cover template generator](https://www.drivethrurpg.com/pub_podbook_templates.php)

## File Requirements

| Requirement | Value |
|-------------|-------|
| **Format** | PDF/X-1a:2001 or PDF/X-3:2002 |
| **Color (interior)** | CMYK (color) or Grayscale (B&W) |
| **ICC Profile** | CGATS21_CRPC1.icc |
| **Max TAC** | 240% |
| **Resolution** | 300 DPI for CMYK/grayscale; 600 DPI for B&W line art |
| **Fonts** | Fully embedded |
| **Security** | None (no encryption) |
| **Crop/registration marks** | None in file |

## Bleed & Margins

```
+--------------------------------------+
| <- 0.125" Bleed (outside edges only) |
|  +-------------------------------+   |
|  | <- Trim Line                  |   |
|  |  +-------------------------+  |   |
|  |  | <- 0.25" Safety (outside)|  |   |
|  |  | <- 0.5" Safety (gutter) |  |   |
|  |  |                         |  |   |
|  |  |    CONTENT SAFE AREA    |  |   |
|  |  |                         |  |   |
|  |  +-------------------------+  |   |
|  +-------------------------------+   |
+--------------------------------------+
```

- Bleed: 0.125in on outside edges only (NOT the binding edge)
- Text safety: 0.5in from all edges (treat binding edge as strict)
- Non-bleeding art safety: outside edges 0.25in, binding edge 0.5in

## Color Values

### Rich Black (Large Text >24pt, Graphics)
```
C: 60%  M: 40%  Y: 40%  K: 100%
TAC: 240% (at limit)
```

### Pure Black (Body Text <=24pt)
```
C: 0%  M: 0%  Y: 0%  K: 100%
TAC: 100%
```

**Never use Registration Black** (100/100/100/100) - causes bleeding.

## Total Area Coverage (TAC)

TAC = Cyan + Magenta + Yellow + Black

- **Maximum:** 240%

For a page-average diagnostic only, inspect Ghostscript's `inkcov` output:
```bash
gs -o - -sDEVICE=inkcov document.pdf
```

This is not a per-pixel peak-TAC test and does not prove that every point on a
page is at or below 240%. Use a dedicated prepress tool when peak-TAC evidence
is required.

## Page Signatures

| Book Size | Signature |
|-----------|-----------|
| >= 6.69" x 9.61" | 4-page |
| <= 6.14" x 9.21" | 4- or 6-page; use the cover template's value |
| Intermediate sizes | Use the cover template's value |

### Page Count Rules

Interior page count must be:
- One less than signature multiple, OR
- Final page completely blank (no page numbers, backgrounds)

**Example (6x9 when its cover template specifies a 6-page signature):**
- Cover-template page counts: 126 or 132
- Matching interior counts: 125 or 131
- Alternatively: 126 or 132 when the final page is completely blank

## Covers

- Generated via DriveThruRPG's Template Generator (required)
- Spine text not allowed under 48 pages
- Barcode: remove template barcode and leave a white box for printer SKU
- Same PDF/X format requirements as interior
- Template Generator: https://www.drivethrurpg.com/pub_podbook_templates.php

## Submission Checklist

### Before Upload

- [ ] PDF/X-1a:2001 or PDF/X-3:2002 compliant
- [ ] CMYK color space (or grayscale for B&W)
- [ ] TAC <= 240% on all pages
- [ ] Correct trim size + 0.125" bleed
- [ ] Page count matches signature requirement
- [ ] All fonts embedded
- [ ] No security/encryption
- [ ] No spot colors (PANTONE)
- [ ] Images 300 DPI minimum
- [ ] No crop/registration marks

### Common Rejection Reasons

1. TAC exceeds 240%
2. Wrong page dimensions
3. Missing bleed
4. Fonts not embedded
5. Page count doesn't match signature
6. RGB color space
7. Encrypted/secured PDF

---

## Pipeline Notes

Browser renderers normally produce an RGB PDF. Use the gutterpress PDF/X build
path described in `skills/print/pdfx-print-pipeline` for the Ghostscript
conversion and output intent; do not treat a PDF/X metadata marker by itself as
proof of compliance.

Run both target validation and preflight on the final artifact:

```bash
gutterpress validate --pdf dist/book/book-pdfx.pdf --target dtrpg
gutterpress preflight --pdf dist/book/book-pdfx.pdf --target dtrpg
```

These checks cover PDF structure, PDF/X markers and metadata, embedded fonts,
page geometry, color spaces, image resolution, transparency, and Ghostscript's
page-level ink-coverage report. The current gutterpress ink check is
page-averaged; it is not a per-pixel peak-TAC measurement. If the printer or
project requires peak-TAC proof, use a dedicated prepress tool and record that
result separately.

### ICC Profile

**CGATS21_CRPC1.icc** is required.

Use the copy bundled in this skill or download the current profile from
[DriveThruRPG's specification page](https://help.drivethrupartners.com/hc/en-us/articles/12780800178583-Quick-Specifications-for-Print-Books).

### Image Format Issues

Browser-based PDF renderers (e.g., Paged.js) cannot handle:
- TIFF files (even CMYK TIFFs)
- XCF/PSD editor files

**Solution:** Keep web-friendly images (PNG/JPG) in `images/` directory. Archive TIFFs separately.

### Filename Requirements

Unescaped spaces in image destinations are parsed inconsistently across
Markdown pipelines. Prefer URL-safe filenames:
```markdown
<!-- BROKEN: Space in filename -->
![Character Art](images/Character Art.png){.float-right}

<!-- WORKS: Dash in filename -->
![Character Art](images/Character-Art.png){.float-right}
```

### Page Size with Bleed

For 8.5x11" trim with 0.125" bleed:
- Document size: 8.625" x 11.25" (bleed on top, bottom, and outside edge;
  none on the binding edge)
- CSS: `@page { size: 8.625in 11.25in; }`

### Signature Alignment

Treat a signature mismatch as a release blocker until the generated cover
template confirms the intended count. The cover-template page count must be a
multiple of its 4- or 6-page signature. Submit an interior that is one page
shorter, or submit the full count with a completely blank final page reserved
for printer information.

### Supplemental inspection commands

```bash
# Inspect the declared PDF/X marker (not sufficient by itself)
exiftool -GTS_PDFXVersion -GTS_PDFXConformance file.pdf

# Inspect fonts; every data row must show "yes" in the emb column
pdffonts file.pdf

# Check page size
pdfinfo file.pdf | grep "Page size"

# Check encryption
pdfinfo file.pdf | grep "Encrypted"
```
