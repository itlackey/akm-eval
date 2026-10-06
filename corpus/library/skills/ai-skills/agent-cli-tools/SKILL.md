---
name: agent-cli-tools
description: |
  Delegate work to AI agent CLI tools: Claude Code, OpenCode, OpenAI Codex, GitHub Copilot CLI,
  and Aider. Covers how to kick off agentic processes non-interactively, capture output, and
  chain tool calls. Use when you need to dispatch a task to an external agent process, compare
  tool capabilities, or troubleshoot a CLI agent setup.
  Triggers: "delegate to claude", "run opencode", "use codex", "kick off agent", "agentic CLI",
  "run aider", "run copilot", "headless agent", "non-interactive agent"
metadata:
  author: akm-shared contributors
  version: "1.1.0"
  created: 2026-05-22
license: MPL-2.0
compatibility: Requires Bash. Individual tools need their own install (see references/).
allowed-tools: Bash Read
updated: 2026-09-15
---

# Agent CLI Tools

## Overview

Every major AI coding agent ships a CLI that can be invoked non-interactively to delegate work,
capture structured output, and integrate into scripts or other agents. This skill covers the ten
most common tools, their key invocation patterns, and how to receive and use their output.

## Provider / Tool / Account Switching Policy

**An agent must NEVER switch providers, tools, models, or accounts without explicit user permission.**

If the requested agent tool or provider is unavailable (missing key, not installed, auth expired),
the agent must **stop and report** — not silently fall back to another tool.

```
✓ ALLOWED:  User says "use Claude Code" → agent uses Claude Code
✓ ALLOWED:  Tool fails → agent reports the exact error and stops
✗ FORBIDDEN: Claude Code key missing → agent silently uses OpenCode instead
✗ FORBIDDEN: Codex fails → agent retries with a different model without asking
✗ FORBIDDEN: Anthropic rate-limited → agent switches to OpenAI without asking
✗ FORBIDDEN: OAuth expired → agent tries API key fallback without asking
```

When a required tool or credential is unavailable:

```bash
# Report clearly and stop — do not attempt alternatives
echo "ERROR: ANTHROPIC_API_KEY not set — cannot use Claude Code." >&2
echo "       Add it to env/anthropic or run: claude /login" >&2
echo "       Other tools available if you prefer: opencode, codex, goose" >&2
exit 1
```

---

## Credential Setup (start here)

Before dispatching any agent, configure credentials so API key values never appear in agent
context, logs, or shell history.

This skill ships no credentials. Each consumer keeps one env file per service in their own
primary akm bundle, named after the service: `env/anthropic`, `env/openai`, `env/gemini`,
`env/dashscope`, `env/github`, and so on (variables for each: `references/env-setup.md`).

```bash
# Create an env file for a service you use (once); a person adds the key to the file
# shown by `akm env path env/anthropic`, e.g. ANTHROPIC_API_KEY=...
akm env create anthropic

# Run a tool with that service's variables injected; values never enter agent context
akm env run env/anthropic -- claude -p "task" --output-format json

# Check which env files exist and their key names (never prints values)
akm env list | jq -r '.envs[] | "\(.ref): \(.keys | join(", "))"'
# OAuth tools (no env var needed after first login):
claude -p "x" 2>/dev/null | jq -e '.result' > /dev/null && echo "✓ Claude Code OAuth" || echo "✗ Claude Code — run: claude /login"
opencode auth list 2>/dev/null | grep -q "●" && echo "✓ OpenCode"    || echo "✗ OpenCode — run: opencode auth login"
```

Full docs: `references/env-setup.md` · `references/akm-env-setup.md`

---

## Auth Priority

**Prefer OAuth over API keys for every tool that supports it.** OAuth tokens are managed by
the tool's credential store, have automatic rotation, and never appear in shell history or
environment variables.

| Tool | OAuth available | API key fallback |
|---|---|---|
| Claude Code | ✓ `claude /login` | `ANTHROPIC_API_KEY` |
| OpenCode | ✓ `opencode auth login` | env vars picked up automatically |
| Codex | ✓ `codex login` | `OPENAI_API_KEY` |
| Gemini CLI | ✓ `gemini auth login` | `GEMINI_API_KEY` |
| Amazon Q | ✓ `q login` | AWS credential chain |
| Copilot CLI | ✓ reuses `gh auth login` automatically | `COPILOT_GITHUB_TOKEN` |
| Goose | provider-dependent | provider-specific env vars |
| Aider | ✗ — env var only | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| Pi | ✗ — env var only | provider-specific env vars |
| Qwen Code | ✗ — env var only | `DASHSCOPE_API_KEY` (or Ollama — no key) |

## Model Selection

