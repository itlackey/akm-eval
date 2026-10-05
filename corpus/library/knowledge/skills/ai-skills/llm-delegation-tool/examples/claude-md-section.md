---
description: Configuration and usage guide for integrating OpenAI API Delegation
  skills into agent workflows. Covers setup instructions, model selection
  (embeddings, moderation, chat), usage patterns in front matter and commands,
  plus session budget monitoring.
when_to_use: Use when configuring agent workflows that require external LLM
  capabilities via OpenAI API, specifically for semantic search tasks, content
  safety checks, or specialized completions. Refer to this guide during initial
  setup of delegation skills and when managing token budget constraints across
  sessions.
updated: 2026-05-15
---

# OpenAI API Delegation Integration

This guide details the integration of OpenAI API capabilities (embeddings, moderation, chat) into agent workflows via the LLM Delegation Tool. It covers setup, configuration management, usage patterns in front matter and commands, and session budget monitoring.

## When to Use

Use this asset when:
- Configuring agent workflows that require external LLM capabilities via OpenAI API.
- Implementing semantic search tasks, content safety checks, or specialized completions.
- Managing token budget constraints across sessions.
- Setting up delegation skills for the first time.

## Configuration Overview

### Prerequisites

- **Config file**: `.claude/openai-config.json`
- **API Key**: Set `OPENAI_API_KEY` environment variable.
- **Documentation**: See `skills/ai-skills/llm-delegation-tool/SKILL.md` for deep dives.

### Available Delegation Configs

| Config | Endpoint | Model | Purpose |
|--------|----------|-------|---------|
| `semantic_search` | embeddings | text-embedding-3-small | Quick semantic searches (512d) |
| `deep_search` | embeddings | text-embedding-3-large | Comprehensive analysis (3072d) |
| `content_check` | moderation | omni-moderation-latest | Content policy violations |
| `chat_assist` | chat | gpt-4o | Specialized completions |

## Setup Instructions

1. **Install the skill** (if not already installed):
   ```bash
   # Copy to skills directory
   cp -r path/to/llm-delegation-tool ~/.claude/skills/
   ```

2. **Set your API key**:
   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

3. **Verify configuration**:
   ```bash
   cat .claude/openai-config.json
   ```

## Usage Examples

### In Agent Front Matter

```yaml
---
openai_delegation: semantic_search
---
```

### In User Prompts

```bash
# Natural language
"use semantic_search to find similar mechanics"

# Explicit syntax
"@delegate:deep_search comprehensive analysis"
```

### With Commands

```bash
claude-code --agent=search "find stealth mechanics"
claude-code moderate "check this content"
```

## Agents Using Delegation

- **`semantic-search`** - Uses `semantic_search` for finding similar content.
- **`lore-indexer`** - Uses `deep_search` for comprehensive lore analysis.
- **`content-moderator`** - Uses `content_check` for reviewing submissions.

## Cost Management

Current session budget:
- Max per request: 10,000 tokens
- Max per session: 100,000 tokens
- Warning threshold: 75,000 tokens

Monitor costs with:
```bash
# Check token usage in logs
claude-code --verbose
```

## Customization

To add new delegation configs:

1. **Edit `.claude/openai-config.json`**:
   ```json
   {
     "configs": {
       "my_config": {
         "endpoint": "embeddings",
         "model": "text-embedding-3-small",
         "params": {
           "dimensions": 512
         }
       }
     }
   }
   ```

2. **Use in agent**:
   ```yaml
   ---
   openai_delegation: my_config
   ---
   ```

3. **Document in this section** (above)

## Troubleshooting

**Delegation not working?**
- Verify `.claude/openai-config.json` exists.
- Check `OPENAI_API_KEY` is set.
- Validate JSON syntax.
- Review agent front matter.

**High costs?**
- Review `context_strategy` settings.
- Use smaller models for quick tasks.
- Set stricter `max_tokens` limits.
- Monitor session usage.

**API errors?**
- 401: Check API key validity.
- 429: Rate limit - wait or upgrade.
- 400: Verify config parameters.

For detailed documentation, see: `skills/ai-skills/llm-delegation-tool/SKILL.md`

---
[Continue with your project's other sections...]
