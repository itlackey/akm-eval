---
description: Guidelines for structuring and updating Work Item descriptions in
  Azure DevOps using Markdown syntax, covering header hierarchy, lists,
  checkboxes, and CLI-based content management.
when_to_use: Use when authoring new Work Items requiring structured
  documentation, managing task acceptance criteria with checkboxes, or
  performing bulk description updates via the Azure DevOps CLI during cleanup
  initiatives.
updated: 2026-05-15
---
# Azure DevOps Best Practices for Tracker Skill

**Date Created:** 2026-01-04  
**Context:** Documentation Cleanup initiative with proper formatting and linking

## 1. Work Item Descriptions - Formatting Best Practices

### RECOMMENDED: Markdown Format

Azure DevOps supports **Markdown** for work item descriptions. Key formatting rules:

#### Good Formatting Pattern

```markdown
## Overview
Brief one-line summary

## Scope
- Bullet point 1
- Bullet point 2

## Files to Delete

### Category 1 (20 files)
- file1
- file2

### Category 2 (15 files)
- file3

## Execution Steps

1. Create backup
2. Verify references
3. Run cleanup

## Verification

- [ ] All files deleted
- [ ] Tests pass
- [ ] No errors

## Acceptance Criteria

- [x] Done
- [ ] Todo
```

#### Key Points

- Use `##` for main sections (not `#` which renders too large)
- Use `###` for subsections
- Use bullet lists for clarity
- Use numbered lists for sequences
- Use `- [ ]` checkboxes for tracking

#### AVOID

- Long text walls without sections
- Deep nesting (max 3 levels)
- Excessive code blocks
- Complex HTML

### How to Update Descriptions via CLI

**BEST METHOD: Use a File**

```bash
cat > <temp-file> << 'EOF'
## Overview
Your markdown content here
```