**Do not hardcode model names in scripts or automation.** Models should be supplied by the
calling agent or operator at invocation time via the appropriate flag or environment variable:

```bash
# Supply model at call time
claude -p "task" --model "${MODEL}"
opencode run "task" --model "${OPENCODE_MODEL}"
codex exec --sandbox workspace-write --model "${MODEL}" -- "task"
goose run --text "task" --model "${MODEL}" --provider "${PROVIDER}"
```

If no model is specified, each tool uses its configured default. See each tool's reference doc
for current model IDs and provider-specific naming conventions.

## Quick-Reference: Headless Invocation

| Tool | Headless command | Output flag |
|---|---|---|
| Claude Code | `claude -p "task"` | `--output-format json` |
| Qwen Code | `qwen-code -p "task"` | `--output-format json` |
| OpenCode | `opencode run "task"` | *(stdout)* |
| Codex | `codex exec --sandbox workspace-write -- "task"` | `--json` (JSONL events); `-o <file>` for final text |
| Gemini CLI | `gemini -p "task" --yolo` | *(stdout)* |
| Amazon Q | `q chat --no-interactive --trust-all-tools "task"` | *(stdout)* |
| Goose | `goose run --text "task"` | *(stdout)* |
| Pi | `pi -p "task"` | *(stdout)* |
| Copilot CLI | `copilot -p "task" --yolo --silent` | `--output-format json` |
| Aider | `aider --message "task" --yes` | *(stdout/stderr)* |

## Quick-Reference: Image / Multimodal Input

Each CLI exposes image input differently. Tested against the same image+prompt on 2026-05-23
(see `references/image-input.md` for full per-tool transcripts and gotchas).

| Tool | Image attach syntax | Example |
|---|---|---|
| Claude Code | via `Read` tool in prompt, or `--file <id>:<path>` startup resource | `claude -p "Read img.png and describe it"` |
| Qwen Code | provider-dependent (`--image` when using vision-capable model) | `qwen-code -p "describe" --image img.png` |
| OpenCode | `--file <path>` (put PROMPT first; short `-f` before prompt mis-parses) | `opencode run "describe" --file img.png` |
| Codex | `-i <FILE>` / `--image <FILE>` | `printf '%s\n' "describe" \| codex exec -i img.png -` |
| Gemini CLI | `@<path>` inline in the prompt string | `gemini -p "describe @img.png" --yolo` |
| Amazon Q | `@<path>` inline in the prompt string | `q chat --no-interactive "describe @img.png"` |
| Goose | provider-dependent; pass image-capable provider/model | `goose run --text "describe @img.png" --provider anthropic` |
| Pi | provider-dependent; needs vision-capable model | `pi -p "describe" --image img.png` (when supported) |
| Copilot CLI | `--attachment <path>` (use `--allow-all-tools` headless) | `copilot -p "describe" --attachment img.png --allow-all-tools` |
| Aider | `/add <image>` (interactive) or include in message; needs vision model | `aider --message "describe img.png" img.png --yes` |

### Gotchas (verified)

- **Codex image prompts.** Reading the prompt from stdin is portable across CLI versions:
  `printf '%s\n' "your prompt" | codex exec -i image.png -`.
- **OpenCode flag ordering.** `opencode run -f IMG "PROMPT"` is parsed as `-f "PROMPT"` and
  errors with "File not found". Put the prompt first, or use the long `--file` form after it.
- **Copilot uses tool calls, not direct vision.** `--attachment` triggers the agent's `Read`
  tool internally, which inflates token usage ~5× vs a direct vision call. For high-volume
  image tasks prefer Gemini CLI or Codex.
- **Claude Code has no `--image` flag.** Vision goes through the `Read` tool (which natively
  handles PNG/JPG/etc.). Either reference the path in the prompt and let the agent call Read,
  or pre-stage the file with `--file <id>:<path>`.
- **Provider-dependent tools (Goose, Pi, Aider, Qwen Code).** Image input only works when the
  selected provider+model is multimodal. Ollama local models usually are not unless explicitly
  a vision variant (e.g. `llava`, `qwen2-vl`).
- **Image size matters.** Downscale to ≤1024px on the long edge before attaching — large
  images inflate prompt tokens (especially on gpt-4o-mini variants).

## When to Use Each Tool

