---
name: opencode-extensions
description: Build OpenCode extensions with Bun.js/TypeScript. Use when creating
  plugins, custom tools, agents, commands, skills, rules (AGENTS.md), or
  opencode.json configurations. Triggers on requests involving .opencode/
  directory, OpenCode SDK, MCP servers, or any OpenCode extension development.
updated: 2026-03-15
when_to_use: Use this skill when you need to extend OpenCode's functionality
  with custom plugins, tools, agents, commands, or rules; specifically for
  creating hooks that intercept tool execution, handling session events like
  idle or errors, adding custom capabilities via the tool API, or configuring
  global settings in opencode.json.
---

# OpenCode Extension Development

Build plugins, tools, agents, commands, skills, and configurations for OpenCode using Bun.js and TypeScript.

## When to Use

Use this skill when you need to extend OpenCode's functionality with custom plugins, tools, agents, commands, or rules. Specifically use this for:
- Creating hooks that intercept tool execution (e.g., `tool.execute.before`)
- Handling session lifecycle events (e.g., `session.idle`, `session.error`)
- Adding custom capabilities via the tool API
- Configuring global settings in `opencode.json`
- Developing system-wide extensions located in `~/.config/opencode/`

## Extension Types

| Type | Location | Format |
|------|----------|--------|
| Plugin | `.opencode/plugin/` | `.ts`/`.js` |
| Tool | `.opencode/tool/` | `.ts`/`.js` |
| Agent | `.opencode/agent/` | `.md` or JSON |
| Command | `.opencode/command/` | `.md` or JSON |
| Skill | `.opencode/skill/<n>/SKILL.md` | `.md` |
| Rules | `AGENTS.md` | `.md` |
| Config | `opencode.json` | `.json` |

**Note:** Global location is `~/.config/opencode/` instead of `.opencode/` for system-wide extensions.

## Plugin Development

Plugins extend OpenCode with hooks and custom tools. They are the primary mechanism for intercepting execution flow and managing lifecycle events.

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory }) => ({
  // Event handler
  event: async ({ event }) => {
    if (event.type === "session.idle") console.log("Done!")
  },
  
  // Intercept tool execution
  "tool.execute.before": async (input, output) => {
    if (input.tool === "read" && output.args.filePath.includes(".env")) {
      throw new Error("Cannot read .env files")
    }
  },
  
  // Add custom tools
  tool: {
    greet: tool({
      description: "Greet a user",
      args: { name: tool.schema.string() },
      async execute(args) { return `Hello, ${args.name}!` }
    })
  }
})
```

**Events:** `session.idle`, `session.error`, `session.created`, `file.edited`, `message.updated`, `tool.execute.before`, `tool.execute.after`

For dependencies, create `.opencode/package.json` with required packages.

## Custom Tool Development

Tools are standalone functions defined via the SDK. They appear in the tool list for LLMs to invoke.

```typescript
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Tool description for LLM",
  args: {
    query: tool.schema.string().describe("SQL query"),
    limit: tool.schema.number().optional().default(10)
  },
  async execute(args, context) {
    const { agent, sessionID } = context
    return `Executed: ${args.query}`
  }
})
```

**Naming Convention:** Filename becomes tool name. Multiple exports create `<file>_<export>` tools.

## Agent Definition

Agents are defined in Markdown files within `.opencode/agent/` or system config.

Create `.opencode/agent/reviewer.md`:

```markdown
# Reviewer Agent

You are a code reviewer. Analyze the provided code for bugs, security issues, and best practices.

## Instructions
- Check for null pointer exceptions
- Verify input validation
- Suggest performance improvements
```
