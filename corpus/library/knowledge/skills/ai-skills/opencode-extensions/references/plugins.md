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

This document provides the technical reference for developing, structuring, and deploying OpenCode plugins. It covers installation paths, the plugin API, dependency management, and available event hooks for extending functionality.

## Installation Paths

Plugins can be installed at the project level or globally:

- **Project**: `.opencode/plugin/`
- **Global**: `~/.config/opencode/plugin/`
- **NPM**: Reference in `opencode.json` under `"plugin": ["npm-package"]`

## Plugin Structure

A plugin is an asynchronous function that returns a configuration object containing hooks and tools.

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => ({
  // Return hooks object
})
```

**Context Parameters:**
- `project`: Project information object.
- `directory`: Current working directory.
- `worktree`: Git worktree path.
- `client`: OpenCode SDK client.
- `$`: Bun shell execution utility.

## Dependencies

To manage plugin dependencies, create a `package.json` file inside your plugin directory:

```json
{ "dependencies": { "some-package": "^1.0.0" } }
```

## Event Hooks

Register event listeners using the `event` hook. The `event` object contains `type` and `properties`.

```typescript
event: async ({ event }) => {
  // event.type and event.properties
}
```

**Available Event Types:**

- **Session**: `session.created`, `session.updated`, `session.deleted`, `session.idle`, `session.error`, `session.compacted`
- **Message**: `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed`
- **File**: `file.edited`, `file.watcher.updated`
- **Tool**: `tool.execute.before`, `tool.execute.after`
- **Other**: `command.executed`, `permission.replied`, `permission.updated`, `todo.updated`

## Tool Execution Hooks

Modify or block tool execution using the `tool.execute.before` and `tool.execute.after` hooks.

### Before Execution

Modify arguments or block execution by throwing an error.

```typescript
"tool.execute.before": async (input, output) => {
  console.log("Tool:", input.tool, "Args:", output.args)
  if (input.tool === "bash") {
    output.args.command = `prefix && ${output.args.command}`
  }
  // throw Error to block
}
```

### After Execution

Process results after the tool completes.

```typescript
"tool.execute.after": async (input, output) => {
  console.log("Result:", output.result)
}
```

## Custom Tools in Plugins

Define custom tools using the `tool` helper.

```typescript
tool: {
  mytool: tool({
    args: { param: tool.schema.string() },
    async execute(args) { return "result" }
  })
}
```

## Compaction Hooks

Customize how the session context is compacted using experimental hooks.

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

### Notifications

Send a desktop notification when a session becomes idle.

```typescript
event: async ({ event }) => {
  if (event.type === "session.idle") {
    await $`osascript -e 'display notification "Done!" with title "OpenCode"'`
  }
}
```

### Block .env Access

Prevent tools from accessing `.env` files.

```typescript
"tool.execute.before": async (input, output) => {
  if (output.args.filePath?.includes(".env")) {
    throw new Error("Cannot access .env files")
  }
}
```
