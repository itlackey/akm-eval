---
description: Configuration documentation and JSON examples for integrating
  OpenAI API endpoints into agent workflows, including semantic search
  embeddings, content moderation checks, and multi-model routing strategies via
  delegation headers.
when_to_use: Use when setting up agent systems that require external model calls
  for specific tasks like similarity search or safety filtering, or when
  defining conditional logic for switching between different OpenAI models based
  on task requirements within a workflow.
updated: 2026-05-15
---
# Configuration Examples

Detailed configuration examples for various use cases.

## Semantic Search Project

**.claude/openai-config.json:**
```json
{
  "api_key_env": "OPENAI_API_KEY",
  "default_config": "semantic_search",

  "configs": {
    "semantic_search": {
      "model": "text-embedding-3-small",
      "params": { "dimensions": 512 },
      "context_strategy": "relevant"
    },
    "deep_search": {
      "model": "text-embedding-3-large",
      "params": { "dimensions": 3072 },
      "context_strategy": "full"
    }
  },

  "endpoints": {
    "embeddings": {
      "path": "/v1/embeddings",
      "base_url": "https://api.openai.com",
      "default_model": "text-embedding-3-small",
      "required_params": ["input"],
      "optional_params": ["model", "dimensions"],
      "available_models": [
        "text-embedding-3-small",
        "text-embedding-3-large",
        "text-embedding-ada-002"
      ]
    }
  }
}
```

**agents/search.md:**
```markdown
---
openai_delegation: semantic_search
---

# Search Agent
Find content by semantic similarity...
```

## Content Moderation

**.claude/openai-config.json:**
```json
{
  "configs": {
    "content_check": {
      "model": "omni-moderation-latest",
      "auto_invoke": true
    }
  },

  "endpoints": {
    "moderation": {
      "path": "/v1/moderations",
      "base_url": "https://api.openai.com",
      "default_model": "omni-moderation-latest",
      "required_params": ["input"],
      "available_models": [
        "omni-moderation-latest",
        "omni-moderation-2024-09-26",
        "text-moderation-latest",
        "text-moderation-stable"
      ]
    }
  }
}
```

**commands/moderate.md:**
```markdown
---
openai_delegation: content_check
---

# Moderate Command
Check content for policy violations...
```

## Multi-Endpoint Agent

**agents/community-manager.md:**
```markdown
---
openai_delegation:
  - name: search
    model: text-embedding-3-small
    when: "searching for similar content"
  - name: moderate
    model: omni-moderation-latest
    when: "checking user submissions"
---

# Community Manager
I help manage community content...
```

## Custom Endpoints

Add custom OpenAI-compatible endpoints:

```json
{
  "endpoints": {
    "custom_embed": {
      "path": "/v1/embeddings",
      "base_url": "https://custom-api.example.com",
      "default_model": "custom-model",
      "api_key_env": "CUSTOM_API_KEY",
      "required_params": ["input"],
      "available_models": ["custom-model-v1", "custom-model-v2"]
    }
  }
}
```

## Conditional Delegation

```yaml
---
openai_delegation:
  model: text-embedding-3-small
  when: "user asks for semantic search or similarity"
  fallback: "use local search if delegation fails"
---
```

## Result Caching

```json
{
  "configs": {
    "cached_search": {
      "model": "text-embedding-3-small",
      "cache_results": true,
      "cache_ttl": 3600
    }
  }
}
```
