# Paged.js Troubleshooting Guide

## Table of Contents
1. Page Break Issues
2. Header/Footer Problems
3. Counter Issues
4. Layout and Overflow Problems
5. Performance Issues
6. Browser-Specific Issues

## Page Break Issues

### Unwanted Page Breaks

**Symptom:** Content breaks across pages when it should stay together

**Solutions:**
```css
/* Prevent breaks inside element */
.keep-together {
  break-inside: avoid;
  page-break-inside: avoid; /* fallback */
}

/* Keep heading with following content */
h2 {
  break-after: avoid;
  page-break-after: avoid; /* fallback */
}

/* Minimum lines before break */
p {
  orphans: 3;
  widows: 3;
}
```

**Common culprits:**
- Tables breaking mid-row: Add `break-inside: avoid` to `tr` or entire `table`
- Images splitting: Add `break-inside: avoid` to `figure` or `img` container
- Lists breaking awkwardly: Add `break-inside: avoid` to `li`

### Missing Page Breaks

**Symptom:** Content doesn't break where expected

**Causes:**
1. Element has `break-inside: avoid` that prevents natural break
2. Page has too much forced content without break points
3. Conflicting break properties

**Solutions:**
```css
/* Force break before element */
.chapter {
  break-before: page;
  page-break-before: always; /* fallback */
}

/* Force break to specific page side */
.chapter {
  break-before: right; /* always starts on right page */
}
```

### Blank Pages Appearing

**Symptom:** Extra blank pages between sections

**Causes:**
1. `break-before: right` or `break-before: left` creating blank page to reach correct side
2. Multiple break rules conflicting
3. Content ending on wrong side before forced break

**Solutions:**
```css
/* Allow blank pages */
@page :blank {
  @top-center { content: none; }
  @bottom-center { content: none; }
}

/* Or prevent by using simple page break */
.chapter {
  break-before: page; /* instead of 'right' */
}
```

## Header/Footer Problems

### Headers Not Showing

**Checklist:**
1. ✓ Is `string-set` applied to element that exists on the page?
2. ✓ Does the element selector match actual HTML?
3. ✓ Is element visible (not `display: none`)?
4. ✓ Does `string(name)` match the name in `string-set: name`?

**Example:**
```css
/* Wrong - no matching h1 on page */
h1 { string-set: chapter-title content(); }

/* Fix - use element that exists */
.chapter-title { string-set: chapter-title content(); }

/* In HTML */
<div class="chapter-title">Chapter 1: Introduction</div>
```

### Headers Showing Wrong Content

**Symptom:** Header shows content from previous section

**Cause:** String values persist until overwritten

**Solution:**
```css
/* Reset string at section boundaries */
.chapter {
  string-set: section-title "";
}

h2 {
  string-set: section-title content();
}
```

### Headers on First Page

**Symptom:** Don't want header/footer on chapter first page

**Solution:**
```css
@page chapter:first {
  @top-center { content: none; }
  @bottom-center { content: none; }
}
```

### Different Left/Right Headers Not Working

**Cause:** Not using `:left` and `:right` pseudo-classes correctly

**Solution:**
```css
/* Ensure page is named */
.content {
  page: content;
}

/* Define both sides */
@page content:left {
  @top-left { content: string(book-title); }
  @top-right { content: counter(page); }
}

@page content:right {
  @top-left { content: counter(page); }
  @top-right { content: string(chapter-title); }
}
```

## Counter Issues

### Counter Not Incrementing

**Checklist:**
1. ✓ Is `counter-reset` on a parent/ancestor element?
2. ✓ Is `counter-increment` on the correct element?
3. ✓ Are the elements being rendered?

**Example:**
```css
/* Wrong - counter never reset */
h1 { counter-increment: chapter; }

/* Fix - reset at document level */
body { counter-reset: chapter; }
h1 { counter-increment: chapter; }
```

### Counter Resets Unexpectedly

**Cause:** Multiple `counter-reset` declarations

**Solution:**
```css
/* Be explicit about where counters reset */
body {
  counter-reset: chapter figure table;
}

.chapter {
  counter-reset: figure table; /* reset per chapter */
}
```

### Page Numbers Wrong After Reset

