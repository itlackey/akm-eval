---
description: Qwen Code CLI — Alibaba's open-source coding agent for Qwen3-Coder models, install, headless mode, and flags
when_to_use: When you want to run Qwen coding models (Qwen3-Coder 480B/35B) locally or via API with a Claude Code-style agent loop
updated: 2026-09-15
---

# Qwen Code CLI Reference

## What It Is

Qwen Code is Alibaba's open-source CLI agent built on the Claude Code architecture, optimized for
Qwen3-Coder models (480B MoE, 35B active parameters). It supports headless/non-interactive mode
with structured JSON output, making it a drop-in alternative to Claude Code for Qwen models.

## Setup Checklist

Follow these steps in order. Choose **Path A** (cloud API) or **Path B** (local Ollama).

```bash
# 1. Check prerequisites
node --version          # requires Node.js 22+

# 2. Install
npm install -g @qwen-code/qwen-code

# 3. Verify install
qwen-code --version

# --- PATH A: Alibaba Cloud DashScope ---
# 4a. Set credentials (see Credential Security below)
akm env create dashscope   # then add DASHSCOPE_API_KEY=... to the file yourself
akm env list | jq '.envs[] | select(.ref == "env/dashscope") | .keys'   # names only

# 5a. Smoke test (cloud)
akm env run env/dashscope -- qwen-code -p "say hello" --model qwen3-coder-480b-a35b-instruct \
  --no-interactive --output-format json | jq '.result'

# --- PATH B: Local Ollama (no API key) ---
# 4b. Verify Ollama is running
curl -sf http://localhost:11434/api/version > /dev/null \
  || { echo "ERROR: Ollama not running. Start with: ollama serve" >&2; exit 1; }

# 5b. Pull the model if not present
ollama list | grep -q "qwen2.5-coder" || ollama pull qwen2.5-coder:32b

# 6b. Smoke test (local)
OPENAI_BASE_URL=http://localhost:11434/v1 \
OPENAI_API_KEY=ollama \
qwen-code -p "say hello" --model qwen2.5-coder:32b --no-interactive
```

## Install

```bash
npm install -g @qwen-code/qwen-code
# or via released binaries: https://github.com/QwenLM/qwen-code/releases

# Verify
qwen-code --version
```

Requires Node.js 22+.

## Authentication

**Qwen Code does not support OAuth.** Options:

- **Cloud (DashScope):** API key only — obtain from https://dashscope.aliyun.com, keep it in `env/dashscope`
- **Local (Ollama):** No authentication required — dummy `OPENAI_API_KEY=ollama` value accepted
- **LM Studio:** Same as Ollama — no real API key, dummy value accepted

```bash
# Cloud: inject from your own env/dashscope (see Credential Security)
akm env run env/dashscope -- qwen-code -p "task"   # env/dashscope holds DASHSCOPE_API_KEY

# Ollama local:
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_API_KEY="ollama"   # dummy value — Ollama ignores it

# LM Studio local:
export OPENAI_BASE_URL="http://localhost:1234/v1"
export OPENAI_API_KEY="lmstudio"   # dummy value
```

## Credential Security

**Never hardcode real API keys in scripts, config files, or shell history.**

```bash
# Keep the key in your own primary bundle (once), then add DASHSCOPE_API_KEY=... to the file yourself
akm env create dashscope

# Inject it only for the command that needs it
akm env run env/dashscope -- qwen-code -p "task" --no-interactive

# In a script launched that way, check presence WITHOUT reading/printing the value
if [ -z "${DASHSCOPE_API_KEY}" ] && [ "${OPENAI_API_KEY}" != "ollama" ] && [ "${OPENAI_API_KEY}" != "lmstudio" ]; then
  echo "ERROR: No cloud API key set and no local backend configured." >&2
  echo "  Cloud: run via akm env run env/dashscope -- <command>" >&2
  echo "  Local: set OPENAI_BASE_URL and OPENAI_API_KEY=ollama" >&2
  exit 1
fi
```

Rules:
- **Never** echo or log `DASHSCOPE_API_KEY`
- **Without akm**: keep the key in a mode-600 dotenv file outside any repo, and never commit it
- **In CI/CD**: inject `DASHSCOPE_API_KEY` as a secret env var
- **With akm**: `akm env run env/dashscope -- qwen-code ...` loads the key for that one command
- Dummy values (`ollama`, `lmstudio`) for `OPENAI_API_KEY` are safe to hardcode — they are not real credentials

## Headless Delegation

```bash
# Non-interactive prompt (same -p flag as Claude Code)
qwen-code -p "Add error handling to src/server.ts" --no-interactive

# Structured JSON output
qwen-code -p "List all exported functions in lib/" \
  --output-format json \
  --no-interactive

# Stream JSON events
qwen-code -p "Refactor utils.ts" \
  --output-format stream-json \
  --no-interactive | jq '.type'

# Limit turns
qwen-code -p "Fix the failing test" \
  --max-turns 10 \
  --no-interactive
```

## Core Flags

Same flag surface as Claude Code:

