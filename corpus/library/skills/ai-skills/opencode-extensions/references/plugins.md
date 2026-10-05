---
description: Reference documentation for developing OpenCode plugins, covering
  installation paths, plugin architecture, dependency management, and available
  hooks for events, tools, and sessions.
when_to_use: When extending OpenCode functionality with custom tools,
  intercepting workflow events (session, file, message), managing dependencies,
  or customizing context compaction logic.
updated: 2026-05-15
---
# OpenCode Plugins Reference

## Location

- `.opencode/plugin/` - Project
- `~/.config/opencode/plugin/` - Global
- `opencode.json` → `"plugin": ["npm-package"]` - NPM

## Plugin Structure

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => ({
  // Return hooks object
})
```

**Context:** `project` (info), `directory` (cwd), `worktree` (git path), `client` (SDK), `$` (Bun shell)

## Dependencies

Create `.opencode/package.json`:

```json
{ "dependencies": { "some-package": "^1.0.0" } }
```

## Event Hooks

```typescript
event: async ({ event }) => {
  // event.type and event.properties
}
```

**Session:** `session.created`, `session.updated`, `session.deleted`, `session.idle`, `session.error`, `session.compacted`

**Message:** `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed`

**File:** `file.edited`, `file.watcher.updated`

**Tool:** `tool.execute.before`, `tool.execute.after`

**Other:** `command.executed`, `permission.replied`, `permission.updated`, `todo.updated`

## Tool Execution Hooks

```typescript
// Before - modify args or block
"tool.execute.before": async (input, output) => {
  console.log("Tool:", input.tool, "Args:", output.args)
  if (input.tool === "bash") {
    output.args.command = `prefix && ${output.args.command}`
  }
  // throw Error to block
}

// After - process results
"tool.execute.after": async (input, output) => {
  console.log("Result:", output.result)
}
```

## Custom Tools in Plugins

```typescript
tool: {
  mytool: tool({
    description: "Description",
    args: { param: tool.schema.string() },
    async execute(args) { return "result" }
  })
}
```

## Compaction Hooks

```typescript
// Add context
"experimental.session.compacting": async (input, output) => {
  output.context.push("Custom context to preserve")
}

// Replace prompt
"experimental.session.compacting": async (input, output) => {
  output.prompt = "Custom compaction prompt"
}
```

## Examples

**Notifications:**
```typescript
event: async ({ event }) => {
  if (event.type === "session.idle") {
    await $`osascript -e 'display notification "Done!" with title "OpenCode"'`
  }
}
```

**Block .env access:**
```typescript
"tool.execute.before": async (input, output) => {
  if (output.args.filePath?.includes(".env")) {
    throw new Error("Cannot access .env files")
  }
}
```
