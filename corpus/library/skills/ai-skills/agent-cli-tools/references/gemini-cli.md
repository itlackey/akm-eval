---
description: Gemini CLI — Google's open-source AI agent CLI, install, auth, free tier, headless mode, MCP, and troubleshooting
when_to_use: When you want a free-tier multi-file coding agent with 1M token context, Google Search grounding, or MCP tool support
updated: 2026-09-15
---

# Gemini CLI Reference

## What It Is

Gemini CLI is Google's open-source (Apache 2.0) AI agent CLI powered by Gemini models with a
1M-token context window. It includes built-in Google Search grounding, file operations, shell
execution, and MCP extensibility. Free tier: 60 requests/min, 1,000/day with a personal Google
account — no billing required.

## Setup Checklist

Follow these steps in order. Choose **Path A** (personal Google account, free) or **Path B** (API key).

```bash
# 1. Check prerequisites
node --version          # requires Node.js 18+

# 2. Install
npm install -g @google/gemini-cli

# 3. Verify install
gemini --version

# --- PATH A: Personal Google account (recommended for development — free tier) ---
# 4a. Authenticate via browser OAuth (no API key needed)
gemini auth login
# Browser opens — sign in with your Google account

# 5a. Verify auth
gemini auth status

# --- PATH B: API key (Gemini API / AI Studio) ---
# 4b. Obtain an API key from https://aistudio.google.com/app/apikey
# 5b. Set credentials securely (see Credential Security)
akm env create gemini   # then add GEMINI_API_KEY=... to the file yourself
akm env list | jq '.envs[] | select(.ref == "env/gemini") | .keys'   # names only

# 6. Smoke test (Path B: prefix with akm env run env/gemini --)
gemini -p "say hello"
```

## Install

```bash
npm install -g @google/gemini-cli

# Verify
gemini --version
```

Requires Node.js 18+.

## Authentication

```bash
# Option 1: Personal Google account (free tier — no API key, no billing)
gemini auth login
# Opens browser for OAuth; stores token in ~/.gemini/

# Option 2: API key (Gemini API / AI Studio — for production or CI)
akm env run env/gemini -- gemini -p "task" --yolo   # env/gemini holds GEMINI_API_KEY
```

Free tier limits (personal account): 60 req/min, 1,000 req/day.

## Credential Security

**Gemini CLI supports two auth methods with different security profiles.**

### OAuth (personal account) — preferred for development

```bash
# Auth is handled via browser flow; no API key to manage
gemini auth login

# Check status without exposing any token
gemini auth status

# Never try to extract or log the OAuth token
# If auth expires: gemini auth login again
```

### API key — for CI/CD and production

```bash
# Keep the key in your own primary bundle (once), then add GEMINI_API_KEY=... to the file yourself
akm env create gemini

# Inject it only for the command that needs it
akm env run env/gemini -- gemini -p "task" --yolo

# In a script launched that way, check presence WITHOUT reading/printing the value
if [ -z "${GEMINI_API_KEY}" ]; then
  echo "ERROR: GEMINI_API_KEY not set. Run via: akm env run env/gemini -- <script>" >&2
  exit 1
fi
```

Rules:
- **Never** `echo $GEMINI_API_KEY` or log it
- **Without akm**: keep the key in a mode-600 dotenv file outside any repo, and never commit it
- **In CI/CD**: inject `GEMINI_API_KEY` as a secret env var (GitHub Secrets, etc.)
- **With akm**: `akm env run env/gemini -- gemini ...` loads the key for that one command
- OAuth tokens in `~/.gemini/` are managed by the CLI — do not log or print their values; copying them to pass to another tool is fine

## Headless Delegation

`-p` alone makes Gemini CLI non-interactive. Also pass `--skip-trust` (or set
`GEMINI_CLI_TRUST_WORKSPACE=true`) to suppress the workspace trust prompt in scripts.

The CLI can only access files **under its working directory** — run it from the directory
containing the files you want it to read/edit.

