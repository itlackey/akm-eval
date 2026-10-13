---
description: Reference guide for configuring and managing OpenCode agents,
  detailing file locations, syntax formats, configuration options, invocation
  modes, built-in agents, permissions, and temperature settings.
when_to_use: Use when setting up agent configurations in project or global
  files, defining custom behaviors, selecting primary/subagent/all modes, or
  adjusting tool access and model parameters for development tasks.
updated: 2026-05-15
---
# OpenCode Agents Reference

## Location

- `.opencode/agent/name.md` - Project
- `~/.config/opencode/agent/name.md` - Global
- `opencode.json` → `"agent": {}` - JSON config

## Markdown Format

```markdown
---
description: What agent does (required)
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.3
maxSteps: 20
tools:
  write: false
  edit: false
permission:
  edit: deny
  bash:
    "git *": allow
    "*": ask
---

System prompt for this agent.
```

## JSON Format

```json
{
  "agent": {
    "reviewer": {
      "description": "Code review agent",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.2,
      "prompt": "{file:./prompts/review.txt}",
      "tools": { "write": false },
      "permission": { "edit": "deny" }
    }
  }
}
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `description` | string | Required. What agent does |
| `mode` | `primary\|subagent\|all` | How to invoke (default: `all`) |
| `model` | string | Override model (`provider/model-id`) |
| `temperature` | number | 0.0-1.0 creativity |
| `maxSteps` | number | Max iterations |
| `disable` | boolean | Disable agent |
| `prompt` | string | System prompt or `{file:path}` |
| `tools` | object | Tool enable/disable |
| `permission` | object | Permission settings |

## Modes

- **primary**: Tab to switch, main conversation
- **subagent**: @mention to invoke, specialized tasks
- **all**: Both (default)

## Built-in Agents

- **build** (primary): Full access, default
- **plan** (primary): Read-only, edit/bash ask
- **general** (subagent): Complex searches
- **explore** (subagent): Fast codebase exploration

## Permissions

Values: `allow`, `deny`, `ask`

```yaml
permission:
  edit: ask
  bash:
    "git status": allow
    "rm *": deny
    "*": ask
  webfetch: deny
  skill:
    "safe-*": allow
```

## Temperature Guide

- `0.0-0.2`: Code analysis, deterministic
- `0.3-0.5`: General development
- `0.6-1.0`: Creative, exploration
