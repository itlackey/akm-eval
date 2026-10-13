---
description: OpenCode CLI — complete flag reference, install, auth, config, and troubleshooting
when_to_use: When you need full details on opencode CLI flags, session management, model selection, or server mode
updated: 2026-09-15
---

# OpenCode CLI Reference

## Setup Checklist

Follow these steps in order. Complete each before moving to the next.

```bash
# 1. Install (choose one)
curl -fsSL https://opencode.ai/install | sh
# or: npm install -g opencode-ai

# 2. Verify install
opencode --version

# 3. Configure credentials (choose one method — see Credential Security below)
#    Option A: interactive login (stores keys in ~/.local/share/opencode/auth.json)
opencode auth login
#    Option B: API key injected from your own env/anthropic (holds ANTHROPIC_API_KEY)
akm env run env/anthropic -- opencode run "say hello"

# 4. Confirm at least one provider is configured
opencode auth list

# 5. Smoke test
opencode run "say hello"
```

## Install

```bash
# Installer script
curl -fsSL https://opencode.ai/install | sh

# npm
npm install -g opencode-ai

# Verify
opencode --version
```

## Authentication

**Prefer `opencode auth login` — credentials stored securely in `auth.json`, never in shell history.**

```bash
# Option 1 (preferred): interactive OAuth/credential setup per provider
opencode auth login

# List configured providers
opencode auth list
```

Keys stored in `~/.local/share/opencode/auth.json` (file-level protected, not in shell history).
For providers that support OAuth (GitHub Copilot, Google), `opencode auth login` uses the full
OAuth flow. For API-key-only providers, it stores the key in `auth.json` rather than env vars.

OpenCode also reads provider keys from environment variables at startup. For scripted/headless
runs, inject them with `akm env run env/<provider> -- opencode ...` instead of embedding keys in
config. (Without akm, it also auto-reads a `.env` file in the project root; keep that out of git.)

## Credential Security

**Never hardcode API keys in config files, scripts, or shell history.**

```bash
# Keep each provider key in its own env file in your primary bundle (once),
# then add the key to the file yourself
akm env create anthropic   # ANTHROPIC_API_KEY
akm env create openai      # OPENAI_API_KEY

# Inject only the provider you use, only for that command
akm env run env/anthropic -- opencode run "task" --model "${OPENCODE_MODEL}"

# In scripts: check presence WITHOUT reading/printing the value
if [ -z "${ANTHROPIC_API_KEY}" ] && ! opencode auth list 2>/dev/null | grep -q anthropic; then
  echo "ERROR: No Anthropic credentials found. Run: opencode auth login, or run via akm env run env/anthropic" >&2
  exit 1
fi
```

Rules:
- **Prefer** `opencode auth login` — it stores keys in `auth.json` using the OS credential layer, not shell history
- **Never** `echo $ANTHROPIC_API_KEY` or log key values
- **Never** commit a project `.env` to git — add it to `.gitignore`
- **In CI/CD**: inject provider keys as environment variables; opencode picks them up automatically
- **With akm**: `akm env run env/<provider> -- opencode ...` loads that provider's key for one command
- `opencode.json` config files must never contain literal API key values — use env var references only

## Core Commands

### `opencode` (TUI)
Start the interactive terminal UI.

```bash
opencode                          # start TUI in cwd
opencode /path/to/project         # open specific project
opencode -c                       # continue last session
opencode -s <session-id>          # continue specific session
opencode -m anthropic/claude-sonnet-4-6  # specify model
opencode --agent code-review      # use a named agent
```

### `opencode run` (headless)
Run a prompt non-interactively.

```bash
opencode run "Explain the auth flow in src/"
opencode run "Write tests for billing.ts" --model anthropic/claude-sonnet-4-6
opencode run --session <id> "Continue: also update the README"
opencode run --agent my-reviewer "Review the PR changes"
```

### `opencode attach`
Attach a TUI to a running backend server.

```bash
opencode attach http://server.example:4096
opencode attach http://localhost:4096 --session <id>
```

### `opencode serve` / `opencode web`
Start a headless backend server.

```bash
opencode web --port 4096 --hostname 0.0.0.0   # web UI + API
opencode serve --port 4096                      # API only
```

### `opencode agent`
Manage custom agents.

```bash
opencode agent list
opencode agent create              # interactive wizard
```

### `opencode auth`
Manage credentials.

```bash
opencode auth login
opencode auth list
```

## Model Selection

**Do not hardcode model names in scripts or automation.** Pass the model at invocation time:

