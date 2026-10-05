# Trim Sizes Reference

Current DriveThruRPG trim sizes. Available color and binding combinations vary;
confirm the intended format in the current
[Book Formats and Sizes FAQ](https://help.drivethrupartners.com/hc/en-us/articles/12780763819031-Book-Formats-and-Sizes-FAQ)
before laying out the book.

## DriveThruRPG Trim Sizes

### Small Softcover (4 or 6-page signatures)

| Key | Width | Height | Interior with 3-edge bleed | Common Use |
|-----|-------|--------|------------|------------|
| `5x8` | 5" | 8" | 5.125" × 8.25" | Pocket guides |
| `5.06x7.81` | 5.06" | 7.81" | 5.185" × 8.06" | Crown quarto |
| `5.5x8.5` | 5.5" | 8.5" | 5.625" × 8.75" | Digest/novels |
| `A5` | 5.83" | 8.27" | 5.955" × 8.52" | European standard |
| `6x9` | 6" | 9" | 6.125" × 9.25" | Trade (most popular) |
| `6.14x9.21` | 6.14" | 9.21" | 6.265" × 9.46" | Royal |

### Large Softcover/Hardcover (4-page signatures)

| Key | Width | Height | Interior with 3-edge bleed | Common Use |
|-----|-------|--------|------------|------------|
| `6.625x10.25` | 6.625" | 10.25" | 6.75" × 10.5" | Large trade |
| `6.69x9.61` | 6.69" | 9.61" | 6.815" × 9.86" | Magazine |
| `7x10` | 7" | 10" | 7.125" × 10.25" | Core rulebooks |
| `7.44x9.69` | 7.44" | 9.69" | 7.565" × 9.94" | Large royal |
| `7.5x9.25` | 7.5" | 9.25" | 7.625" × 9.5" | Executive |
| `8x8` | 8" | 8" | 8.125" × 8.25" | Square art books |
| `8x10` | 8" | 10" | 8.125" × 10.25" | Art-heavy books |
| `8.25x10.75` | 8.25" | 10.75" | 8.375" × 11" | Large format |
| `8.25x11` | 8.25" | 11" | 8.375" × 11.25" | US large |
| `A4` | 8.268" | 11.693" | 8.393" × 11.943" | European full |
| `8.5x8.5` | 8.5" | 8.5" | 8.625" × 8.75" | Large square |
| `8.5x11` | 8.5" | 11" | 8.625" × 11.25" | US Letter |
| `11x8.5` | 11" | 8.5" | 11.125" × 8.75" | Landscape (premium color only) |

## TypeScript Configuration

```typescript
export const TRIM_SIZES = {
  // Small sizes
  "5x8": { width: 5, height: 8 },
  "5.06x7.81": { width: 5.06, height: 7.81 },
  "5.5x8.5": { width: 5.5, height: 8.5 },
  "A5": { width: 5.83, height: 8.27 },
  "6x9": { width: 6, height: 9 },
  "6.14x9.21": { width: 6.14, height: 9.21 },

  // Large sizes
  "6.625x10.25": { width: 6.625, height: 10.25 },
  "6.69x9.61": { width: 6.69, height: 9.61 },
  "7x10": { width: 7, height: 10 },
  "7.44x9.69": { width: 7.44, height: 9.69 },
  "7.5x9.25": { width: 7.5, height: 9.25 },
  "8x8": { width: 8, height: 8 },
  "8x10": { width: 8, height: 10 },
  "8.25x10.75": { width: 8.25, height: 10.75 },
  "8.25x11": { width: 8.25, height: 11 },
  "A4": { width: 8.268, height: 11.693 },
  "8.5x8.5": { width: 8.5, height: 8.5 },
  "8.5x11": { width: 8.5, height: 11 },
  "11x8.5": { width: 11, height: 8.5 },
} as const;

export type TrimSize = keyof typeof TRIM_SIZES;

export function withBleed(size: TrimSize, bleed = 0.125) {
  const dims = TRIM_SIZES[size];
  return {
    // DriveThruRPG interiors bleed on top, bottom, and the outside edge only.
    width: dims.width + bleed,
    height: dims.height + bleed * 2,
  };
}
```

Do not infer the signature solely from these dimensions. DriveThruRPG
documents the endpoints of the size ranges, while intermediate sizes and
binding choices can vary. Use the signature shown by the current cover
template generator.

## Safety Guidelines

DriveThruRPG recommends keeping all text at least 0.5" inside every page edge.
Keep non-bleeding artwork at least 0.25" from each of the three outside edges
and 0.5" from the binding edge. These are safety distances from the page edge,
not a formula for choosing a book's typographic margins or gutter.
