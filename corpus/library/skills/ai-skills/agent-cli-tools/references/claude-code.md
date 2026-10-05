---
description: Claude Code CLI — complete flag reference, install, auth, MCP setup, and troubleshooting
when_to_use: When you need full details on claude CLI flags, output formats, tool restrictions, or MCP configuration
updated: 2026-09-15
---

# Claude Code CLI Reference

## Setup Checklist

Follow these steps in order. Complete each before moving to the next.

```bash
# 1. Check prerequisite
node --version          # requires Node.js 18+

# 2. Install
npm install -g @anthropic-ai/claude-code

# 3. Verify install
claude --version

# 4. Set credentials (choose one method — see Credential Security below)
#    Option A: API key in your own env/anthropic (holds ANTHROPIC_API_KEY)
akm env create anthropic   # then add ANTHROPIC_API_KEY=... to the file yourself
#    Option B: interactive OAuth login
claude /login

# 5. Confirm the env file lists the key (names only — do NOT print the value)
akm env list | jq '.envs[] | select(.ref == "env/anthropic") | .keys'

# 6. Smoke test — using -p makes the session non-interactive (Option B: drop the akm prefix)
akm env run env/anthropic -- claude -p "say hello" --output-format json | jq '.result'
```

## Install

```bash
npm install -g @anthropic-ai/claude-code
# Verify
claude --version
```

## Authentication

**Prefer OAuth — no API key to manage, no risk of key exposure.**

```bash
# Option 1 (preferred): interactive OAuth login
claude /login

# Option 2: per-org OAuth login
claude /login --org <org-id>

# Option 3 (fallback): API key from your own env/anthropic (see Credential Security)
akm env run env/anthropic -- claude -p "task"   # env/anthropic holds ANTHROPIC_API_KEY
```

Config stored in `~/.claude/`.

## Credential Security

**Never hardcode API keys in scripts, config files, or shell history.**

```bash
# Keep the key in your own primary bundle (once), then add ANTHROPIC_API_KEY=... to the file yourself
akm env create anthropic

# Inject it only for the command (or script) that needs it
akm env run env/anthropic -- claude -p "task" --output-format json

# In a script launched that way, check presence WITHOUT reading/printing the value
if [ -z "${ANTHROPIC_API_KEY}" ]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set. Run via: akm env run env/anthropic -- <script>" >&2
  exit 1
fi
```

Rules:
- **Never** `echo $ANTHROPIC_API_KEY`, log it, or pass it as a CLI argument literal
- **Without akm**: keep the key in a mode-600 dotenv file outside any repo, and never commit it
- **In CI/CD**: inject via GitHub Secrets / AWS Secrets Manager / Vault as environment variables
- **With akm**: `akm env run env/anthropic -- claude ...` loads the key for that one command
- Prefer `claude /login` (OAuth) over API key when running interactively — no key to manage

## Model Selection

**Do not hardcode model names in scripts or automation.** Pass the model at invocation time:

```bash
claude -p "task" --model "${CLAUDE_MODEL}"
```

If `--model` is omitted, Claude Code uses the model configured in `~/.claude/settings.json` or
its built-in default. Model IDs change as new versions release — consult
https://docs.anthropic.com/en/docs/models-overview for current names.

## Core Flags

| Flag | Description |
|---|---|
| `-p` / `--print` | Prompt to run; **using `-p` makes the session non-interactive** |
| `--output-format` | `text` (default), `json`, `stream-json` |
| `--model` | Model ID, e.g. `claude-sonnet-4-6` |
| `--max-turns` | Max agent turns (default: unlimited) |
| `--system-prompt` | Override the system prompt |
| `--allowedTools` | Comma/space-separated list of allowed tools |
| `--disallowedTools` | Comma/space-separated list of blocked tools |
| `--mcp-config` | Path to MCP config JSON |
| `--add-dir` | Add extra directories to the allowed file tree |
| `--dangerously-skip-permissions` | Skip all permission checks (scripts only) |
| `--verbose` | Show detailed debug output |

