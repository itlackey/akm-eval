---
description: Targeted fix procedures for OpenCode errors including
  ProviderInitError, AI_APICallError due to outdated packages, and MCP server
  connection failures.
when_to_use: Use these steps when encountering startup crashes, model switching
  failures, API parameter errors, or when MCP tools fail to connect or respond
  with timeouts.
updated: 2026-05-12
---
# Targeted Fix Procedures

Step-by-step fix procedures organized by error type. Each fix includes verification steps.

## FIX-001: ProviderInitError

**Error:** `ProviderInitError` on startup or when switching models.

**Cause:** Corrupted auth config, invalid provider setup, or malformed `opencode.json`.

**Steps:**
```bash
# 1. Check which providers are configured
opencode auth list

# 2. Verify the provider config in opencode.json is valid
cat ~/.config/opencode/opencode.json | python3 -m json.tool

# 3. If auth.json is corrupted, reset it
cp ~/.local/share/opencode/auth.json ~/.local/share/opencode/auth.json.bak
rm ~/.local/share/opencode/auth.json

# 4. Re-authenticate
opencode auth login

# 5. Verify
opencode models
```

---

## FIX-002: AI_APICallError / Outdated Provider Packages

**Error:** `AI_APICallError`, unexpected parameter errors, or model compatibility issues.

**Cause:** OpenCode caches provider SDK packages (Anthropic, OpenAI, Google, etc.) locally. Outdated packages cause API incompatibilities.

**Steps:**
```bash
# 1. Clear the entire cache (forces fresh download of all provider packages)
rm -rf ~/.cache/opencode

# 2. Restart OpenCode
opencode

# 3. Verify models work
opencode run "Hello, are you working?"
```

---

## FIX-003: MCP Server Won't Connect

**Error:** MCP tools unavailable, connection refused, timeouts.

**Steps:**
```bash
# 1. Check status of all MCP servers
opencode mcp list

# 2. Debug the specific server
opencode mcp debug <server-name>

# 3. Test the command manually
# Find the command from your config:
cat ~/.config/opencode/opencode.json | grep -A5 '"<server-name>"'
# Then run it directly:
npx -y @modelcontextprotocol/server-<name>

# 4. Check environment variables referenced in config
# Look for {env:VAR} patterns and verify they're set
env | grep -i <relevant-var>

# 5. Increase timeout if server is slow to start
# In opencode.json:
# "mcp": { "<server>": { "timeout": 15000 } }

# 6. For OAuth servers, re-authenticate
opencode mcp logout <server-name>
opencode mcp auth <server-name>
```

---

## FIX-004: Plugin Crashes or Won't Load

**Error:** Plugin hooks not firing, tools not available, OpenCode crashes on start.

**Steps:**
```bash
# 1. Isolate: disable all plugins
# In opencode.json, temporarily set:
# "plugin": []

# 2. Also move disk plugins out of the way
mv ~/.config/opencode/plugins ~/.config/opencode/plugins.bak
mv .opencode/plugins .opencode/plugins.bak  # if project-level

# 3. Start OpenCode to confirm it works without plugins
opencode

# 4. Re-enable plugins one at a time to find the culprit
# Move them back one by one, restarting each time

# 5. For the broken plugin, check:
#    - Correct export (default export or named Plugin export)
#    - Valid TypeScript/JS syntax
#    - Dependencies listed in .opencode/package.json
#    - Compatible with current OpenCode version

# 6. Clear cached plugin builds
rm -rf ~/.cache/opencode/node_modules/

# 7. Restore working plugins
mv ~/.config/opencode/plugins.bak ~/.config/opencode/plugins
mv .opencode/plugins.bak .opencode/plugins
```

---

## FIX-005: Context Overflow / Frequent Compaction

**Error:** Responses cut off, `session.compacted` events firing constantly, degraded response quality.

**Steps:**
```bash
# 1. Check current token usage
opencode stats

# 2. Enable auto-compaction if not already on
# In opencode.json:
# "compaction": { "auto": true, "prune": true }

# 3. Consider a plugin for smarter pruning
# In opencode.json:
# "plugin": ["opencode-dynamic-context-pruning"]

# 4. Use smaller models for simple tasks
# In opencode.json:
# "small_model": "anthropic/claude-haiku-4-5-20250714"

# 5. Use subagents for subtasks to isolate context
# Create .opencode/agents/subtask.md with mode: subagent

# 6. Be specific with file references (avoid glob patterns)
# Instead of "read all files in src/", reference specific files

# 7. Monitor with tokenscope
# "plugin": ["opencode-tokenscope"]
```

---

## FIX-006: Desktop App Blank/Frozen

**Error:** Desktop app shows blank window, frozen UI, or won't render.