| Flag | Description |
|---|---|
| `-p` / `--print` | Prompt (enables non-interactive mode) |
| `--no-interactive` | Never prompt the user |
| `--output-format` | `text`, `json`, `stream-json` |
| `--model` | Model ID |
| `--max-turns` | Max agent turns |
| `--allowedTools` | Comma-separated allowed tools |
| `--disallowedTools` | Comma-separated blocked tools |
| `--system-prompt` | Override system prompt |

## Model Selection

**Do not hardcode model names in scripts.** Pass the model at invocation time:

```bash
# Cloud
qwen-code -p "task" --model "${QWEN_MODEL}"

# Local (Ollama)
OPENAI_BASE_URL="${OLLAMA_URL}/v1" OPENAI_API_KEY=ollama \
  qwen-code -p "task" --model "${QWEN_MODEL}"
```

If `--model` is omitted, Qwen Code uses its configured default. Consult
https://github.com/QwenLM/qwen-code for current supported model IDs.

## Model IDs (reference — use via env var at runtime)

```
# DashScope (cloud)             # Ollama / LM Studio (local)
qwen3-coder-480b-a35b-instruct  qwen2.5-coder:32b
                                qwen2.5-coder:7b        # faster, less memory
```

## Local Model via Ollama

```bash
# Resolve the Ollama host — try localhost first, then common Docker bridge addresses
OLLAMA_HOST=""
for host in localhost 172.17.0.1 host.docker.internal; do
  if curl -sf "http://${host}:11434/api/version" > /dev/null 2>&1; then
    OLLAMA_HOST="$host"
    break
  fi
done
[ -z "$OLLAMA_HOST" ] && { echo "ERROR: Ollama not reachable. Start with: ollama serve" >&2; exit 1; }

# Pull the model if not present
OLLAMA_URL="http://${OLLAMA_HOST}:11434"
curl -sf "${OLLAMA_URL}/api/tags" | jq -r '.models[].name' | grep -q "qwen2.5-coder:32b" || {
  echo "Pulling qwen2.5-coder:32b..."
  ollama pull qwen2.5-coder:32b
}

# Run against local model
OPENAI_BASE_URL="${OLLAMA_URL}/v1" \
OPENAI_API_KEY=ollama \
qwen-code -p "Add unit tests for auth.ts" \
  --model qwen2.5-coder:32b \
  --no-interactive
```

**Docker host note:** If running inside a container, `localhost` won't reach an Ollama instance
on the host. Try `172.17.0.1` (default Docker bridge), `host.docker.internal` (Docker Desktop /
macOS / Windows), or the explicit host IP. The resolver above tries all three automatically.

## Local Model via LM Studio

```bash
# Resolve the LM Studio host — try localhost then Docker bridge addresses
LMSTUDIO_HOST=""
for host in localhost 172.17.0.1 host.docker.internal; do
  if curl -sf "http://${host}:1234/v1/models" > /dev/null 2>&1; then
    LMSTUDIO_HOST="$host"
    break
  fi
done
[ -z "$LMSTUDIO_HOST" ] && { echo "ERROR: LM Studio server not reachable at port 1234" >&2; exit 1; }

OPENAI_BASE_URL="http://${LMSTUDIO_HOST}:1234/v1" \
OPENAI_API_KEY=lmstudio \
qwen-code -p "Refactor auth.ts" \
  --model qwen2.5-coder-32b-instruct \
  --no-interactive
```

**Docker host note:** Same as Ollama — if inside a container, substitute `172.17.0.1` or
`host.docker.internal` for `localhost`.

## Output Format

JSON output schema matches Claude Code:

```json
{
  "type": "result",
  "result": "...",
  "cost_usd": 0.0012,
  "duration_ms": 8200,
  "num_turns": 2,
  "session_id": "abc123"
}
```

## Scripting

```bash
# Run this script via `akm env run env/dashscope -- bash <script>`
[ -z "${DASHSCOPE_API_KEY}" ] && { echo "ERROR: DASHSCOPE_API_KEY not set (add it to env/dashscope)" >&2; exit 1; }

RESULT=$(qwen-code -p "Summarize all TODOs" \
  --output-format json --no-interactive | jq -r '.result')
echo "$RESULT"
```

## Troubleshooting

**`DASHSCOPE_API_KEY not set`**
→ Run through `akm env run env/dashscope -- qwen-code ...`; obtain key at https://dashscope.aliyun.com
→ Check key names without printing values: `akm env list | jq '.envs[] | select(.ref == "env/dashscope") | .keys'`

**Local model too slow**
→ Use `qwen2.5-coder:7b` for faster iteration; 32b for quality
→ Ensure Ollama has enough GPU/RAM: `ollama ps`

**`qwen-code: command not found`**
→ `npm install -g @qwen-code/qwen-code`; verify: `echo "$(npm bin -g)"` is in `$PATH`

**Context window exceeded with large repos**
→ Add `--allowedTools "Read,Edit"` to reduce tool surface and token usage
→ Switch to `qwen2.5-coder:32b` which has a 128k context window
