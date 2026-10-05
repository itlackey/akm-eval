#!/usr/bin/env bun
/**
 * LiteLLM Health Monitoring CLI
 */

import { LiteLLMClient } from "../lib/client.ts";

const client = new LiteLLMClient();

const commands: Record<string, () => Promise<void>> = {
  async check() {
    const model = process.argv[3];
    console.log("\n🏥 Running health check...\n");
    
    const health = await client.health.check(model);
    
    console.log("✅ Healthy Endpoints:");
    if (health.healthy_endpoints?.length) {
      for (const endpoint of health.healthy_endpoints) {
        const region = endpoint["x-ms-region"] ? ` (${endpoint["x-ms-region"]})` : "";
        console.log(`  • ${endpoint.model}${region}`);
        if (endpoint.api_base) {
          console.log(`    ${endpoint.api_base}`);
        }
      }
    } else {
      console.log("  (none)");
    }
    
    console.log("\n❌ Unhealthy Endpoints:");
    if (health.unhealthy_endpoints?.length) {
      for (const endpoint of health.unhealthy_endpoints) {
        console.log(`  • ${endpoint.model}`);
        if (endpoint.api_base) {
          console.log(`    ${endpoint.api_base}`);
        }
        if (endpoint.error) {
          console.log(`    Error: ${endpoint.error}`);
        }
      }
    } else {
      console.log("  (none)");
    }
    
    console.log("\n📊 Summary:");
    console.log(`  Healthy: ${health.healthy_count}`);
    console.log(`  Unhealthy: ${health.unhealthy_count}`);
  },

  async ready() {
    console.log("\n🔍 Checking readiness...\n");
    
    const ready = await client.health.readiness();
    
    console.log(`  Status: ${ready.status === "connected" ? "✅" : "❌"} ${ready.status}`);
    console.log(`  Database: ${ready.db === "connected" ? "✅" : "❌"} ${ready.db}`);
    console.log(`  Cache: ${ready.cache || "not configured"}`);
    console.log(`  Version: ${ready.litellm_version}`);
    
    if (ready.success_callbacks?.length) {
      console.log(`\n  Success Callbacks:`);
      for (const cb of ready.success_callbacks) {
        console.log(`    • ${cb}`);
      }
    }
    
    if (ready.failure_callbacks?.length) {
      console.log(`\n  Failure Callbacks:`);
      for (const cb of ready.failure_callbacks) {
        console.log(`    • ${cb}`);
      }
    }
  },

  async live() {
    console.log("\n💓 Checking liveliness...\n");
    
    const live = await client.health.liveliness();
    console.log(`  Status: ${live.status === "healthy" ? "✅ healthy" : "❌ unhealthy"}`);
  },

  async services() {
    console.log("\n🔌 Checking services...\n");
    
    const services = await client.health.services();
    
    for (const [name, info] of Object.entries(services)) {
      const status = (info as { status: string }).status;
      const icon = status === "connected" || status === "healthy" ? "✅" : "❌";
      console.log(`  ${icon} ${name}: ${status}`);
    }
  },

  async all() {
    console.log("\n🏥 Complete Health Check\n");
    console.log("═".repeat(50));
    
    // Liveliness
    console.log("\n[Liveliness]");
    try {
      const live = await client.health.liveliness();
      console.log(`  ✅ Status: ${live.status}`);
    } catch (error) {
      console.log(`  ❌ Error: ${(error as Error).message}`);
    }
    
    // Readiness
    console.log("\n[Readiness]");
    try {
      const ready = await client.health.readiness();
      console.log(`  Status: ${ready.status === "connected" ? "✅" : "❌"} ${ready.status}`);
      console.log(`  Database: ${ready.db === "connected" ? "✅" : "❌"} ${ready.db}`);
      console.log(`  Version: ${ready.litellm_version}`);
    } catch (error) {
      console.log(`  ❌ Error: ${(error as Error).message}`);
    }
    
    // Model Health
    console.log("\n[Model Health]");
    try {
      const health = await client.health.check();
      console.log(`  Healthy: ${health.healthy_count}`);
      console.log(`  Unhealthy: ${health.unhealthy_count}`);
      
      if (health.unhealthy_endpoints?.length) {
        console.log("\n  ⚠️ Unhealthy models:");
        for (const endpoint of health.unhealthy_endpoints) {
          console.log(`    • ${endpoint.model}: ${endpoint.error || "unknown error"}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Error: ${(error as Error).message}`);
    }
    
    console.log("\n" + "═".repeat(50));
  },

  async watch() {
    const interval = parseInt(process.argv[3] || "30");
    console.log(`\n👁️  Watching health (every ${interval}s)...\n`);
    console.log("Press Ctrl+C to stop\n");
    
    const checkHealth = async () => {
      const timestamp = new Date().toLocaleTimeString();
      
      try {
        const [live, ready, health] = await Promise.all([
          client.health.liveliness().catch(() => ({ status: "error" })),
          client.health.readiness().catch(() => ({ status: "error", db: "error" })),
          client.health.check().catch(() => ({ healthy_count: 0, unhealthy_count: 0 })),
        ]);
        
        const liveIcon = live.status === "healthy" ? "✅" : "❌";
        const dbIcon = ready.db === "connected" ? "✅" : "❌";
        
        console.log(`[${timestamp}] Live: ${liveIcon} | DB: ${dbIcon} | Models: ${health.healthy_count}✅ ${health.unhealthy_count}❌`);
      } catch (error) {
        console.log(`[${timestamp}] ❌ Error: ${(error as Error).message}`);
      }
    };
    
    await checkHealth();
    setInterval(checkHealth, interval * 1000);
  },
};

async function main() {
  const command = process.argv[2] || "all";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
LiteLLM Health Monitoring

Usage:
  bun run health.ts <command> [args]

Commands:
  check [model]     Full health check (makes LLM calls)
  ready             Check readiness with DB status
  live              Check basic liveliness
  services          Check connected services
  all               Run all health checks
  watch [interval]  Continuous monitoring (default: 30s)

Examples:
  bun run health.ts                    # Run all checks
  bun run health.ts check              # Full model health check
  bun run health.ts check gpt-4o       # Check specific model
  bun run health.ts watch 10           # Watch every 10 seconds

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