```bash
# Non-interactive prompt
GEMINI_CLI_TRUST_WORKSPACE=true gemini --skip-trust -p "Add error handling to src/server.ts" --yolo
# Pipe a prompt
echo "List all exported types in lib/" | GEMINI_CLI_TRUST_WORKSPACE=true gemini --skip-trust --yolo
# With a specific model
GEMINI_CLI_TRUST_WORKSPACE=true gemini --skip-trust -p "Refactor auth.ts" --model gemini-2.5-pro --yolo
```

## Core Flags

| Flag | Short | Description |
|---|---|---|
| `--prompt` | `-p` | Prompt to run (non-interactive) |
| `--model` | `-m` | Model ID (default: `gemini-2.5-flash`) |
| `--skip-trust` | | Skip workspace trust prompt (required in scripts/headless) |
| `--sandbox` | | Run in sandboxed environment |
| `--yolo` | | Auto-approve all tool calls (CI/scripts) |
| `--mcp-config` | | Path to MCP config JSON |
| `--debug` | | Show debug output |

## Model Selection

**Do not hardcode model names in scripts.** Pass the model at invocation time:

```bash
gemini -p "task" --model "${GEMINI_MODEL}" --yolo
```

If `--model` is omitted, Gemini CLI uses `gemini-2.5-flash` by default. Consult
https://ai.google.dev/gemini-api/docs/models for current model names and quotas.

## Model IDs (reference — use via env var at runtime)

```
gemini-2.5-flash     # default — fast, free tier
gemini-2.5-pro       # most capable, higher quota
gemini-2.0-flash     # previous generation, fast
```

## Agent Mode (multi-step)

Gemini CLI runs an agentic loop automatically when the task requires multiple tool calls:

```bash
# Multi-file refactor
gemini -p "Rename all instances of UserModel to User across the codebase" --yolo

# With Google Search grounding (fetches live docs)
gemini -p "Update the Stripe SDK usage to the latest API version" --yolo
```

## YOLO Mode (CI/Scripts)

`--yolo` auto-approves all tool calls without user confirmation:

```bash
GEMINI_CLI_TRUST_WORKSPACE=true gemini --skip-trust -p "Fix all TypeScript errors" --yolo
```

## MCP Integration

MCP config must not contain API key values — use env var references or keyless commands:

```bash
# Create config file
mkdir -p .gemini
cat > .gemini/mcp.json << 'EOF'
{
  "mcpServers": {
    "sqlite": { "command": "npx", "args": ["-y", "mcp-server-sqlite", "db.sqlite"] }
  }
}
EOF

# MCP servers that need secrets should read them from the environment,
# not from hardcoded values in mcp.json

gemini -p "Query the users table and add validation" \
  --mcp-config .gemini/mcp.json --yolo
```

## Google Search Grounding

Gemini CLI can ground responses in live Google Search results:

```bash
gemini -p "Upgrade this project from React 18 to React 19 using the migration guide"
# Gemini will search for the React 19 migration guide automatically
```

## Scripting

```bash
# If using an API key instead of OAuth, run this script via `akm env run env/gemini -- bash <script>`

# Capture output
RESULT=$(GEMINI_CLI_TRUST_WORKSPACE=true gemini --skip-trust -p "List all API endpoints in src/" --yolo 2>&1)

# Loop over files (rate-limit aware for free tier)
for f in src/routes/*.ts; do
  GEMINI_CLI_TRUST_WORKSPACE=true gemini --skip-trust -p "Add input validation to $f" --yolo
  sleep 2   # stay under 60 req/min free tier limit
done
```

## Troubleshooting

**`Authentication required`**
→ Run `gemini auth login` (personal account) or run through `akm env run env/gemini -- gemini ...` (API key)
→ Check: `gemini auth status`

**Rate limit exceeded (free tier)**
→ 60 req/min, 1,000/day — add `sleep 2` between calls or use an API key for higher limits

**`gemini: command not found`**
→ `npm install -g @google/gemini-cli`; verify: `echo "$(npm bin -g)"` is in `$PATH`

**Tool calls blocked**
→ Add `--yolo` for scripts; interactive mode prompts for each tool call

**Large repo context overflow**
→ Gemini has 1M token context but very large monorepos can still exhaust it — scope to subdirectories
