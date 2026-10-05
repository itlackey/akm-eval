---
description: Advanced CSS techniques for print-ready documents.
when_to_use: Use this asset when generating print-ready PDFs that require
  specific page dimensions, complex text wrapping shapes, or CMYK color
  management.
updated: 2026-06-19
---

# CSS for Print Reference

Advanced CSS techniques for print-ready documents.

## Page Setup

### Basic Page Definition

```css
@page {
  size: 6.25in 9.25in;  /* trim + bleed */
  margin: 0;
  marks: crop cross;
}

/* Alternating margins for book layout */
@page :left {
  margin-left: 0.875in;   /* gutter */
  margin-right: 0.625in;  /* outside */
}

@page :right {
  margin-left: 0.625in;   /* outside */
  margin-right: 0.875in;  /* gutter */
}

@page :first {
  /* First page styles */
}
```

### Page Breaks

```css
/* Force page break after */
.page { page-break-after: always; }

/* Prevent break inside */
.stat-block { break-inside: avoid; }

/* Keep header with content */
h2 { break-after: avoid; }

/* Control orphans/widows */
p {
  orphans: 3;  /* min lines at bottom */
  widows: 3;   /* min lines at top */
}
```

## Shape-Outside

Text wrapping around complex shapes.

### Circle

```css
.circle-shape {
  width: 200px;
  height: 200px;
  float: left;
  shape-outside: circle(50%);
  clip-path: circle(50%);
  margin-right: 20px;
}
```

### Ellipse

```css
.ellipse-shape {
  width: 250px;
  height: 180px;
  float: right;
  shape-outside: ellipse(50% 40% at 50% 50%);
  clip-path: ellipse(50% 40% at 50% 50%);
}
```

### Polygon

```css
/* Diamond */
.diamond {
  shape-outside: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
}

/* Irregular */
.irregular {
  shape-outside: polygon(
    0% 0%,
    80% 0%,
    100% 20%,
    90% 40%,
    100% 60%,
    85% 80%,
    100% 100%,
    0% 100%
  );
  shape-margin: 15px;
}
```

### Path

```css
/* Shield/crest shape */
.shield {
  shape-outside: path('M 100 0 L 200 50 L 200 150 Q 200 200 100 200 Q 0 200 0 150 L 0 50 Z');
  clip-path: path('M 100 0 L 200 50 L 200 150 Q 200 200 100 200 Q 0 200 0 150 L 0 50 Z');
}
```

### Inset

```css
.rounded-box {
  shape-outside: inset(10px 10px 10px 10px round 20px);
  clip-path: inset(10px round 20px);
}
```

## Drop Caps

### CSS First-Letter

```css
.drop-cap::first-letter {
  float: left;
  font-size: 4em;
  line-height: 0.8;
  margin-right: 0.1em;
  margin-top: 0.05em;
  font-weight: bold;
  color: #1e3a5f;
}
```

### Shaped Drop Cap

```css
.drop-cap-circle {
  float: left;
  width: 80px;
  height: 80px;
  shape-outside: circle(50%);
  border-radius: 50%;
  background: #1e3a5f;
  color: gold;
  font-size: 48pt;
  text-align: center;
  line-height: 80px;
  margin-right: 10px;
}
```

## Multi-Column Layout

```css
.two-column {
  column-count: 2;
  column-gap: 0.375in;
  column-rule: 1px solid #ccc;
}

/* Span all columns */
.two-column h2 {
  column-span: all;
  break-after: avoid;
}

/* Prevent breaks */
.two-column p {
  break-inside: avoid;
}
```

## Print Colors

### Device CMYK

```css
/* Rich black */
.rich-black {
  color: device-cmyk(60% 40% 40% 100%);
}

/* Pure black */
.pure-black {
  color: device-cmyk(0% 0% 0% 100%);
}

/* Fallback pattern */
.text {
  color: #1a1a1a;  /* RGB fallback */
  color: device-cmyk(0% 0% 0% 100%);  /* CMYK if supported */
}
```

### Force Background Printing

```css
.print-bg {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
```

## Typography for Print

```css
body {
  font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
  font-size: 11pt;
  line-height: 1.5;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}

/* No indent after headers */
h1 + p, h2 + p, h3 + p {
  text-indent: 0;
}

/* Indent subsequent paragraphs */
p + p {
  text-indent: 1em;
  margin-top: 0;
}

/* Font smoothing */
* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

## Tables

```css
table {
  width: 100%;
  border-collapse: collapse;
  break-inside: avoid;
  font-size: 9pt;
}

th {
  background: #1e3a5f;
  color: white;
  padding: 6px 8px;
  text-align: left;
}

td {
  padding: 5px 8px;
  border-bottom: 1px solid #ddd;
}

tr:nth-child(even) {
  background: rgba(0,0,0,0.03);
}
```

## RPG Stat Blocks

```css
.stat-block {
  background: linear-gradient(135deg, #f5f0e1, #ede5d0);
  border: 2px solid #1e3a5f;
  padding: 12px;
  margin: 0.75em 0;
  font-size: 9pt;
  break-inside: avoid;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  text-align: center;
  border-top: 1px solid #c4a35a;
  border-bottom: 1px solid #c4a35a;
  padding: 6px 0;
  margin: 8px 0;
}
```

## Sidebars & Callouts

```css
/* Floating sidebar with shape-outside */
.sidebar {
  float: right;
  width: 2in;
  margin: 0 0 0.5em 0.25in;
  padding: 10px;
  background: #1e3a5f;
  color: white;
  font-size: 8pt;
  shape-outside: inset(0);
  shape-margin: 15px;
}

/* Pull quote */
.pull-quote {
  float: right;
  width: 40%;
  margin: 0 0 20px 30px;
  padding: 20px;
  font-style: italic;
  border-left: 4px solid #c4a35a;
}
```

## Running Headers & Page Numbers

```css
.page {
  position: relative;
}

.page-number {
  position: absolute;
  bottom: calc(0.125in + 0.25in);  /* bleed + margin */
  font-size: 9pt;
}

.page:nth-child(odd) .page-number {
  right: calc(0.125in + 0.5in);
}

.page:nth-child(even) .page-number {
  left: calc(0.125in + 0.5in);
}

.running-header {
  position: absolute;
  top: calc(0.125in + 0.375in);
  font-size: 8pt;
  font-variant: small-caps;
  letter-spacing: 0.1em;
  color: #888;
}
```

## PDF/X Compatibility Notes

1. **Transparency** - Flattened in PDF/X-1a; test output carefully
2. **Gradients** - Rasterized at document DPI
3. **Filters** - May not render; avoid blur, drop-shadow
4. **Web fonts** - Must be fully loaded before PDF generation
5. **RGB colors** - Converted to CMYK; may shift
