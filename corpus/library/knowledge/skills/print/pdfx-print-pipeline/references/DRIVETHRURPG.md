---
description: Consolidated reference for DriveThruRPG POD requirements including
  PDF/X specs, bleed/margin rules, TAC limits, page signatures, and Ghostscript
  conversion commands.
when_to_use: When preparing or validating a manuscript for DriveThruRPG
  print-on-demand fulfillment.
updated: 2026-06-23
---

# DriveThruRPG Print-on-Demand Reference

**Last Updated:** January 20, 2026

**Canonical specs:** `knowledge/print/pipelines/print-specs` (single source of truth for shared specs; not part of this bundle, provide it in your own stash and load it with `akm show knowledge/print/pipelines/print-specs`)

This is the consolidated, token-efficient reference for DriveThruRPG POD requirements, including practical lessons from production builds.

Primary references:
- https://help.drivethrupartners.com/hc/en-us/articles/12780800178583-Quick-Specifications-for-Print-Books
- https://help.drivethrupartners.com/hc/en-us/articles/12780763819031-Book-Formats-and-Sizes-FAQ
- Cover template generator: https://www.drivethrurpg.com/pub_podbook_templates.php

**Related Guides** (not part of this bundle; provide them in your own stash and load each with `akm show <ref>`):
- TAC Limiting Guide, `knowledge/print/pipelines/tac-limiting-guide` (optional) - Reducing ink coverage
- Canonical Print Specs, `knowledge/print/pipelines/print-specs` - Single source of truth

## File Requirements

| Requirement | Value |
|-------------|-------|
| **Format** | PDF/X-1a:2001 or PDF/X-3:2002 |
| **Color (interior)** | CMYK (color) or Grayscale (B&W) |
| **ICC Profile** | CGATS21_CRPC1.icc |
| **Max TAC** | 240% |
| **Resolution** | 300 DPI minimum |
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
- **Recommended:** Under 220% for safety

Check with Ghostscript:
```bash
gs -o - -sDEVICE=inkcov document.pdf
```

## Page Signatures

| Book Size | Signature |
|-----------|-----------|
| >= 6.69" x 9.61" | 4-page |
| < 6.69" x 9.61" | 6-page |

### Page Count Rules

Interior page count must be:
- One less than signature multiple, OR
- Final page completely blank (no page numbers, backgrounds)

**Example (6x9, 6-page signature):**
- Content: 127 pages
- Valid counts: 125, 131 (signature multiples - 1)
- Or: 126, 132 with blank final page

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


## Practical Lessons (from Book Production)

### PDF/X-1a Marker

Ghostscript requires specific flags to create valid PDF/X-1a:

```bash
gs -dNOPAUSE -dBATCH -dQUIET \
  -sDEVICE=pdfwrite \
  -dPDFX=true \                    # CRITICAL: Enables PDF/X mode
  -dPDFSETTINGS=/prepress \
  -dCompatibilityLevel=1.3 \       # PDF 1.3 required for PDF/X-1a
  -sColorConversionStrategy=CMYK \
  -dProcessColorModel=/DeviceCMYK \
  -dEmbedAllFonts=true \
  -sOutputFile=output.pdf \
  pdfx-definition.ps \             # PostScript preamble with metadata
  input.pdf
```

The PostScript preamble must include:
```postscript
[ /GTS_PDFXVersion (PDF/X-1a:2001)
  /GTS_PDFXConformance (PDF/X-1a:2001)
  /DOCINFO pdfmark
```

Verify with:
```bash
exiftool -GTS_PDFXVersion output.pdf
# Expected: PDF/X-1a:2001
```

### PDFX Definition File

```postscript
%!PS-Adobe-3.0
/ICCProfile (CGATS21_CRPC1.icc) def

[ /GTS_PDFXVersion (PDF/X-1a:2001) /DOCINFO pdfmark

[ /Title (Document Title)
  /Creator (PDF/X Pipeline)
  /Trapped /False
  /DOCINFO pdfmark

[ /OutputCondition (CGATS TR 001)
  /OutputConditionIdentifier (CGATS TR 001)
  /RegistryName (http://www.color.org)
  /Info (CGATS21_CRPC1.icc)
  /DestOutputProfile ICCProfile
  /OutputIntent pdfmark
```

### Ghostscript Full Conversion Command

```bash
gs -dPDFX -dBATCH -dNOPAUSE -dNOOUTERSAVE \
   -sDEVICE=pdfwrite \
   -dCompatibilityLevel=1.4 \
   -sColorConversionStrategy=CMYK \
   -sProcessColorModel=DeviceCMYK \
   -sOutputICCProfile=CGATS21_CRPC1.icc \
   -sDefaultCMYKProfile=CGATS21_CRPC1.icc \
   -dOverrideICC=true \
   -dColorImageResolution=300 \
   -dGrayImageResolution=300 \
   -dEmbedAllFonts=true \
   -dSubsetFonts=true \
   -dPDFXTrimBoxToMediaBox=true \
   -sOutputFile=output_pdfx.pdf \
   -f pdfx_def.ps \
   input.pdf
```

### TAC Limiting

Browser-based renderers output RGB. Post-processing is required:

1. **Measure TAC first:**
   ```bash
   # Sample first 10 pages
   gs -dNOPAUSE -dBATCH -sDEVICE=tiff32nc -r72 \
     -dFirstPage=1 -dLastPage=10 \
     -sOutputFile=sample-%04d.tif input.pdf
   ```

2. **Apply TAC limiting via device-link ICC profile:**
   ```bash
   # Create TAC-limited profile
   linkicc -o cmyk-tac240.icc -k240 default_cmyk.icc default_cmyk.icc

   # Apply to each page
   tificc -l cmyk-tac240.icc input.tif output.tif
   ```

3. **Allow ~1% tolerance:** TAC of 240.4% is acceptable due to rounding.

See the TAC Limiting Guide, `knowledge/print/pipelines/tac-limiting-guide` (optional, from your own stash), for complete workflow.

### ICC Profile

**CGATS21_CRPC1.icc** is required.

Download from:
- https://idealliance.org/specifications/gracol/
- https://www.color.org/registry/

Specifications:
- TAC: 240%
- UCR/GCR: Medium+
- Max Black: 100%

### Image Format Issues

Browser-based PDF renderers (e.g., Paged.js) cannot handle:
- TIFF files (even CMYK TIFFs)
- XCF/PSD editor files

**Solution:** Keep web-friendly images (PNG/JPG) in `images/` directory. Archive TIFFs separately.

### Filename Requirements

Spaces in image filenames break markdown-it-attrs parsing:
```markdown
<!-- BROKEN: Space in filename -->
![Character Art](images/Character Art.png){.float-right}

<!-- WORKS: Dash in filename -->
![Character Art](images/Character-Art.png){.float-right}
```

### Page Size with Bleed

For 8.5x11" trim with 0.125" bleed:
- Document size: 8.75" x 11.25"
- CSS: `@page { size: 8.75in 11.25in; }`

### Signature Alignment

Page count warnings (e.g., "566 not divisible by 4") are advisory. DriveThruRPG accepts non-aligned counts, but optimal printing uses:
- 4-page signatures (most common)
- Add blank pages to reach next multiple of 4 if desired

### Verification Commands

```bash
# Check PDF/X compliance
exiftool -GTS_PDFXVersion -GTS_PDFXConformance file.pdf

# Check fonts
pdffonts file.pdf | grep -v "emb"

# Check page size
pdfinfo file.pdf | grep "Page size"

# Check encryption
pdfinfo file.pdf | grep "Encrypted"
```