- **Claude Code** — best full-agentic loop for code tasks; structured JSON output; tool use
- **Qwen Code** — drop-in Claude Code alternative using Qwen3-Coder; works with local Ollama
- **OpenCode** — multi-provider TUI/headless; good for swapping models; supports remote attach
- **Codex** — tight OpenAI integration; staged approval modes (`codex exec` for non-interactive)
- **Gemini CLI** — free tier (1000 req/day); 1M token context; Google Search grounding
- **Amazon Q** — best for AWS environments; native AWS API access; Claude Sonnet-powered
- **Goose** — open-source; 15+ providers including Ollama/Bedrock; extensible toolkit system
- **Pi** — minimal BYOK agent; sparse system prompt preserves context for large files
- **Copilot CLI** — GitHub-integrated full agent; OAuth via existing `gh` token; session management
- **Aider** — git-aware pair programming; great for applying multi-file diffs with auto-commit


---

## Claude Code

### Install & Auth

```bash
npm install -g @anthropic-ai/claude-code
# Prefer OAuth — no API key to manage:
claude /login
# Fallback: akm env run env/anthropic -- claude ...  (env/anthropic holds ANTHROPIC_API_KEY)
```

### Headless delegation

```bash
# Run a task, get plain text back (-p makes it non-interactive)
claude -p "Add error handling to src/server.ts"

# Get structured JSON output (includes cost, turns, result)
claude -p "Summarize all TODOs in this repo" --output-format json

# Limit turns and restrict tools; pass model from env
claude -p "Fix the failing test in tests/auth.test.ts" \
  --max-turns 10 \
  --allowedTools "Read,Edit,Bash(bun test:*)" \
  --model "${CLAUDE_MODEL}"

# Stream JSON events (for real-time processing)
claude -p "Refactor utils.ts" --output-format stream-json | jq '.type'
```

### Capture output

```bash
RESULT=$(claude -p "List all exported functions in lib/" --output-format json)
echo "$RESULT" | jq '.result'
```

Full reference: `references/claude-code.md`

---

## Qwen Code

### Install & Auth

```bash
npm install -g @qwen-code/qwen-code
# No OAuth available. Options:
# Cloud: akm env run env/dashscope -- qwen-code ...  (env/dashscope holds DASHSCOPE_API_KEY)
# Local (no key): set OPENAI_BASE_URL=http://<ollama-host>:11434/v1 OPENAI_API_KEY=ollama
```

### Headless delegation

```bash
# Cloud (key injected from env/dashscope)
akm env run env/dashscope -- qwen-code -p "Add error handling to src/server.ts" --output-format json

# Local Ollama (no API key); pass model from env or as arg
OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_API_KEY=ollama \
  qwen-code -p "Write tests for billing.ts" --model "${QWEN_MODEL}"
```

Full reference: `references/qwen-code.md`

---

## OpenCode

### Install & Auth

```bash
curl -fsSL https://opencode.ai/install | sh   # or: npm i -g opencode-ai
# Prefer OAuth — stores credentials securely, not in env:
opencode auth login
```

### Headless delegation

```bash
# Run a one-shot task (model from env or omit to use configured default)
opencode run "Explain the auth middleware"

# Pass model from env
opencode run "Write tests for billing.ts" --model "${OPENCODE_MODEL}"

# Continue a session
opencode run --session <session-id> "Now also update the README"
```

Full reference: `references/opencode.md`

---

## OpenAI Codex

### Install & Auth

```bash
npm install -g @openai/codex
# Prefer OAuth:
codex login
# Fallback: akm env run env/openai -- codex ...  (env/openai holds OPENAI_API_KEY)
```

### Headless delegation (correct subcommand: `codex exec`)

```bash
# Normal project work inside the repository
codex exec --sandbox workspace-write -- \
  "Add pagination to the /users endpoint"

# Pass model from env
codex exec --sandbox workspace-write --model "${CODEX_MODEL}" -- \
  "Rename UserModel to User everywhere"
```

Full reference: `references/codex.md`

---

## GitHub Copilot CLI

### Install & Auth

```bash
npm install -g @github/copilot
# Prefer OAuth — reuses existing gh session automatically:
# No action needed if gh auth login has been run.
# Otherwise: copilot login
```

### Headless delegation

```bash
# Non-interactive; full permissions
copilot -p "Add error handling to src/server.ts" --yolo --silent

# Pass model from env
copilot -p "Refactor auth.ts" --model "${COPILOT_MODEL}" --yolo

# JSON output
copilot -p "List all API endpoints" --allow-all --output-format json
```

Full reference: `references/github-copilot-cli.md`

---

## Aider

### Install & Auth

```bash
pip install aider-chat
# No OAuth available. Inject the provider key from your env file at run time:
#   akm env run env/anthropic -- aider ...   (or env/openai for OPENAI_API_KEY)
# Without akm, aider also auto-reads .env in the project root
```

### Headless delegation

```bash
# Apply a task non-interactively; pass model from env
aider --message "Add docstrings to all public functions in lib/" --yes \
  --model "${AIDER_MODEL}"

# Specify target files
aider src/auth.ts src/session.ts \
  --message "Extract session logic into its own module" \
  --yes

# Read-only context
aider --read README.md --message "Update the API docs in src/api.ts" --yes
```

