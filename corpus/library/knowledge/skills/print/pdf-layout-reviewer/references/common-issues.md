---
description: A quick reference guide for identifying and fixing frequent visual,
  typographic, and structural problems in print layouts.
when_to_use: Use this asset when performing a pre-flight review of a PDF or
  print-ready file to identify common layout defects before final export.
updated: 2026-06-19
---

# Common Layout Issues Reference

Quick reference for identifying frequent problems in print layouts.

## Visual Identification Guide

### Text Overflow Issues

**How to spot:**
- Text cut off at column/page edge
- Ellipsis (...) appearing in body text
- Text boxes with visible boundaries and content exceeding them
- Last line of paragraph disappearing at page bottom

**Common causes:**
- Text box too small for content
- Font size increased without adjusting container
- Added content without pagination check

**Fix priority:** CRITICAL

### Rivers of White Space

**How to spot:**
- Vertical channels of white space running through justified text
- Multiple word spaces vertically aligning across 3+ lines
- Particularly visible when squinting or viewing at distance

**Common causes:**
- Justified text without hyphenation
- Narrow columns with long words
- Insufficient hyphenation settings

**Fix priority:** HIGH

### Trapped White Space

**How to spot:**
- Awkward pockets of empty space surrounded by content
- Irregular shapes of white space that look unintentional
- Different from intentional margins/gutters (less geometric)

**Common causes:**
- Poor text wrap around images
- Irregular image shapes without careful flow adjustment
- Pulled quotes or callouts without proper space planning

**Fix priority:** MEDIUM-HIGH

### Orphans & Widows

**How to spot:**
- **Widow**: Single line at top of page/column, separated from paragraph
- **Orphan**: Single word or very short line ending a paragraph
- **Orphan (alternate)**: Single line at bottom of page/column

**Common causes:**
- Default paragraph settings
- Not manually adjusting problematic breaks
- Automatic pagination without review

**Fix priority:** MEDIUM-HIGH

### Inconsistent Spacing

**How to spot:**
- Varying distances between similar elements (e.g., heading to text varies)
- Uneven margins across pages
- Irregular gutters between columns
- Different spacing before/after similar elements

**Visual check:** Measure with ruler tool or overlay grid

**Fix priority:** MEDIUM

### Poor Image Sizing

**How to spot:**
- Images that are too large (dominating spread unnecessarily)
- Images too small (details illegible, or lost on page)
- Inconsistent sizing for similar image types
- Awkward crops (cutting off important elements)
- Pixelation (insufficient resolution)

**Technical check:** 
- Resolution below 300 DPI at print size
- Scaled up more than 110% from original

**Fix priority:** HIGH (if illegible), MEDIUM (if inconsistent)

### Table Problems

**How to spot:**
- Text touching cell borders (insufficient padding)
- Columns too narrow (forced wrapping or abbreviation)
- Inconsistent row heights
- Headers not distinct from data rows
- Numbers not right-aligned
- Text not left-aligned
- Borders that are too heavy or too light

**Common in:** Data-heavy publications, RPG stat blocks, reference material

**Fix priority:** MEDIUM-HIGH (readability critical)

### Font Inconsistencies

**How to spot:**
- Different fonts for same semantic level (e.g., two different body text fonts)
- Incorrect weights (bold instead of semibold, or vice versa)
- Mixing font families unintentionally
- Size variations in elements that should match

**Systematic check:** 
1. List all font families used
2. List all sizes used for each semantic element
3. Verify intentional variation vs. error

**Fix priority:** HIGH

### Alignment Issues

**How to spot:**
- Elements that appear to align but don't quite (off by 1-2 pixels)
- Ragged edges that aren't deliberately ragged
- Centered elements slightly off-center
- Baseline misalignment across columns

**Visual check:** 
- Use guidelines/rulers in PDF viewer
- Compare to baseline grid

**Fix priority:** MEDIUM

### Margin Problems

**How to spot:**
- Inner margin too small (text disappearing into gutter)
- Inconsistent margins between recto/verso pages
- Content extending beyond safe zone
- Margins that don't account for bleed properly

**Measurement:**
- Use measuring tool in PDF viewer
- Check multiple pages for consistency

**Fix priority:** HIGH (if into gutter), MEDIUM (if inconsistent)

## Genre-Specific Issues

### Tabletop RPG Layouts

**Stat Block Issues:**
- Inconsistent formatting between similar creatures/items
- Borders too thick (competing with content)
- Insufficient padding inside stat blocks
- Headers not distinctive enough

**Sidebar Problems:**
- Interrupting text flow awkwardly
- Background colors too dark (reducing readability)
- Not clearly distinguished from body content
- Inconsistent placement patterns

### Art Magazine Layouts

**Image Presentation Issues:**
- Insufficient margin around featured artwork
- Captions too prominent (competing with art)
- Background not sufficiently neutral
- Inconsistent presentation style (some bordered, some not)
- Varying artwork sizes without clear rationale

**Typography Problems:**
- Fonts too decorative (competing with art)
- Text too prominent on spreads
- Inconsistent caption style

### Technical Manual Layouts

**Code Block Issues:**
- Font too small for readability
- Insufficient padding/margins
- Poor syntax highlighting contrast
- Inconsistent formatting across examples

**Diagram Problems:**
- Labels too small
- Unclear connections/flow
- Insufficient context
- Poor placement relative to referencing text

## Quick Diagnostic Checklist

When reviewing a layout, scan for:

1. **Text cutoff** (zoom corners and edges)
2. **Orphans/widows** (scan first/last lines of pages)
3. **Inconsistent fonts** (compare similar elements)
4. **Margin variations** (measure multiple pages)
5. **Image quality** (zoom to 200%+)
6. **Table readability** (can you quickly parse data?)
7. **Alignment** (use ruler/grid overlay)
8. **White space** (intentional vs. accidental gaps)
9. **Spread coherence** (do facing pages work together?)
10. **Color consistency** (compare across pages)
