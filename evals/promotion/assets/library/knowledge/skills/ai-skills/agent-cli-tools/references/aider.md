---
description: Aider CLI — complete flag reference, install, auth, git integration, model config, and troubleshooting
when_to_use: When you need full details on aider CLI flags, headless mode, git auto-commit, file targeting, or model configuration
updated: 2026-09-15
---

# Aider CLI Reference

## What It Is

Aider is a git-aware AI pair programmer. It edits files directly, creates git commits, and
handles multi-file refactors. Best suited for applying structured edits to a codebase with
full git history tracking.

## Setup Checklist

Follow these steps in order. Complete each before moving to the next.

```bash
# 1. Check prerequisites
python3 --version       # requires Python 3.10+
git --version           # aider requires a git repo

# 2. Install (choose one)
pip install aider-chat
# or isolated: pipx install aider-chat

# 3. Verify install
aider --version

# 4. Set credentials (see Credential Security below)
#    At least one of: env/anthropic (ANTHROPIC_API_KEY) or env/openai (OPENAI_API_KEY)
akm env create anthropic   # then add ANTHROPIC_API_KEY=... to the file yourself

# 5. Confirm the env file lists the key (names only, never values)
akm env list | jq '.envs[] | select(.ref == "env/anthropic") | .keys'

# 6. Ensure you're in a git repo
git rev-parse --git-dir > /dev/null 2>&1 \
  || { echo "ERROR: Not in a git repo. Run: git init" >&2; exit 1; }

# 7. Smoke test
akm env run env/anthropic -- aider --message "list the files in this project" --yes --no-auto-commits
```

## Install

```bash
pip install aider-chat

# Or with pipx (isolated, recommended)
pipx install aider-chat

# Verify
aider --version
```

## Authentication

**Aider does not support OAuth.** API keys via environment variables are the only option.
Inject them from your own env file for the provider you use:

```bash
akm env run env/anthropic -- aider --message "task" --yes   # ANTHROPIC_API_KEY
akm env run env/openai -- aider --message "task" --yes      # OPENAI_API_KEY
akm env run env/gemini -- aider --message "task" --yes      # GEMINI_API_KEY
```

Without akm, aider also auto-loads a `.env` file from the current working directory; keep it
out of git.

## Credential Security

**Never hardcode API keys in scripts, config files, or shell history.**

```bash
# Keep each provider key in its own env file in your primary bundle (once),
# then add the key to the file yourself
akm env create anthropic   # ANTHROPIC_API_KEY
akm env create openai      # OPENAI_API_KEY

# In scripts launched with akm env run: check presence WITHOUT reading/printing the value
if [ -z "${ANTHROPIC_API_KEY}" ] && [ -z "${OPENAI_API_KEY}" ]; then
  echo "ERROR: No AI provider API key set. Run via: akm env run env/anthropic -- <script>" >&2
  exit 1
fi
```

Rules:
- **Never** `echo $ANTHROPIC_API_KEY` or log it
- **Never** commit a project `.env` to git — always add it to `.gitignore`
- **In CI/CD**: inject as env vars via GitHub Secrets, AWS Secrets Manager, or Vault
- **With akm**: `akm env run env/anthropic -- aider ...` loads the key for that one command
- `.aider.conf.yml` must not contain API key values — only model names and non-secret settings

## Headless / Non-Interactive Mode

The key flag for scripting is `--message` combined with `--yes`:

```bash
# Basic headless task (key injected from your env/anthropic)
akm env run env/anthropic -- aider --message "Add JSDoc comments to all exported functions" --yes

# Specify model
aider --model claude-sonnet-4-6 --message "Fix type errors" --yes

# Target specific files
aider src/auth.ts src/session.ts \
  --message "Extract session logic into a dedicated SessionManager class" \
  --yes

# Read-only context (provides context without adding to edit set)
aider --read README.md --read ARCHITECTURE.md \
  --message "Update the architecture doc to match the current codebase" \
  src/ARCHITECTURE.md --yes
```

## Core Flags

| Flag | Short | Description |
|---|---|---|
| `--message` | `-m` | Task to complete (enables non-interactive mode) |
| `--yes` | `-y` | Auto-confirm all prompts |
| `--model` | | Model to use |
| `--opus` | | Shortcut for `claude-opus-4-7` |
| `--sonnet` | | Shortcut for `claude-sonnet-4-6` |
| `--4o` | | Shortcut for `gpt-4o` |
| `--no-auto-commits` | | Don't auto-commit changes |
| `--auto-commits` | | Auto-commit changes (default: on) |
| `--dirty-commits` | | Commit even with a dirty working tree |
| `--read` | | Add file as read-only context |
| `--no-interactive` | | Fully non-interactive; exit on any ambiguity |
| `--lint` | | Run linter after edits |
| `--test` | | Run tests after edits |
| `--test-cmd` | | Custom test command |
| `--lint-cmd` | | Custom lint command |
| `--verbose` | | Show verbose output |
| `--no-stream` | | Disable streaming output |
| `--map-tokens` | | Token budget for repo map (default: 1024) |

