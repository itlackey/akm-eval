---
name: opencode-troubleshoot
description: Diagnose and fix OpenCode issues. Use when OpenCode won't start.
  sessions fail, MCP servers disconnect, plugins break, providers error,
  performance degrades, auth fails, configs conflict, or anything goes wrong
  with an OpenCode installation. Also use for proactive health checks, log
  analysis, session forensics, and deep diagnostics on any OpenCode CLI,
  Desktop, Web, or SDK deployment.
when_to_use: Use this skill when users encounter runtime errors, configuration
  issues, authentication failures, performance problems, or need to perform
  proactive health checks and log analysis for OpenCode.
updated: 2026-05-11
---

# OpenCode Troubleshooting & Diagnostics

Deep diagnostic analysis and repair for [OpenCode](https://opencode.ai) — the open-source AI coding agent.

## Quick Reference: Key Paths

| Item | macOS / Linux | Windows |
|------|---------------|---------|
| Data root | `~/.local/share/opencode/` | `%USERPROFILE%\.local\share\opencode` |
| Logs | `~/.local/share/opencode/log/` | `%USERPROFILE%\.local\share\opencode\log` |
| Auth | `~/.local/share/opencode/auth.json` | `%USERPROFILE%\.local\share\opencode\auth.json` |
| Sessions | `~/.local/share/opencode/project/<slug>/storage/` | Same pattern under `%USERPROFILE%` |
| Global config | `~/.config/opencode/opencode.json` (or `.jsonc`) | `%USERPROFILE%\.config\opencode\opencode.json` |
| Project config | `./opencode.json` (project root) | Same |
| TUI config | `~/.config/opencode/tui.json` | Same pattern |
| Cache | `~/.cache/opencode/` | `%USERPROFILE%\.cache\opencode` |
| Global plugins | `~/.config/opencode/plugins/` | Same pattern |
| Project plugins | `.opencode/plugins/` | Same |
| Desktop app state | `~/Library/Application Support/` (macOS) | `%APPDATA%` |

## Diagnostic Workflow

When helping someone troubleshoot OpenCode, follow this sequence:

1. **Triage** — identify the symptom category (see `references/symptom-map.md`)
2. **Collect** — run `scripts/oc-diag.sh` for automated environment snapshot
3. **Analyze** — check logs, config, auth, sessions using the reference guides
4. **Resolve** — apply targeted fixes from `references/fixes.md`
5. **Verify** — confirm the fix, run `scripts/oc-healthcheck.sh`

## Documentation Index

**Core References:**
- `references/symptom-map.md` — symptom-to-cause lookup table for fast triage
- `references/filesystem-map.md` — complete directory/file layout with descriptions
- `references/log-analysis.md` — how to read, filter, and interpret OpenCode logs
- `references/config-diagnostics.md` — config merge order, common mistakes, validation
- `references/fixes.md` — targeted fix procedures organized by error type

**Diagnostic Scripts:**
- `scripts/oc-diag.sh` — full environment diagnostic snapshot (run first)
- `scripts/oc-healthcheck.sh` — quick pass/fail health check
- `scripts/oc-log-analyzer.sh` — parse and summarize recent log files
- `scripts/oc-session-inspector.sh` — inspect session history and storage

## Key CLI Commands for Debugging

```bash
# Verbose startup
opencode --log-level DEBUG
opencode --print-logs

# Config inspection
opencode models                  # List available models
opencode models --refresh        # Refresh model cache from models.dev
opencode auth list               # Show authenticated providers
opencode mcp list                # Show MCP server status
opencode session list            # List sessions
opencode stats                   # Token usage and cost stats
opencode stats --days 7          # Last 7 days of stats
opencode export <sessionID>      # Export session as JSON for analysis

# MCP debugging
opencode mcp debug <server>      # Debug specific MCP server
opencode mcp auth <server>       # Re-authenticate OAuth MCP
opencode mcp auth list           # Show OAuth status for all MCP servers

# Recovery
opencode upgrade                 # Update to latest version
opencode uninstall --dry-run     # See what would be removed
```

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENCODE_CONFIG` | Custom config file path |
| `OPENCODE_CONFIG_DIR` | Custom config directory |
| `OPENCODE_CONFIG_CONTENT` | Inline JSON config override |
| `OPENCODE_PORT` | Server port (can conflict with Desktop) |
| `OPENCODE_SERVER_PASSWORD` | HTTP basic auth for serve/web |
| `OPENCODE_DISABLE_AUTOUPDATE` | Skip update checks |
| `OPENCODE_DISABLE_DEFAULT_PLUGINS` | Disable built-in plugins |
| `OPENCODE_DISABLE_LSP_DOWNLOAD` | Skip automatic LSP downloads |
| `OPENCODE_DISABLE_AUTOCOMPACT` | Disable context compaction |
| `OPENCODE_DISABLE_PRUNE` | Disable old data pruning |
| `OPENCODE_DISABLE_CLAUDE_CODE` | Disable `.claude` prompt/skill reading |
| `OPENCODE_PERMISSION` | Inline JSON permission config |

## Plugin Logging

Plugins should use structured logging via the SDK client:

```typescript
await client.app.log({
  body: {
    service: "my-plugin",
    level: "debug",  // debug \| info \| warn \| error
    message: "Diagnostic message",
    extra: { key: "value" }
  }
})
```

This writes to the standard log directory and appears in `--print-logs` output.

## Official Resources

| Resource | URL |
|----------|-----|
| Docs | https://opencode.ai/docs/ |
| Troubleshooting | https://opencode.ai/docs/troubleshooting/ |
| CLI Reference | https://opencode.ai/docs/cli/ |
| Config Reference | https://opencode.ai/docs/config/ |
| GitHub Issues | https://github.com/anomalyco/opencode/issues |
| Discord | https://opencode.ai/discord |
| Plugin Docs | https://opencode.ai/docs/plugins/ |
| MCP Server Docs | https://opencode.ai/docs/mcp-servers/ |
