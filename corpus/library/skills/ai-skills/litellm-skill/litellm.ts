#!/usr/bin/env bun
/**
 * LiteLLM Management CLI - Unified Entry Point
 * 
 * A comprehensive CLI for managing LiteLLM proxy instances.
 */

import { LiteLLMClient } from "./lib/client.ts";

const client = new LiteLLMClient();

const HELP = `
╔═══════════════════════════════════════════════════════════════════╗
║                    LiteLLM Management CLI                        ║
╚═══════════════════════════════════════════════════════════════════╝

Usage:
  bun run litellm.ts <resource> <action> [args]
  bun run litellm.ts <resource>:<action> [args]

Resources:
  models      Manage model deployments
  keys        Manage virtual API keys
  users       Manage users
  teams       Manage teams
  orgs        Manage organizations
  budgets     Manage budget templates
  customers   Manage end-user customers
  health      Health monitoring
  spend       Spend tracking and reports
  config      Configuration management

Quick Commands:
  status      Show proxy status and health
  version     Show LiteLLM version
  help        Show this help

Examples:
  bun run litellm.ts status
  bun run litellm.ts models list
  bun run litellm.ts keys:generate
  bun run litellm.ts teams create '{"team_alias":"dev"}'
  bun run litellm.ts health check

Environment:
  LITELLM_API_BASE      LiteLLM proxy URL (default: http://localhost:4000)
  LITELLM_MASTER_KEY    Master key for admin operations

For resource-specific help:
  bun run litellm.ts <resource> help
`;

async function showStatus() {
  console.log("\n🔍 LiteLLM Proxy Status\n");
  console.log("═".repeat(50));
  
  try {
    // Check liveliness
    const live = await client.health.liveliness();
    console.log(`\n  Liveliness: ✅ ${live.status}`);
  } catch (error) {
    console.log(`\n  Liveliness: ❌ ${(error as Error).message}`);
  }
  
  try {
    // Check readiness
    const ready = await client.health.readiness();
    console.log(`  Database: ${ready.db === "connected" ? "✅" : "❌"} ${ready.db}`);
    console.log(`  Version: ${ready.litellm_version}`);
  } catch (error) {
    console.log(`  Readiness: ❌ ${(error as Error).message}`);
  }
  
  try {
    // Count models
    const models = await client.models.list();
    console.log(`  Models: ${models.data.length}`);
  } catch {
    // Ignore
  }
  
  try {
    // Check health
    const health = await client.health.check();
    console.log(`  Healthy: ${health.healthy_count}`);
    console.log(`  Unhealthy: ${health.unhealthy_count}`);
  } catch {
    // Ignore
  }
  
  console.log("\n" + "═".repeat(50));
}

