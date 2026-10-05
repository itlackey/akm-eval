# Paged.js CSS Patterns Reference

## Page Setup

### Basic @page Rules

```css
@page {
  size: A4;
  margin: 2cm 2cm 2cm 2cm;
}

/* Named pages for different sections */
@page chapter {
  margin: 3cm 2cm 2cm 2cm;
}

@page frontmatter {
  margin: 2cm;
}

/* Apply named pages */
.chapter {
  page: chapter;
}

.frontmatter {
  page: frontmatter;
}
```

### Page Breaks

```css
/* Force breaks */
.chapter {
  break-before: page;  /* Start on new page */
  break-after: avoid;  /* Don't break after */
}

/* Avoid breaks */
.keep-together {
  break-inside: avoid;
}

/* Right/left page breaks */
.chapter {
  break-before: right;  /* Start on right page */
}

/* Break before specific elements */
h1 {
  break-before: page;
}

h2, h3 {
  break-after: avoid;
  break-inside: avoid;
}

/* Keep with next element */
h2 {
  break-after: avoid;
}
h2 + p {
  break-before: avoid;
}
```

## Headers and Footers

### Running Headers

```css
@page {
  @top-center {
    content: string(chapter-title);
  }

  @top-left {
    content: string(section-title);
  }

  @top-right {
    content: "Page " counter(page);
  }
}

/* Set string values */
h1 {
  string-set: chapter-title content();
}

h2 {
  string-set: section-title content();
}
```

### Different Headers for Left/Right Pages

```css
@page :left {
  @top-left {
    content: string(book-title);
  }
  @top-right {
    content: counter(page);
  }
}

@page :right {
  @top-left {
    content: counter(page);
  }
  @top-right {
    content: string(chapter-title);
  }
}
```

### Blank First Pages

```css
@page :first {
  @top-center { content: none; }
  @bottom-center { content: none; }
}

/* Or for specific named pages */
@page chapter:first {
  @top-center { content: none; }
}
```

## Page Counters

### Basic Counters

```css
@page {
  @bottom-center {
    content: counter(page);
  }
}

/* Roman numerals for frontmatter */
@page frontmatter {
  @bottom-center {
    content: counter(page, lower-roman);
  }
}

/* Reset counter */
.frontmatter {
  counter-reset: page 1;
}

.main-content {
  counter-reset: page 1;
}
```

### Custom Counters

```css
/* Chapter counter */
body {
  counter-reset: chapter;
}

h1.chapter {
  counter-increment: chapter;
}

h1.chapter::before {
  content: "Chapter " counter(chapter) ": ";
}

/* Figure counter */
.chapter {
  counter-reset: figure;
}

figure {
  counter-increment: figure;
}

figcaption::before {
  content: "Figure " counter(chapter) "." counter(figure) ": ";
}
```

## Cross-References

```css
/* Target counter for page references */
a.page-ref::after {
  content: " (page " target-counter(attr(href), page) ")";
}

/* Target text for content references */
a.section-ref::after {
  content: " \"" target-text(attr(href)) "\"";
}
```

## Widows and Orphans

```css
p, li {
  orphans: 3;  /* Min lines at bottom of page */
  widows: 3;   /* Min lines at top of page */
}
```

## Footnotes

```css
/* Footnote area */
@page {
  @footnote {
    border-top: 1px solid black;
    padding-top: 0.5em;
  }
}

/* Footnote calls */
.footnote {
  float: footnote;
  footnote-display: block;
}

/* Footnote marker */
.footnote::footnote-call {
  content: counter(footnote);
  font-size: 0.8em;
  vertical-align: super;
}

.footnote::footnote-marker {
  content: counter(footnote) ". ";
}
```

## Debugging Patterns

### Visualize Page Boxes

```css
/* Show page boundaries */
@page {
  border: 2px solid red;
}

/* Show margin boxes */
@page {
  @top-left { border: 1px solid blue; }
  @top-center { border: 1px solid blue; }
  @top-right { border: 1px solid blue; }
}

/* Highlight break points */
* {
  outline: 1px solid rgba(255, 0, 0, 0.1);
}

h1, h2, h3 {
  outline: 2px solid rgba(0, 0, 255, 0.3);
}
```

### Common Issues

**Issue: Headers not appearing**
- Ensure `string-set` is applied to element that appears on page
- Check that element selector matches actual HTML
- Verify `content: string(name)` matches `string-set: name`

**Issue: Page breaks in wrong places**
- Add `break-inside: avoid` to container
- Use `break-after: avoid` on preceding element
- Consider `page-break-inside: avoid` (legacy property)

**Issue: Counters not incrementing**
- Verify `counter-reset` is on parent element
- Check `counter-increment` is on correct element
- Ensure elements are actually rendered (not `display: none`)

**Issue: Content overflowing margins**
- Check box-sizing model
- Verify padding + border + width calculations
- Use max-width instead of fixed width

## Print-Specific Media Queries

```css
/* Screen preview styles */
@media screen {
  body {
    background: #eee;
  }

  .pagedjs_page {
    box-shadow: 0 0 10px rgba(0,0,0,0.2);
    margin: 1cm auto;
  }
}

/* Print-only styles */
@media print {
  /* Hide preview chrome */
  .preview-controls {
    display: none;
  }
}
```

## Layout Patterns

### Two-Column Layout

```css
.two-column {
  columns: 2;
  column-gap: 1cm;
  column-rule: 1px solid #ccc;
}

/* Keep images from spanning columns */
img {
  break-inside: avoid;
  max-width: 100%;
}
```

### Bleed and Crop Marks

```css
@page {
  size: A4;
  margin: 2cm;
  marks: crop cross;
  bleed: 3mm;
}
```

### Running Elements (Complex Headers)

```css
/* Copy entire element to header */
.chapter-info {
  position: running(chapter-header);
}

@page {
  @top-center {
    content: element(chapter-header);
  }
}
```
