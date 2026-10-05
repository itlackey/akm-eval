---
description: A structured checklist for human visual QA of printed PDFs,
  covering margins, numbering, breaks, and consistency.
when_to_use: Use this asset when performing a manual visual review of a
  print-ready PDF to verify structural integrity, layout safety, and typographic
  consistency before final approval.
updated: 2026-06-19
---

# Print Quality Checklist (Visual Review)

This checklist is specific to the human visual QA workflow. For shared print standards (margins, bleed, typography thresholds, color, resolution), refer to the canonical source: `knowledge/print/pipelines/print-specs` (not part of this bundle; provide it in your own stash and load it with `akm show knowledge/print/pipelines/print-specs`).

---

## Visual Review Methodology

### Page-by-Page Review Process

**Three-Pass System:**

**Pass 1: Structural Review** (Fast scan)
- Page numbering sequence
- Chapter/section breaks
- Blank pages (intended vs errors)
- Obvious layout breaks
- Missing content

**Pass 2: Detailed Review** (Thorough)
- Margins and safe zones
- Typography and spacing
- Images and graphics
- Headers and footers
- Alignment and consistency

**Pass 3: Edge Cases** (Critical check)
- First/last pages of sections
- Pages with complex layouts
- Color vs B&W pages
- Special elements (tables, sidebars)
- Reference elements (TOC, index)

---

## Margins and Safe Zones

### How to Check

**Visual Method:**
1. Look at page edges - is content too close?
2. Check inner edge - can text be read when bound?
3. Compare left/right pages - are margins symmetric?
4. Verify chapter starts - do they use different margins?

**Measurement Method:**
1. Use ruler tool in PDF viewer
2. Measure from edge to first content
3. Check against spec requirements (see `knowledge/print/pipelines/print-specs`)
4. Document any violations

**Things That Should Touch Edges:**
- Background colors/images (if intended)
- Full-bleed images
- Decorative elements

**Things That Should NOT Touch Edges:**
- Body text
- Important images
- Page numbers (unless design choice)
- Headers/footers with critical info

---

## Page Numbering

### Placement Check

**Standard Positions:**
- Bottom center (most common)
- Bottom outer corners (recto/verso)
- Top outer corners
- Top center

**Rules:**
- Consistent position throughout
- Easy to find when flipping
- Not in margins that get cut

### Special Cases

**Pages Without Numbers (Acceptable):**
- Title page
- Copyright page
- Blank pages
- Full-bleed images (sometimes)
- Chapter openers (design choice)

**Roman vs Arabic:**
- Frontmatter: typically lowercase roman (i, ii, iii)
- Main content: Arabic numerals (1, 2, 3)
- Should restart at 1 for main content

---

## Headers and Footers

### Content Check

**Left Page (Verso) Typically:**
- Book title or section title
- Page number

**Right Page (Recto) Typically:**
- Chapter title or author
- Page number

### Issues to Flag
- Wrong content (old chapter title on new chapter)
- Inconsistent styling
- Too large/prominent
- Missing where expected

### First Page Exceptions
Chapter/section first pages often have no header (design choice). Should be a consistent rule across all first pages.

---

## Page Breaks

### Good Breaks
- At natural divisions (end of chapter/section)
- Strategic placement (chapter starts on recto)
- After complete thoughts

### Bad Breaks
- Mid-thought (sentence splits across pages)
- Visual disruption (caption separated from image, list items split)
- Heading isolation (heading at bottom with no text)

### Checking Method
1. Flip through PDF page by page
2. Look for awkward breaks
3. Check if content flows naturally
4. Verify headings have at least 2-3 lines of text after

---

## Consistency Across Pages

### Visual Rhythm

**Should Be Consistent:**
- Margins (unless intentional change)
- Text column width
- Line spacing
- Header/footer position
- Font sizes
- Color scheme

**Can Vary:**
- Chapter openers (often special)
- Full-page images
- Special sections (appendix, etc.)
- Intentional design changes

---

## Special Pages

### Title Page
- Title prominent and clear
- Author name present
- No page number (typically)
- Clean, uncluttered design

### Copyright Page
- Copyright notice, ISBN, publisher info, edition statement, printing date, legal notices
- Usually small text (8-9pt acceptable)
- No page number or roman numeral

### Table of Contents
- Page numbers accurate
- Dot leaders aligned (if used)
- Hierarchy clear
- All sections included

### Chapter Openers
- All formatted same way
- Start on recto (if that's the rule)
- Consistent spacing
- Chapter number and title present

---

## Accessibility Considerations

- Sufficient contrast (4.5:1 for body text, 3:1 for large text 18pt+)
- Clear, legible fonts
- Good character differentiation
- Clear hierarchy and logical flow

---

## Final Checklist

### Before Declaring PDF Ready

**Structural:**
- [ ] All pages present and in order
- [ ] Page numbering correct throughout
- [ ] No blank pages (unless intentional)
- [ ] Chapters start correctly
- [ ] Table of contents matches content

**Visual:**
- [ ] Margins consistent and adequate
- [ ] No content in unsafe zones
- [ ] Headers/footers present and correct
- [ ] Images high quality and placed well
- [ ] Typography consistent and readable

**Technical:**
- [ ] Correct color mode (see `knowledge/print/pipelines/print-specs`)
- [ ] Proper resolution (300 DPI minimum)
- [ ] Bleed area correct (if applicable)
- [ ] Fonts embedded

**Content:**
- [ ] No widows or orphans
- [ ] Page breaks logical
- [ ] Tables formatted well
- [ ] Cross-references correct

**Polish:**
- [ ] Consistent styling throughout
- [ ] Professional appearance
- [ ] No obvious errors
- [ ] Meets design specifications

---

## Common Red Flags

### Immediate Concerns
- Text in margins (will be cut off)
- Low resolution images (will look pixelated)
- Missing page numbers
- Inconsistent fonts
- Widows/orphans everywhere
- Random page breaks
- Wrong color mode
- Content in gutter

### Review Documentation Format

**Page-Specific Issues:**
```
Page 47:
- CRITICAL: Body text extends into bottom margin
- MAJOR: Chapter heading orphaned at bottom of page
- MINOR: Inconsistent space after heading
```

**Pattern Issues:**
```
Pattern across pp. 23-45:
- MAJOR: Left page headers showing wrong chapter title
- MINOR: Paragraph spacing varies (0.5em vs 0.75em)
```
