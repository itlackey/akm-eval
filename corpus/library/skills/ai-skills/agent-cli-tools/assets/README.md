# Assets Directory

This directory contains static resources used by the skill.

## Purpose

Store non-executable resources:
- Templates (HTML, Markdown, configuration files)
- Images and diagrams
- Data files (JSON, CSV, YAML)
- Sample files or fixtures

## Organization

Organize assets by type:
```
assets/
├── templates/      # File templates
├── images/         # Images and diagrams
├── data/           # Data files
└── samples/        # Sample or example files
```

## Guidelines

### File Naming

- Use kebab-case for filenames
- Include file extension
- Use descriptive names

### File Size

- Keep files small when possible
- Consider external hosting for large assets
- Document external dependencies

### Templates

Template files should:
- Include placeholder comments
- Document required variables
- Provide usage examples

Example:
```markdown
<!-- template.md -->
# {{TITLE}}

{{CONTENT}}

<!-- Usage: Replace {{TITLE}} and {{CONTENT}} with actual values -->
```

## See Also

- Parent SKILL.md for skill documentation
- `../references/` for documentation on using these assets
