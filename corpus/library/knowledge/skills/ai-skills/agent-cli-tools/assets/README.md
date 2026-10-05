---
description: Defines the structure, purpose, and guidelines for static resources
  used by the agent-cli-tools skill.
updated: 2026-06-18
when_to_use: Use this reference when creating, organizing, or validating static
  assets for the agent-cli-tools skill.
---

# Assets Directory

This directory contains static resources used by the `agent-cli-tools` skill. It serves as the canonical reference for managing non-executable files, ensuring consistency in naming, security, and organization across the project.

## Purpose

Store and organize non-executable resources required by the skill, including:
- **Templates**: HTML, Markdown, or configuration file templates.
- **Images & Diagrams**: Visual aids and documentation graphics.
- **Data Files**: JSON, CSV, or YAML fixtures for testing or configuration.
- **Samples**: Example files demonstrating usage patterns.

## Organization

Assets are organized by type to facilitate discovery and maintenance:

```
assets/
├── templates/      # File templates
├── images/         # Images and diagrams
├── data/           # Data files
└── samples/        # Sample or example files
```

## Guidelines

### File Naming

- Use **kebab-case** for all filenames (e.g., `my-template.md`).
- Always include the file extension.
- Use descriptive names that indicate content and purpose.

### File Size

- Keep files small and focused.
- For large assets (e.g., high-res images), consider external hosting and store only references here.
- Document any external dependencies clearly.

### Templates

Template files should be self-documenting:
- Include placeholder comments indicating variables.
- Document required variables and their expected formats.
- Provide usage examples in comments.

Example:
```markdown
<!-- template.md -->
# {{TITLE}}

{{CONTENT}}

<!-- Usage: Replace {{TITLE}} and {{CONTENT}} with actual values -->
```

### Security & Permissions

- **Permissions**: Set restrictive permissions (e.g., `600` or `644`) to prevent unauthorized access.
- **Secrets**: **Never** store secrets, API keys, or passwords in asset files. Use environment variables or secret managers instead.
- **Sanitization**: Ensure all input data stored in assets is sanitized before processing to prevent injection attacks.

## See Also

- Parent `SKILL.md` for skill documentation.
- `../references/` for documentation on using these assets.
