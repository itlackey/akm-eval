#!/usr/bin/env bun
/**
 * LiteLLM User Management CLI
 */

import { LiteLLMClient } from "../lib/client.ts";

const client = new LiteLLMClient();

const commands: Record<string, () => Promise<void>> = {
  async list() {
    const result = await client.users.list();
    console.log("\n👤 Users:\n");
    
    for (const user of result.users) {
      const spend = user.spend?.toFixed(4) || "0.0000";
      const budget = user.max_budget ? `$${user.max_budget}` : "unlimited";
      
      console.log(`  • ${user.user_id}`);
      console.log(`    Email: ${user.user_email || "none"}`);
      console.log(`    Role: ${user.user_role}`);
      console.log(`    Spend: $${spend} / ${budget}`);
      console.log(`    Team: ${user.team_id || "none"}`);
      console.log("");
    }
    
    console.log(`Total: ${result.total || result.users.length} users`);
  },

  async create() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: users.ts create '<json-config>'");
      console.error(`
Example:
  bun run users.ts create '{
    "user_email": "dev@example.com",
    "user_role": "internal_user",
    "max_budget": 100,
    "auto_create_key": true
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.users.create(config);
    
    console.log("\n✅ User created:\n");
    console.log(`  ID: ${result.user_id}`);
    console.log(`  Email: ${result.user_email || "none"}`);
    console.log(`  Role: ${result.user_role}`);
    console.log(`  Max Budget: ${result.max_budget ? `$${result.max_budget}` : "unlimited"}`);
    
    if (result.key) {
      console.log(`\n  API Key: ${result.key}`);
      console.log("  ⚠️  Store this key securely - it won't be shown again!");
    }
  },

  async info() {
    const userId = process.argv[3];
    const info = await client.users.info(userId);
    
    console.log("\n📋 User Info:\n");
    console.log(`  ID: ${info.user_id}`);
    console.log(`  Email: ${info.user_email || "none"}`);
    console.log(`  Role: ${info.user_role}`);
    console.log(`  Spend: $${info.spend?.toFixed(4) || "0.0000"}`);
    console.log(`  Max Budget: ${info.max_budget ? `$${info.max_budget}` : "unlimited"}`);
    console.log(`  Budget Duration: ${info.budget_duration || "none"}`);
    console.log(`  Team: ${info.team_id || "none"}`);
    console.log(`  Organization: ${info.organization_id || "none"}`);
    console.log(`  Created: ${info.created_at}`);
    
    if (info.keys?.length) {
      console.log(`\n  Keys: ${info.keys.length}`);
      for (const key of info.keys) {
        console.log(`    • ${key.key_alias || key.key_name || "unnamed"}`);
        console.log(`      Spend: $${key.spend?.toFixed(4) || "0.0000"}`);
      }
    }
  },

  async update() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: users.ts update '<json-config>'");
      console.error(`
Example:
  bun run users.ts update '{
    "user_id": "user-123",
    "max_budget": 200,
    "user_role": "proxy_admin"
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.users.update(config);
    console.log("\n✅ User updated:\n");
    console.log(JSON.stringify(result, null, 2));
  },

  async delete() {
    const userId = process.argv[3];
    if (!userId) {
      console.error("Usage: users.ts delete <user-id>");
      process.exit(1);
    }

    const result = await client.users.delete([userId]);
    console.log("\n✅ User deleted:");
    console.log(`  Deleted: ${result.deleted_users.join(", ")}`);
  },

  async activity() {
    const startDate = process.argv[3];
    const endDate = process.argv[4];
    
    console.log("\n📈 Daily Activity:\n");
    
    const result = await client.users.dailyActivity({
      start_date: startDate,
      end_date: endDate,
    });
    
    for (const day of result.results) {
      console.log(`  ${day.date}:`);
      console.log(`    Spend: $${day.metrics.spend.toFixed(4)}`);
      console.log(`    Requests: ${day.metrics.api_requests}`);
      console.log(`    Tokens: ${day.metrics.total_tokens.toLocaleString()}`);
      console.log("");
    }
    
    console.log("  Totals:");
    console.log(`    Spend: $${result.metadata.total_spend.toFixed(4)}`);
    console.log(`    Requests: ${result.metadata.total_api_requests}`);
  },

  async "quick-add"() {
    const email = process.argv[3];
    const role = (process.argv[4] || "internal_user") as string;
    const budget = process.argv[5] ? parseFloat(process.argv[5]) : undefined;
    
    if (!email) {
      console.error("Usage: users.ts quick-add <email> [role] [budget]");
      console.error("  role: internal_user (default), proxy_admin, internal_user_view_only");
      process.exit(1);
    }

    const result = await client.users.create({
      user_email: email,
      user_role: role as "internal_user" | "proxy_admin",
      max_budget: budget,
      auto_create_key: true,
      key_alias: email.split("@")[0],
    });
    
    console.log("\n✅ User created:\n");
    console.log(`  Email: ${email}`);
    console.log(`  Role: ${role}`);
    console.log(`  Budget: ${budget ? `$${budget}` : "unlimited"}`);
    
    if (result.key) {
      console.log(`\n  API Key: ${result.key}`);
    }
  },
};

async function main() {
  const command = process.argv[2] || "list";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
LiteLLM User Management

Usage:
  bun run users.ts <command> [args]

Commands:
  list                    List all users
  create <json>           Create a new user
  info [user-id]          Get user information
  update <json>           Update user settings
  delete <user-id>        Delete a user
  activity [start] [end]  Get daily activity
  quick-add <email> ...   Quick add user with email

User Roles:
  proxy_admin             Full admin access
  proxy_admin_view_only   Admin read-only access
  internal_user           Standard user (default)
  internal_user_view_only User read-only access

User Creation Options (JSON):
  {
    "user_email": "dev@example.com",
    "user_id": "custom-id",
    "user_role": "internal_user",
    "max_budget": 100,
    "budget_duration": "monthly",
    "models": ["gpt-4o"],
    "team_id": "team-123",
    "auto_create_key": true,
    "key_alias": "dev-key"
  }

Examples:
  bun run users.ts quick-add dev@example.com
  bun run users.ts quick-add dev@example.com internal_user 100
  bun run users.ts activity 2024-01-01 2024-12-31

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