## Model Selection

**Do not hardcode model names in scripts.** Pass the model at invocation time:

```bash
aider --model "${AIDER_MODEL}" --message "task" --yes
```

If `--model` is omitted, aider picks a default based on which API key is set.
Use `aider --list-models` to see all models available with your configured keys.

## Model IDs (reference — use via env var at runtime)

```
# Claude (requires ANTHROPIC_API_KEY)     # OpenAI (requires OPENAI_API_KEY)
claude-sonnet-4-6                          gpt-4o
claude-opus-4-7                            o3 / o4-mini
claude-haiku-4-5-20251001

# Gemini (requires GEMINI_API_KEY)        # Ollama (no key — see OLLAMA_API_BASE)
gemini/gemini-2-flash-latest              ollama/<model-name>
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
  | grep -q "qwen2.5-coder" || ollama pull qwen2.5-coder:32b

# Tell aider which Ollama host to use via OLLAMA_API_BASE
OLLAMA_API_BASE="http://${OLLAMA_HOST}:11434" \
aider --model ollama/qwen2.5-coder:32b \
  --message "Add error handling to src/server.ts" \
  --yes --no-auto-commits
```

**Docker host note:** `localhost` inside a container points to the container itself. Use
`172.17.0.1` (default Docker bridge), `host.docker.internal` (Docker Desktop), or the explicit
host IP. The resolver above tries all three and exports the first reachable one.

## Config File

`.aider.conf.yml` in project root — **never include API keys here**:

```yaml
# .aider.conf.yml — safe settings only, no keys
model: claude-sonnet-4-6
auto-commits: true
lint-cmd: bun run lint
test-cmd: bun test
map-tokens: 2048
```

Global config: `~/.aider.conf.yml`

## Git Integration

Aider integrates deeply with git:

```bash
# Default: auto-commit each edit with a descriptive message
aider --message "Add error handling" --yes

# Disable auto-commit (make changes without committing)
aider --no-auto-commits --message "Draft refactor" --yes

# Commit even if working tree is dirty
aider --dirty-commits --message "Quick fix" --yes

# Aider adds .aider* to .gitignore automatically
```

Commit messages are generated by the model and follow conventional commit format.

## Repo Map

Aider builds a "repo map" — a summary of your codebase structure — to give the model context
about files it isn't directly editing.

```bash
# Increase map token budget for large repos
aider --map-tokens 4096 --message "Refactor the auth subsystem" --yes

# Disable repo map (faster, less context)
aider --map-tokens 0 --message "Fix this one function" src/utils.ts --yes
```

## Lint & Test Loop

```bash
# Run linter after every edit
aider --lint --lint-cmd "bun run lint" \
  --message "Fix all lint errors" --yes

# Run tests after every edit and auto-fix failures
aider --test --test-cmd "bun test" \
  --message "Make all tests pass" --yes
```

## Scripting Patterns

```bash
# Run this script via `akm env run env/anthropic -- bash <script>` — never inline key values
if [ -z "${ANTHROPIC_API_KEY}" ] && [ -z "${OPENAI_API_KEY}" ]; then
  echo "ERROR: No API key set" >&2; exit 1
fi

# Apply task and capture output
aider --message "List all broken imports (don't edit)" \
  --no-auto-commits --yes 2>&1 | grep -E "^(ERROR|ImportError)"

# Process multiple files
for f in src/routes/*.ts; do
  aider "$f" --message "Add input validation" --yes --no-auto-commits
done
git add -p   # review before committing
```

## Troubleshooting

**`Can't initialize git repo`**
→ Run from inside a git repo: `git rev-parse --git-dir` to check; `git init` to create one

**`Model not found`**
→ Check the provider's env file lists the key (not its value): `akm env list | jq '.envs[] | select(.ref == "env/anthropic") | .keys'`
→ Use `aider --list-models` to see available models

**Auto-commits breaking CI**
→ Pass `--no-auto-commits` and commit manually after review

**Context window exceeded**
→ Reduce `--map-tokens`; target specific files instead of the whole repo
→ Use a model with larger context: `claude-sonnet-4-6` (200k), `gpt-4o` (128k)

**Aider edits wrong files**
→ Explicitly pass target files on the command line
→ Use `--read` for context-only files that shouldn't be edited

**`aider: command not found`**
→ `pip install aider-chat`; check `pip show aider-chat` and that pip's bin dir is in `$PATH`
→ With pipx: `pipx ensurepath && pipx install aider-chat`