```bash
opencode run "task" --model "${OPENCODE_MODEL}"
# OPENCODE_MODEL should be in provider/model form, e.g. anthropic/claude-sonnet-4-6
```

If `--model` is omitted, OpenCode uses the model configured in `opencode.json` or the
provider's default. Model IDs follow `provider/model` form; see https://models.dev for
the current list of available models per provider.

## All Flags

| Flag | Short | Description |
|---|---|---|
| `--continue` | `-c` | Continue last session |
| `--session` | `-s` | Session ID to continue |
| `--prompt` | `-p` | Prompt to use |
| `--model` | `-m` | Model in `provider/model` form |
| `--agent` | | Agent to use |
| `--port` | | Port to listen on |
| `--hostname` | | Hostname to listen on |
| `--dir` | | Working directory |

## Model IDs

```
anthropic/claude-sonnet-4-6
anthropic/claude-opus-4-7
anthropic/claude-haiku-4-5-20251001
openai/gpt-4o
openai/o3
google/gemini-2-flash
github-copilot/gpt-4o
github-copilot/claude-sonnet-4-5
ollama/qwen2.5-coder:32b        # local — no API key required
```

Provider list comes from [models.dev](https://models.dev).

## Local Model via Ollama (no API key)

```bash
# Resolve the Ollama host — try localhost then common Docker bridge addresses
# (If running inside a container, localhost won't reach the host's Ollama instance)
OLLAMA_HOST=""
for host in localhost 172.17.0.1 host.docker.internal; do
  if curl -sf "http://${host}:11434/api/version" > /dev/null 2>&1; then
    OLLAMA_HOST="$host"
    break
  fi
done
[ -z "$OLLAMA_HOST" ] && { echo "ERROR: Ollama not reachable. Start with: ollama serve" >&2; exit 1; }

# Pull model if not present
curl -sf "http://${OLLAMA_HOST}:11434/api/tags" | jq -r '.models[].name' \
  | grep -q "qwen2.5-coder" || ollama pull qwen2.5-coder:32b

# Run opencode pointing at the resolved Ollama host
OPENAI_BASE_URL="http://${OLLAMA_HOST}:11434/v1" \
opencode run "Fix the type errors in src/" --model ollama/qwen2.5-coder:32b
```

**Docker host note:** `localhost` inside a container resolves to the container itself, not the
Docker host. Common alternatives: `172.17.0.1` (default bridge network), `host.docker.internal`
(Docker Desktop on macOS/Windows), or the explicit IP of the `docker0` interface on Linux.

## Config File

`opencode.json` in project root (or `~/.config/opencode/opencode.json` for user-level).
**Do not put API keys in this file** — set them via `opencode auth login` or env vars.

```json
{
  "$schema": "https://opencode.ai/config.schema.json",
  "model": "anthropic/claude-sonnet-4-6",
  "theme": "opencode",
  "agents": {
    "code-review": {
      "name": "Code Reviewer",
      "description": "Reviews code for quality and correctness",
      "model": "anthropic/claude-opus-4-7",
      "system": "You are an expert code reviewer..."
    }
  }
}
```

## Session Management

Sessions persist in `~/.local/share/opencode/`. Each session has an ID.

```bash
# Continue a known session
opencode run --session abc123 "Now update the tests"
```

## Scripting Patterns

```bash
# Run task with the provider's env file injected and capture stdout
OUTPUT=$(akm env run env/anthropic -- opencode run "List all API endpoints in src/" 2>&1)

# Parallel runs with different providers, each with its own env file
akm env run env/anthropic -- opencode run "Summarize this codebase" --model anthropic/claude-haiku-4-5-20251001 &
akm env run env/openai -- opencode run "Summarize this codebase" --model openai/gpt-4o-mini &
wait
```

## Troubleshooting

**`No providers configured`**
→ Run `opencode auth login` to configure at least one provider
→ Or run through `akm env run env/<provider> -- opencode ...` so the provider key is in the environment

**`Model not found`**
→ Check `opencode auth list` — the provider must be authenticated
→ Use full `provider/model` form

**TUI blank / not rendering**
→ Try a different terminal; ensure `$TERM` supports 256 colors: `export TERM=xterm-256color`

**`opencode run` hangs**
→ Check network; add `--model` to rule out model-availability issues
→ Kill stuck backend: `pkill -f opencode`

**Permission errors on install**
→ Use user-local npm prefix: `npm config set prefix ~/.local && npm install -g opencode-ai`
