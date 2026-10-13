---
description: Troubleshooting guide for resolving common issues with the OpenAI
  delegation skill, including front matter syntax validation, configuration file
  errors, endpoint definitions, and model availability problems.
when_to_use: Use when the agent fails to activate the delegation skill,
  encounters config or endpoint lookup errors, or experiences model routing
  failures during execution.
updated: 2026-05-15
---
# Troubleshooting Guide

Common issues and solutions for the OpenAI delegation skill.

## Delegation Not Working

### Issue: Front matter not recognized

**Symptoms:**
- Agent has `openai_delegation` in front matter but skill doesn't activate
- No delegation messages appear

**Solutions:**
1. Check YAML syntax - ensure proper indentation
2. Verify front matter is between `---` markers
3. Check for tabs vs spaces (use spaces)
4. Validate YAML online: https://www.yamllint.com/

**Example of correct syntax:**
```yaml
---
openai_delegation: semantic_search
---
```

### Issue: Config not found

**Error:**
```
Error: Config 'invalid_name' not found in openai-config.json
Available configs: semantic_search, deep_search, content_check
```

**Solutions:**
1. Check spelling in agent front matter
2. Verify config exists in `.claude/openai-config.json`
3. List available configs: `cat .claude/openai-config.json | grep -A1 '"configs"'`

### Issue: Endpoint not defined

**Error:**
```
Error: Endpoint 'embeddings' referenced but not defined in endpoints section
```

**Solutions:**
1. Ensure endpoint exists in `endpoints` section of config
2. Check endpoint ID matches exactly (case-sensitive)
3. Copy from `default-openai-config.json` if needed

## Model Routing Issues

### Issue: Model not found in available_models

**Error:**
```
Model 'gpt-5-ultra' not found in any endpoint's available_models.
Run 'python scripts/update-models.py' to refresh model lists.
```

**Solutions:**
1. Run `python scripts/update-models.py` to update available models
2. Check for typos in the model name
3. Verify the model exists: https://platform.openai.com/docs/models
4. Manually add the model to the appropriate endpoint's `available_models`

### Issue: Wrong endpoint selected

**Symptoms:**
- Model routes to unexpected endpoint
- API returns "model not supported" error

**Solutions:**
1. Check which endpoint contains the model in its `available_models`
2. Explicitly specify `endpoint` if auto-detection is wrong:
   ```yaml
   openai_delegation:
     endpoint: chat  # Explicit
     model: gpt-4o
   ```
3. Update model lists: `python scripts/update-models.py`

## API Key Issues

### Issue: API key not found

**Error:**
```
Error: OPENAI_API_KEY environment variable not set
Set with: export OPENAI_API_KEY="sk-..."
```

**Solutions:**
```bash
# Check if set
echo $OPENAI_API_KEY

# Set temporarily
export OPENAI_API_KEY="sk-..."

# Set permanently (add to ~/.bashrc or ~/.zshrc)
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.bashrc
source ~/.bashrc
```

### Issue: Invalid API key

**Error:**
```
Error: OpenAI API request failed (401 Unauthorized)
Check your API key and permissions
```

**Solutions:**
1. Verify key is correct and active
2. Check key permissions at https://platform.openai.com/api-keys
3. Generate new key if needed
4. Ensure no extra spaces in the key

## Request Failures

### Issue: Rate limit exceeded

**Error:**
```
Error: OpenAI API request failed (429 Too Many Requests)
You've exceeded your rate limit
```

**Solutions:**
1. Wait a moment and try again
2. Check your rate limits: https://platform.openai.com/account/limits
3. Reduce `max_tokens` in config to make smaller requests
4. Use result caching to avoid repeated requests

### Issue: Budget exceeded

**Error:**
```
Error: Session budget exceeded (100,000 tokens), blocking new requests
```

**Solutions:**
1. Increase budget limits in config:
   ```json
   {
     "budget": {
       "max_tokens_per_session": 200000
     }
   }
   ```
2. Use smaller models (e.g., `text-embedding-3-small` instead of `large`)
3. Set `context_strategy` to `minimal`
4. Restart session to reset counter

## Cost Issues

### Issue: Unexpectedly high costs

**Symptoms:**
- API bills higher than expected
- Token usage warnings appearing frequently

