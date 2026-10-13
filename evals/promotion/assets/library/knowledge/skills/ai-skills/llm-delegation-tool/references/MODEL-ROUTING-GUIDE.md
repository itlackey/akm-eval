---
description: Explains how to configure model-based endpoint routing in the
  OpenAI delegation skill, allowing automatic detection of the correct API path
  based on specified model names.
when_to_use: When configuring OpenAI delegation skills where you want simplified
  setup that automatically routes requests based on available models rather than
  explicitly defining endpoint paths.
updated: 2026-05-15
---
# Model-Based Endpoint Routing Guide

This guide explains how to use the model-based endpoint routing feature in the OpenAI delegation skill.

## Overview

The skill can automatically detect which endpoint to use based on the model name you specify. This simplifies configuration and makes agents more maintainable.

## Key Concepts

### Before: Explicit Endpoint Specification

Previously, you had to specify both the endpoint and model:

```yaml
---
openai_delegation:
  endpoint: chat
  model: gpt-4o-mini
  params:
    temperature: 0.7
---
```

### Now: Auto-Detection from Model

You can now specify just the model:

```yaml
---
openai_delegation:
  model: gpt-4o-mini
  params:
    temperature: 0.7
---
```

The skill will:
1. Look up `gpt-4o-mini` in all endpoints' `available_models` arrays
2. Find it in the `chat` endpoint
3. Automatically route to `/v1/chat/completions`

## How It Works

### Configuration Structure

Each endpoint now includes an `available_models` array:

```json
{
  "endpoints": {
    "chat": {
      "path": "/v1/chat/completions",
      "available_models": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "o1-preview"
      ]
    },
    "embeddings": {
      "path": "/v1/embeddings",
      "available_models": [
        "text-embedding-3-small",
        "text-embedding-3-large"
      ]
    }
  }
}
```

### Routing Logic

When Claude Code encounters a delegation config:

```javascript
// Agent specifies only model
const config = {
  model: "text-embedding-3-large",
  params: { dimensions: 1024 }
};

// Skill searches for the model
for (const [endpointId, endpointConfig] of endpoints) {
  if (endpointConfig.available_models.includes("text-embedding-3-large")) {
    // Found! Use this endpoint
    config.endpoint = endpointId; // "embeddings"
    break;
  }
}
```

## Usage Examples

### Example 1: Chat Completion with Auto-Routing

**Agent front matter:**
```yaml
---
openai_delegation:
  model: gpt-4o-mini
  params:
    temperature: 0.8
    max_tokens: 1500
  system_prompt: "You are a creative writing assistant"
---
```

**What happens:**
- Skill finds `gpt-4o-mini` in `chat` endpoint's `available_models`
- Routes to `/v1/chat/completions`
- Applies the params and system_prompt

### Example 2: Embeddings with Auto-Routing

**Agent front matter:**
```yaml
---
openai_delegation:
  model: text-embedding-3-small
  params:
    dimensions: 512
  context_strategy: minimal
---
```

**What happens:**
- Skill finds `text-embedding-3-small` in `embeddings` endpoint
- Routes to `/v1/embeddings`
- Uses 512 dimensions for the embedding

### Example 3: Named Config with Model-Only

**Config file (`.claude/openai-config.json`):**
```json
{
  "configs": {
    "fast_search": {
      "model": "text-embedding-3-small",
      "params": { "dimensions": 256 }
    }
  }
}
```

**Agent front matter:**
```yaml
---
openai_delegation: fast_search
---
```

**What happens:**
- Loads `fast_search` config
- Finds model `text-embedding-3-small`
- Auto-routes to `embeddings` endpoint

### Example 4: Reasoning Models

**Agent front matter:**
```yaml
---
openai_delegation:
  model: o1-preview
  params:
    max_tokens: 8000
  context_strategy: full
---
```

**What happens:**
- Skill finds `o1-preview` in `chat` endpoint
- Routes to `/v1/chat/completions`
- Uses full context for reasoning tasks

## Maintaining Model Lists

### Automatic Updates

Use the included script to keep model lists current:

```bash
# Show what would change (dry run)
python scripts/update-models.py --dry-run

# Apply updates
python scripts/update-models.py

# Update custom config file
python scripts/update-models.py --config /path/to/config.json
```

### Manual Updates

You can also manually edit the `available_models` arrays:

```json
{
  "endpoints": {
    "chat": {
      "available_models": [
        "gpt-4o",
        "gpt-4o-mini",
        "new-model-2024"  // Add new models here
      ]
    }
  }
}
```

### When to Update

Update your model lists when:
- OpenAI releases new models
- You want to use a newly released model
- You see an error: "Model 'xyz' not found in any endpoint's available_models"
- Monthly or quarterly as part of maintenance

## Benefits

### 1. Simpler Configuration

**Before:**
```yaml
openai_delegation:
  endpoint: chat
  model: gpt-4o-mini
  params: {...}
```

**After:**
```yaml
openai_delegation:
  model: gpt-4o-mini
  params: {...}
```

### 2. Future-Proof

If OpenAI reorganizes their API structure, you only need to update the endpoint configs, not every agent.

### 3. Reduced Errors

No more "endpoint/model mismatch" errors from specifying the wrong endpoint for a model.

