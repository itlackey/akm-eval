---
description: Pi CLI agent — minimal multi-provider AI coding agent by earendil-works, install, auth, headless usage
when_to_use: When you want a minimal, BYOK-flexible coding agent with a sparse system prompt and maximum context window for code
updated: 2026-09-15
---

# Pi CLI Reference

## What It Is

Pi is a minimal open-source AI coding agent (github: earendil-works/pi) with a philosophy of
sparse system prompts and on-demand tool loading to maximize usable context window. It has four
core tools (Read, Write, Edit, Bash) and supports any major provider via BYOK.

## Setup Checklist

Follow these steps in order. Pi needs at least one provider configured.

```bash
# 1. Install
npm install -g @earendil/pi

# 2. Verify install
pi --version

# 3. Set credentials for your chosen provider (see Credential Security)
#    One env file per provider in your primary bundle, e.g. env/anthropic (ANTHROPIC_API_KEY)
akm env create anthropic   # then add ANTHROPIC_API_KEY=... to the file yourself

# 4. Confirm the env file lists the key (names only, never values)
akm env list | jq '.envs[] | select(.ref == "env/anthropic") | .keys'

# 5. Smoke test
akm env run env/anthropic -- pi -p "say hello" --provider anthropic --model claude-haiku-4-5
```

## Install

```bash
# npm (recommended)
npm install -g @earendil/pi

# or clone and build from source
git clone https://github.com/earendil-works/pi
cd pi && npm install && npm run build && npm link

# Verify
pi --version
```

## Authentication

**Pi does not support OAuth.** API keys via environment variables are the only option.

```bash
# Inject the provider's env file for the run (see Credential Security)
akm env run env/anthropic -- pi -p "task" --provider anthropic

# Provider env var names, and the env file that holds each:
#   ANTHROPIC_API_KEY   → Claude models (Anthropic)        env/anthropic
#   OPENAI_API_KEY      → GPT / o-series (OpenAI)          env/openai
#   GOOGLE_API_KEY      → Gemini (Google)                  env/gemini
#   XAI_API_KEY         → Grok (xAI)                       env/xai
#   MISTRAL_API_KEY     → Mistral models                   env/mistral
#   GROQ_API_KEY        → Groq fast-inference models       env/groq
```

## Credential Security

**Never hardcode API keys in scripts or shell history. Pi reads them from env vars only.**

```bash
# Create an env file for each provider you use (once), then add its key to the file yourself
akm env create anthropic   # ANTHROPIC_API_KEY
akm env create openai      # OPENAI_API_KEY
akm env create gemini      # GOOGLE_API_KEY
akm env create groq        # GROQ_API_KEY

# Inject only the provider you run
akm env run env/anthropic -- pi -p "task" --provider anthropic

# Inside a script launched that way, check the provider is configured (without reading the value)
check_provider() {
  local provider="$1"
  case "$provider" in
    anthropic) [ -n "${ANTHROPIC_API_KEY}" ] ;;
    openai)    [ -n "${OPENAI_API_KEY}" ] ;;
    google)    [ -n "${GOOGLE_API_KEY}" ] ;;
    xai)       [ -n "${XAI_API_KEY}" ] ;;
    mistral)   [ -n "${MISTRAL_API_KEY}" ] ;;
    groq)      [ -n "${GROQ_API_KEY}" ] ;;
  esac
}

PROVIDER="anthropic"
check_provider "$PROVIDER" \
  || { echo "ERROR: ${PROVIDER} API key not set. Run via akm env run with that provider's env file" >&2; exit 1; }
```

Rules:
- **Never** pass keys as command-line arguments (e.g., `pi -p "task" --key sk-ant-...`)
- **Never** `echo $ANTHROPIC_API_KEY` or log key values
- **Without akm**: keep keys in a mode-600 dotenv file outside any repo, and never commit it
- **In CI/CD**: inject as env vars via GitHub Secrets, AWS Secrets Manager, or Vault
- **With akm**: `akm env run env/<provider> -- pi ...` loads that provider's key for one command

## Headless Delegation

```bash
# Inject the provider's env file — do not inline key values
# Run a task with explicit provider and model
akm env run env/anthropic -- pi -p "Add error handling to src/server.ts" --provider anthropic --model claude-sonnet-4-6

# With OpenAI
akm env run env/openai -- pi -p "Refactor auth.ts" --provider openai --model gpt-4o

# With Gemini (free tier — requires GOOGLE_API_KEY, not OAuth)
akm env run env/gemini -- pi -p "Write tests for billing.ts" --provider google --model gemini-2.5-flash

# With Groq (fast local-speed inference)
akm env run env/groq -- pi -p "Fix import errors in src/index.ts" --provider groq --model llama-3.3-70b-versatile
```

## Model Selection

**Do not hardcode model names in scripts.** Pass provider and model at invocation time:

```bash
pi -p "task" --provider "${PI_PROVIDER}" --model "${PI_MODEL}"
```

If omitted, Pi may error or use a provider default. Always pass both `--provider` and
`--model` in automation to avoid ambiguity. Consult each provider's docs for current IDs.

## Core Flags

| Flag | Description |
|---|---|
| `-p` / `--prompt` | Prompt to run (non-interactive) |
| `--provider` | Provider: `anthropic`, `openai`, `google`, `xai`, `mistral`, `groq` |
| `--model` | Model ID |
| `--max-turns` | Max agent iterations |
| `--no-interactive` | Fully non-interactive mode |

## Design Philosophy

Pi loads only the tools an agent needs on demand, rather than listing all tools in the system
prompt. This leaves more context tokens available for actual code, making it particularly
effective on long files or large refactors where context budget matters.

```bash
# Pi with a tight context budget (useful for smaller/cheaper models)
pi -p "Fix the import error in src/index.ts" \
  --provider groq --model llama-3.3-70b-versatile
```

## Multi-Provider Scripting

```bash
# Try providers in order of preference; use the first whose env file exists
for provider in anthropic openai groq; do
  if akm env path "env/${provider}" > /dev/null 2>&1; then
    akm env run "env/${provider}" -- pi -p "Explain the auth flow" --provider "$provider"
    break
  fi
done
```

## Extending with TypeScript

Pi is extensible via TypeScript plugins:

```typescript
// .pi/tools/my-tool.ts
export default {
  name: "my-tool",
  description: "Does something custom",
  async run(args: unknown) { /* ... */ }
}
```

## Troubleshooting

**No output / silent failure**
→ Check the provider's env file lists the key: `akm env list | jq '.envs[] | select(.ref == "env/anthropic") | .keys'`
→ Pass `--provider` explicitly; pi may default to a provider whose key isn't set

**`pi: command not found`**
→ `npm install -g @earendil/pi`; verify: `echo "$(npm bin -g)"` is in `$PATH`

**Context window errors**
→ Pi's sparse-prompt design helps, but for very large repos scope to specific files as arguments

**Model not available for provider**
→ Check provider docs for current model IDs; Pi passes them through directly
→ Verify the correct env var is set for the provider in use
