---
description: Guide for configuring and utilizing OpenAI Delegation skills for
  semantic search, content moderation, and specialized generation within agent
  commands.
when_to_use: When setting up agents requiring external AI capabilities like
  embeddings, safety checks, or lore generation via frontmatter or prompt
  delegation syntax.
updated: 2026-05-15
---
# Example: How to Document OpenAI Delegation in claude.md

This is an example section to add to your project's `.claude/claude.md` file.

---

## OpenAI API Delegation

This project uses the OpenAI Delegation skill to enable semantic search, content moderation, and specialized content generation.

### Configuration

- **Config file**: `.claude/openai-config.json`
- **API Key**: Set `OPENAI_API_KEY` environment variable
- **Documentation**: See skill documentation for full reference

### Available Delegation Configs

#### For Search
- **`semantic_search`** - Quick semantic search with 512-dimension embeddings
- **`deep_search`** - Comprehensive analysis with 3072-dimension embeddings
- **`quick_embed`** - Fast, minimal-context embeddings (256 dimensions)

#### For Content Safety
- **`content_check`** - Auto-moderate user submissions for policy violations

#### For Content Generation
- **`lore_generation`** - Generate atmospheric TTRPG lore with specialized prompting
- **`mechanics_assistant`** - Help with game mechanics design and balance

### Using Delegation

#### In Agent/Command Front Matter

Add to the front matter of your agent or command:

```yaml
---
openai_delegation: semantic_search
---
```

Or define inline:

```yaml
---
openai_delegation:
  endpoint: embeddings
  model: text-embedding-3-small
  params:
    dimensions: 512
---
```

#### In Your Prompts

**Natural language:**
```
use semantic_search to find similar mechanics
search with embeddings for shadow creatures
check this content with moderation
```

**Explicit delegation:**
```
@delegate:semantic_search find content about stealth
@delegate:deep_search comprehensive lore analysis
@delegate:lore_generation create a new faction
```

### Active Agents Using Delegation

- **`lore-writer`** - Uses `lore_generation` for atmospheric content
- **`semantic-search`** - Uses `semantic_search` for finding similar content
- **`content-moderator`** - Uses `content_check` for safety checks

### Cost Management

Current budget limits:
- Max tokens per request: 10,000
- Max tokens per session: 150,000
- Warning threshold: 100,000 tokens

Estimated costs:
- Embeddings (small): ~$0.00002 per 1K tokens
- Embeddings (large): ~$0.00013 per 1K tokens
- Moderation: Free
- Chat (gpt-4o): ~$0.0025 input / $0.01 output per 1K tokens

### Examples

**Find similar lore:**
```
use semantic_search to find lore similar to "the old market district"
```

**Generate new content:**
```
use lore_generation to create a new underground faction focused on artifact trading
```

**Check community submissions:**
```
check this user submission with content moderation: [content here]
```

**Deep analysis:**
```
@delegate:deep_search analyze all references to shadow magic across the entire lore
```

### Troubleshooting

**Delegation not working?**
- Verify `OPENAI_API_KEY` is set
- Check `.claude/openai-config.json` exists and is valid JSON
- Confirm config name exists in the configs section

**High costs?**
- Use `semantic_search` instead of `deep_search` for quick queries
- Use `quick_embed` for simple similarity checks
- Review `context_strategy` settings in config

**Need help?**
- See skill SKILL.md for complete documentation
- Check examples/ directory for reference configs
- Review error messages for specific issues
