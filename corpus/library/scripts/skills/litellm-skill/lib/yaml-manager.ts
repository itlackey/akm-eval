#!/usr/bin/env bun
// LiteLLM YAML Manager — CLI + programmatic API
// Minimal usage: ./yaml-manager.ts <command> [options]
/**
 * LiteLLM Configuration YAML Manager
 * Manage LiteLLM config.yaml files programmatically
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  LiteLLMConfig,
  ModelConfig,
  GeneralSettings,
  LiteLLMSettings,
  RouterSettings,
  PassThroughEndpoint,
  GuardrailConfig,
} from "./types.ts";

export class LiteLLMConfigManager {
  private config: LiteLLMConfig;
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || "./config.yaml";
    this.config = {
      model_list: [],
    };
  }

  /**
   * Load configuration from a YAML file
   */
  async load(filePath?: string): Promise<LiteLLMConfig> {
    const path = filePath || this.filePath;
    try {
      const content = await Bun.file(path).text();
      this.config = parseYaml(content) as LiteLLMConfig;
      return this.config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, return empty config
        return this.config;
      }
      throw error;
    }
  }

  /**
   * Save configuration to a YAML file
   */
  async save(filePath?: string): Promise<void> {
    const path = filePath || this.filePath;
    const content = stringifyYaml(this.config, {
      indent: 2,
      lineWidth: 120,
    });
    await Bun.write(path, content);
  }

  /**
   * Get the current configuration
   */
  getConfig(): LiteLLMConfig {
    return this.config;
  }

  /**
   * Set the entire configuration
   */
  setConfig(config: LiteLLMConfig): void {
    this.config = config;
  }

  // ============================================================================
  // Model Management
  // ============================================================================

  /**
   * Add a model to the configuration
   */
  addModel(model: ModelConfig): void {
    if (!this.config.model_list) {
      this.config.model_list = [];
    }
    this.config.model_list.push(model);
  }

  /**
   * Remove a model by name (removes all deployments with that name)
   */
  removeModel(modelName: string): boolean {
    if (!this.config.model_list) return false;
    const initialLength = this.config.model_list.length;
    this.config.model_list = this.config.model_list.filter(
      (m) => m.model_name !== modelName
    );
    return this.config.model_list.length < initialLength;
  }

  /**
   * Remove a specific model deployment by index
   */
  removeModelByIndex(index: number): boolean {
    if (!this.config.model_list || index < 0 || index >= this.config.model_list.length) {
      return false;
    }
    this.config.model_list.splice(index, 1);
    return true;
  }

  /**
   * Get all models
   */
  getModels(): ModelConfig[] {
    return this.config.model_list || [];
  }

  /**
   * Find models by name
   */
  findModelsByName(modelName: string): ModelConfig[] {
    return (this.config.model_list || []).filter((m) => m.model_name === modelName);
  }

  /**
   * Update a model at a specific index
   */
  updateModel(index: number, updates: Partial<ModelConfig>): boolean {
    if (!this.config.model_list || index < 0 || index >= this.config.model_list.length) {
      return false;
    }
    this.config.model_list[index] = {
      ...this.config.model_list[index],
      ...updates,
      litellm_params: {
        ...this.config.model_list[index].litellm_params,
        ...updates.litellm_params,
      },
      model_info: {
        ...this.config.model_list[index].model_info,
        ...updates.model_info,
      },
    };
    return true;
  }

  // ============================================================================
  // General Settings
  // ============================================================================

  /**
   * Set general settings
   */
  setGeneralSettings(settings: GeneralSettings): void {
    this.config.general_settings = {
      ...this.config.general_settings,
      ...settings,
    };
  }

  /**
   * Get general settings
   */
  getGeneralSettings(): GeneralSettings | undefined {
    return this.config.general_settings;
  }

  /**
   * Set master key
   */
  setMasterKey(key: string): void {
    if (!this.config.general_settings) {
      this.config.general_settings = {};
    }
    this.config.general_settings.master_key = key;
  }

  /**
   * Set database URL
   */
  setDatabaseUrl(url: string): void {
    if (!this.config.general_settings) {
      this.config.general_settings = {};
    }
    this.config.general_settings.database_url = url;
  }

  // ============================================================================
  // LiteLLM Settings
  // ============================================================================

  /**
   * Set litellm settings
   */
  setLiteLLMSettings(settings: LiteLLMSettings): void {
    this.config.litellm_settings = {
      ...this.config.litellm_settings,
      ...settings,
    };
  }

  /**
   * Get litellm settings
   */
  getLiteLLMSettings(): LiteLLMSettings | undefined {
    return this.config.litellm_settings;
  }

  /**
   * Configure caching
   */
  setCache(params: LiteLLMSettings["cache_params"]): void {
    if (!this.config.litellm_settings) {
      this.config.litellm_settings = {};
    }
    this.config.litellm_settings.cache = true;
    this.config.litellm_settings.cache_params = params;
  }

  /**
   * Set fallbacks for a model
   */
  setFallbacks(model: string, fallbacks: string[]): void {
    if (!this.config.litellm_settings) {
      this.config.litellm_settings = {};
    }
    if (!this.config.litellm_settings.fallbacks) {
      this.config.litellm_settings.fallbacks = [];
    }
    // Remove existing fallback for this model
    this.config.litellm_settings.fallbacks = this.config.litellm_settings.fallbacks.filter(
      (f) => !Object.keys(f).includes(model)
    );
    // Add new fallback
    this.config.litellm_settings.fallbacks.push({ [model]: fallbacks });
  }

  // ============================================================================
  // Router Settings
  // ============================================================================

  /**
   * Set router settings
   */
  setRouterSettings(settings: RouterSettings): void {
    this.config.router_settings = {
      ...this.config.router_settings,
      ...settings,
    };
  }

  /**
   * Get router settings
   */
  getRouterSettings(): RouterSettings | undefined {
    return this.config.router_settings;
  }

  /**
   * Set routing strategy
   */
  setRoutingStrategy(
    strategy: "simple-shuffle" | "least-busy" | "usage-based-routing" | "latency-based-routing"
  ): void {
    if (!this.config.router_settings) {
      this.config.router_settings = {};
    }
    this.config.router_settings.routing_strategy = strategy;
  }

  /**
   * Configure Redis for routing
   */
  setRedisConfig(host: string, port: number, password?: string): void {
    if (!this.config.router_settings) {
      this.config.router_settings = {};
    }
    this.config.router_settings.redis_host = host;
    this.config.router_settings.redis_port = port;
    if (password) {
      this.config.router_settings.redis_password = password;
    }
  }

  // ============================================================================
  // Environment Variables
  // ============================================================================

  /**
   * Set environment variables
   */
  setEnvironmentVariables(vars: Record<string, string>): void {
    this.config.environment_variables = {
      ...this.config.environment_variables,
      ...vars,
    };
  }

  /**
   * Get environment variables
   */
  getEnvironmentVariables(): Record<string, string> | undefined {
    return this.config.environment_variables;
  }

  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Validate the configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check model_list
    if (!this.config.model_list || this.config.model_list.length === 0) {
      errors.push("model_list is empty - at least one model is required");
    }

    // Validate each model
    for (let i = 0; i < (this.config.model_list || []).length; i++) {
      const model = this.config.model_list![i];
      
      if (!model.model_name) {
        errors.push(`Model at index ${i}: model_name is required`);
      }
      
      if (!model.litellm_params) {
        errors.push(`Model at index ${i}: litellm_params is required`);
      } else if (!model.litellm_params.model) {
        errors.push(`Model at index ${i}: litellm_params.model is required`);
      }
    }

    // Check for required general settings if database features are used
    if (this.config.general_settings?.database_url && !this.config.general_settings?.master_key) {
      errors.push("master_key is required when database_url is set");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Create a minimal valid configuration
   */
  static createMinimal(masterKey: string, models: ModelConfig[]): LiteLLMConfig {
    return {
      model_list: models,
      general_settings: {
        master_key: masterKey,
      },
    };
  }

  /**
   * Create a production-ready configuration template
   */
  static createProductionTemplate(options: {
    masterKey: string;
    databaseUrl: string;
    models: ModelConfig[];
    redisHost?: string;
    redisPort?: number;
    redisPassword?: string;
  }): LiteLLMConfig {
    const config: LiteLLMConfig = {
      model_list: options.models,
      general_settings: {
        master_key: options.masterKey,
        database_url: options.databaseUrl,
        database_connection_pool_limit: 10,
        database_connection_timeout: 60,
        background_health_checks: true,
        health_check_interval: 300,
        alerting: ["slack"],
      },
      litellm_settings: {
        drop_params: true,
        num_retries: 3,
        request_timeout: 600,
        success_callback: ["langfuse"],
        failure_callback: ["langfuse"],
      },
      router_settings: {
        routing_strategy: "simple-shuffle",
        num_retries: 2,
        timeout: 630,
      },
    };

    // Add Redis if configured
    if (options.redisHost) {
      config.router_settings!.redis_host = options.redisHost;
      config.router_settings!.redis_port = options.redisPort || 6379;
      if (options.redisPassword) {
        config.router_settings!.redis_password = options.redisPassword;
      }
      
      config.litellm_settings!.cache = true;
      config.litellm_settings!.cache_params = {
        type: "redis",
        host: options.redisHost,
        port: options.redisPort || 6379,
        password: options.redisPassword,
      };
    }

    return config;
  }

  /**
   * Merge two configurations
   */
  merge(other: Partial<LiteLLMConfig>): void {
    if (other.model_list) {
      this.config.model_list = [
        ...(this.config.model_list || []),
        ...other.model_list,
      ];
    }

    if (other.general_settings) {
      this.config.general_settings = {
        ...this.config.general_settings,
        ...other.general_settings,
      };
    }

    if (other.litellm_settings) {
      this.config.litellm_settings = {
        ...this.config.litellm_settings,
        ...other.litellm_settings,
      };
    }

    if (other.router_settings) {
      this.config.router_settings = {
        ...this.config.router_settings,
        ...other.router_settings,
      };
    }

    if (other.environment_variables) {
      this.config.environment_variables = {
        ...this.config.environment_variables,
        ...other.environment_variables,
      };
    }
  }

  /**
   * Export configuration as YAML string
   */
  toYaml(): string {
    return stringifyYaml(this.config, {
      indent: 2,
      lineWidth: 120,
    });
  }

  /**
   * Export configuration as JSON string
   */
  toJson(pretty = true): string {
    return JSON.stringify(this.config, null, pretty ? 2 : 0);
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const [command, ...rest] = args;

  if (!command) {
    console.log(`
LiteLLM Config Manager

Usage:
  bun run yaml-manager.ts <command> [options]

Commands:
  show <file>              Show configuration
  validate <file>          Validate configuration
  add-model <file> <json>  Add a model to config
  remove-model <file> <n>  Remove model by name
  set-master-key <f> <key> Set master key
  create-template <file>   Create production template

Examples:
  bun run yaml-manager.ts show config.yaml
  bun run yaml-manager.ts add-model config.yaml '{"model_name":"gpt-4o","litellm_params":{"model":"openai/gpt-4o"}}'
  bun run yaml-manager.ts validate config.yaml
`);
    process.exit(0);
  }

  const manager = new LiteLLMConfigManager();

  try {
    switch (command) {
      case "show": {
        await manager.load(rest[0]);
        console.log(manager.toYaml());
        break;
      }

      case "validate": {
        await manager.load(rest[0]);
        const result = manager.validate();
        if (result.valid) {
          console.log("✅ Configuration is valid");
        } else {
          console.log("❌ Configuration has errors:");
          result.errors.forEach((e) => console.log(`  - ${e}`));
          process.exit(1);
        }
        break;
      }

      case "add-model": {
        await manager.load(rest[0]);
        const model = JSON.parse(rest[1]) as ModelConfig;
        manager.addModel(model);
        await manager.save(rest[0]);
        console.log(`✅ Added model: ${model.model_name}`);
        break;
      }

      case "remove-model": {
        await manager.load(rest[0]);
        const removed = manager.removeModel(rest[1]);
        if (removed) {
          await manager.save(rest[0]);
          console.log(`✅ Removed model: ${rest[1]}`);
        } else {
          console.log(`❌ Model not found: ${rest[1]}`);
          process.exit(1);
        }
        break;
      }

      case "set-master-key": {
        await manager.load(rest[0]);
        manager.setMasterKey(rest[1]);
        await manager.save(rest[0]);
        console.log("✅ Master key updated");
        break;
      }

      case "create-template": {
        const config = LiteLLMConfigManager.createProductionTemplate({
          masterKey: "sk-your-master-key",
          databaseUrl: "postgresql://user:password@localhost:5432/litellm",
          models: [
            {
              model_name: "gpt-4o",
              litellm_params: {
                model: "openai/gpt-4o",
                api_key: "os.environ/OPENAI_API_KEY",
              },
            },
          ],
        });
        manager.setConfig(config);
        await manager.save(rest[0]);
        console.log(`✅ Created template: ${rest[0]}`);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}

export { LiteLLMConfigManager };