Full reference: `references/aider.md`

---

## Gemini CLI

### Install & Auth

```bash
npm install -g @google/gemini-cli
# Prefer OAuth — free tier (1000 req/day), no billing required:
gemini auth login
# Fallback: akm env run env/gemini -- gemini ...  (env/gemini holds GEMINI_API_KEY)
```

### Headless delegation

```bash
# Pass model from env or omit for default
gemini -p "Fix all TypeScript errors" --yolo
gemini -p "Upgrade Stripe SDK to latest API" --model "${GEMINI_MODEL}" --yolo
```

Full reference: `references/gemini-cli.md`

---

## Amazon Q CLI

### Install & Auth

```bash
brew install amazon-q   # macOS; see references for Linux
# Prefer OAuth (AWS Builder ID — free, no AWS account required):
q login
```

### Headless delegation

```bash
q chat --no-interactive --trust-all-tools "Refactor auth.ts"
q chat --trust-all-tools "List all Lambda functions in us-east-1 not invoked in 30 days"
```

Full reference: `references/amazon-q-cli.md`

---

## Goose

### Install & Auth

```bash
curl -fsSL https://github.com/block/goose/releases/latest/download/install.sh | sh
# Configure via interactive setup (OAuth where available per provider):
goose configure
# Fallback: akm env run env/<provider> -- goose ...  (e.g. env/anthropic)
```

### Headless delegation

```bash
# Pass provider and model from env
goose run --text "Add error handling to src/server.ts" \
  --provider "${GOOSE_PROVIDER}" --model "${GOOSE_MODEL}"

# Local Ollama (no API key)
goose run --text "Write tests" --provider ollama --model "${OLLAMA_MODEL}"
```

Full reference: `references/goose.md`

---

## Pi

### Install & Auth

```bash
npm install -g @earendil/pi
# No OAuth available. Inject the key for whichever provider you use:
#   akm env run env/<provider> -- pi ...   (e.g. env/anthropic)
```

### Headless delegation

```bash
# Pass provider and model from env
pi -p "Refactor auth.ts" \
  --provider "${PI_PROVIDER}" \
  --model "${PI_MODEL}"
```

Full reference: `references/pi.md`

---

## Chaining Tools

### Plan with Claude Code, apply with Aider

```bash
PLAN=$(claude -p "Create a step-by-step refactoring plan for auth.ts" \
  --output-format json | jq -r '.result')
aider src/auth.ts --message "$PLAN" --yes
```

### OpenCode in a loop

```bash
for file in src/**/*.ts; do
  opencode run "Add missing null checks to $file" --model "${OPENCODE_MODEL}"
done
```

---

## Choosing a Tool

```
Need structured JSON output?             → Claude Code or Qwen Code (--output-format json)
Need to swap models freely?              → OpenCode (--model provider/model)
Tightest OpenAI integration?             → Codex (codex exec)
Free tier (no billing required)?         → Gemini CLI (OAuth, 1000 req/day)
Working in AWS / need AWS API access?    → Amazon Q CLI
Need local/offline models (Ollama)?      → Qwen Code, Goose, or Pi
Need 15+ providers in one tool?          → Goose
Minimal BYOK / max context for code?     → Pi
Auto-commit multi-file diffs via git?    → Aider
```

## Reference Files

- `references/env-setup.md` — credential contract: one env file per service and the variables each holds, model variables, Ollama host resolution, security rules
- `references/akm-env-setup.md` — akm env mechanics: create env files, check key names, inject with `akm env run`, dispatch script
- `references/claude-code.md` — Claude Code: all flags, MCP, output formats, troubleshooting
- `references/qwen-code.md` — Qwen Code: Qwen3-Coder models, local Ollama, headless mode
- `references/opencode.md` — OpenCode: commands, session management, server mode, config
- `references/codex.md` — Codex: `codex exec` subcommand, approval modes, providers
- `references/gemini-cli.md` — Gemini CLI: free tier, YOLO mode, Search grounding, MCP
- `references/amazon-q-cli.md` — Amazon Q: AWS integration, trust-all-tools, MCP
- `references/goose.md` — Goose: 15+ providers, server mode, session continuation, toolkits
- `references/pi.md` — Pi: minimal BYOK agent, sparse system prompt, multi-provider
- `references/github-copilot-cli.md` — Copilot CLI: full agent, OAuth via gh, sessions, MCP, headless `-p` mode
- `references/aider.md` — Aider: git integration, lint/test loop, repo map, model config
- `references/image-input.md` — Image / multimodal input: per-tool attach syntax, tested invocations, gotchas
