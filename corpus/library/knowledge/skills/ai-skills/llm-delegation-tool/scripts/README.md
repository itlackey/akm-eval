---
description: Node.js scripts (no dependencies) for delegating one-shot LLM
  requests and refreshing endpoint model lists.
when_to_use: Use delegate.mjs for single LLM calls (text / vision / embeddings /
  moderation) or update-models.mjs to refresh available_models lists in
  openai-config.json from each endpoint's /v1/models.
updated: 2026-05-23
---

# LLM Delegation Scripts

Two zero-dependency Node.js scripts that power the skill. Requires Node 18+ (uses built-in `fetch`); Node 20+ recommended. Also works with Bun.

## delegate.mjs — one-shot LLM request

```bash
node scripts/delegate.mjs <config_name> "<prompt>" [options]
```

### Options

| Flag                       | Description |
|----------------------------|-------------|
| `--context-file <path>`    | File to attach. Image → vision message; otherwise → system message. Repeatable. |
| `--project-dir <dir>`      | Project root that contains `.claude/openai-config.json` (default: cwd). |
| `--json`                   | Emit raw JSON response instead of human-formatted output. |
| `--max-image-bytes <n>`    | Warn when an attached image exceeds this size (default: 5,000,000). |

The request goes to the endpoint's `base_url_env` variable when that is set, otherwise its `base_url`, otherwise `https://api.openai.com`. To load the variable from your stash: `akm env run env/local-llm -- node scripts/delegate.mjs ...`.

### Examples

```bash
# Text generation
node scripts/delegate.mjs coder "Write a function to sort an array"

# Vision (image auto-detected by extension AND magic-byte sniffing)
node scripts/delegate.mjs vlm "Describe this" --context-file screenshot.png

# Multiple images in one call
node scripts/delegate.mjs analyst "Compare these two screenshots" \
  --context-file before.png --context-file after.png

# Text context file as system message
node scripts/delegate.mjs analyst "Summarize" --context-file notes.md

# Mixed: text context + image
node scripts/delegate.mjs analyst "Use this style guide and review the mockup" \
  --context-file style-guide.md --context-file mockup.png

# Raw JSON for piping
node scripts/delegate.mjs coder "list 3 colors" --json | jq '.choices[0].message.content'

# Different working directory
node scripts/delegate.mjs coder "explain" --project-dir /path/to/project
```

### What the port fixes vs. the legacy Python version

- **Per-endpoint `api_key` and `api_key_env` are honored.** Falls back to root `api_key_env`.
- **`skip_ssl_verify: true` on an endpoint** is honored (via Undici Agent — scoped to that call, not process-wide).
- **MIME sniffing fallback** by magic bytes when extension is missing or wrong.
- **Multiple images per call** — `--context-file` is repeatable.
- **Image size warning** when an attached image exceeds `--max-image-bytes`.
- **Zero deps** — uses built-in `node:fs/promises`, `fetch`, `undici`.

---

## update-models.mjs — refresh endpoint model lists

```bash
node scripts/update-models.mjs [options]
```

Queries `/v1/models` on each endpoint and rewrites the `available_models` arrays in `openai-config.json`.

### Options

| Flag                  | Description |
|-----------------------|-------------|
| `--config <path>`     | Path to `openai-config.json` (default: `.claude/openai-config.json`). |
| `--endpoint <id>`     | Only refresh this endpoint (default: all). |
| `--dry-run`           | Show changes without writing. |
| `--api-key <key>`     | Override the resolved API key. |
| `--base-url <url>`    | Override the endpoint's `base_url_env` and `base_url` for this run. |

### How it works

1. For each endpoint, fetch `<base URL>/v1/models` (`--base-url`, else the `base_url_env` variable, else `base_url`) with the endpoint's resolved key.
2. Filter the returned model IDs by the endpoint's path:
   - `/v1/embeddings` → only models matching `embedding` / `embed`
   - `/v1/moderations` → only `moderation` models
   - `/v1/chat/completions` → models matching gpt / o1 / o3 / o4 / claude / gemini / qwen / llama / mistral / phi / deepseek
3. Diff against the current `available_models`, print added/removed, and (unless `--dry-run`) write the file.

### Examples

```bash
# Dry-run, all endpoints
node scripts/update-models.mjs --dry-run

# Just refresh the OpenAI chat endpoint
node scripts/update-models.mjs --endpoint chat

# Custom config path
node scripts/update-models.mjs --config /path/to/openai-config.json
```

### Scheduling

```bash
# cron: weekly on Sunday at 02:00
0 2 * * 0 cd /path/to/project && node scripts/update-models.mjs >> <log-file> 2>&1
```

---

## Troubleshooting

| Symptom                                    | Fix |
|--------------------------------------------|-----|
| `Configuration file not found`             | Create `.claude/openai-config.json` (see `default-openai-config.json`). |
| `Config '<name>' not found`                | List of available configs is printed in the error. |
| `Model '<id>' not in any endpoint`         | Run `update-models.mjs` or add the model to an endpoint's `available_models`. |
| `Failed to fetch ... 401`                  | Wrong API key. Check `api_key_env` resolves to a value. |
| `Failed to fetch ... fetch failed`         | DNS / connectivity. If endpoint is a lab on a self-signed cert, set `skip_ssl_verify: true` on that endpoint. |
| Vision call returns text-only description with no real understanding | Selected model isn't multimodal. Use a `-vl` / `gpt-4o` / `claude-3.5+` variant. |
| Huge prompt token count on an image        | Image too large. Downscale to ≤1024px long edge. |
| `MODULE_NOT_FOUND: undici` (very rare)     | Node version too old. Upgrade to Node 20+ (Bun also works). |