**Steps:**
```bash
# 1. macOS: Try reloading
# OpenCode menu → Reload Webview

# 2. Fully quit and relaunch
# macOS: Cmd+Q then reopen
# Linux/Windows: close all windows, kill process

# 3. Disable plugins (see FIX-004)

# 4. Clear cache
rm -rf ~/.cache/opencode  # Linux/macOS
# Windows: delete %USERPROFILE%\.cache\opencode

# 5. Check for port conflicts
# Unset OPENCODE_PORT if set
unset OPENCODE_PORT
# Remove server.port from config if present

# 6. Linux Wayland issues
OC_ALLOW_WAYLAND=1 opencode  # or switch to X11 session

# 7. Windows: install/update WebView2 Runtime
# Download from https://developer.microsoft.com/en-us/microsoft-edge/webview2/

# 8. Nuclear: reset desktop state
# Delete opencode.settings.dat, opencode.global.dat, opencode.workspace.*.dat
# from the app data directory (see filesystem-map.md)
```

---

## FIX-007: Session Recovery

**Error:** Session unresponsive, stuck on a bad tool call, need to revert changes.

**Steps:**
```bash
# 1. Abort current operation
# In TUI: press Ctrl+C
# Via SDK:
# await client.session.abort({ path: { id: sessionId } })

# 2. Undo last operation (in TUI)
# Type: /undo

# 3. Export the session for analysis
opencode export <session-id> > session-backup.json

# 4. Continue from a known good state
opencode --session <session-id>
# Or fork the session to experiment:
opencode --session <session-id> --fork

# 5. If session is completely broken, start fresh
# The old session data remains in storage for reference
opencode  # starts new session
```

---

## FIX-008: Model Not Found / Wrong Model Name

**Error:** `ProviderModelNotFoundError`, "Model not available".

**Steps:**
```bash
# 1. List all available models
opencode models

# 2. Filter by provider
opencode models anthropic

# 3. Refresh model cache if a new model was just released
opencode models --refresh

# 4. Verify format is provider/model
# WRONG: "claude-sonnet-4-5"
# RIGHT: "anthropic/claude-sonnet-4-5"

# 5. Check auth for the provider
opencode auth list
# If not listed, authenticate:
opencode auth login

# 6. Some models require specific subscriptions
# Check provider's website for access requirements
```

---

## FIX-009: Linux Clipboard Issues

**Error:** Copy/paste not working in TUI.

**Steps:**
```bash
# 1. Install appropriate clipboard utility

# For X11:
sudo apt install -y xclip
# or
sudo apt install -y xsel

# For Wayland:
sudo apt install -y wl-clipboard

# For headless/CI:
sudo apt install -y xvfb
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
export DISPLAY=:99.0

# 2. Verify detection
# OpenCode auto-detects Wayland and prefers wl-clipboard
# For X11, it tries xclip then xsel
which xclip xsel wl-copy 2>/dev/null
```

---

## FIX-010: Windows Performance Issues

**Error:** Slow file access, terminal problems, general sluggishness on Windows.

**Steps:**
```
1. Install WSL (Windows Subsystem for Linux)
   - Open PowerShell as Admin: wsl --install
   - Restart
   - Set up a Linux distro (Ubuntu recommended)

2. Install OpenCode inside WSL
   curl -fsSL https://opencode.ai/install | bash

3. Run OpenCode from WSL terminal for best performance
   opencode

4. If using Git Bash, set the path:
   OPENCODE_GIT_BASH_PATH="C:\Program Files\Git\bin\bash.exe"
```

---

## FIX-011: Upgrade Issues

**Error:** Problems after upgrading, or need to upgrade to fix bugs.

**Steps:**
```bash
# 1. Check current version
opencode --version

# 2. Upgrade to latest
opencode upgrade

# 3. Upgrade to a specific version
opencode upgrade v0.1.48

# 4. Specify install method if auto-detection fails
opencode upgrade --method curl
opencode upgrade --method npm
opencode upgrade --method brew

# 5. If upgrade breaks things, clear cache
rm -rf ~/.cache/opencode

# 6. If still broken, do a clean reinstall
opencode uninstall --keep-config --keep-data
curl -fsSL https://opencode.ai/install | bash
```

---

## FIX-012: Server/Web Mode Issues

**Error:** `opencode serve` or `opencode web` not accessible, connection refused.

**Steps:**
```bash
# 1. Start with explicit port and hostname
opencode serve --port 4096 --hostname 0.0.0.0

# 2. Set password for security
export OPENCODE_SERVER_PASSWORD=mysecret
opencode serve

# 3. Check if port is already in use
lsof -i :4096 || ss -tlnp | grep 4096

# 4. Verify server is responding
curl http://localhost:4096/health

# 5. For remote access, check firewall
sudo ufw status  # or iptables -L

# 6. For CORS issues with web mode
opencode web --cors "http://localhost:5173"

# 7. Attach TUI to running server
opencode attach http://localhost:4096
```
