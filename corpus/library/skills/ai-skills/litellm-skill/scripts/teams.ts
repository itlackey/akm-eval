#!/usr/bin/env bun
/**
 * LiteLLM Team Management CLI
 */

import { LiteLLMClient } from "../lib/client.ts";

const client = new LiteLLMClient();

const commands: Record<string, () => Promise<void>> = {
  async list() {
    const teams = await client.teams.list();
    console.log("\n👥 Teams:\n");
    
    for (const team of teams) {
      const spend = team.spend?.toFixed(4) || "0.0000";
      const budget = team.max_budget ? `$${team.max_budget}` : "unlimited";
      
      console.log(`  • ${team.team_alias} (${team.team_id})`);
      console.log(`    Spend: $${spend} / ${budget}`);
      console.log(`    Models: ${team.models?.length ? team.models.join(", ") : "all"}`);
      if (team.budget_duration) {
        console.log(`    Budget Duration: ${team.budget_duration}`);
      }
      console.log("");
    }
    
    console.log(`Total: ${teams.length} teams`);
  },

  async create() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: teams.ts create '<json-config>'");
      console.error(`
Example:
  bun run teams.ts create '{
    "team_alias": "engineering",
    "max_budget": 1000,
    "budget_duration": "monthly",
    "models": ["gpt-4o", "claude-3-sonnet"]
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.teams.create(config);
    
    console.log("\n✅ Team created:\n");
    console.log(`  ID: ${result.team_id}`);
    console.log(`  Alias: ${result.team_alias}`);
    console.log(`  Max Budget: ${result.max_budget ? `$${result.max_budget}` : "unlimited"}`);
    console.log(`  Models: ${result.models?.length ? result.models.join(", ") : "all"}`);
  },

  async info() {
    const teamId = process.argv[3];
    if (!teamId) {
      console.error("Usage: teams.ts info <team-id>");
      process.exit(1);
    }

    const info = await client.teams.info(teamId);
    
    console.log("\n📋 Team Info:\n");
    console.log(`  ID: ${info.team_id}`);
    console.log(`  Alias: ${info.team_alias}`);
    console.log(`  Spend: $${info.spend?.toFixed(4) || "0.0000"}`);
    console.log(`  Max Budget: ${info.max_budget ? `$${info.max_budget}` : "unlimited"}`);
    console.log(`  Budget Duration: ${info.budget_duration || "none"}`);
    console.log(`  Models: ${info.models?.length ? info.models.join(", ") : "all"}`);
    console.log(`  Organization: ${info.organization_id || "none"}`);
    
    if (info.members && info.members.length > 0) {
      console.log("\n  Members:");
      for (const member of info.members) {
        console.log(`    • ${member.user_id || member.user_email} (${member.role})`);
        console.log(`      Spend: $${member.spend?.toFixed(4) || "0.0000"}`);
      }
    }
    
    if (info.keys && info.keys.length > 0) {
      console.log(`\n  Keys: ${info.keys.length} active`);
    }
  },

  async update() {
    const configJson = process.argv[3];
    if (!configJson) {
      console.error("Usage: teams.ts update '<json-config>'");
      console.error(`
Example:
  bun run teams.ts update '{
    "team_id": "abc123",
    "max_budget": 2000,
    "models": ["gpt-4o"]
  }'
`);
      process.exit(1);
    }

    const config = JSON.parse(configJson);
    const result = await client.teams.update(config);
    console.log("\n✅ Team updated:\n");
    console.log(JSON.stringify(result, null, 2));
  },

  async delete() {
    const teamId = process.argv[3];
    if (!teamId) {
      console.error("Usage: teams.ts delete <team-id>");
      process.exit(1);
    }

    const result = await client.teams.delete([teamId]);
    console.log("\n✅ Team deleted:");
    console.log(`  Deleted: ${result.deleted_teams.join(", ")}`);
  },

  async "add-member"() {
    const teamId = process.argv[3];
    const memberJson = process.argv[4];
    
    if (!teamId || !memberJson) {
      console.error("Usage: teams.ts add-member <team-id> '<member-json>'");
      console.error(`
Example:
  bun run teams.ts add-member team-123 '{
    "user_email": "dev@example.com",
    "role": "user"
  }'
`);
      process.exit(1);
    }

    const member = JSON.parse(memberJson);
    const result = await client.teams.addMember({
      team_id: teamId,
      member,
    });
    
    console.log("\n✅ Member added to team");
    console.log(`  Team: ${result.team_alias}`);
    console.log(`  Members: ${result.members?.length || 0}`);
  },

  async "remove-member"() {
    const teamId = process.argv[3];
    const userId = process.argv[4];
    
    if (!teamId || !userId) {
      console.error("Usage: teams.ts remove-member <team-id> <user-id-or-email>");
      process.exit(1);
    }

    const isEmail = userId.includes("@");
    const result = await client.teams.removeMember({
      team_id: teamId,
      ...(isEmail ? { user_email: userId } : { user_id: userId }),
    });
    
    console.log("\n✅ Member removed from team");
    console.log(`  Team: ${result.team_alias}`);
  },

  async "update-member"() {
    const teamId = process.argv[3];
    const userId = process.argv[4];
    const role = process.argv[5] as "admin" | "user";
    
    if (!teamId || !userId || !role) {
      console.error("Usage: teams.ts update-member <team-id> <user-id> <role>");
      console.error("  role: 'admin' or 'user'");
      process.exit(1);
    }

    const result = await client.teams.updateMember({
      team_id: teamId,
      user_id: userId,
      role,
    });
    
    console.log("\n✅ Member role updated");
    console.log(`  Team: ${result.team_alias}`);
    console.log(`  User: ${userId}`);
    console.log(`  New Role: ${role}`);
  },
};

async function main() {
  const command = process.argv[2] || "list";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
LiteLLM Team Management

Usage:
  bun run teams.ts <command> [args]

Commands:
  list                             List all teams
  create <json>                    Create a new team
  info <team-id>                   Get team information
  update <json>                    Update team settings
  delete <team-id>                 Delete a team
  add-member <team-id> <json>      Add member to team
  remove-member <team-id> <uid>    Remove member from team
  update-member <tid> <uid> <role> Update member role

Team Creation Options (JSON):
  {
    "team_alias": "engineering",
    "max_budget": 1000,
    "budget_duration": "monthly",
    "models": ["gpt-4o"],
    "tpm_limit": 100000,
    "rpm_limit": 1000,
    "members_with_roles": [
      {"user_email": "dev@example.com", "role": "admin"}
    ],
    "metadata": {}
  }

Member Options (JSON):
  {
    "user_id": "user-123",
    "user_email": "dev@example.com",
    "role": "admin" | "user"
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
