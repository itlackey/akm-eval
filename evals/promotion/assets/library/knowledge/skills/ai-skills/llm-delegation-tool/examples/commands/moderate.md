---
openai_delegation: content_check
updated: 2026-03-15
description: Validates input text or files against safety policies using
  OpenAI's moderation endpoint to detect policy violations and generate
  compliance reports.
when_to_use: Use when screening user submissions, AI-generated content, or
  external inputs for harmful material before storage, publication, or further
  processing.
---

# Moderate Content Command

Check content for policy violations using OpenAI's moderation API.

## Usage

```bash
claude-code moderate "content to check..."
```

## What This Does

1. Sends the provided content to OpenAI's moderation endpoint
2. Receives flagged categories and confidence scores
3. Returns a formatted report

## Output Format

```
Content Moderation Report
========================

Status: [FLAGGED | CLEAN]

Categories Triggered:
- category_name: score (HIGH | MEDIUM | LOW)

Recommendation: [APPROVE | REVIEW | REJECT]

Details:
[Explanation of any violations]
```

## Examples

**Check a user comment:**
```bash
claude-code moderate "Thanks for the great content!"
```

**Check with file input:**
```bash
claude-code moderate < user-submission.txt
```

**Check and log results:**
```bash
claude-code moderate "content..." >> moderation-log.txt
```

## Configuration

Uses the `content_check` delegation config:
- Fast response (free API)
- No context needed
- Auto-invokes moderation check

## Exit Codes

- 0: Content is clean
- 1: Content is flagged
- 2: API error
