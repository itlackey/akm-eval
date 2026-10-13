---
description: Technical specification for implementing OpenAI delegation skill
  logic in Claude Code, detailing initialization steps, request flow detection
  hierarchy, and configuration resolution functions including error handling for
  missing configs.
when_to_use: Use when architecting agent workflows requiring dynamic external
  service integration via project-level configuration files or explicit prompt
  triggers rather than hardcoded API keys.
updated: 2026-05-15
---
# Implementation Guide for Claude Code

How Claude Code should implement the OpenAI delegation skill.

## Initialization

On startup or when processing a project:

1. Load `.claude/openai-config.json` if it exists in the project
2. Merge with skill's `default-openai-config.json`
3. Validate the configuration
4. Prepare endpoint definitions

## Request Flow

### 1. Detect Delegation Need

Check in this order:

1. **User prompt** - `@delegate:config_name` syntax
2. **Command front matter** - `openai_delegation` field
3. **Agent front matter** - `openai_delegation` field
4. **Natural language triggers** - "use embeddings...", "search with semantic..."
5. **Project default** - `default_config` field

### 2. Resolve Configuration

```javascript
function resolveDelegationConfig(context) {
  // 1. Check user prompt for explicit delegation
  if (context.prompt.includes('@delegate:')) {
    return parseExplicitDelegation(context.prompt);
  }

  // 2. Check command front matter (NEVER override)
  if (context.command?.frontMatter?.openai_delegation) {
    return resolveConfig(context.command.frontMatter.openai_delegation);
  }

  // 3. Check agent front matter (NEVER override)
  if (context.agent?.frontMatter?.openai_delegation) {
    return resolveConfig(context.agent.frontMatter.openai_delegation);
  }

  // 4. Check natural language triggers
  if (containsNaturalDelegationTrigger(context.prompt)) {
    return inferConfigFromPrompt(context.prompt);
  }

  // 5. Check project default
  if (projectConfig?.default_config) {
    return projectConfig.configs[projectConfig.default_config];
  }

  // 6. No delegation
  return null;
}

function resolveConfig(delegationSpec) {
  let config;

  // If string, look up named config
  if (typeof delegationSpec === 'string') {
    config = projectConfig.configs[delegationSpec];
    if (!config) {
      throw new Error(`Config '${delegationSpec}' not found in openai-config.json`);
    }
  } else {
    // Inline config object
    config = delegationSpec;
  }

  // AUTO-DETECT ENDPOINT FROM MODEL
  // If model specified but no endpoint, search available_models
  if (config.model && !config.endpoint) {
    const endpoint = findEndpointForModel(config.model);
    if (!endpoint) {
      throw new Error(
        `Model '${config.model}' not found in any endpoint's available_models. ` +
        `Run 'python scripts/update-models.py' to refresh model lists.`
      );
    }
    config.endpoint = endpoint;
  }

  return config;
}

function findEndpointForModel(modelName) {
  // Search all endpoints for this model
  for (const [endpointId, endpointConfig] of Object.entries(projectConfig.endpoints)) {
    if (endpointConfig.available_models?.includes(modelName)) {
      return endpointId;
    }
  }
  return null;
}
```

### 3. Prepare Context

Based on `context_strategy`:

**full**:
- Include all relevant files in project
- Include conversation history
- May hit token limits for large projects

**relevant** (default):
- Include files mentioned in conversation
- Include files matching query keywords
- Include recent conversation context

**minimal**:
- Include only the specific user query/input
- No additional context

### 4. Make API Request

```javascript
async function delegateToOpenAI(config, context) {
  const endpoint = projectConfig.endpoints[config.endpoint];

  // Build request
  const request = {
    method: 'POST',
    url: `${endpoint.base_url}${endpoint.path}`,
    headers: {
      'Authorization': `Bearer ${process.env[endpoint.api_key_env || projectConfig.api_key_env]}`,
      'Content-Type': 'application/json'
    },
    body: buildRequestBody(config, context, endpoint)
  };

  // Track tokens
  const estimatedTokens = estimateTokens(request.body);
  trackTokenUsage(estimatedTokens);

  // Check budget
  if (exceedsBudget(estimatedTokens)) {
    throw new Error('Budget limit exceeded');
  }

  // Make request
  const response = await fetch(request.url, request);

  // Parse response
  return parseResponse(response, endpoint);
}
```

### 5. Handle Response

1. Parse based on endpoint's `output_schema`
2. Format for user consumption
3. Log costs and tokens
4. Return results to main flow

### 6. Error Handling

Provide clear, actionable error messages:

```javascript
try {
  return await delegateToOpenAI(config, context);
} catch (error) {
  if (error.status === 401) {
    return `Error: Invalid API key. Check ${projectConfig.api_key_env} environment variable.`;
  } else if (error.status === 429) {
    return `Error: Rate limit exceeded. Wait a moment and try again.`;
  } else if (error.message.includes('not found')) {
    return `Error: ${error.message}\nAvailable configs: ${Object.keys(projectConfig.configs).join(', ')}`;
  }

  // Fallback to regular processing
  console.warn('Delegation failed, continuing with available tools:', error);
  return null;
}
```

## Natural Language Triggers

Recognize these patterns:

- "use {config_name} to..."
- "use {endpoint} to..."
- "search with embeddings"
- "check with moderation"
- "generate with {model}"
- "semantic search for..."
- "find similar..."

## User Communication

Always inform user when delegating:

```
🔄 Delegating to OpenAI Embeddings API
   Config: semantic_search
   Model: text-embedding-3-small
   Estimated tokens: ~500
   Estimated cost: $0.00001

[Perform delegation...]

✅ Delegation complete
   Tokens used: 487
   Actual cost: $0.0000097
```

## Budget Tracking

Track throughout session:

```javascript
const budget = {
  tokensThisRequest: 0,
  tokensThisSession: 0,
  maxPerRequest: projectConfig.budget.max_tokens_per_request,
  maxPerSession: projectConfig.budget.max_tokens_per_session,
  warnAt: projectConfig.budget.warn_at_tokens
};

function trackTokenUsage(tokens) {
  budget.tokensThisRequest += tokens;
  budget.tokensThisSession += tokens;

  if (budget.tokensThisSession >= budget.warnAt) {
    console.warn(`⚠️  Token usage: ${budget.tokensThisSession}/${budget.maxPerSession}`);
  }

  if (budget.tokensThisRequest > budget.maxPerRequest) {
    throw new Error('Per-request token limit exceeded');
  }

  if (budget.tokensThisSession > budget.maxPerSession) {
    throw new Error('Session token limit exceeded');
  }
}
```

## Security Considerations

1. **API Keys**: Load from environment variables only, never log
2. **Input Validation**: Sanitize all inputs before sending to API
3. **Output Validation**: Validate API responses match expected schema
4. **Error Handling**: Don't expose sensitive details in error messages
5. **File Access**: Respect `.gitignore` when preparing context
