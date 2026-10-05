#!/usr/bin/env bun
/**
 * LiteLLM Budget Management CLI
 */

import { LiteLLMClient } from "../lib/client.ts";

const client = new LiteLLMClient();

const commands: Record<string, () => Promise<void>> = {
  async list() {
    const budgets = await client.budgets.list();
    console.log("\n💵 Budget Templates:\n");
    
    if (!budgets.length) {
      console.log("  No budget templates found");
      return;
    }
    
    for (const budget of budgets) {
      console.log(`  • ${budget.budget_id}`);
      console.log(`    Max Budget: ${budget.max_budget ? `$${budget.max_budget}` : "unlimited"}`);
      if (budget.soft_budget) {
        console.log(`    Soft Budget: $${budget.soft_budget}`);
      }
      console.log(`    Duration: ${budget.budget_duration || "none"}`);
      if (budget.tpm_limit) {
        console.log(`    TPM Limit: ${budget.tpm_limit.toLocaleString()}`);
      }
      if (budget.rpm_limit) {
        console.log(`    RPM Limit: ${budget.rpm_limit}`);
      }
      console.log("");
    }
    
    console.log(`Total: ${budgets.length} budgets`);
  },

  async create() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: budgets.ts create '<json-config>'");
      console.error(`
Example:
  bun run budgets.ts create '{
    "budget_id": "free-tier",
    "max_budget": 10,
    "budget_duration": "monthly",
    "rpm_limit": 10,
    "tpm_limit": 10000
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.budgets.create(config);
    
    console.log("\n✅ Budget created:\n");
    console.log(`  ID: ${result.budget_id}`);
    console.log(`  Max Budget: ${result.max_budget ? `$${result.max_budget}` : "unlimited"}`);
    console.log(`  Duration: ${result.budget_duration || "none"}`);
  },

  async info() {
    const budgetId = process.argv[3];
    if (!budgetId) {
      console.error("Usage: budgets.ts info <budget-id>");
      process.exit(1);
    }

    const info = await client.budgets.info(budgetId);
    console.log("\n📋 Budget Info:\n");
    console.log(JSON.stringify(info, null, 2));
  },

  async update() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: budgets.ts update '<json-config>'");
      console.error(`
Example:
  bun run budgets.ts update '{
    "budget_id": "free-tier",
    "max_budget": 20
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.budgets.update(config);
    console.log("\n✅ Budget updated:\n");
    console.log(JSON.stringify(result, null, 2));
  },

  async delete() {
    const budgetId = process.argv[3];
    if (!budgetId) {
      console.error("Usage: budgets.ts delete <budget-id>");
      process.exit(1);
    }

    const result = await client.budgets.delete(budgetId);
    console.log("\n✅ Budget deleted:");
    console.log(`  ${result.message}`);
  },

  async "quick-create"() {
    const budgetId = process.argv[3];
    const maxBudget = parseFloat(process.argv[4] || "10");
    const duration = process.argv[5] || "monthly";
    
    if (!budgetId) {
      console.error("Usage: budgets.ts quick-create <id> [max-budget] [duration]");
      console.error("  duration: 30s, 30m, 24h, 7d, 30d, monthly, yearly");
      process.exit(1);
    }

    const result = await client.budgets.create({
      budget_id: budgetId,
      max_budget: maxBudget,
      budget_duration: duration,
    });
    
    console.log("\n✅ Budget created:\n");
    console.log(`  ID: ${result.budget_id}`);
    console.log(`  Max: $${maxBudget}`);
    console.log(`  Duration: ${duration}`);
  },

  async templates() {
    console.log("\n📋 Common Budget Templates:\n");
    
    const templates = [
      {
        name: "Free Tier",
        config: {
          budget_id: "free-tier",
          max_budget: 5,
          budget_duration: "monthly",
          rpm_limit: 5,
          tpm_limit: 5000,
        },
      },
      {
        name: "Developer",
        config: {
          budget_id: "developer",
          max_budget: 50,
          budget_duration: "monthly",
          rpm_limit: 60,
          tpm_limit: 100000,
        },
      },
      {
        name: "Team",
        config: {
          budget_id: "team",
          max_budget: 500,
          budget_duration: "monthly",
          rpm_limit: 500,
          tpm_limit: 1000000,
        },
      },
      {
        name: "Enterprise",
        config: {
          budget_id: "enterprise",
          max_budget: 5000,
          budget_duration: "monthly",
          rpm_limit: 2000,
          tpm_limit: 10000000,
        },
      },
    ];
    
    for (const template of templates) {
      console.log(`  ${template.name}:`);
      console.log(`    ${JSON.stringify(template.config)}\n`);
    }
    
    console.log("  To create, run:");
    console.log("    bun run budgets.ts create '<json>'");
  },
};

async function main() {
  const command = process.argv[2] || "list";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
LiteLLM Budget Management

Usage:
  bun run budgets.ts <command> [args]

Commands:
  list                        List all budgets
  create <json>               Create a budget template
  info <budget-id>            Get budget information
  update <json>               Update budget settings
  delete <budget-id>          Delete a budget
  quick-create <id> [b] [d]   Quick create budget
  templates                   Show common templates

Budget Duration Formats:
  30s     - 30 seconds
  30m     - 30 minutes
  24h     - 24 hours
  7d      - 7 days
  30d     - 30 days
  monthly - 1 month
  yearly  - 1 year

Budget Options (JSON):
  {
    "budget_id": "my-budget",
    "max_budget": 100,
    "soft_budget": 80,
    "budget_duration": "monthly",
    "tpm_limit": 100000,
    "rpm_limit": 100,
    "max_parallel_requests": 10,
    "model_max_budget": {
      "gpt-4o": 50,
      "claude-3-opus": 30
    }
  }

Examples:
  bun run budgets.ts quick-create free-tier 10 monthly
  bun run budgets.ts quick-create dev 100 30d

Environment:
  LITELLM_API_BASE      LiteLLM proxy URL
  LITELLM_MASTER_KEY    Master key for admin ops
`);
    process.exit(0);
  }

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error("Run with --help for usage");
    process.exit(1);
  }

  try {
    await handler();
  } catch (error) {
    console.error("\n❌ Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