**Note:** There is no `--no-interactive` flag. Using `-p` / `--print` with a prompt is what
makes a Claude Code session non-interactive.

## Output Formats

### `--output-format text`
Plain text streamed to stdout. Default.

### `--output-format json`
Single JSON object on completion:
```json
{
  "type": "result",
  "result": "...",
  "cost_usd": 0.0043,
  "duration_ms": 12450,
  "num_turns": 3,
  "session_id": "abc123"
}
```

### `--output-format stream-json`
Newline-delimited JSON events:
```jsonl
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}]}}
{"type":"tool_use","name":"Read","input":{"file_path":"src/auth.ts"}}
{"type":"tool_result","content":"..."}
{"type":"result","result":"Done","cost_usd":0.002}
```

## Tool Restrictions

Use `--allowedTools` to scope what the agent can do:

```bash
# Only allow reading and running tests
claude -p "Find all failing tests" \
  --allowedTools "Read,Glob,Grep,Bash(bun test:*)"

# Shell wildcard syntax: Bash(prefix:*)
# Exact match: Bash(git status)
```

Common tool names: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`,
`Agent`, `TodoRead`, `TodoWrite`.

## MCP Servers

```bash
# Use an MCP config file
claude -p "Query the database for active users" \
  --mcp-config .claude/mcp.json

# MCP config format (.claude/mcp.json):
# {
#   "mcpServers": {
#     "my-db": { "command": "npx", "args": ["-y", "mcp-server-sqlite", "db.sqlite"] }
#   }
# }
# Note: MCP server env vars are passed from the shell environment — do not hardcode keys in mcp.json
```

## CLAUDE.md

Claude Code reads `CLAUDE.md` (and `.claude/CLAUDE.md`) at startup for project-level instructions.
When running headless, this file still applies unless overridden with `--system-prompt`.

## Headless Scripting Patterns

```bash
# Run this script via `akm env run env/anthropic -- bash <script>`
[ -z "${ANTHROPIC_API_KEY}" ] && { echo "ERROR: ANTHROPIC_API_KEY not set (add it to env/anthropic)" >&2; exit 1; }

# Capture result only (-p makes it non-interactive)
RESULT=$(claude -p "List all exported types in lib/" \
  --output-format json | jq -r '.result')

# Count turns used
TURNS=$(claude -p "Refactor utils.ts" \
  --output-format json | jq '.num_turns')

# Process stream events
claude -p "Add logging to server.ts" \
  --output-format stream-json \
  | while IFS= read -r line; do
      TYPE=$(echo "$line" | jq -r '.type')
      [ "$TYPE" = "result" ] && echo "$line" | jq '.result'
    done
```

## Slash Commands (interactive only)

| Command | Action |
|---|---|
| `/help` | Show help |
| `/clear` | Clear conversation |
| `/compact` | Summarize context |
| `/cost` | Show session cost |
| `/model` | Switch model |
| `/login` | Re-authenticate |
| `/logout` | Log out |

## Settings Files

| File | Scope |
|---|---|
| `~/.claude/settings.json` | User-level defaults |
| `.claude/settings.json` | Project-level defaults |
| `.claude/settings.local.json` | Local overrides (gitignored) |

Key settings fields: `model`, `permissions.allow[]`, `permissions.deny[]`, `hooks`.

## Troubleshooting

**`Error: ANTHROPIC_API_KEY not set`**
→ Run through `akm env run env/anthropic -- claude ...` (where `env/anthropic` holds `ANTHROPIC_API_KEY`)
→ Or run `claude /login` for OAuth-based auth

**`Credit balance is too low`**
→ The API key's account has insufficient credits — top up at console.anthropic.com
→ Or switch to OAuth: `claude /login`

**Agent loops forever**
→ Add `--max-turns 20` to cap iterations

**Tool permission prompts block headless run**
→ Add `--dangerously-skip-permissions` (scripts only, never on untrusted code)
   or whitelist tools with `--allowedTools`

**Output is empty / no result**
→ Verify `-p` is set; check `--output-format json` and parse `.result` field

**Model not found**
→ Use full model ID: `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5-20251001`
