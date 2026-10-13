---
description: Complete directory and file layout for OpenCode's diagnostic
  reference, including data storage paths, authentication configuration
  structure, log rotation policies, and troubleshooting commands for corrupted
  credentials or error analysis.
when_to_use: Use this asset when debugging application crashes, verifying
  credential persistence, analyzing session history, retrieving timestamped
  logs, or recovering from corrupted auth.json files.
updated: 2026-05-12
---
# OpenCode Filesystem Map

Complete directory and file layout for diagnostic reference.

## Data Directory: `~/.local/share/opencode/`

This is OpenCode's primary data store. On Windows: `%USERPROFILE%\.local\share\opencode`.

```
~/.local/share/opencode/
├── auth.json                    # API keys, OAuth tokens for all providers
├── log/                         # Application log files
│   ├── 2025-01-09T123456.log   # Timestamped log files
│   ├── 2025-01-10T091234.log   # Most recent 10 logs are kept
│   └── ...
└── project/                     # Per-project session and message data
    ├── <project-slug>/          # Git-based projects (slug from repo name)
    │   └── storage/             # SQLite or JSON session store
    │       ├── sessions/        # Individual session data
    │       └── messages/        # Message history per session
    └── global/                  # Non-git project data
        └── storage/
```

### auth.json

Contains credentials for authenticated providers. Created by `opencode auth login`.
Structure:
```json
{
  "providers": {
    "anthropic": { "apiKey": "sk-ant-..." },
    "openai": { "apiKey": "sk-..." },
    "google": { "oauth": { "access_token": "...", "refresh_token": "..." } }
  }
}
```

**Diagnostic notes:**
- If corrupted, delete and re-authenticate: `rm ~/.local/share/opencode/auth.json && opencode auth login`
- OAuth tokens can expire; re-run `opencode auth login` for affected provider
- Keys from environment variables (e.g., `ANTHROPIC_API_KEY`) and `.env` files are loaded separately at startup

### Log Files

Log files are timestamped (e.g., `2025-01-09T123456.log`). Only the 10 most recent are retained.

**Reading logs:**
```bash
# Latest log
ls -t ~/.local/share/opencode/log/*.log | head -1 | xargs cat

# Search for errors in recent logs
grep -i "error\|panic\|fatal" ~/.local/share/opencode/log/*.log

# Tail the current log during a live session
tail -f $(ls -t ~/.local/share/opencode/log/*.log | head -1)
```

**Log levels** (set with `--log-level`):
- `DEBUG` — verbose, includes all internal operations
- `INFO` — standard operational messages (default)
- `WARN` — potential issues that don't block operation
- `ERROR` — failures that affect functionality

### Project Storage

Session data lives under `project/<slug>/storage/`. The slug is derived from the Git repository name. Non-git directories use `global/storage/`.

**Finding project data:**
```bash
# List all known projects
ls ~/.local/share/opencode/project/

# Check storage size per project
du -sh ~/.local/share/opencode/project/*/storage/
```

## Config Directory: `~/.config/opencode/`

On Windows: `%USERPROFILE%\.config\opencode`.

```
~/.config/opencode/
├── opencode.json       # Global config (or opencode.jsonc)
├── tui.json            # TUI-specific config
├── agents/             # Global agent definitions (.md files)
├── commands/           # Global slash commands (.md files)
├── plugins/            # Global plugin files (.ts/.js)
├── skills/             # Global skills
├── tools/              # Global custom tools
└── themes/             # Custom themes
```

**Config merge order** (later wins):
1. Remote config (`.well-known/opencode`)
2. Global config (`~/.config/opencode/opencode.json`)
3. Custom config (`OPENCODE_CONFIG` env var)
4. Project config (`./opencode.json`)
5. `.opencode` directories (agents, commands, plugins)
6. Inline config (`OPENCODE_CONFIG_CONTENT` env var)

**Note:** Directory names are **plural** (`agents/`, `plugins/`, `tools/`). Singular names (`agent/`, `plugin/`, `tool/`) are supported for backward compatibility.

## Project Directory: `.opencode/`

Per-project extensions, placed in the project root.

```
.opencode/
├── agents/          # Project-specific agent definitions
├── commands/        # Project-specific slash commands
├── plugins/         # Project-specific plugins
│   └── index.ts     # Plugin entry point
├── skills/          # Project-specific skills
├── tools/           # Project-specific custom tools
└── package.json     # Dependencies for plugins/tools
```

## Cache Directory: `~/.cache/opencode/`

On Windows: `%USERPROFILE%\.cache\opencode`.

```
~/.cache/opencode/
├── node_modules/       # Cached plugin dependencies and provider packages
├── lsp/                # Downloaded LSP server binaries
└── models/             # Cached model list from models.dev
```

**When to clear:**
- Provider package errors (`AI_APICallError`) → `rm -rf ~/.cache/opencode`
- Stale plugin behavior → `rm -rf ~/.cache/opencode/node_modules/`
- Model list outdated → `opencode models --refresh` (or delete cache)

## Desktop App State

Desktop-specific state files (not the same as CLI data):

| File | Purpose |
|------|---------|
| `opencode.settings.dat` | Desktop default server URL |
| `opencode.global.dat` | Global UI state |
| `opencode.workspace.*.dat` | Per-workspace UI state |

**Locations:**
- macOS: `~/Library/Application Support/`
- Linux: `~/.local/share/`
- Windows: `%APPDATA%`

**Last resort reset:** Delete these files to reset Desktop to defaults.
