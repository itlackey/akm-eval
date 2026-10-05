---
name: llm-delegation-tool
description: Delegate a single LLM request to any OpenAI-compatible endpoint
  (OpenAI, Anthropic-compat proxies, LMStudio, Ollama, custom labs) using named
  configs. One zero-dependency Node.js script, no SDKs. Supports text, vision
  (multi-image), and embeddings.
updated: 2026-05-23
when_to_use: When you need a one-shot LLM call (text / vision / embeddings)
  without spawning a full agent loop, specifically triggered by
  `@delegate:<name>` syntax or natural language routing requests.
tags:
  - llm
  - delegation
  - openai
  - embeddings
  - vision
  - routing
  - lmstudio
  - ollama
config_path: .claude/openai-config.json
---

# LLM Delegation Tool

A thin routing layer over any **OpenAI-compatible HTTP endpoint** (`/v1/chat/completions`, `/v1/embeddings`, `/v1/moderations`). This skill allows you to define named configurations (e.g., "coder", "vlm") that map specific models and endpoints, enabling one-shot calls without spawning a full agent loop.

No SDKs. No streaming. Just one HTTP POST and the response text.

## 💡 When to use this skill vs. others

This tool is designed for simple, single-request LLM tasks where you need fine-grained control over model selection or endpoint routing. For complex workflows involving multi-turn conversations, file editing, or chained tools, use `skills/ai-skills/agent-cli-tools`.

| Task | Use this skill (Delegation) | Use `skills/ai-skills/agent-cli-tools` |
| :--- | :--- | :--- |
| One-shot text generation | ✅ | overkill |
| Vision: "describe this PNG" | ✅ | overkill |
| Embeddings for semantic search | ✅ | not supported |
| Content moderation | ✅ | not supported |
| Full agent loop (multi-turn, tool use, edits) | ❌ | ✅ |
| Routing the same prompt between local + cloud | ✅ | ✅ |

## What this skill does: Core Functionality

The script makes one-shot calls to specific API paths (`/v1/...`). You define named configs that specify which model and endpoint to use, allowing you to route requests dynamically.

**Usage:**
```bash
node scripts/delegate.mjs <config_name> "<prompt>" [--context-file <file>]
```

## Quick start

Follow these steps to run a delegation call:

