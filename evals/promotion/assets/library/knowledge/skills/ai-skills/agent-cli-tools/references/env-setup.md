---
description: Credential contract for agent CLI tools — one akm env file per service in the consumer's own primary bundle, the variables each holds, model variables, local inference endpoints, and security rules
when_to_use: When an agent needs credentials or model settings for any agent CLI tool (Claude Code, OpenCode, Codex, Gemini, Goose, Pi, Aider, etc.) without exposing secret values to context, logs, or shell history
updated: 2026-09-15
---

# Environment Setup for Agent CLI Tools

## The Rule

**Agents must never read API key values into context.** Keep each service's credentials in an
env file in your own primary akm bundle, inject them into only the command that needs them with
`akm env run`, and check key names — never values.

```
env/anthropic  (your primary bundle; one env file per service)
         ↓  akm env run env/anthropic -- <command>
Child process environment only
         ↓  tool reads from env
claude / opencode / codex / goose / ...
```

---

## Consumer Contract: One Env File per Service

This skill contains no credentials. Consumers provide the env files below in their own primary
bundle. akm searches that bundle first, so `env/anthropic` resolves to the consumer's own
`env/anthropic.env`. Create only the files for services you use.

| Env ref | Required variables | Optional variables | Used by |
|---|---|---|---|
| `env/anthropic` | `ANTHROPIC_API_KEY` | | Claude Code, Aider, Pi, Goose, OpenCode |
| `env/openai` | `OPENAI_API_KEY` | `OPENAI_BASE_URL` (OpenAI-compatible endpoint) | Codex, Aider, Pi, OpenCode, Goose |
| `env/gemini` | `GEMINI_API_KEY` | `GOOGLE_API_KEY` (same AI Studio key, for tools that read that name) | Gemini CLI and Aider; `GOOGLE_API_KEY`: Pi and Goose (`google` provider) |
| `env/dashscope` | `DASHSCOPE_API_KEY` | | Qwen Code (cloud) |
| `env/github` | `GH_TOKEN`, `COPILOT_GITHUB_TOKEN` (at least one) | | GitHub Copilot CLI (reads `COPILOT_GITHUB_TOKEN` first, then `GH_TOKEN`), gh |
| `env/groq` | `GROQ_API_KEY` | | Pi, Goose |
| `env/openrouter` | `OPENROUTER_API_KEY` | | Goose |
| `env/mistral` | `MISTRAL_API_KEY` | | Pi |
| `env/xai` | `XAI_API_KEY` | | Pi (Grok) |
| `env/aws` | | `AWS_PROFILE`, `AWS_REGION`, or short-lived `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | Amazon Q CLI (IAM path), Goose (`bedrock`) |

Where to get keys: console.anthropic.com (Anthropic), platform.openai.com/api-keys (OpenAI),
aistudio.google.com/app/apikey (Gemini), dashscope.aliyun.com (DashScope), console.groq.com/keys
(Groq), openrouter.ai/keys (OpenRouter), console.mistral.ai (Mistral), console.x.ai (xAI). For
Copilot CLI, use a fine-grained PAT with the "Copilot Requests" permission.

Create a file (once). A person, not the agent, adds the values, one `KEY=value` per line:

```bash
akm env create anthropic                 # then edit the file shown by: akm env path env/anthropic
```

Create, check, run, rotate, and dispatch steps: `references/akm-env-setup.md`.

---

## Model and Provider Variables (not credentials)

These are not secrets. The calling agent or operator supplies them at invocation time and passes
them to each tool's `--model` / `--provider` flag (see Model Selection in `SKILL.md`):

| Variable | Tool | Example value |
|---|---|---|
| `CLAUDE_MODEL` | Claude Code | `claude-sonnet-4-6` |
| `CODEX_MODEL` | Codex | current model ID approved for the task |
| `OPENCODE_MODEL` | OpenCode | `anthropic/claude-sonnet-4-6` |
| `GEMINI_MODEL` | Gemini CLI | `gemini-2.5-flash` |
| `AIDER_MODEL` | Aider | `claude-sonnet-4-6` |
| `GOOSE_PROVIDER` / `GOOSE_MODEL` | Goose | `anthropic` / `claude-sonnet-4-6` |
| `PI_PROVIDER` / `PI_MODEL` | Pi | `anthropic` / `claude-sonnet-4-6` |
| `QWEN_MODEL` | Qwen Code | `qwen3-coder-480b-a35b-instruct` |
| `OLLAMA_MODEL` | Ollama-backed tools | `qwen2.5-coder:32b` |
| `COPILOT_MODEL` | Copilot CLI | passed to `copilot --model` |

---

## Checking Which Agents Are Ready

An agent can audit available tools without reading any values:

```bash
echo "=== Agent CLI Credential Status ==="

