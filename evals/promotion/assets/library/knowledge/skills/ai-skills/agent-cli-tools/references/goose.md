---
description: Goose CLI — Block's open-source multi-provider AI agent, install, headless mode, 15+ providers, extensions
when_to_use: When you need a multi-provider (Anthropic, OpenAI, Ollama, OpenRouter, Bedrock) open-source agent with extensible toolkit
updated: 2026-09-15
---

# Goose CLI Reference

## What It Is

Goose is Block's open-source AI coding agent (now under the Linux Foundation's Agentic AI
Foundation). It supports 15+ LLM providers, runs as a background service, and has a rich
extension ecosystem. It can run shell commands, edit files, and handle multi-step workflows
autonomously.

## Setup Checklist

Follow these steps in order. Choose **Path A** (cloud provider) or **Path B** (local Ollama).

```bash
# 1. Install
curl -fsSL https://github.com/block/goose/releases/latest/download/install.sh | sh
# or on macOS: brew install block/tap/goose

# 2. Verify install
goose --version

# --- PATH A: Cloud provider ---
# 3a. Set credentials for chosen provider (see Credential Security)
#     One env file per provider in your primary bundle, e.g. env/anthropic (ANTHROPIC_API_KEY)
akm env create anthropic   # then add ANTHROPIC_API_KEY=... to the file yourself

# 4a. Confirm the env file lists the key (names only, never values)
akm env list | jq '.envs[] | select(.ref == "env/anthropic") | .keys'

# 5a. Run interactive setup (stores provider config in ~/.config/goose/)
goose configure

# --- PATH B: Local Ollama (no API key) ---
# 3b. Verify Ollama is running
curl -sf http://localhost:11434/api/version > /dev/null \
  || { echo "ERROR: Ollama not running. Start with: ollama serve" >&2; exit 1; }

# 4b. Pull model if not present
ollama list | grep -q "qwen2.5-coder" || ollama pull qwen2.5-coder:32b

# 6. Smoke test
akm env run env/anthropic -- goose run --text "say hello" --provider anthropic   # ollama: no akm prefix
```

## Install

```bash
# macOS / Linux installer
curl -fsSL https://github.com/block/goose/releases/latest/download/install.sh | sh

# Homebrew (macOS)
brew install block/tap/goose

# Verify
goose --version
```

## Authentication

```bash
# Interactive provider setup — stores config in ~/.config/goose/ (not shell history)
goose configure

# Or inject provider keys from your own env file (see Credential Security below)
akm env run env/anthropic -- goose run --text "task" --provider anthropic
```

## Credential Security

**Never hardcode API keys in scripts, config files, or shell history.**

```bash
# Create an env file for each provider you use (once), then add its key to the file yourself
akm env create anthropic    # ANTHROPIC_API_KEY
akm env create openai       # OPENAI_API_KEY
akm env create openrouter   # OPENROUTER_API_KEY
akm env create gemini       # GOOGLE_API_KEY
# AWS Bedrock uses the standard AWS credential chain — no API key env file needed

# Inject only the provider you run
akm env run env/anthropic -- goose run --text "task" --provider anthropic

# Inside a script launched that way, check the provider (without reading the key)
check_goose_provider() {
  case "$1" in
    anthropic)   [ -n "${ANTHROPIC_API_KEY}" ] ;;
    openai)      [ -n "${OPENAI_API_KEY}" ] ;;
    openrouter)  [ -n "${OPENROUTER_API_KEY}" ] ;;
    google)      [ -n "${GOOGLE_API_KEY}" ] ;;
    groq)        [ -n "${GROQ_API_KEY}" ] ;;
    ollama)      curl -sf http://localhost:11434/api/version > /dev/null ;;
    bedrock)     aws sts get-caller-identity > /dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

PROVIDER="anthropic"
check_goose_provider "$PROVIDER" \
  || { echo "ERROR: ${PROVIDER} not configured. Run via akm env run with that provider's env file, or run: goose configure" >&2; exit 1; }
```

Rules:
- **Never** `echo $ANTHROPIC_API_KEY` or log key values
- **Without akm**: keep keys in a mode-600 dotenv file outside any repo, and never commit it
- **In CI/CD**: inject as env vars via GitHub Secrets, AWS Secrets Manager, or Vault
- **With akm**: `akm env run env/<provider> -- goose ...` loads that provider's key for one command
- Goose config files (`~/.config/goose/`) do not store key values — they reference the env
- For AWS Bedrock: use IAM roles in production rather than static access keys

## Headless / Non-Interactive Mode

```bash
# Run a task non-interactively (text mode); inject the provider's env file
akm env run env/anthropic -- goose run --text "Add error handling to src/server.ts"

# With explicit model and provider
akm env run env/anthropic -- goose run --text "Refactor auth.ts" \
  --provider anthropic --model claude-sonnet-4-6

# Via Ollama (local — no API key needed)
goose run --text "Write unit tests for billing.ts" \
  --provider ollama --model qwen2.5-coder:32b
```

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
  | grep -q "qwen2.5-coder:32b" || {
  echo "Pulling qwen2.5-coder:32b..."
  ollama pull qwen2.5-coder:32b
}

