---
description: Diagnose and fix OpenCode configuration issues, including merge
  order conflicts, file format errors (JSON vs JSONC), and common mistakes like
  invalid model names.
when_to_use: Use when encountering ProviderModelNotFoundError, unexpected config
  values overriding intended settings, or syntax validation failures in
  .json/.jsonc files.
updated: 2026-05-12
---
# Config Diagnostics

How to diagnose and fix OpenCode configuration issues.

## Config Merge Order

OpenCode merges config from multiple sources. Later sources override earlier ones for conflicting keys; non-conflicting keys are preserved from all sources.

```
1. Remote config    (.well-known/opencode)     ← organizational defaults
2. Global config    (~/.config/opencode/opencode.json)
3. Custom config    ($OPENCODE_CONFIG)
4. Project config   (./opencode.json)
5. .opencode dirs   (agents, commands, plugins)
6. Inline config    ($OPENCODE_CONFIG_CONTENT)  ← highest priority
```

### Diagnosing Merge Conflicts

The most common config issue is unexpected values from a higher-priority source overriding a lower one.

```bash
# Check if multiple config files exist
echo "=== Global ===" && cat ~/.config/opencode/opencode.json 2>/dev/null || echo "(none)"
echo "=== Project ===" && cat ./opencode.json 2>/dev/null || echo "(none)"
echo "=== Env ===" && echo "OPENCODE_CONFIG=$OPENCODE_CONFIG"
echo "OPENCODE_CONFIG_CONTENT=$OPENCODE_CONFIG_CONTENT"
```

## Config File Format

OpenCode supports both `.json` and `.jsonc` (JSON with comments). Always include the schema for editor validation:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5"
}
```

**Common format errors:**
- Trailing commas in `.json` files (use `.jsonc` if you want trailing commas)
- Missing quotes around keys
- Comments in `.json` files (rename to `.jsonc`)
- BOM characters (save as UTF-8 without BOM)

### Validation

```bash
# Validate JSON syntax
cat ~/.config/opencode/opencode.json | python3 -m json.tool > /dev/null 2>&1 && echo "Valid" || echo "Invalid JSON"

# For JSONC, strip comments first
sed 's|//.*||g; s|/\*.*\*/||g' ~/.config/opencode/opencode.jsonc | python3 -m json.tool > /dev/null
```

## Common Config Mistakes

### Model Name Format

```json
// WRONG — these will cause ProviderModelNotFoundError
{ "model": "claude-sonnet-4-5" }
{ "model": "sonnet" }
{ "model": "claude-sonnet-4-20250514" }

// CORRECT — must be provider/model
{ "model": "anthropic/claude-sonnet-4-5" }
{ "model": "openai/gpt-4.1" }
{ "model": "openrouter/google/gemini-2.5-flash" }
```

Find valid model names: `opencode models`

### Provider Config with Variable Substitution

```json
{
  "provider": {
    "anthropic": {
      "npm": "@ai-sdk/anthropic",
      "options": {
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

**Diagnostic:** If the env var isn't set, the `{env:VAR}` pattern resolves to empty string, causing auth failures. Check:

```bash
echo $ANTHROPIC_API_KEY  # Should show your key
```

### Permission Patterns

```json
{
  "permission": {
    "bash": {
      "git *": "allow",
      "npm *": "allow",
      "rm -rf *": "deny",
      "*": "ask"
    }
  }
}
```

**First match wins.** If patterns are ordered wrong, you may block things you intended to allow.

### Server Port Conflicts

```json
{ "server": { "port": 4096 } }
```

The Desktop app starts its own server. If you also have `OPENCODE_PORT` set or `server.port` in config, they may conflict.

```bash
# Check if port is in use
lsof -i :4096 2>/dev/null || ss -tlnp | grep 4096
```

### Plugin Config

```json
{
  "plugin": ["opencode-wakatime", "opencode-plugin-inspector"]
}
```

Plugins can also be loaded from disk directories. If both npm and disk plugins exist with the same name, behavior may be unpredictable.

```bash
# List all plugin sources
echo "=== NPM plugins (from config) ==="
cat ~/.config/opencode/opencode.json | grep -A5 '"plugin"'
echo "=== Global disk plugins ==="
ls ~/.config/opencode/plugins/ 2>/dev/null
echo "=== Project disk plugins ==="
ls .opencode/plugins/ 2>/dev/null
```

### MCP Server Config

```json
{
  "mcp": {
    "myserver": {
      "type": "local",
      "command": ["npx", "-y", "@mcp/my-server"],
      "environment": { "TOKEN": "{env:MY_TOKEN}" },
      "timeout": 10000
    }
  }
}
```

**Common issues:**
- `command` must be an array, not a string
- Command must be in PATH or use absolute path
- Environment variables using `{env:VAR}` must be set
- Default timeout may be too low for slow-starting servers

### Watcher Ignore Patterns

```json
{
  "watcher": {
    "ignore": [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "*.log",
      "coverage/**"
    ]
  }
}
```

If the watcher is consuming too many resources, add more ignore patterns. Max file size for watcher: 5MB.

## Reset Procedures

### Soft Reset (keep sessions)

```bash
# Backup and reset config only
cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.bak
rm ~/.config/opencode/opencode.json
# OpenCode will use defaults on next start
```

### Cache Reset

```bash
# Clear all cached packages (provider SDKs, plugins, LSPs)
rm -rf ~/.cache/opencode
```

### Full Reset (nuclear option)

```bash
# Remove everything — auth, sessions, config, cache
opencode uninstall
# Or manually:
rm -rf ~/.local/share/opencode
rm -rf ~/.cache/opencode
rm -rf ~/.config/opencode
```

### Desktop App Reset

```bash
# Reset desktop state (find and delete these files):
# macOS: ~/Library/Application Support/
# Linux: ~/.local/share/
# Windows: %APPDATA%
# Files: opencode.settings.dat, opencode.global.dat, opencode.workspace.*.dat
```