# OAuth-based (check login state via tool)
claude -p "x" --output-format json 2>/dev/null | jq -e '.result' > /dev/null 2>&1 \
  && echo "✓ Claude Code (OAuth active)" || echo "✗ Claude Code — run: claude /login"
opencode auth list 2>/dev/null | grep -q "●" \
  && echo "✓ OpenCode (providers configured)" || echo "✗ OpenCode — run: opencode auth login"
copilot -p "x" --allow-all --silent 2>/dev/null | head -1 | grep -q "/" \
  && echo "✓ Copilot CLI (GitHub auth active)" || echo "✗ Copilot CLI — run: copilot login"

# API key-based: env files and their key names (never values)
ENV_LIST=$(akm env list)
for pair in anthropic:ANTHROPIC_API_KEY openai:OPENAI_API_KEY gemini:GEMINI_API_KEY dashscope:DASHSCOPE_API_KEY; do
  ref="env/${pair%%:*}" key="${pair##*:}"
  echo "$ENV_LIST" | jq -e --arg r "$ref" --arg k "$key" 'any(.envs[]; .ref == $r and any(.keys[]; . == $k))' > /dev/null \
    && echo "✓ ${ref} has ${key}" || echo "✗ ${ref} missing or lacks ${key}"
done

# Local inference
curl -sf "http://localhost:11434/api/version" > /dev/null 2>&1 \
  && echo "✓ Ollama reachable at localhost:11434" \
  || echo "✗ Ollama not reachable (optional — for local models)"
```

---

## Local Inference (Ollama / LM Studio): No Env File Needed

Local backends need no real key. Set the endpoint and a dummy key inline; the dummy values are
not credentials:

```bash
OPENAI_BASE_URL="http://localhost:11434/v1" OPENAI_API_KEY=ollama qwen-code -p "task"    # Ollama default
OPENAI_BASE_URL="http://localhost:1234/v1" OPENAI_API_KEY=lmstudio qwen-code -p "task"   # LM Studio default
```

When running inside a container, `localhost` does not reach the host's Ollama instance.
Resolve the correct host automatically:

```bash
# Auto-resolve Ollama host (try localhost, Docker bridge, host.docker.internal)
if [ -z "${OPENAI_BASE_URL:-}" ] || [[ "${OPENAI_BASE_URL}" == *localhost* ]]; then
  for host in localhost 172.17.0.1 host.docker.internal; do
    if curl -sf "http://${host}:11434/api/version" > /dev/null 2>&1; then
      export OPENAI_BASE_URL="http://${host}:11434/v1"
      export OPENAI_API_KEY="${OPENAI_API_KEY:-ollama}"
      break
    fi
  done
fi

[ -z "${OPENAI_BASE_URL:-}" ] && echo "WARNING: Ollama not reachable (local models unavailable)"
```

---

## Security Rules

- **Never** `echo`, `cat`, `print`, or log any `*_KEY`, `*_TOKEN`, `*_AUTH`, or `*_SECRET` value
- **Never** `cat` or `source` an env file; inject it with `akm env run` (`akm env path` prints only a path)
- **Never** pass API keys as CLI arguments (exposed in `ps aux` and `/proc/cmdline`)
- **Keep** env files in your own primary bundle, never in a project repo or a shared bundle
- **Restrict** injection with `--only` when a command needs one variable: `akm env run env/github --only COPILOT_GITHUB_TOKEN -- copilot ...`
- **Prefer OAuth** for every tool that supports it — no key to manage or rotate

---

## Without akm

If you do not use akm, put the same variables in a mode-600 dotenv file outside any project and
load it only for the command that needs it. Never commit it.