# Run goose pointing at the resolved Ollama host
OLLAMA_HOST="http://${OLLAMA_HOST}:11434" \
goose run --text "Fix the type errors in src/" \
  --provider ollama --model qwen2.5-coder:32b --no-session
```

**Docker host note:** `localhost` inside a container resolves to the container, not the Docker
host. Try `172.17.0.1` (Linux default bridge), `host.docker.internal` (Docker Desktop /
macOS / Windows), or `$(ip route show default | awk '/default/ {print $3}')` to find the
gateway dynamically. The resolver above tries the three most common values automatically.

## Server Mode

Goose can run as a persistent background service:

```bash
# Start the Goose server with the provider's env file injected
akm env run env/anthropic -- goose serve --port 8080

# Send a task to the running server
goose run --server http://localhost:8080 --text "Fix the failing tests"
```

## Core Commands

| Command | Description |
|---|---|
| `goose run` | Run a task (headless or interactive) |
| `goose serve` | Start as background server |
| `goose configure` | Interactive provider/model setup |
| `goose session` | Manage sessions |
| `goose toolkit` | List/manage installed toolkits |

## Core Flags

| Flag | Description |
|---|---|
| `--text` | Prompt to run (enables headless mode) |
| `--provider` | LLM provider |
| `--model` | Model ID |
| `--session` | Session name (for continuation) |
| `--no-session` | Don't persist session state |
| `--server` | Connect to a running Goose server |
| `--port` | Port for serve mode |

## Model Selection

**Do not hardcode model names in scripts.** Pass provider and model at invocation time:

```bash
goose run --text "task" --provider "${GOOSE_PROVIDER}" --model "${GOOSE_MODEL}"
```

If omitted, Goose uses the provider/model configured via `goose configure`. Consult
each provider's documentation for current model IDs.

## Supported Providers

```
anthropic       → Claude models (requires ANTHROPIC_API_KEY)
openai          → GPT, o-series (requires OPENAI_API_KEY)
google          → Gemini (requires GOOGLE_API_KEY)
ollama          → Local models — no API key; requires Ollama running at localhost:11434
openrouter      → Any model via OpenRouter (requires OPENROUTER_API_KEY)
bedrock         → AWS Bedrock (uses AWS credential chain — no separate key)
azure           → Azure OpenAI (requires AZURE_OPENAI_API_KEY + endpoint config)
groq            → Fast inference (requires GROQ_API_KEY)
databricks      → DBRX, hosted models (requires DATABRICKS_TOKEN + host config)
```

## Extensions / Toolkits

```bash
# List available toolkits
goose toolkit list

# Install a toolkit
goose toolkit add github        # GitHub integration
goose toolkit add jira          # Jira issue management
goose toolkit add docker        # Docker operations
goose toolkit add database      # SQL database access
```

Toolkits that need secrets (e.g., GitHub tokens, Jira API keys) read them from environment
variables — keep each in an env file named after its service (e.g. `env/github`) and inject it
with `akm env run`, following the same security rules above.

## Scripting

```bash
# Run this script via `akm env run env/anthropic -- bash <script>`, then validate before use
check_goose_provider "anthropic" \
  || { echo "ERROR: anthropic provider not configured (add ANTHROPIC_API_KEY to env/anthropic)" >&2; exit 1; }

# Headless in CI
goose run \
  --text "Fix all TypeScript errors in src/" \
  --provider anthropic \
  --model claude-haiku-4-5 \
  --no-session

# Switch providers based on task complexity
if [ "${COMPLEX_TASK:-false}" = "true" ]; then
  goose run --text "${TASK}" --provider anthropic --model claude-opus-4-7
else
  goose run --text "${TASK}" --provider ollama --model qwen2.5-coder:7b
fi
```

## Session Continuation

```bash
# Start a named session
goose run --text "Plan the auth refactor" --session auth-refactor

# Continue it later
goose run --session auth-refactor --text "Now implement step 2"
```

## Troubleshooting

**`goose: command not found`**
→ Re-run the install script; check `~/.local/bin` is in `$PATH`: `export PATH="$HOME/.local/bin:$PATH"`

**Provider connection failed**
→ `goose configure` to reset provider config
→ Check the provider's env file lists the key: `akm env list | jq '.envs[] | select(.ref == "env/anthropic") | .keys'`

**Ollama model not found**
→ `ollama pull <model-name>` first; verify with `ollama list`
→ Confirm Ollama is running: `curl -sf http://localhost:11434/api/version`

**Server mode port conflict**
→ `goose serve --port 8081` to use a different port

**Session state causes loops**
→ Use `--no-session` for scripts to avoid stale context from prior runs