**Symptom:** Page numbers restart but should continue

**Solution:**
```css
/* For frontmatter with roman numerals */
.frontmatter {
  counter-reset: page 1;
}

/* Main content continues from 1 */
.main-content {
  counter-reset: page 1;
}

/* Or don't reset, just change format */
@page frontmatter {
  @bottom-center {
    content: counter(page, lower-roman);
  }
}
```

## Layout and Overflow Problems

### Content Overflowing Page

**Symptoms:**
- Text extending beyond margins
- Images too large for page
- Tables extending off page

**Solutions:**
```css
/* Responsive images */
img {
  max-width: 100%;
  height: auto;
  break-inside: avoid;
}

/* Constrain tables */
table {
  width: 100%;
  table-layout: fixed;
  word-wrap: break-word;
}

/* Long URLs */
.url {
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
}
```

### Inconsistent Spacing

**Cause:** Margin collapse, varying line heights, or baseline alignment issues

**Solutions:**
```css
/* Consistent vertical rhythm */
* {
  margin: 0;
  padding: 0;
}

p {
  margin-bottom: 1em;
}

h1, h2, h3 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

/* Prevent margin collapse */
.section {
  padding-top: 1px;
}
```

### Elements Positioned Incorrectly

**Cause:** Absolute/fixed positioning doesn't work well with paged media

**Solutions:**
```css
/* Avoid absolute positioning */
/* Instead use margins/padding and flow layout */

/* For page decorations, use margin boxes */
@page {
  @top-left-corner {
    content: url('decoration.svg');
  }
}
```

## Performance Issues

### Slow Rendering

**Causes:**
- Large documents (200+ pages)
- Complex CSS selectors
- Many images
- Heavy JavaScript in content

**Solutions:**
```css
/* Simplify selectors */
/* Instead of: */
body > main > section.chapter > div.content > p.first

/* Use: */
.chapter-first-para

/* Optimize images before including */
/* - Compress images
   - Use appropriate formats (WebP for photos, SVG for diagrams)
   - Resize to actual display size */
```

### Browser Freezing

**Cause:** Too much content processing at once

**Solutions:**
- Break document into smaller sections for testing
- Reduce the input to the smallest chapter or fixture that still reproduces the problem
- Test with simplified CSS first, then add complexity

## Browser-Specific Issues

### Chrome/Chromium

**Issue:** Different rendering than print preview

**Solution:** Always test final PDF output, not just browser preview

**Issue:** Font rendering differences

**Solution:**
```css
/* Ensure fonts are embedded */
@font-face {
  font-family: 'MyFont';
  src: url('myfont.woff2') format('woff2');
  font-display: block;
}
```

### Firefox

**Issue:** Some Paged.js features less stable

**Solution:** Use Chrome-based browser for primary development

### PDF Generation

**Issue:** Fonts missing in final PDF

**Cause:** Fonts not embedded or not found

**Solutions:**
- Use web-safe fonts or embed custom fonts
- Ensure font files are in correct path
- Check font licensing for embedding

**Issue:** PDF file size too large

**Solutions:**
- Compress images before including
- Subset fonts to only needed characters
- Use appropriate image formats

## Diagnostic Techniques

### Visual Debugging

```css
/* Add to see page structure */
* {
  outline: 1px solid rgba(255, 0, 0, 0.1);
}

.chapter {
  outline: 2px solid blue;
}

@page {
  border: 3px solid red;
}

/* Show break opportunities */
h1, h2, h3, p {
  background: rgba(0, 255, 0, 0.05);
}
```

### Console Logging

```javascript
// In your HTML, add hooks
document.querySelectorAll('h1').forEach((el, i) => {
  console.log(`H1 ${i}:`, el.textContent);
});

// Check page breaks
const pages = document.querySelectorAll('.pagedjs_page');
console.log(`Total pages: ${pages.length}`);
```

### Incremental Testing

1. Start with minimal CSS (just margins)
2. Add one feature at a time (headers, then counters, then breaks)
3. Test after each addition
4. Isolate issues to specific CSS rules

### Element Inspection

Use browser DevTools to:
- Inspect which CSS rules are applied
- Check computed styles
- See box model dimensions
- Verify element visibility and positioning
