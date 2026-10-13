---
description: Quick start guide for setting up OpenAI API delegation with Claude
  Code in 5 minutes. Covers skill installation, API key setup, configuration
  creation, and test agent deployment.
when_to_use: When integrating OpenAI embedding models into your Claude workflow,
  when you need search/retrieval capabilities via delegation, or when starting a
  new project requiring OpenAI API access through the delegation pattern.
updated: 2026-05-15
---
# LLM Delegation Tool — Quick Start Guide

Get up and running with OpenAI API delegation in 5 minutes.

## Step 1: Copy the Skill (30 seconds)

```bash
# Copy to your Claude Code skills directory
cp -r llm-delegation-tool ~/.claude/skills/

# Or if skills are in your project
mkdir -p .claude/skills
cp -r llm-delegation-tool .claude/skills/
```

## Step 2: Get Your OpenAI API Key (2 minutes)

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)
4. Set it in your environment:

```bash
export OPENAI_API_KEY="sk-..."

# To make it permanent, add to ~/.bashrc or ~/.zshrc:
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.bashrc
```

## Step 3: Create Configuration (1 minute)

Create `.claude/openai-config.json` in your project:

```json
{
  "api_key_env": "OPENAI_API_KEY",

  "configs": {
    "search": {
      "model": "text-embedding-3-small",
      "params": {
        "dimensions": 512
      }
    }
  },

  "endpoints": {
    "embeddings": {
      "path": "/v1/embeddings",
      "base_url": "https://api.openai.com",
      "default_model": "text-embedding-3-small",
      "required_params": ["input"],
      "available_models": [
        "text-embedding-3-small",
        "text-embedding-3-large"
      ]
    }
  },

  "budget": {
    "max_tokens_per_request": 10000,
    "max_tokens_per_session": 100000
  }
}
```

**Note:** The `endpoint` is auto-detected from the model! See MODEL-ROUTING-GUIDE.md for details.

**Or copy a template:**

```bash
# Find this skill's folder through akm
SKILL_DIR="$(dirname "$(akm show skills/ai-skills/llm-delegation-tool --format json | jq -r .path)")"

# Minimal config
cp "$SKILL_DIR/examples/projects/minimal-openai-config.json" .claude/openai-config.json

# TTRPG project
cp "$SKILL_DIR/examples/projects/ttrpg-openai-config.json" .claude/openai-config.json

# Development project
cp "$SKILL_DIR/examples/projects/development-openai-config.json" .claude/openai-config.json
```

## Step 4: Create a Test Agent (30 seconds)

Create `agents/test-search.md`:

```markdown
---
openai_delegation: search
---

# Test Search Agent

I use embeddings to find similar content.
```

## Step 5: Test It! (30 seconds)

```bash
claude-code --agent=test-search "find documentation about authentication"
```

You should see:
```
🔄 Delegating to OpenAI Embeddings API
   Config: search
   Model: text-embedding-3-small
   Estimated tokens: ~200
   
[Search results...]
```

## Success! 🎉

You're now using OpenAI delegation. 

## Next Steps

### Update Model Lists (Recommended)

Keep your `available_models` current with the OpenAI API:

```bash
# Install dependencies
pip install requests

# Update model lists
python scripts/update-models.py
```

This queries OpenAI's API and updates all `available_models` arrays automatically.

### Add More Configs

Edit `.claude/openai-config.json`:

```json
{
  "configs": {
    "search": { ... },

    "moderate": {
      "model": "omni-moderation-latest"
    },

    "deep_search": {
      "model": "text-embedding-3-large",
      "params": {
        "dimensions": 3072
      }
    },

    "smart_chat": {
      "model": "gpt-4o-mini",
      "params": {
        "temperature": 0.7
      }
    }
  },

  "endpoints": {
    "embeddings": { ... },

    "moderation": {
      "path": "/v1/moderations",
      "base_url": "https://api.openai.com",
      "default_model": "omni-moderation-latest",
      "required_params": ["input"],
      "available_models": [
        "omni-moderation-latest",
        "text-moderation-latest"
      ]
    },

    "chat": {
      "path": "/v1/chat/completions",
      "base_url": "https://api.openai.com",
      "default_model": "gpt-4o",
      "required_params": ["messages"],
      "available_models": [
        "gpt-4o",
        "gpt-4o-mini",
        "o1-preview"
      ]
    }
  }
}
```

**Note:** With model-based routing, you can omit `endpoint` from configs!

### Create Specialized Agents

**Moderator** (`agents/moderator.md`):
```markdown
---
openai_delegation: moderate
---

# Content Moderator
Check content for policy violations.
```

**Deep Search** (`agents/deep-search.md`):
```markdown
---
openai_delegation: deep_search
---

# Deep Search Agent
Comprehensive semantic analysis.
```

### Document in claude.md

Add to `.claude/claude.md`:

```markdown
## LLM Delegation

- Config: `.claude/openai-config.json`
- API Key: `OPENAI_API_KEY` environment variable

### Available Configs
- `search` - Quick embeddings
- `moderate` - Content checking
- `deep_search` - Comprehensive analysis
```

### Use in Prompts

```bash
# Natural language
"use search to find similar code"

# Explicit override
"@delegate:deep_search comprehensive analysis"
```

## Common Issues

### "API key not found"

```bash
# Check if set
echo $OPENAI_API_KEY

# Set it
export OPENAI_API_KEY="sk-..."
```

### "Config not found"

- Check spelling in agent front matter
- Verify config exists in `.claude/openai-config.json`
- Validate JSON syntax: `python -m json.tool .claude/openai-config.json`

### "Endpoint not defined"

- Ensure endpoint exists in `endpoints` section
- Check endpoint ID matches config's `endpoint` field

## Quick Reference

### Front Matter Syntax

```yaml
---
# Simple (named config)
openai_delegation: config_name

# Model-only (endpoint auto-detected)
openai_delegation:
  model: gpt-4o-mini
  params:
    temperature: 0.7

# Explicit endpoint
openai_delegation:
  endpoint: embeddings
  model: text-embedding-3-small

# Multiple endpoints
openai_delegation:
  - name: search
    model: text-embedding-3-small
  - name: check
    model: omni-moderation-latest
---
```

### Prompt Syntax

```bash
# Natural language
"use embeddings to search"

# Explicit
"@delegate:config_name query"
```

### Config Location

```
project-root/
├── .claude/
│   ├── claude.md
│   └── openai-config.json  ← Here!
```

## Cost Estimates

Typical costs for common operations:

| Operation | Tokens | Cost (approx) |
|-----------|--------|---------------|
| Simple search (small) | 500 | $0.00001 |
| Deep search (large) | 2000 | $0.00026 |
| Moderation check | 100 | $0.00000 (free) |
| Chat completion | 1000 | $0.01 |

Set budgets in config to control costs!

## Resources

- **Full Documentation**: `SKILL.md`
- **Model Routing Guide**: `MODEL-ROUTING-GUIDE.md` (NEW!)
- **Script Documentation**: `scripts/README.md`
- **Examples**: `examples/` directory
- **Templates**: `examples/projects/`
- **OpenAI Docs**: https://platform.openai.com/docs

## Support

Having issues? Check:
1. API key is set correctly
2. Config file is valid JSON
3. Endpoint definitions are complete
4. Agent front matter is valid YAML
5. Skill is in the skills directory

Still stuck? Review `SKILL.md` for detailed troubleshooting.

---

**You're ready to go!** Start creating agents with OpenAI delegation. 🚀
