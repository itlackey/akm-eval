---
description: Step-by-step instructions for reading, filtering, and interpreting
  OpenCode log files to diagnose issues.
when_to_use: Use when investigating application crashes, unexpected behavior, or
  debugging specific error types such as API failures, connection timeouts,
  authentication issues, or plugin execution errors within OpenCode.
updated: 2026-05-15
---

# Log Analysis Guide

How to read, filter, and interpret OpenCode log files for diagnostics.

## Log Location

```bash
~/.local/share/opencode/log/
```

Files are timestamped: `YYYY-MM-DDTHHMMSS.log`. Only the 10 most recent are kept.

## Generating Verbose Logs

```bash
# Maximum verbosity — produces DEBUG-level output
opencode --log-level DEBUG

# Print logs to stderr (useful for piping/capture)
opencode --print-logs

# Combine for maximum diagnostic output
opencode --log-level DEBUG --print-logs 2>debug-$(date +%Y%m%d-%H%M%S).log
```

## Common Log Patterns

### Startup Sequence

A healthy startup shows these phases in order:
1. Config loading (global → project merge)
2. Provider initialization
3. Plugin loading
4. MCP server connections
5. LSP server initialization
6. TUI/Server ready

**What to look for:**
```bash
# Check startup succeeded
grep -E "ready|listening|initialized" <logfile>

# Find startup failures
grep -E "error|failed|panic|fatal" <logfile> | head -20
```

### Provider Errors

```bash
# Find provider-specific issues
grep -iE "provider|api.call|auth|apikey|token" <logfile>
```

Common patterns:
- `ProviderInitError` — config corruption or invalid auth
- `AI_APICallError` — outdated provider package or API change
- `ProviderModelNotFoundError` — wrong `provider/model` format
- `401` / `403` — expired or invalid API key
- `429` — rate limited
- `500` / `502` / `503` — provider outage

### MCP Server Errors

```bash
# MCP-specific log entries
grep -iE "mcp|server.*connect|server.*timeout|server.*error" <logfile>
```

Common patterns:
- `connection refused` — server process not running or wrong port
- `timeout` — server taking too long to start (increase timeout in config)
- `ENOENT` — command not found (bad path in MCP config)
- `permission denied` — command not executable
- `oauth` / `token` — authentication issue with remote MCP

### Plugin Errors

```bash
# Plugin-related entries
grep -iE "plugin|hook|tool\.execute" <logfile>
```

Common patterns:
- `plugin.*error` — unhandled exception in plugin code
- `module not found` — missing dependency in `.opencode/package.json`
- `syntax error` — TypeScript/JS parse failure
- `hook.*timeout` — plugin hook taking too long

### Session Errors

```bash
# Session lifecycle events
grep -iE "session\.(created|idle|error|compacted)" <logfile>
```

Common patterns:
- `session.error` — API call failure mid-session
- `session.compacted` — context was auto-compacted (check token counts)
- `context.*overflow` — hit model's context limit before compaction triggered

### LSP Errors

```bash
# LSP diagnostics
grep -iE "lsp|language.server|diagnostic" <logfile>
```

## Automated Log Analysis

Use `scripts/oc-log-analyzer.sh` for automated parsing:

```bash
# Analyze the most recent log
./scripts/oc-log-analyzer.sh

# Analyze a specific log file
./scripts/oc-log-analyzer.sh ~/.local/share/opencode/log/2025-01-09T123456.log

# Analyze all logs from today
./scripts/oc-log-analyzer.sh --today
```

## Correlating Logs with Sessions

To correlate a log entry with a specific session:

```bash
# Find session IDs in logs
grep -oE "session[_.]id["=:]\s*[a-zA-Z0-9_-]+" <logfile> | sort -u

# Get session details
opencode session list --format json | jq '.[] | {id, title, updatedAt}'

# Export a problematic session for analysis
opencode export <session-id> > session-dump.json
```

## Live Debugging

For real-time troubleshooting during an active session:

```bash
# In terminal 1: start OpenCode with debug logging
opencode --log-level DEBUG --print-logs 2>&1 | tee live-debug.log

# In terminal 2: watch the log live
tail -f $(ls -t ~/.local/share/opencode/log/*.log | head -1) | grep -i error
```

## Filing Bug Reports

When filing issues on GitHub, include:

1. **OpenCode version**: `opencode --version`
2. **OS and architecture**: `uname -a` or Windows version
3. **Relevant log excerpt**: last 50 lines from the error session
4. **Config** (redacted): `cat ~/.config/opencode/opencode.json` (remove API keys)
5. **Reproduction steps**

```bash
# Quick diagnostic bundle for bug reports
opencode --version
echo "---"
uname -a
echo "---"
tail -50 $(ls -t ~/.local/share/opencode/log/*.log | head -1)
```
