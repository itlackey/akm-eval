---
description: Using akm env to store and inject agent CLI credentials — one env file per service, create and fill it, check key names, run agents with akm env run, dispatch script
when_to_use: When managing agent CLI API keys with akm, or when an agent needs credentials injected without exposing values to its context window
updated: 2026-09-15
---

# akm env Setup for Agent CLI Tools

The former vault commands were removed in akm 0.9; `akm env` replaces them. Check current syntax with
`akm env --help` and `akm env run --help`.

## Why akm env

An env file in your own primary akm bundle keeps credentials on disk and out of structured
output, LLM context, logs, and shell history. `akm env list` shows key names only, and
`akm env run` injects the values into one child process — they go disk → child environment,
bypassing the agent's context entirely.

```
env/anthropic  (your primary bundle; one env file per service)
        ↓  akm env run env/anthropic -- <command>
Child process environment only
        ↓  tool reads from env
claude / opencode / codex / goose / aider / ...
```

This skill ships in a shared bundle and contains no credentials. Each consumer creates the env
files it needs, named after the service: `env/anthropic`, `env/openai`, `env/gemini`,
`env/dashscope`, `env/github`, and so on. The variables each file holds are listed in
`references/env-setup.md`.

---

## Step 1: Create One Env File per Service

A person, not the agent, supplies the values. Either create an empty file and fill it in:

```bash
akm env create anthropic                  # creates env/anthropic in your working bundle
$EDITOR "$(akm env path env/anthropic)"
# One KEY=value per line:
#   ANTHROPIC_API_KEY=sk-ant-...
```

Or promote a key that is already exported in your own terminal, without retyping it
(`printf` is a shell builtin, so the value does not appear in the process list):

```bash
printf 'ANTHROPIC_API_KEY=%s\n' "$ANTHROPIC_API_KEY" | akm env create anthropic --from-stdin
printf 'OPENAI_API_KEY=%s\n' "$OPENAI_API_KEY" | akm env create openai --from-stdin
printf 'DASHSCOPE_API_KEY=%s\n' "$DASHSCOPE_API_KEY" | akm env create dashscope --from-stdin
```

Optional non-secret values for the same service go in the same file, for example
`OPENAI_BASE_URL` in `env/openai`.

---

## Step 2: Verify Key Names (never values)

```bash
# All env files and their key names
akm env list | jq -r '.envs[] | "\(.ref): \(.keys | join(", "))"'

# One file
akm env list | jq '.envs[] | select(.ref == "env/anthropic") | .keys'
# [
#   "ANTHROPIC_API_KEY"
# ]
```

---

## Step 3: Run Tools With the Env File Injected

```bash
# One-off delegation: the variables exist only for that command's lifetime
akm env run env/anthropic -- claude -p "Summarize the codebase" --output-format json

# The tool's stdout passes through unchanged, so pipes work as usual
akm env run env/anthropic -- claude -p "List exported types" --output-format json | jq -r '.result'

# Inject only some keys
akm env run env/github --only COPILOT_GITHUB_TOKEN -- copilot -p "hello" --allow-all --silent

# A whole script that calls several tools using the same service
akm env run env/anthropic -- bash agent-task.sh

# A command that needs two services: nest the runs
akm env run env/github -- akm env run env/anthropic -- goose run --text "task" --provider anthropic
```

`akm env run` exits with the child's exit code, and exits 1 with `Env not found` when the ref
does not resolve. Do not `source` the file at `akm env path`.

---

## Complete Agent Dispatch Script

A full script an agent can run safely:

```bash
#!/usr/bin/env bash
# agent-dispatch.sh — delegate a task to a CLI agent with credentials from akm env
# Model/provider variables (CLAUDE_MODEL, GOOSE_PROVIDER, ...) come from the caller.

set -euo pipefail
set +x   # never trace — prevents key values in logs

TASK="${TASK:-}"
TOOL="${TOOL:-claude}"   # claude | opencode | codex | goose | aider | pi
ENV_REF="${ENV_REF:?ENV_REF required: the env file for the provider, e.g. env/anthropic}"

[ -z "${TASK}" ] && { echo "ERROR: TASK env var required" >&2; exit 1; }

# 1. Verify the env file exists (key names only, never values)
akm env list | jq -e --arg r "${ENV_REF}" 'any(.envs[]; .ref == $r)' > /dev/null \
  || { echo "ERROR: ${ENV_REF} not found. Create it: akm env create ${ENV_REF#env/}" >&2; exit 1; }

# 2. Dispatch with credentials injected for this one command
run() { akm env run "${ENV_REF}" -- "$@"; }

case "${TOOL}" in
  claude)   run claude -p "${TASK}" --output-format json | jq -r '.result' ;;
  opencode) run opencode run "${TASK}" --model "${OPENCODE_MODEL}" ;;
  codex)    run codex exec --sandbox workspace-write -- "${TASK}" ;;
  goose)    run goose run --text "${TASK}" --provider "${GOOSE_PROVIDER}" --model "${GOOSE_MODEL}" --no-session ;;
  aider)    run aider --message "${TASK}" --yes --no-auto-commits --model "${AIDER_MODEL}" ;;
  pi)       run pi -p "${TASK}" --provider "${PI_PROVIDER}" --model "${PI_MODEL}" ;;
  *)
    echo "ERROR: Unknown tool: ${TOOL}" >&2
    echo "       Valid: claude opencode codex goose aider pi" >&2
    exit 1
    ;;
esac
```

```bash
# Usage
TASK="Fix all TypeScript errors in src/" TOOL=claude ENV_REF=env/anthropic bash agent-dispatch.sh
TASK="Write tests for billing.ts" TOOL=codex ENV_REF=env/openai bash agent-dispatch.sh
```

---

## OAuth Tools — No Env File Needed

These tools store OAuth tokens themselves; no env file required:

| Tool | Setup | Check |
|---|---|---|
| Claude Code | `claude /login` | `claude -p "hello" --output-format json` |
| OpenCode | `opencode auth login` | `opencode auth list` |
| Codex | `codex login` | `codex exec --sandbox read-only -- "echo ok"` |
| Gemini CLI | `gemini auth login` | `gemini auth status` |
| Amazon Q | `q login` | `q --version` (prompts if unauthed) |
| Copilot CLI | `copilot login` / uses `GH_TOKEN` | `copilot -p "hello" --allow-all --silent` |

Where OAuth is not available (CI), a token in an env file is the fallback:

```bash
# Copilot CLI: fine-grained PAT with "Copilot Requests" permission, kept in env/github
akm env run env/github --only COPILOT_GITHUB_TOKEN -- copilot -p "hello" --allow-all --silent
```

---

## Updating Keys

`akm env create` refuses to overwrite an existing env file. To rotate a key, edit the file:

```bash
$EDITOR "$(akm env path env/anthropic)"
```

## Removing an Env File

```bash
# Deletes the file; cannot be undone. --yes is required in non-interactive shells.
akm env remove env/groq --yes
```
