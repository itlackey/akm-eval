---
description: One-shot LLM request tool — delegate text, vision, and embeddings
  calls to any OpenAI-compatible endpoint (OpenAI, LMStudio, Ollama, custom
  labs) via named configs. Lighter than a full agent CLI.
when_to_use: Use for single-turn LLM calls (text/vision/embeddings/moderation)
  when a full multi-turn agent loop is overkill; invoke via inline
  `@delegate:name` syntax or direct CLI execution.
updated: 2026-05-23
---

# LLM Delegation Tool

One-shot LLM requests against any OpenAI-compatible endpoint (OpenAI, LMStudio, Ollama, Anthropic-compat proxies, custom labs). One zero-dependency Node.js script (`scripts/delegate.mjs`), one HTTP POST, no SDKs. Requires Node 18+ (Bun works too).

For full agent loops (Claude Code, Codex, Gemini CLI, OpenCode, Copilot, etc.) use [`skills/ai-skills/agent-cli-tools`](../../../../skills/ai-skills/agent-cli-tools/SKILL.md) instead.

## Quick Start

1. **Create configuration** in your project:

```bash
mkdir -p .claude
cat > .claude/openai-config.json << 'EOF'
{
  "api_key_env": "OPENAI_API_KEY",

  "configs": {
    "coder": {
      "endpoint": "local",
      "model": "qwen/qwen3-coder-30b"
    }
  },

  "endpoints": {
    "local": {
      "path": "/v1/chat/completions",
      "base_url": "http://localhost:1234",
      "available_models": ["qwen/qwen3-coder-30b"]
    }
  }
}
EOF
```

2. **Use in prompts**:

```
@delegate:coder Write a function to sort an array
```

3. **Claude will execute**:

```bash
node scripts/delegate.mjs coder "Write a function to sort an array"
```

## Usage Patterns

### Inline Delegation
```
@delegate:config_name Your prompt here
```

### Command Line
```bash
# Basic text call
node scripts/delegate.mjs coder "Your prompt"

# Vision — image is auto-detected by extension (.png/.jpg/.jpeg/.gif/.webp/.bmp/.tiff)
node scripts/delegate.mjs vlm "Describe this image" --context-file screenshot.png

# Text context file (loaded as system message)
node scripts/delegate.mjs analyst "Summarize" --context-file notes.md

# JSON output for piping
node scripts/delegate.mjs coder "list 3 colors" --json

# From a different working directory
node scripts/delegate.mjs coder "explain" --project-dir /path/to/project
```

### Vision tips
- Prefer `gpt-4o` over `gpt-4o-mini` for images — mini's tile token accounting is ~30× costlier on the same image.
- Downscale to ≤1024px long edge before sending.
- Multiple images per call: pass `--context-file` more than once. You can also mix text + images in a single call.

## Configuration

Place `.claude/openai-config.json` in your project root with:

- **configs**: Named model configurations (coder, vlm, embeddings, etc.)
- **endpoints**: API endpoint definitions (local, openai, ollama, etc.)
- **api_key_env**: Environment variable for API key (optional)
- **base_url_env**: Per-endpoint environment variable for the base URL, used instead of `base_url` when set (optional). See SKILL.md for the `env/local-llm` and `env/openai` env files.

See [references/configuration-examples.md](../../../../skills/ai-skills/llm-delegation-tool/references/configuration-examples.md) for complete examples.

## Supported Services

- **OpenAI API** - GPT-4, GPT-3.5, embeddings, etc.
- **LMStudio** - Local models via OpenAI-compatible API
- **Ollama** - Local models via OpenAI-compatible API
- **Any OpenAI-compatible endpoint**

## Documentation

- **[SKILL.md](../../../../skills/ai-skills/llm-delegation-tool/SKILL.md)** - Complete skill documentation
- **[references/QUICKSTART.md](../../../../skills/ai-skills/llm-delegation-tool/references/QUICKSTART.md)** - 5-minute setup guide
- **[references/configuration-examples.md](../../../../skills/ai-skills/llm-delegation-tool/references/configuration-examples.md)** - Config examples
- **[references/MODEL-ROUTING-GUIDE.md](../../../../skills/ai-skills/llm-delegation-tool/references/MODEL-ROUTING-GUIDE.md)** - Model routing details
- **[references/implementation-guide.md](../../../../skills/ai-skills/llm-delegation-tool/references/implementation-guide.md)** - Implementation details
- **[references/troubleshooting.md](../../../../skills/ai-skills/llm-delegation-tool/references/troubleshooting.md)** - Troubleshooting

## Scripts

- **[scripts/delegate.mjs](../../../../skills/ai-skills/llm-delegation-tool/scripts/delegate.mjs)** - Main delegation script (Node.js, zero deps)
- **[scripts/update-models.mjs](../../../../skills/ai-skills/llm-delegation-tool/scripts/update-models.mjs)** - Refresh `available_models` from each endpoint's `/v1/models`

## License
MPL-2.0
