#!/usr/bin/env bun
/**
 * LiteLLM Virtual Key Management CLI
 */

import { LiteLLMClient } from "../lib/client.ts";

const client = new LiteLLMClient();

const commands: Record<string, () => Promise<void>> = {
  async list() {
    const result = await client.keys.list();
    console.log("\n🔑 Virtual Keys:\n");
    
    for (const key of result.keys) {
      const alias = key.key_alias || key.key_name || "unnamed";
      const spend = key.spend?.toFixed(4) || "0.0000";
      const budget = key.max_budget ? `$${key.max_budget}` : "unlimited";
      const models = key.models?.length ? key.models.join(", ") : "all";
      
      console.log(`  • ${alias}`);
      console.log(`    Token: ${key.token.substring(0, 20)}...`);
      console.log(`    Spend: $${spend} / ${budget}`);
      console.log(`    Models: ${models}`);
      console.log(`    Team: ${key.team_id || "none"}`);
      console.log("");
    }
    
    console.log(`Total: ${result.total || result.keys.length} keys`);
  },

  async generate() {
    const configJson = process.argv[3];
    const config = configJson ? JSON.parse(configJson) : {};
    
    const result = await client.keys.generate(config);
    
    console.log("\n✅ Key generated successfully:\n");
    console.log(`  Key: ${result.key}`);
    console.log(`  Alias: ${result.key_name || "none"}`);
    console.log(`  Expires: ${result.expires || "never"}`);
    console.log(`  Max Budget: ${result.max_budget ? `$${result.max_budget}` : "unlimited"}`);
    console.log(`  Models: ${result.models?.length ? result.models.join(", ") : "all"}`);
    
    console.log("\n⚠️  Store this key securely - it won't be shown again!");
  },

  async info() {
    const key = process.argv[3];
    if (!key) {
      console.error("Usage: keys.ts info <key>");
      process.exit(1);
    }

    const info = await client.keys.info(key);
    console.log("\n📋 Key Info:\n");
    console.log(JSON.stringify(info, null, 2));
  },

  async update() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: keys.ts update '<json-config>'");
      console.error(`
Example:
  bun run keys.ts update '{
    "key": "sk-abc123...",
    "max_budget": 100,
    "models": ["gpt-4o", "claude-3-sonnet"]
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.keys.update(config);
    console.log("\n✅ Key updated:\n");
    console.log(JSON.stringify(result, null, 2));
  },

  async delete() {
    const key = process.argv[3];
    if (!key) {
      console.error("Usage: keys.ts delete <key>");
      process.exit(1);
    }

    const result = await client.keys.delete([key]);
    console.log("\n✅ Key deleted:");
    console.log(`  Deleted: ${result.deleted_keys.join(", ")}`);
  },

  async rotate() {
    const key = process.argv[3];
    if (!key) {
      console.error("Usage: keys.ts rotate <key> [json-config]");
      process.exit(1);
    }

    const configJson = process.argv[4];
    const config = configJson ? JSON.parse(configJson) : {};

    const result = await client.keys.regenerate(key, config);
    console.log("\n🔄 Key rotated:\n");
    console.log(`  New Key: ${result.key}`);
    console.log(`  Expires: ${result.expires || "never"}`);
    console.log("\n⚠️  Store the new key securely - the old key is now invalid!");
  },

  async health() {
    const key = process.argv[3];
    const result = await client.keys.health(key);
    console.log("\n💚 Key Health:");
    console.log(`  Status: ${result.status}`);
  },

  async "create-team-key"() {
    const teamId = process.argv[3];
    const budget = process.argv[4];
    
    if (!teamId) {
      console.error("Usage: keys.ts create-team-key <team-id> [max-budget]");
      process.exit(1);
    }

    const result = await client.keys.generate({
      team_id: teamId,
      max_budget: budget ? parseFloat(budget) : undefined,
      key_alias: `${teamId}-key`,
    });

    console.log("\n✅ Team key created:\n");
    console.log(`  Key: ${result.key}`);
    console.log(`  Team: ${teamId}`);
    console.log(`  Max Budget: ${result.max_budget ? `$${result.max_budget}` : "unlimited"}`);
  },

  async "create-user-key"() {
    const userId = process.argv[3];
    const budget = process.argv[4];
    
    if (!userId) {
      console.error("Usage: keys.ts create-user-key <user-id> [max-budget]");
      process.exit(1);
    }

    const result = await client.keys.generate({
      user_id: userId,
      max_budget: budget ? parseFloat(budget) : undefined,
      key_alias: `${userId}-key`,
    });

    console.log("\n✅ User key created:\n");
    console.log(`  Key: ${result.key}`);
    console.log(`  User: ${userId}`);
    console.log(`  Max Budget: ${result.max_budget ? `$${result.max_budget}` : "unlimited"}`);
  },
};

async function main() {
  const command = process.argv[2] || "list";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
LiteLLM Virtual Key Management

Usage:
  bun run keys.ts <command> [args]

Commands:
  list                        List all keys
  generate [json]             Generate a new key
  info <key>                  Get key information
  update <json>               Update key settings
  delete <key>                Delete/revoke a key
  rotate <key> [json]         Rotate a key
  health [key]                Check key health
  create-team-key <tid> [b]   Create key for a team
  create-user-key <uid> [b]   Create key for a user

Key Generation Options (JSON):
  {
    "key_alias": "my-key",
    "models": ["gpt-4o", "claude-3"],
    "max_budget": 100,
    "budget_duration": "30d",
    "rpm_limit": 100,
    "tpm_limit": 100000,
    "team_id": "team-123",
    "user_id": "user-456",
    "metadata": {}
  }

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
