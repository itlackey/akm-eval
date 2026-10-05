#!/usr/bin/env bun
/**
 * LiteLLM Model Management CLI
 */

import { LiteLLMClient } from "../lib/client.ts";

const client = new LiteLLMClient();

const commands: Record<string, () => Promise<void>> = {
  async list() {
    const models = await client.models.list();
    console.log("\n📦 Available Models:\n");
    for (const model of models.data) {
      console.log(`  • ${model.id}`);
    }
    console.log(`\nTotal: ${models.data.length} models`);
  },

  async info() {
    const modelId = process.argv[3];
    const info = await client.models.info(modelId);
    console.log("\n📋 Model Info:\n");
    console.log(JSON.stringify(info, null, 2));
  },

  async add() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: models.ts add '<json-config>'");
      console.error(`
Example:
  bun run models.ts add '{
    "model_name": "gpt-4o",
    "litellm_params": {
      "model": "azure/gpt-4o-deployment",
      "api_base": "https://your-resource.openai.azure.com/",
      "api_key": "your-key",
      "api_version": "2024-08-01-preview"
    }
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.models.add(config);
    console.log("\n✅ Model added successfully:\n");
    console.log(JSON.stringify(result, null, 2));
  },

  async delete() {
    const modelId = process.argv[3];
    if (!modelId) {
      console.error("Usage: models.ts delete <model-id>");
      process.exit(1);
    }

    const result = await client.models.delete(modelId);
    console.log("\n✅ Model deleted:");
    console.log(result.message);
  },

  async update() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: models.ts update '<json-config>'");
      console.error(`
Example:
  bun run models.ts update '{
    "model_id": "abc123",
    "model_info": {
      "description": "Updated description"
    }
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.models.update(config);
    console.log("\n✅ Model updated:\n");
    console.log(JSON.stringify(result, null, 2));
  },

  async settings() {
    const settings = await client.models.getSettings();
    console.log("\n⚙️ Model Settings:\n");
    console.log(JSON.stringify(settings, null, 2));
  },

  async sync() {
    const result = await client.models.syncPricing();
    console.log("\n🔄 Pricing sync:");
    console.log(result.message);
  },
};

async function main() {
  const command = process.argv[2] || "list";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
LiteLLM Model Management

Usage:
  bun run models.ts <command> [args]

Commands:
  list              List all available models
  info [id]         Get model information
  add <json>        Add a new model deployment
  update <json>     Update an existing model
  delete <id>       Delete a model deployment
  settings          Get model settings
  sync              Sync pricing from GitHub

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