1. **Set API Key:** Set the required environment variable (e.g., `OPENAI_API_KEY`), or keep it in an env file in your stash and run through `akm env run` (see [Endpoint URLs and keys from akm env files](#endpoint-urls-and-keys-from-akm-env-files)).
```bash
export OPENAI_API_KEY="sk-..."
```
2. **Configure:** Ensure `.claude/openai-config.json` exists in your project root.
3. **Run a delegation:**
```bash
# Standard text call using the 'coder' config
node scripts/delegate.mjs coder "Write a function to sort an array"

# Vision call (image detected by extension) using the 'vlm' config
node scripts/delegate.mjs vlm "Describe this" --context-file screenshot.png

# Text context file loaded as system message
node scripts/delegate.mjs analyst "Summarize" --context-file notes.md

# From another working directory
node scripts/delegate.mjs coder "explain" --project-dir /path/to/project

# Get raw JSON for piping
node scripts/delegate.mjs coder "list 3 colors" --json
```

## ⚙️ Configuration Details (`.claude/openai-config.json`)

The script reads `<project-dir>/.claude/openai-config.json`. This file defines named configurations and available endpoints.

### Schema Overview

*   **`api_key_env`**: The environment variable name holding the API key (e.g., `OPENAI_API_KEY`).
*   **`configs`**: Named shortcuts (`coder`, `vlm`) that define a specific model and optional parameters.
*   **`endpoints`**: Definitions of reachable services (e.g., `openai`, `local`), specifying the base URL and API path for different tasks (chat, embeddings).
*   **`base_url_env`** (per endpoint, optional): The environment variable name holding that endpoint's base URL (e.g., `LOCAL_LLM_BASE_URL`). When the variable is set, it is used instead of `base_url`.

### Example Configuration
```json
{
  "api_key_env": "OPENAI_API_KEY",
  "configs": {
    "coder":   { "endpoint": "openai", "model": "gpt-4o-mini", "params": { "temperature": 0.7 } },
    "analyst": { "endpoint": "openai", "model": "gpt-4o",      "params": { "temperature": 0.3 } },
    "vlm":     { "endpoint": "local",  "model": "qwen2-vl" }
  },
  "endpoints": {
    "openai": {
      "path": "/v1/chat/completions",
      "base_url": "https://api.openai.com",
      "available_models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
    },
    "local": {
      "path": "/v1/chat/completions",
      "base_url": "http://localhost:1234",
      "available_models": ["qwen2-vl", "llama3.2"]
    },
    "embeddings": {
      "path": "/v1/embeddings",
      "base_url": "https://api.openai.com",
      "available_models": ["text-embedding-3-small", "text-embedding-3-large"]
    },
    "moderation": {
      "path": "/v1/moderations",
      "base_url": "https://api.openai.com",
      "available_models": ["omni-moderation-latest"]
    }
  }
}
```

### Model and Endpoint Resolution Order

The script determines the target configuration using this priority:

1. **`@delegate:<config>` inline syntax** — Highest priority. Inspects the user/system message (e.g., `@delegate:coder some prompt`).
2. **Frontmatter** — `openai_delegation: <config>` in an agent/command's YAML header.
3. **Natural-language** — Explicit phrases like "use the coder model" or "ask gpt-4o to…".

### Model-based Routing Logic

If a config sets `model` but not `endpoint`, the script searches through all defined `endpoints.*.available_models` and picks the first match. It is strongly recommended that you explicitly set `endpoint` in your configuration if multiple endpoints expose the same model.

### Endpoint URLs and keys from akm env files

Keep machine-specific URLs and keys out of the config: name the variables in the config (`base_url_env`, `api_key_env`), put their values in an env file in your own stash, and inject them with `akm env run`.

`default-config.json` does this for its `lmstudio` endpoint: it reads `LOCAL_LLM_BASE_URL` and falls back to `http://localhost:1234` (LM Studio's default port).

| Env ref | Variable | When to set it |
| :--- | :--- | :--- |
| `env/local-llm` | `LOCAL_LLM_BASE_URL` | Your local OpenAI-compatible server is not at the endpoint's `base_url` |
| `env/local-llm` | `LOCAL_LLM_API_KEY` | Your local server needs a key; also add `"api_key_env": "LOCAL_LLM_API_KEY"` to that endpoint |
| `env/openai` | `OPENAI_API_KEY` | You call OpenAI; the root `api_key_env` reads it for every endpoint without its own `api_key_env` |

```bash
akm env run env/local-llm -- node scripts/delegate.mjs coder "Write a function to sort an array"
akm env run env/openai -- node scripts/delegate.mjs analyst "Summarize" --context-file notes.md
```

Base URL order for each endpoint: the `--base-url` flag (`update-models.mjs` only), then the `base_url_env` variable, then `base_url`, then `https://api.openai.com`. An empty variable counts as unset.

## 🖼️ Image Input (Vision)

The script automatically detects images passed via `--context-file` based on file extensions (`.png .jpg .jpeg .gif .bmp .webp .tiff .tif`). It then base64-encodes and sends them as OpenAI vision-format `image_url` content.

**Usage Examples:**
```bash
node scripts/delegate.mjs vlm "Describe this image" --context-file logo.png
node scripts/delegate.mjs analyst "Read this layout" --context-file mockup.jpg
```

### Vision Model Considerations

*   **`gpt-4o` (Recommended):** Offers good performance for vision tasks.
*   **`gpt-4o-mini`:** Cheaper per token, but the image tile accounting often negates savings; avoid for complex vision.
*   **Local Vision Models (`qwen2-vl`, etc.):** Cheapest if your local endpoint is reachable. Ensure the model variant includes `-vl` or similar to confirm multimodal capability (text/vision variants will silently ignore images).

### Sizing and Mixing Rules

*   **Sizing:** Images are downscaled to $≤$1024px on the long edge before transmission, as vision tile counts scale with pixel dimensions.
*   **Multi-Image Support:** Pass `--context-file` multiple times. The script emits a warning if any image exceeds the default `--max-image-bytes` (5MB).
*   **Mixed Input:** You can combine text and images in one call. Text files are concatenated into one `system` message; images are included in the user message's multipart content.

## 📊 Embeddings & Moderation

The same script handles specialized tasks by routing to different endpoint paths:

**Embeddings:**
```json
"endpoints": {
  "embeddings": {
    "path": "/v1/embeddings",
    "base_url": "https://api.openai.com",
    "available_models": ["text-embedding-3-small", "text-embedding-3-large"]
  }
}
```
**Usage:**
```bash
node scripts/delegate.mjs semantic_search "user query string" --json
```

**Moderation:**
```json
"endpoints": {
  "moderation": {
    "path": "/v1/moderations",
    "base_url": "https://api.openai.com",
    "available_models": ["omni-moderation-latest"]
  }
}
```
**Usage:**
```bash
node scripts/delegate.mjs content_check "text to check"      --json
```

## 📣 Communication and Error Handling

### Workflow Pattern (User Experience)
When delegating, the script provides clear feedback:

**Before Call:** Announce *what* and *where* before execution so the user can interrupt.
```
🔄 Delegating to gpt-4o
   Config: analyst
   Endpoint: openai (https://api.openai.com)
```
**After Call:** Surface tokens used for cost visibility.
```
✅ Tokens used: 481 (prompt: 440, completion: 41)
```

### Common Failures and Fixes
| Failure | What to tell the user |
| :--- | :--- |
| Config not found | List available config names from `configs.*` |
| Model not in any endpoint | Suggest `node scripts/update-models.mjs` |
| `fetch failed` / DNS | Show the `base_url` and ask if VPN / local server is up |
| 401 / 403 | Name the expected env var (`api_key_env`) and how to set it |
| 400 from vision call | Image likely too large or model isn't multimodal |
| Empty response | Check `params.max_tokens` — small values truncate output |

The script raises `DelegationError` with the URL and body on HTTP failures — surface those verbatim.

## ⚠️ Known Limitations

While this Node port addresses many previous gaps, certain limitations remain:

1. **No streaming.** The script blocks until the full response is received. Not suitable for very long generations requiring progressive output.
2. **No retry / no rate-limit handling.** A 429 surfaces as an error; the caller must handle retries.
3. **gpt-4o-mini vision token blow-up.** This is not a bug: image tile tokens for `-mini` variants are significantly higher than full `gpt-4o`. Always prefer `gpt-4o` for robust vision tasks.
4. **Vision quality dependency.** If the model isn't multimodal, the image is silently ignored or returns a hallucinated description. Verify the model is a `-vl` / vision variant.

## 🔒 Security Guidelines

*   API keys MUST be sourced from environment variables (`api_key_env`) — never inline in `openai-config.json`.
*   `.claude/openai-config.json` should be `.gitignore`d if endpoint URLs or model lists are sensitive.
*   The script does **not** log full prompts to stdout/stderr, but the `--json` flag dumps the full response which may include reflected prompt content. Exercise caution when piping `--json` into logs.

## 📚 Reference Files and Next Steps

For deeper dives, consult these resources:

*   `references/quickstart.md` — Concrete walk-through with a fresh project.
*   `references/configuration-examples.md` — Full config schemas (OpenAI / LMStudio / Ollama / custom labs).
*   `references/implementation-guide.md` — Detailed routing rules and priority decisions.
*   `references/troubleshooting.md` — Common failures and fixes.
*   `references/MODEL-ROUTING-GUIDE.md` — Deep dive on model $↔$ endpoint mapping.
*   `scripts/README.md` — CLI flags and usage details.

**See also:**
*   `skills/ai-skills/agent-cli-tools` — Use this for full agent loops (multi-turn, tool use, file edits). This skill is lighter for raw single-call LLM access.
*   `skills/ai-skills/litellm-skill` — An alternative routing layer if you prefer the LiteLLM proxy.