**Solutions:**
1. Review `context_strategy` settings - use `minimal` or `relevant` instead of `full`
2. Set `max_tokens` limits on configs:
   ```json
   {
     "max_tokens": 4000
   }
   ```
3. Use smaller embedding models:
   - `text-embedding-3-small` (512d) instead of large (3072d)
4. Check token tracking in logs
5. Enable result caching

### Issue: Can't estimate costs

**Problem:**
- Don't know how much a request will cost

**Solutions:**
1. Check `cost_per_1k_tokens` in endpoint config
2. Estimate tokens before request:
   - Embeddings: ~1 token per word
   - Chat: ~1.3 tokens per word
3. Use `--dry-run` mode if available
4. Start with small limits and adjust

## Configuration Issues

### Issue: Invalid JSON

**Error:**
```
Error: Invalid JSON in config file: Unexpected token } at line 45
```

**Solutions:**
1. Validate JSON: `python -m json.tool .claude/openai-config.json`
2. Check for:
   - Missing commas
   - Extra commas (after last item)
   - Unmatched brackets
   - Comments (not allowed in JSON)
3. Use a JSON formatter: https://jsonformatter.org/

### Issue: Config file not found

**Error:**
```
Error: Config file not found at .claude/openai-config.json
```

**Solutions:**
1. Check current directory: `pwd`
2. Check file exists: `ls .claude/openai-config.json`
3. Create from template:
   ```bash
   mkdir -p .claude
   cp examples/semantic-search-config.json .claude/openai-config.json
   ```

## Script Issues

### Issue: update-models.py fails

**Error:**
```
Error: requests library not found
```

**Solutions:**
```bash
# Install dependencies
pip install requests

# Or with virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install requests
```

### Issue: Script categorizes models incorrectly

**Problem:**
- New model appears in wrong endpoint's `available_models`

**Solutions:**
1. Manually move the model in config file
2. Update categorization patterns in `scripts/update-models.py`:
   ```python
   EMBEDDING_PATTERNS = ['embedding', 'embed']
   MODERATION_PATTERNS = ['moderation']
   CHAT_PATTERNS = ['gpt', 'o1', 'chatgpt', 'new-pattern']
   ```
3. Run script again: `python scripts/update-models.py`

## Permission Issues

### Issue: Can't read/write config files

**Error:**
```
Error: Permission denied: .claude/openai-config.json
```

**Solutions:**
```bash
# Check permissions
ls -l .claude/openai-config.json

# Fix permissions
chmod 644 .claude/openai-config.json

# Check directory permissions
chmod 755 .claude
```

## Debugging Tips

### Enable verbose logging

If Claude Code supports it, enable verbose logging to see delegation details:
```bash
claude-code --verbose --agent=search "test query"
```

### Test with minimal config

Create a simple test config to isolate issues:
```json
{
  "api_key_env": "OPENAI_API_KEY",
  "configs": {
    "test": {
      "model": "text-embedding-3-small"
    }
  },
  "endpoints": {
    "embeddings": {
      "path": "/v1/embeddings",
      "base_url": "https://api.openai.com",
      "required_params": ["input"],
      "available_models": ["text-embedding-3-small"]
    }
  }
}
```

### Check API directly

Test if the OpenAI API works outside of Claude Code:
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Review examples

Compare your config to working examples:
```bash
diff .claude/openai-config.json examples/semantic-search-config.json
```

## Getting Help

If you're still stuck:

1. **Check documentation**:
   - README.md - Quick start
   - MODEL-ROUTING-GUIDE.md - Routing details
   - QUICKSTART.md - Step-by-step setup

2. **Review examples**:
   - `examples/` directory has working configs
   - Copy and modify rather than starting from scratch

3. **Validate configuration**:
   - Run `python -m json.tool .claude/openai-config.json`
   - Check YAML front matter syntax

4. **Test components individually**:
   - Test API key with curl
   - Test config file loads
   - Test simple agent first

5. **Common mistakes checklist**:
   - [ ] API key environment variable is set
   - [ ] Config file is valid JSON
   - [ ] Endpoint IDs match between configs and endpoints
   - [ ] Model names are in `available_models`
   - [ ] Front matter has correct YAML syntax
   - [ ] Skill is in the skills directory
