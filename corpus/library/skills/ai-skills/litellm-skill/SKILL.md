---
name: litellm-manager
description: Manage LiteLLM Proxy instances programmatically.
  Bun.js/TypeScript REST API scripts.
updated: 2026-03-15
when_to_use: Use this skill when you need to manage LiteLLM Proxy instances
  programmatically, such as deploying new models, updating model configurations,
  generating or revoking virtual API keys, and managing user accounts and
  spending limits via the REST API.
---

# LiteLLM Management Skill

Manage and configure LiteLLM Proxy instances programmatically using Bun.js/TypeScript scripts via the REST API. This skill provides comprehensive guidance, quick starts, and detailed references for all administrative endpoints.

## Quick Start

To begin interacting with your LiteLLM instance:

```bash
# Set environment variables
export LITELLM_API_BASE="http://localhost:4000"
export LITELLM_MASTER_KEY="sk-your-master-key"

# Run any management script (e.g., list models)
bun run lib/client.ts models:list
```

## Environment Configuration

The following environment variables are required for administrative operations:

| Variable | Required | Description |
|----------|----------|-------------|
| `LITELLM_API_BASE` | Yes | LiteLLM proxy URL (e.g., `http://localhost:4000`) |
| `LITELLM_MASTER_KEY` | Yes | Master key for admin operations |
| `LITELLM_API_KEY` | No | Virtual key for non-admin operations |

## Core Management Workflows and API Reference

This skill covers all administrative domains of LiteLLM Proxy. The endpoints are grouped by the management task they perform.

### 🚀 Model Deployment & Configuration (Model Management)

Use these endpoints to manage which models are available, how they are configured, and their status.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/model/new` | POST | Add a new model deployment |
| `/model/update` | POST | Update model configuration |
| `/model/delete` | POST | Delete a model deployment |
| `/model/info` | GET | Get detailed model information |
| `/v1/models` | GET | List all available models |
| `/v1/model/info` | GET | Get model info with metadata |
| `/model/settings` | GET | Get model-specific settings |

### 🔑 Access Control & Security (Virtual Key Management)

Manage API keys, ensuring proper access control and budget enforcement for users and services.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/key/generate` | POST | Generate a new virtual key |
| `/key/update` | POST | Update key settings (budget, models, etc.) |
| `/key/delete` | POST | Delete/revoke a virtual key |
| `/key/info` | GET | Get key details and spend |
| `/key/{key}/regenerate` | POST | Rotate an existing key |
| `/key/health` | GET | Check key health status |

### 👥 Identity Management (User, Team, Organization, Customer)

Control who can use the service and how they are grouped for billing and access control.

**User Management:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/user/new` | POST | Create a new user |
| `/user/update` | POST | Update user settings |
| `/user/delete` | POST | Delete a user |
| `/user/info` | GET | Get user details and spend |
| `/user/daily/activity` | GET | Get user's daily usage activity |

**Team Management:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/team/new` | POST | Create a new team |
| `/team/update` | POST | Update team settings |
| `/team/delete` | POST | Delete a team |
| `/team/info` | GET | Get team details |
| `/team/member_add` | POST | Add member to team |
| `/team/member_delete` | POST | Remove member from team |
| `/team/member_update` | POST | Update member role |
| `/team/list` | GET | List all teams |

**Organization Management:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/organization/new` | POST | Create organization |
| `/organization/update` | POST | Update organization |
| `/organization/delete` | POST | Delete organization |
| `/organization/info` | GET | Get organization info |
| `/organization/list` | GET | List organizations |

**Customer Management:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/customer/new` | POST | Create customer with budget |
| `/customer/update` | POST | Update customer settings |
| `/customer/delete` | POST | Delete customer |
| `/customer/info` | GET | Get customer spend info |
| `/customer/list` | GET | List all customers |

### 💰 Financial Control (Budget & Spend Tracking)

Monitor usage, enforce spending limits, and generate financial reports.

**Budget Management:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/budget/new` | POST | Create a budget template |
| `/budget/update` | POST | Update budget settings |
| `/budget/delete` | POST | Delete a budget |
| `/budget/info` | GET | Get budget details |
| `/budget/list` | GET | List all budgets |

**Spend Tracking:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/global/spend/report` | GET | Get global spend report |
| `/global/spend/reset` | POST | Reset all spend counters |
| `/global/spend/logs` | GET | Get spend logs (also used for request/response logs) |
| `/spend/keys` | GET | Spend breakdown by keys |
| `/spend/users` | GET | Spend breakdown by users |
| `/spend/teams` | GET | Spend breakdown by teams |
| `/spend/tags` | GET | Spend breakdown by tags |

### ⚙️ System Health & Configuration

Check the operational status of the proxy and manage its underlying configuration.

**Health & Monitoring:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Full health check (makes LLM calls) |
| `/health/liveliness` | GET | Basic liveliness check |
| `/health/readiness` | GET | Readiness check with DB status |
| `/health/services` | GET | Check connected services |
| `/metrics` | GET | Prometheus metrics |

