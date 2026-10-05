#!/usr/bin/env bun
/**
 * LiteLLM Configuration Management CLI
 */

import { LiteLLMClient } from "../lib/client.ts";
import { LiteLLMConfigManager } from "../lib/yaml-manager.ts";

const client = new LiteLLMClient();

const commands: Record<string, () => Promise<void>> = {
  async get() {
    console.log("\n⚙️ Current Configuration:\n");
    const config = await client.config.get();
    console.log(JSON.stringify(config, null, 2));
  },

  async list() {
    console.log("\n📋 Configuration Keys:\n");
    const keys = await client.config.list();
    for (const key of keys) {
      console.log(`  • ${key}`);
    }
  },

  async field() {
    const fieldName = process.argv[3];
    if (!fieldName) {
      console.error("Usage: config.ts field <field-name>");
      process.exit(1);
    }

    const info = await client.config.fieldInfo(fieldName);
    console.log(`\n📋 Field Info: ${fieldName}\n`);
    console.log(JSON.stringify(info, null, 2));
  },

  async update() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: config.ts update '<json-config>'");
      console.error(`
Example:
  bun run config.ts update '{
    "general_settings": {
      "alerting": ["slack"]
    }
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.config.update(config);
    console.log("\n✅ Configuration updated:");
    console.log(`  ${result.message}`);
  },

  // YAML file operations
  async "yaml-show"() {
    const filePath = process.argv[3] || "./config.yaml";
    const manager = new LiteLLMConfigManager(filePath);
    
    try {
      await manager.load();
      console.log("\n📄 Config YAML:\n");
      console.log(manager.toYaml());
    } catch (error) {
      console.error(`\n❌ Error reading ${filePath}:`, (error as Error).message);
      process.exit(1);
    }
  },

  async "yaml-validate"() {
    const filePath = process.argv[3] || "./config.yaml";
    const manager = new LiteLLMConfigManager(filePath);
    
    try {
      await manager.load();
      const result = manager.validate();
      
      if (result.valid) {
        console.log("\n✅ Configuration is valid");
      } else {
        console.log("\n❌ Configuration has errors:");
        for (const error of result.errors) {
          console.log(`  • ${error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(`\n❌ Error reading ${filePath}:`, (error as Error).message);
      process.exit(1);
    }
  },

  async "yaml-add-model"() {
    const filePath = process.argv[3];
    const modelJson = process.argv[4];
    
    if (!filePath || !modelJson) {
      console.error("Usage: config.ts yaml-add-model <file> '<model-json>'");
      console.error(`
Example:
  bun run config.ts yaml-add-model config.yaml '{
    "model_name": "gpt-4o",
    "litellm_params": {
      "model": "openai/gpt-4o",
      "api_key": "os.environ/OPENAI_API_KEY"
    }
  }'
`);
      process.exit(1);
    }

    const manager = new LiteLLMConfigManager(filePath);
    await manager.load();
    
    const model = JSON.parse(modelJson);
    manager.addModel(model);
    await manager.save();
    
    console.log(`\n✅ Added model: ${model.model_name}`);
    console.log(`  File: ${filePath}`);
  },

  async "yaml-remove-model"() {
    const filePath = process.argv[3];
    const modelName = process.argv[4];
    
    if (!filePath || !modelName) {
      console.error("Usage: config.ts yaml-remove-model <file> <model-name>");
      process.exit(1);
    }

    const manager = new LiteLLMConfigManager(filePath);
    await manager.load();
    
    const removed = manager.removeModel(modelName);
    
    if (removed) {
      await manager.save();
      console.log(`\n✅ Removed model: ${modelName}`);
    } else {
      console.log(`\n❌ Model not found: ${modelName}`);
      process.exit(1);
    }
  },

  async "yaml-create"() {
    const filePath = process.argv[3];
    
    if (!filePath) {
      console.error("Usage: config.ts yaml-create <file>");
      process.exit(1);
    }

    const config = LiteLLMConfigManager.createProductionTemplate({
      masterKey: "sk-your-master-key-here",
      databaseUrl: "postgresql://user:password@localhost:5432/litellm",
      models: [
        {
          model_name: "gpt-4o",
          litellm_params: {
            model: "openai/gpt-4o",
            api_key: "os.environ/OPENAI_API_KEY",
          },
          model_info: {
            description: "OpenAI GPT-4o",
          },
        },
        {
          model_name: "claude-3-sonnet",
          litellm_params: {
            model: "anthropic/claude-3-sonnet-20240229",
            api_key: "os.environ/ANTHROPIC_API_KEY",
          },
          model_info: {
            description: "Anthropic Claude 3 Sonnet",
          },
        },
      ],
    });

    const manager = new LiteLLMConfigManager(filePath);
    manager.setConfig(config);
    await manager.save();
    
    console.log(`\n✅ Created config template: ${filePath}`);
    console.log("\n  Remember to update:");
    console.log("    • master_key");
    console.log("    • database_url");
    console.log("    • API keys in environment");
  },

  async "yaml-set-master-key"() {
    const filePath = process.argv[3];
    const masterKey = process.argv[4];
    
    if (!filePath || !masterKey) {
      console.error("Usage: config.ts yaml-set-master-key <file> <key>");
      process.exit(1);
    }

    const manager = new LiteLLMConfigManager(filePath);
    await manager.load();
    manager.setMasterKey(masterKey);
    await manager.save();
    
    console.log("\n✅ Master key updated");
  },

  async "yaml-set-database"() {
    const filePath = process.argv[3];
    const dbUrl = process.argv[4];
    
    if (!filePath || !dbUrl) {
      console.error("Usage: config.ts yaml-set-database <file> <database-url>");
      process.exit(1);
    }

    const manager = new LiteLLMConfigManager(filePath);
    await manager.load();
    manager.setDatabaseUrl(dbUrl);
    await manager.save();
    
    console.log("\n✅ Database URL updated");
  },

  async "yaml-list-models"() {
    const filePath = process.argv[3] || "./config.yaml";
    const manager = new LiteLLMConfigManager(filePath);
    
    await manager.load();
    const models = manager.getModels();
    
    console.log("\n📦 Models in Config:\n");
    
    if (models.length === 0) {
      console.log("  No models configured");
      return;
    }
    
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      console.log(`  [${i}] ${model.model_name}`);
      console.log(`      Provider: ${model.litellm_params.model}`);
      if (model.litellm_params.api_base) {
        console.log(`      API Base: ${model.litellm_params.api_base}`);
      }
      if (model.model_info?.description) {
        console.log(`      Description: ${model.model_info.description}`);
      }
      console.log("");
    }
    
    console.log(`Total: ${models.length} models`);
  },
};

async function main() {
  const command = process.argv[2] || "get";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
LiteLLM Configuration Management

Usage:
  bun run config.ts <command> [args]

API Commands (remote):
  get                           Get current config from proxy
  list                          List configuration keys
  field <name>                  Get field-specific info
  update <json>                 Update configuration

YAML Commands (local file):
  yaml-show [file]              Show YAML configuration
  yaml-validate [file]          Validate YAML configuration
  yaml-add-model <file> <json>  Add model to YAML
  yaml-remove-model <f> <name>  Remove model from YAML
  yaml-create <file>            Create production template
  yaml-set-master-key <f> <k>   Set master key in YAML
  yaml-set-database <f> <url>   Set database URL in YAML
  yaml-list-models [file]       List models in YAML

Examples:
  bun run config.ts get
  bun run config.ts yaml-create config.yaml
  bun run config.ts yaml-add-model config.yaml '{"model_name":"gpt-4o",...}'
  bun run config.ts yaml-validate config.yaml

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
