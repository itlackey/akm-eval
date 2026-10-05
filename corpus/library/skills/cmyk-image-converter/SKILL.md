---
name: cmyk-image-converter
description: Convert images to print-safe CMYK using ImageMagick + ICC profiles
  (DriveThruRPG-first), with batch conversion and verification steps.
when_to_use: Use this asset when preparing raster assets for professional offset
  printing or high-quality book production where color accuracy relative to a
  specific ICC profile is required.
updated: 2026-06-19
---

# CMYK Image Converter

Convert images to print-safe CMYK using ImageMagick + ICC profiles (DriveThruRPG-first), with batch conversion and verification steps.

## When to use
- Use this asset when preparing raster assets for professional offset printing or high-quality book production where color accuracy relative to a specific ICC profile is required.
- Do not use for web delivery, screen display, or archival workflows requiring RGB/sRGB/AdobeRGB.

## DriveThruRPG default
- **ICC Profile**: `CGATS21_CRPC1.icc`
- **Target Format**: TIFF (LZW compressed)
- **Resolution**: 300 DPI
- **Note**: Total Area Coverage (TAC) constraints are applied at the PDF stage; this step handles colorspace conversion and profiling.

## Prerequisites
- ImageMagick (`convert`, `identify`)
- ICC Profile file: `CGATS21_CRPC1.icc`

## Quick usage

### Single image (TIFF recommended)
```bash
convert input.png -profile CGATS21_CRPC1.icc -density 300 -compress lzw output.tif
```

### Batch directory conversion
```bash
./scripts/convert-to-cmyk.sh ./images ./output -p CGATS21_CRPC1.icc -f tif -r
```

## Verification
Check that the output file has the correct colorspace and profile embedded:
```bash
identify -verbose output.tif | grep -i -E "Colorspace|Profile"
```

## Notes
- PNG does not natively store CMYK well; prefer TIFF for print assets.
- Always verify the `Colorspace` field in `identify` output is `CMYK` before proceeding to PDF generation.

## References
- `skills/cmyk-image-converter/references/icc-profiles.md`

## Scripts
- `skills/cmyk-image-converter/scripts/convert-to-cmyk.sh`