### 4. Easier Migration

When upgrading to new models, just change the model name:

```yaml
# Old
model: gpt-4

# New - automatically routes correctly
model: gpt-4o
```

### 5. Backward Compatible

You can still specify both `endpoint` and `model` if needed. The auto-routing only happens when `endpoint` is omitted.

## Advanced Scenarios

### Custom OpenAI-Compatible Endpoints

The feature works with custom endpoints too:

```json
{
  "endpoints": {
    "custom_chat": {
      "path": "/v1/chat/completions",
      "base_url": "https://custom-api.example.com",
      "api_key_env": "CUSTOM_API_KEY",
      "available_models": [
        "custom-model-v1",
        "custom-model-v2"
      ]
    }
  }
}
```

Then in your agent:

```yaml
---
openai_delegation:
  model: custom-model-v2
---
```

### Multiple Endpoints with Same Model

If multiple endpoints support the same model (unlikely but possible), the skill uses the first match:

```json
{
  "endpoints": {
    "endpoint_a": {
      "available_models": ["shared-model"]
    },
    "endpoint_b": {
      "available_models": ["shared-model"]
    }
  }
}
```

To explicitly choose, specify the endpoint:

```yaml
---
openai_delegation:
  endpoint: endpoint_b
  model: shared-model
---
```

### Fallback to Default

If no model is specified, the endpoint's `default_model` is used:

```json
{
  "endpoints": {
    "chat": {
      "default_model": "gpt-4o",
      "available_models": ["gpt-4o", "gpt-4o-mini"]
    }
  }
}
```

## Error Handling

### Model Not Found

**Error message:**
```
Model 'gpt-5-ultra' not found in any endpoint's available_models.
Run 'python scripts/update-models.py' to refresh model lists.
```

**Solutions:**
1. Run `python scripts/update-models.py` to update available models
2. Check for typos in the model name
3. Verify the model exists in OpenAI's API
4. Manually add the model to the appropriate endpoint's `available_models`

### Invalid Model Name

**Error message:**
```
Config 'my_config' specifies model 'invalid-model' which is not available.
Available models: gpt-4o, gpt-4o-mini, gpt-4-turbo
```

**Solutions:**
1. Check the model name for typos
2. List available models with `--dry-run`
3. Update your config to use a valid model

## Best Practices

### 1. Keep Model Lists Updated

Run the update script monthly:

```bash
# Add to cron
0 0 1 * * cd /path/to/project && python scripts/update-models.py
```

### 2. Use Descriptive Config Names

Instead of:
```json
{"config1": {"model": "gpt-4o"}}
```

Use:
```json
{"creative_writing": {"model": "gpt-4o", "params": {"temperature": 0.8}}}
```

### 3. Document Model Choices

Add comments explaining why you chose a model:

```yaml
---
# Using o1-preview for complex reasoning tasks
openai_delegation:
  model: o1-preview
  params:
    max_tokens: 8000
---
```

### 4. Test After Updates

After updating model lists:
1. Verify your agents still work
2. Check for any routing errors
3. Test edge cases

### 5. Version Control

Commit your `openai-config.json` to version control:

```bash
git add .claude/openai-config.json
git commit -m "feat: update OpenAI model lists with new releases"
```

## Migration Guide

### Migrating Existing Agents

**Step 1:** Identify agents using explicit endpoints

```bash
grep -r "endpoint:" .claude/agents/
```

**Step 2:** For each agent, decide if auto-routing is beneficial

Keep explicit endpoint if:
- Using custom endpoints
- Endpoint needs to be pinned for specific reasons
- Multiple endpoints support the model

Use auto-routing if:
- Using standard OpenAI endpoints
- Simplicity is preferred
- Future-proofing is important

**Step 3:** Update agent front matter

Before:
```yaml
openai_delegation:
  endpoint: chat
  model: gpt-4o-mini
```

After:
```yaml
openai_delegation:
  model: gpt-4o-mini
```

**Step 4:** Test the agent

```bash
# Invoke the agent and verify it works
```

**Step 5:** Update documentation

Update your project's documentation to reflect the new pattern.

## Troubleshooting

### Q: Can I still use explicit endpoint specification?

**A:** Yes! The auto-routing is optional. You can always specify both `endpoint` and `model`.

### Q: What happens if I specify both endpoint and model?

**A:** The explicit `endpoint` takes precedence. Auto-routing is skipped.

### Q: How do I know which endpoint was selected?

**A:** Claude Code should log the routing decision when delegating (implementation-dependent).

### Q: Can I override the auto-detected endpoint?

**A:** Yes, just specify `endpoint` explicitly in your config or front matter.

### Q: What if update-models.py categorizes a model incorrectly?

**A:** Edit the script's categorization patterns or manually fix the config JSON.

## Summary

Model-based endpoint routing makes your OpenAI delegation configuration:
- **Simpler**: Specify just the model, not the endpoint
- **Maintainable**: Update model lists automatically
- **Future-proof**: Adapts to API changes
- **Backward compatible**: Still supports explicit endpoint specification

Start using it today by:
1. Running `python scripts/update-models.py` to populate `available_models`
2. Updating your agents to specify `model` only
3. Enjoying simpler, cleaner configuration