**Configuration:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/config/yaml` | GET | Get current config.yaml |
| `/config/update` | POST | Update configuration |
| `/config/list` | GET | List config keys |
| `/config/field/info` | GET | Get config field details |

**Logging & Errors:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/global/activity` | GET | Get activity logs |
| `/errors` | GET | Get recent error logs |

## Usage Examples (TypeScript)

The following examples demonstrate common administrative tasks using the `LiteLLMClient`.

### Adding a New Model

```typescript
import { LiteLLMClient } from "./lib/client.ts";

const client = new LiteLLMClient();

await client.models.add({
  model_name: "gpt-4o",
  litellm_params: {
    model: "azure/gpt-4o-deployment",
    api_base: "https://your-resource.openai.azure.com/",
    api_key: "your-azure-key",
    api_version: "2024-08-01-preview"
  },
  model_info: {
    max_tokens: 128000
  }
});
```

### Generating a Virtual Key with Budget

```typescript
const key = await client.keys.generate({
  key_alias: "dev-team-key",
  team_id: "dev-team",
  models: ["gpt-4o", "claude-3-sonnet"],
  max_budget: 100,
  budget_duration: "30d",
  rpm_limit: 100,
  tpm_limit: 100000,
  metadata: {
    environment: "development"
  }
});

console.log("Generated key:", key.key);
```

### Creating a Team with Budget

```typescript
const team = await client.teams.create({
  team_alias: "engineering",
  max_budget: 1000,
  budget_duration: "monthly",
  models: ["gpt-4o", "claude-3-opus"],
  metadata: {
    department: "Engineering",
    cost_center: "ENG-001"
  }
});
```

### Checking Health Status

```typescript
const health = await client.health.check();
console.log("Healthy models:", health.healthy_endpoints);
console.log("Unhealthy models:", health.unhealthy_endpoints);
```

### Getting Spend Report

```typescript
const report = await client.spend.getReport({
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  group_by: "team"
});
```

## File Structure and Implementation Details

The skill relies on a structured file system for implementation:

```
litellm-skill/
├── SKILL.md                 # This documentation
├── lib/
│   ├── client.ts            # Main LiteLLM client class
│   ├── types.ts             # TypeScript type definitions
│   └── yaml-manager.ts      # Config YAML file manager
└── scripts/
    ├── models.ts            # Model management CLI
    ├── keys.ts              # Key management CLI
    ├── teams.ts             # Team management CLI
    ├── users.ts             # User management CLI
    ├── budgets.ts           # Budget management CLI
    ├── health.ts            # Health check CLI
    ├── spend.ts             # Spend tracking CLI
    └── config.ts            # Configuration CLI
```

## Config YAML Management

The skill also supports reading and writing LiteLLM config.yaml files, allowing for persistent configuration management:

```typescript
import { LiteLLMConfigManager } from "./lib/yaml-manager.ts";

const config = new LiteLLMConfigManager("./config.yaml");

// Add a model
config.addModel({
  model_name: "gpt-4o",
  litellm_params: {
    model: "openai/gpt-4o",
    api_key: "os.environ/OPENAI_API_KEY"
  }
});

// Update general settings
config.setGeneralSettings({
  master_key: "sk-1234",
  database_url: "postgresql://user:pass@host:5432/db"
});

// Save changes
await config.save();
```

## Error Handling and Reliability

All API methods throw `LiteLLMError` on failure, providing structured error information:

```typescript
try {
  await client.models.add(modelConfig);
} catch (error) {
  if (error instanceof LiteLLMError) {
    console.error(`API Error: ${error.message}`);
    console.error(`Status: ${error.status}`);
    console.error(`Code: ${error.code}`);
  }
}
```

**Rate Limiting:** The client automatically handles rate limiting with exponential backoff. Configure this behavior during client initialization:

```typescript
const client = new LiteLLMClient({
  maxRetries: 3,
  retryDelay: 1000
});
```

## Best Practices for Production Use

To ensure a secure and cost-effective deployment, follow these guidelines:

1. **Use Virtual Keys**: Never expose the master key to applications.
2. **Set Budgets**: Always set budgets on keys/teams for granular cost control.
3. **Monitor Health**: Regularly check `/health` endpoints for model availability and service status.
4. **Track Spend**: Use spend endpoints (`/global/spend/report`, etc.) to monitor costs accurately.
5. **Use Tags**: Tag requests for highly granular cost attribution across different projects or teams.
6. **Rotate Keys**: Implement key rotation policies regularly for enhanced security.

## Related Documentation

For deeper technical dives, consult the official LiteLLM documentation:

- [LiteLLM Proxy Docs](https://docs.litellm.ai/docs/proxy)
- [Virtual Keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
- [Model Management](https://docs.litellm.ai/docs/proxy/model_management)
- [Spend Tracking](https://docs.litellm.ai/docs/proxy/cost_tracking)