async function runCommand(resource: string, action: string, args: string[]) {
  switch (resource) {
    case "models":
      switch (action) {
        case "list":
          console.log(JSON.stringify(await client.models.list(), null, 2));
          break;
        case "info":
          console.log(JSON.stringify(await client.models.info(args[0]), null, 2));
          break;
        case "add":
          console.log(JSON.stringify(await client.models.add(JSON.parse(args[0])), null, 2));
          break;
        case "delete":
          console.log(JSON.stringify(await client.models.delete(args[0]), null, 2));
          break;
        case "help":
          console.log("\nModels: list, info [id], add <json>, delete <id>");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "keys":
      switch (action) {
        case "list":
          console.log(JSON.stringify(await client.keys.list(), null, 2));
          break;
        case "generate":
          const config = args[0] ? JSON.parse(args[0]) : {};
          console.log(JSON.stringify(await client.keys.generate(config), null, 2));
          break;
        case "info":
          console.log(JSON.stringify(await client.keys.info(args[0]), null, 2));
          break;
        case "delete":
          console.log(JSON.stringify(await client.keys.delete([args[0]]), null, 2));
          break;
        case "rotate":
          console.log(JSON.stringify(await client.keys.regenerate(args[0]), null, 2));
          break;
        case "help":
          console.log("\nKeys: list, generate [json], info <key>, delete <key>, rotate <key>");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "users":
      switch (action) {
        case "list":
          console.log(JSON.stringify(await client.users.list(), null, 2));
          break;
        case "create":
          console.log(JSON.stringify(await client.users.create(JSON.parse(args[0])), null, 2));
          break;
        case "info":
          console.log(JSON.stringify(await client.users.info(args[0]), null, 2));
          break;
        case "delete":
          console.log(JSON.stringify(await client.users.delete([args[0]]), null, 2));
          break;
        case "help":
          console.log("\nUsers: list, create <json>, info [id], delete <id>");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "teams":
      switch (action) {
        case "list":
          console.log(JSON.stringify(await client.teams.list(), null, 2));
          break;
        case "create":
          console.log(JSON.stringify(await client.teams.create(JSON.parse(args[0])), null, 2));
          break;
        case "info":
          console.log(JSON.stringify(await client.teams.info(args[0]), null, 2));
          break;
        case "delete":
          console.log(JSON.stringify(await client.teams.delete([args[0]]), null, 2));
          break;
        case "add-member":
          console.log(JSON.stringify(await client.teams.addMember({
            team_id: args[0],
            member: JSON.parse(args[1])
          }), null, 2));
          break;
        case "help":
          console.log("\nTeams: list, create <json>, info <id>, delete <id>, add-member <id> <json>");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "orgs":
      switch (action) {
        case "list":
          console.log(JSON.stringify(await client.organizations.list(), null, 2));
          break;
        case "create":
          console.log(JSON.stringify(await client.organizations.create(JSON.parse(args[0])), null, 2));
          break;
        case "info":
          console.log(JSON.stringify(await client.organizations.info(args[0]), null, 2));
          break;
        case "help":
          console.log("\nOrgs: list, create <json>, info <id>");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "budgets":
      switch (action) {
        case "list":
          console.log(JSON.stringify(await client.budgets.list(), null, 2));
          break;
        case "create":
          console.log(JSON.stringify(await client.budgets.create(JSON.parse(args[0])), null, 2));
          break;
        case "info":
          console.log(JSON.stringify(await client.budgets.info(args[0]), null, 2));
          break;
        case "delete":
          console.log(JSON.stringify(await client.budgets.delete(args[0]), null, 2));
          break;
        case "help":
          console.log("\nBudgets: list, create <json>, info <id>, delete <id>");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "customers":
      switch (action) {
        case "list":
          console.log(JSON.stringify(await client.customers.list(), null, 2));
          break;
        case "create":
          console.log(JSON.stringify(await client.customers.create(JSON.parse(args[0])), null, 2));
          break;
        case "info":
          console.log(JSON.stringify(await client.customers.info(args[0]), null, 2));
          break;
        case "help":
          console.log("\nCustomers: list, create <json>, info <id>");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "health":
      switch (action) {
        case "check":
          console.log(JSON.stringify(await client.health.check(args[0]), null, 2));
          break;
        case "ready":
          console.log(JSON.stringify(await client.health.readiness(), null, 2));
          break;
        case "live":
          console.log(JSON.stringify(await client.health.liveliness(), null, 2));
          break;
        case "services":
          console.log(JSON.stringify(await client.health.services(), null, 2));
          break;
        case "help":
          console.log("\nHealth: check [model], ready, live, services");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "spend":
      switch (action) {
        case "report":
          console.log(JSON.stringify(await client.spend.getReport({
            start_date: args[0],
            end_date: args[1]
          }), null, 2));
          break;
        case "logs":
          console.log(JSON.stringify(await client.spend.getLogs({
            page_size: args[0] ? parseInt(args[0]) : 20
          }), null, 2));
          break;
        case "keys":
          console.log(JSON.stringify(await client.spend.byKeys(), null, 2));
          break;
        case "teams":
          console.log(JSON.stringify(await client.spend.byTeams(), null, 2));
          break;
        case "users":
          console.log(JSON.stringify(await client.spend.byUsers(), null, 2));
          break;
        case "reset":
          console.log(JSON.stringify(await client.spend.reset(), null, 2));
          break;
        case "help":
          console.log("\nSpend: report [start] [end], logs [n], keys, teams, users, reset");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    case "config":
      switch (action) {
        case "get":
          console.log(JSON.stringify(await client.config.get(), null, 2));
          break;
        case "list":
          console.log(JSON.stringify(await client.config.list(), null, 2));
          break;
        case "update":
          console.log(JSON.stringify(await client.config.update(JSON.parse(args[0])), null, 2));
          break;
        case "help":
          console.log("\nConfig: get, list, update <json>");
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
      break;

    default:
      console.error(`Unknown resource: ${resource}`);
      console.log(HELP);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  const first = args[0];

  // Handle quick commands
  if (first === "status") {
    await showStatus();
    return;
  }

  if (first === "version") {
    try {
      const ready = await client.health.readiness();
      console.log(`LiteLLM version: ${ready.litellm_version}`);
    } catch (error) {
      console.error("Could not get version:", (error as Error).message);
    }
    return;
  }

  // Parse resource:action or resource action
  let resource: string;
  let action: string;
  let restArgs: string[];

  if (first.includes(":")) {
    const [r, a] = first.split(":");
    resource = r;
    action = a;
    restArgs = args.slice(1);
  } else {
    resource = first;
    action = args[1] || "list";
    restArgs = args.slice(2);
  }

  try {
    await runCommand(resource, action, restArgs);
  } catch (error) {
    console.error("\n❌ Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
