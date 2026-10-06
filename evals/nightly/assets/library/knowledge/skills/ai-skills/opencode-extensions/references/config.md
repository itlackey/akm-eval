---
description: Configuration reference documentation for OpenCode CLI tool,
  including file locations, JSON schema structure, and all configurable options
  with their purposes and merge behavior.
when_to_use: When setting up OpenCode for the first time, customizing AI model
  preferences, enabling/disabling tools or permissions, configuring theme and UI
  settings, or troubleshooting configuration conflicts between global and
  project-level configs.
updated: 2026-05-15
---

# OpenCode Configuration Reference

## Locations

1. `~/.config/opencode/opencode.json` - Global
2. `./opencode.json` - Project (overrides global)
3. `$OPENCODE_CONFIG` env var - Custom path

Configs merge; later overrides conflicting keys.

## Schema

```json
{
  "$schema": "https://opencode.ai/config.json",
  
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}",
        "timeout": 600000
      }
    }
  },
  
  "disabled_providers": ["openai"],
  "enabled_providers": ["anthropic"],
  
  "theme": "opencode",
  
  "tui": {
    "scroll_speed": 3,
    "scroll_acceleration": { "enabled": true },
    "diff_style": "auto"
  },
  
  "tools": {
    "write": true,
    "bash": true,
    "webfetch": false
  },
  
  "permission": {
    "edit": "allow",
    "bash": "ask",
    "webfetch": "deny"
  },
  
  "agent": {},
  "default_agent": "build",
  
  "command": {},
  
  "share": "manual",
  
  "instructions": ["CONTRIBUTING.md", "docs/*.md"],
  
  "plugin": ["opencode-wakatime"],
  
  "mcp": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  },
  
  "formatter": {
    "prettier": { "disabled": false },
    "custom": {
      "command": ["biome", "format", "--write", "$FILE"],
      "extensions": [".ts", ".tsx"]
    }
  },
  
  "keybinds": {},
  
  "autoupdate": true,
  
  "compaction": {
    "auto": true,
    "prune": true
  },
  
  "watcher": {
    "ignore": ["node_modules/**", "dist/**"]
  },
  
  "server": {
    "port": 4096,
    "hostname": "127.0.0.1",
    "mdns": false
  }
}
```

## Key Options

| Option | Description |
|--------|-------------|
| `model` | Primary model (`provider/model-id`) |
| `small_model` | Secondary model for lightweight tasks |
| `tools` | Enable/disable tools |
| `permission` | `allow`/`deny`/`ask` per tool |
| `agent` | Custom agent definitions |
| `command` | Custom slash commands |
| `share` | `manual`/`auto`/`disabled` |
| `instructions` | Additional rule files (globs) |
| `plugin` | NPM plugin packages |
| `mcp` | MCP server configs |
| `formatter` | Code formatting settings |
| `watcher` | File system watcher ignore patterns |

## Variable Substitution

```json
{
  "model": "{env:OPENCODE_MODEL}",
  "provider": {
    "openai": {
      "options": { "apiKey": "{file:~/.secrets/key}" }
    }
  }
}
```

## Merge Behavior

- **Global Config**: Loaded from `~/.config/opencode/opencode.json`.
- **Project Config**: Loaded from `./opencode.json` in the current directory.
- **Environment Variable**: Overrides config via `$OPENCODE_CONFIG` path.

**Resolution Order**: Global settings are applied first. Project-level settings override global keys if present. Environment variables substitute values within strings (e.g., `{env:VAR}`) before parsing.
