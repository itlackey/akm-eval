---
description: GitHub Copilot CLI — standalone terminal agent with OAuth via gh, session management, MCP, and non-interactive scripting
when_to_use: When you want a GitHub-integrated full agentic coding loop that reuses existing gh OAuth credentials. Supports headless -p mode, --yolo auto-approval, JSON output, session continuity, and MCP servers.
updated: 2026-09-15
---

# GitHub Copilot CLI Reference

## What It Is

GitHub Copilot CLI (`copilot`) is a full terminal agent: it reads and writes files, runs shell
commands, searches codebases, manages sessions, and supports MCP. It authenticates via the
existing `gh` OAuth token — no separate API key or login needed if `gh auth` is already set up.

## Setup Checklist

```bash
# 1. Prerequisite: GitHub CLI must be installed and authenticated
gh --version
gh auth status   # must show authenticated

# 2. Install
npm install -g @github/copilot

# 3. Verify
copilot --version

# 4. Auth — reuses gh OAuth token automatically; no action needed if gh is authed
# If gh is not authenticated or you need a separate token:
copilot login   # browser OAuth flow; stored in system credential store

# 5. Confirm auth without revealing token
[ -n "${COPILOT_GITHUB_TOKEN}" ] && echo "token: set (env)" || echo "token: using gh OAuth"

# 6. Smoke test
copilot -p "what directory am I in? return just the path" --allow-all --silent
```

## Authentication

**Prefer OAuth — Copilot CLI reuses the existing `gh` token automatically.**

```bash
# Option 1 (preferred): automatic reuse of gh OAuth session
# No action needed. Copilot checks these env vars in order:
#   COPILOT_GITHUB_TOKEN → GH_TOKEN → GITHUB_TOKEN
# If none are set, it reads the token stored by gh auth login.

# Option 2: interactive OAuth login (if gh is not set up)
copilot login
# Browser flow; token stored in system credential store or ~/.copilot/

# Option 3: token via environment variable (CI/CD)
export COPILOT_GITHUB_TOKEN="${GH_TOKEN}"
# Use a fine-grained PAT (v2) with "Copilot Requests" permission
```

**Note:** Classic `ghp_` personal access tokens are not supported.

## Credential Security

```bash
# Check auth state without printing the token value
copilot -p "say hello" --allow-all --silent   # succeeds = authenticated

# In CI: inject token as a secret env var — never log or echo it
[ -n "${COPILOT_GITHUB_TOKEN}" ] && echo "set" || echo "not set"
```

Rules:
- OAuth tokens are stored by the system credential store — do not log or print them
- `COPILOT_GITHUB_TOKEN` is the preferred CI env var — inject via GitHub Secrets or Vault
- **With akm**: keep the token in your own `env/github` and run `akm env run env/github -- copilot ...`

## Model Selection

**Do not hardcode model names in scripts.** Pass the model at invocation time:

```bash
copilot -p "task" --model "${COPILOT_MODEL}" --allow-all
```

If `--model` is omitted, Copilot uses its configured default. Use `/model` in interactive
mode to see available models.

## Non-Interactive / Headless Mode

```bash
# Basic headless run (-p exits after completion)
copilot -p "Add error handling to src/server.ts" --allow-all

# Silent output (agent response only, no stats)
copilot -p "List all exported functions in lib/" --allow-all --silent

# Full permissions shorthand
copilot -p "Fix all TypeScript errors" --yolo

# JSON output (JSONL — one object per line)
copilot -p "Summarize the architecture" --allow-all --output-format json
```

## Core Flags

| Flag | Description |
|---|---|
| `-p` / `--prompt` | Prompt (non-interactive; exits after completion) |
| `--allow-all` / `--yolo` | Allow all tools, paths, and URLs without confirmation |
| `--allow-all-tools` | Auto-approve all tool calls (required for non-interactive) |
| `--allow-all-paths` | Disable file path verification |
| `--silent` / `-s` | Output only agent response, no stats |
| `--output-format` | `text` (default) or `json` (JSONL) |
| `--model` | Model to use |
| `--continue` | Resume the most recent session |
| `--resume[=id]` | Resume session by ID, name, or 7+ hex prefix |
| `--name` | Name the new session |
| `--no-ask-user` | Agent works autonomously without asking questions |
| `--autopilot` | Maximum autonomy mode |
| `--add-dir` | Add a directory to the allowed file access list |
| `--additional-mcp-config` | Extra MCP servers as JSON string or `@file` path |
| `--no-custom-instructions` | Skip loading AGENTS.md |

## Scripting Patterns

```bash
# If using a token instead of gh OAuth, run this script via `akm env run env/github -- bash <script>`
[ -n "${COPILOT_GITHUB_TOKEN}" ] || { echo "ERROR: no Copilot token found (add it to env/github)" >&2; exit 1; }

# Headless with full permissions
copilot -p "Fix all lint errors in src/" --yolo --silent

# Capture JSON output
copilot -p "List all API endpoints" --allow-all --output-format json \
  | jq 'select(.type=="agent_message") | .content'

# Pass model from env
copilot -p "Refactor auth.ts" --model "${COPILOT_MODEL}" --yolo

# CI usage (token injected as env var)
COPILOT_GITHUB_TOKEN="${GH_TOKEN}" \
copilot -p "Run tests and report failures" --allow-all --silent
```

## Session Management

```bash
# Continue most recent session
copilot --continue

# Resume by ID prefix (7+ hex chars)
copilot --resume=0cb916d

# Resume by name
copilot --resume="my-feature"

# Name a new session and run headless
copilot --name="auth-refactor" -p "Refactor auth.ts" --yolo
```

## MCP Integration

```bash
# Inline MCP config (JSON string)
copilot -p "Query the database" \
  --additional-mcp-config '{"mcpServers":{"sqlite":{"command":"npx","args":["-y","mcp-server-sqlite","db.sqlite"]}}}' \
  --yolo

# From config file
copilot -p "Query the database" --additional-mcp-config @.copilot/mcp.json --yolo
```

## Troubleshooting

**`copilot: command not found`**
→ `npm install -g @github/copilot`; check `npm bin -g` is in `$PATH`

**`Authentication required`**
→ `gh auth status` — if gh is authenticated, Copilot picks it up automatically
→ Otherwise: `copilot login`

**Token type not supported**
→ Must use OAuth (via `copilot login`) or a fine-grained v2 PAT with "Copilot Requests" permission

**Tool calls blocked in non-interactive mode**
→ Add `--allow-all-tools` or `--yolo`

**Requires Copilot subscription**
→ Active GitHub Copilot subscription required (Individual, Business, or Enterprise)
