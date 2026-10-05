# References Directory

This directory contains supplementary documentation loaded on-demand when needed.

## Purpose

Reference files provide:
- Detailed technical documentation
- Extended examples and use cases
- API specifications
- Domain-specific reference material

## Guidelines

### Keep Files Focused

- Each file should cover a specific topic
- Keep files small to minimize context usage
- Use clear, descriptive filenames

### Common Reference Files

- `REFERENCE.md` - Detailed technical reference
- `EXAMPLES.md` - Extended usage examples
- `API.md` - API documentation
- `GLOSSARY.md` - Domain-specific terminology
- `CHECKLIST.md` - Step-by-step checklists
- `PATTERNS.md` - Design patterns or best practices

### File Format

Use Markdown for all reference files:
```markdown
# Document Title

## Section 1

Content...

## Section 2

Content...
```

### Loading Pattern

Reference files are loaded only when explicitly needed:
- Main SKILL.md provides high-level guidance
- References provide detailed information when required
- This minimizes context window usage

## See Also

- Parent SKILL.md for main skill documentation
- `../scripts/` for automation scripts
