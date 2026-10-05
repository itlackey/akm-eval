#!/usr/bin/env bun
/**
 * LiteLLM Spend Tracking CLI
 */

import { LiteLLMClient } from "../lib/client.ts";

const client = new LiteLLMClient();

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString();
}

const commands: Record<string, () => Promise<void>> = {
  async report() {
    const startDate = process.argv[3];
    const endDate = process.argv[4];
    
    console.log("\n💰 Spend Report\n");
    
    const report = await client.spend.getReport({
      start_date: startDate,
      end_date: endDate,
    });
    
    console.log(`  Total Spend: ${formatCurrency(report.spend)}`);
    
    if (report.max_budget) {
      const percentage = ((report.spend / report.max_budget) * 100).toFixed(1);
      console.log(`  Max Budget: ${formatCurrency(report.max_budget)}`);
      console.log(`  Usage: ${percentage}%`);
    }
    
    if (report.budget_duration) {
      console.log(`  Budget Duration: ${report.budget_duration}`);
    }
    
    if (report.budget_reset_at) {
      console.log(`  Budget Resets: ${formatDate(report.budget_reset_at)}`);
    }
    
    if (report.breakdown?.length) {
      console.log("\n  Breakdown:");
      for (const item of report.breakdown) {
        console.log(`    • ${item.group}: ${formatCurrency(item.spend)}`);
        console.log(`      Tokens: ${item.tokens.toLocaleString()}`);
        console.log(`      Requests: ${item.requests.toLocaleString()}`);
      }
    }
  },

  async logs() {
    const pageSize = parseInt(process.argv[3] || "20");
    
    console.log("\n📋 Spend Logs\n");
    
    const result = await client.spend.getLogs({
      page_size: pageSize,
    });
    
    console.log(`Showing ${result.logs.length} of ${result.total} logs\n`);
    
    for (const log of result.logs) {
      console.log(`  ${log.request_id}`);
      console.log(`    Model: ${log.model_group} (${log.model})`);
      console.log(`    Spend: ${formatCurrency(log.spend)}`);
      console.log(`    Tokens: ${log.total_tokens} (${log.prompt_tokens}+${log.completion_tokens})`);
      console.log(`    Status: ${log.status}`);
      console.log(`    Time: ${log.startTime}`);
      if (log.request_tags?.length) {
        console.log(`    Tags: ${log.request_tags.join(", ")}`);
      }
      console.log("");
    }
  },

  async keys() {
    const startDate = process.argv[3];
    const endDate = process.argv[4];
    
    console.log("\n🔑 Spend by Keys\n");
    
    const result = await client.spend.byKeys({
      start_date: startDate,
      end_date: endDate,
    });
    
    const entries = Object.entries(result).sort((a, b) => b[1] - a[1]);
    
    if (entries.length === 0) {
      console.log("  No spend data found");
      return;
    }
    
    let total = 0;
    for (const [key, spend] of entries) {
      console.log(`  ${key.substring(0, 20)}...: ${formatCurrency(spend)}`);
      total += spend;
    }
    
    console.log(`\n  Total: ${formatCurrency(total)}`);
  },

  async users() {
    const startDate = process.argv[3];
    const endDate = process.argv[4];
    
    console.log("\n👤 Spend by Users\n");
    
    const result = await client.spend.byUsers({
      start_date: startDate,
      end_date: endDate,
    });
    
    const entries = Object.entries(result).sort((a, b) => b[1] - a[1]);
    
    if (entries.length === 0) {
      console.log("  No spend data found");
      return;
    }
    
    let total = 0;
    for (const [user, spend] of entries) {
      console.log(`  ${user}: ${formatCurrency(spend)}`);
      total += spend;
    }
    
    console.log(`\n  Total: ${formatCurrency(total)}`);
  },

  async teams() {
    const startDate = process.argv[3];
    const endDate = process.argv[4];
    
    console.log("\n👥 Spend by Teams\n");
    
    const result = await client.spend.byTeams({
      start_date: startDate,
      end_date: endDate,
    });
    
    const entries = Object.entries(result).sort((a, b) => b[1] - a[1]);
    
    if (entries.length === 0) {
      console.log("  No spend data found");
      return;
    }
    
    let total = 0;
    for (const [team, spend] of entries) {
      console.log(`  ${team}: ${formatCurrency(spend)}`);
      total += spend;
    }
    
    console.log(`\n  Total: ${formatCurrency(total)}`);
  },

  async tags() {
    const startDate = process.argv[3];
    const endDate = process.argv[4];
    
    console.log("\n🏷️  Spend by Tags\n");
    
    const result = await client.spend.byTags({
      start_date: startDate,
      end_date: endDate,
    });
    
    const entries = Object.entries(result).sort((a, b) => b[1] - a[1]);
    
    if (entries.length === 0) {
      console.log("  No spend data found");
      return;
    }
    
    let total = 0;
    for (const [tag, spend] of entries) {
      console.log(`  ${tag}: ${formatCurrency(spend)}`);
      total += spend;
    }
    
    console.log(`\n  Total: ${formatCurrency(total)}`);
  },

  async reset() {
    console.log("\n⚠️  Resetting all spend counters...\n");
    
    const result = await client.spend.reset();
    
    console.log(`  Status: ${result.status}`);
    console.log(`  Message: ${result.message}`);
  },

  async summary() {
    console.log("\n📊 Spend Summary\n");
    console.log("═".repeat(50));
    
    // Get overall report
    const report = await client.spend.getReport();
    console.log(`\n  Total Spend: ${formatCurrency(report.spend)}`);
    if (report.max_budget) {
      console.log(`  Max Budget: ${formatCurrency(report.max_budget)}`);
    }
    
    // Get top spenders
    console.log("\n  Top Spending Teams:");
    const teams = await client.spend.byTeams();
    const topTeams = Object.entries(teams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [team, spend] of topTeams) {
      console.log(`    • ${team}: ${formatCurrency(spend)}`);
    }
    
    console.log("\n  Top Spending Users:");
    const users = await client.spend.byUsers();
    const topUsers = Object.entries(users)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [user, spend] of topUsers) {
      console.log(`    • ${user}: ${formatCurrency(spend)}`);
    }
    
    console.log("\n" + "═".repeat(50));
  },

  async activity() {
    const startDate = process.argv[3];
    const endDate = process.argv[4];
    
    console.log("\n📈 User Daily Activity\n");
    
    const result = await client.users.dailyActivity({
      start_date: startDate,
      end_date: endDate,
    });
    
    console.log("Daily Breakdown:");
    for (const day of result.results) {
      console.log(`\n  ${day.date}:`);
      console.log(`    Spend: ${formatCurrency(day.metrics.spend)}`);
      console.log(`    Tokens: ${day.metrics.total_tokens.toLocaleString()}`);
      console.log(`    Requests: ${day.metrics.api_requests}`);
    }
    
    console.log("\n  Totals:");
    console.log(`    Spend: ${formatCurrency(result.metadata.total_spend)}`);
    console.log(`    Tokens: ${(result.metadata.total_prompt_tokens + result.metadata.total_completion_tokens).toLocaleString()}`);
    console.log(`    Requests: ${result.metadata.total_api_requests}`);
  },
};

async function main() {
  const command = process.argv[2] || "summary";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
LiteLLM Spend Tracking

Usage:
  bun run spend.ts <command> [args]

Commands:
  report [start] [end]    Get spend report
  logs [page-size]        Get spend logs
  keys [start] [end]      Spend breakdown by keys
  users [start] [end]     Spend breakdown by users
  teams [start] [end]     Spend breakdown by teams
  tags [start] [end]      Spend breakdown by tags
  activity [start] [end]  Get daily activity
  summary                 Overall spend summary
  reset                   Reset all spend counters

Date Format:
  YYYY-MM-DD (e.g., 2024-01-01)

Examples:
  bun run spend.ts report                           # Current period
  bun run spend.ts report 2024-01-01 2024-12-31    # Custom range
  bun run spend.ts teams 2024-01-01                # Teams from date
  bun run spend.ts logs 50                         # Last 50 logs

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
