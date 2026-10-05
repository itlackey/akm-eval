---
type: agent
name: auto-routing-example
openai_delegation:
  model: gpt-4o-mini
  system_prompt: You are a helpful assistant for brainstorming game mechanics and features.
updated: 2026-03-15
description: Demonstrates model-based endpoint routing by specifying only a
  model without defining an explicit endpoint, simplifying configuration and
  ensuring adaptability when models shift between endpoints.
when_to_use: Use this pattern when configuring OpenAI delegation agents where
  you prefer simpler setup over hardcoded endpoints or want the system to handle
  route selection based on available models.
tools:
  - openai_delegation
model: gpt-4o-mini
---

# Auto-Routing Example Agent

This agent demonstrates the new **model-based endpoint routing** feature. Notice that the front matter only specifies a `model`, not an `endpoint`.

## How It Works

When this agent is invoked, the OpenAI delegation skill will:
1. See that `model: gpt-4o-mini` is specified
2. Search through all endpoints' `available_models` arrays
3. Find `gpt-4o-mini` in the `chat` endpoint's available models
4. Automatically route the request to `/v1/chat/completions`

## Benefits

This approach means:
- Simpler agent configuration (no need to know which endpoint)
- Agents automatically adapt when models move between endpoints
- Reduced configuration errors
- Cleaner front matter

## Traditional Approach (Still Supported)

You can still explicitly specify the endpoint:

```yaml
---
openai_delegation:
  endpoint: chat
  model: gpt-4o-mini
  params:
    temperature: 0.7
---
```

Both approaches work - use whichever fits your needs.

## Example Usage

**Brainstorm mechanics:**
```
Help me brainstorm stealth mechanics for a shadow-based TTRPG
```

**Refine ideas:**
```
Take this mechanic and suggest three variations with different difficulty levels
```

**Balance features:**
```
Review this ability and suggest how to balance it for fairness
```

## Updating Model Lists

The `available_models` arrays are maintained by running:

```bash
python scripts/update-models.py
```

This script queries the OpenAI API and updates your config with the latest available models. Run it periodically to ensure your skill can route to new models as they're released.
