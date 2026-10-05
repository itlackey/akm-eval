---
description: TypeScript SDK client library enabling programmatic interaction
  with OpenCode AI server instances. Provides session management, LLM prompting,
  shell command execution, context injection, and lifecycle control for building
  AI-powered applications.
when_to_use: Use when integrating OpenCode AI capabilities into a Node.js or Bun
  application. Ideal for scenarios requiring persistent sessions, executing
  commands via the agent, managing conversation history, or sharing session
  states with users without exposing server internals directly.
updated: 2026-05-15
---
# OpenCode SDK Reference

Install: `bun add @opencode-ai/sdk`

## Client Creation

```typescript
// Full instance (starts server)
import { createOpencode } from "@opencode-ai/sdk"
const { client, server } = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 5000,
  config: { model: "anthropic/claude-sonnet-4-20250514" }
})

// Client only (existing server)
import { createOpencodeClient } from "@opencode-ai/sdk"
const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
```

## Types

```typescript
import type { Session, Message, Part, Agent, Project, Config } from "@opencode-ai/sdk"
```

## Session API

```typescript
// CRUD
const session = await client.session.create({ body: { title: "Task" } })
const sessions = await client.session.list()
const single = await client.session.get({ path: { id } })
await client.session.delete({ path: { id } })
await client.session.update({ path: { id }, body: { title: "New" } })

// Messaging
const response = await client.session.prompt({
  path: { id },
  body: {
    model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
    parts: [{ type: "text", text: "Message" }]
  }
})

// Context injection (no AI response)
await client.session.prompt({
  path: { id },
  body: { noReply: true, parts: [{ type: "text", text: "Context" }] }
})

// Commands and shell
await client.session.command({ path: { id }, body: { name: "test" } })
await client.session.shell({ path: { id }, body: { command: "npm test" } })

// History
const messages = await client.session.messages({ path: { id } })
const message = await client.session.message({ path: { id, messageId } })

// Control
await client.session.abort({ path: { id } })
await client.session.init({ path: { id }, body: {} })
await client.session.revert({ path: { id }, body: { messageID } })
await client.session.unrevert({ path: { id } })

// Sharing
await client.session.share({ path: { id } })
await client.session.unshare({ path: { id } })
```

## Files API

```typescript
const textResults = await client.find.text({ query: { pattern: "function" } })
const files = await client.find.files({ query: { query: "*.ts", type: "file" } })
const symbols = await client.find.symbols({ query: { query: "create" } })
const content = await client.file.read({ query: { path: "src/index.ts" } })
const status = await client.file.status()
```

## Other APIs

```typescript
// Health
const health = await client.global.health()

// Agents
const agents = await client.app.agents()

// Config
const config = await client.config.get()
const { providers } = await client.config.providers()

// Auth
await client.auth.set({
  path: { id: "anthropic" },
  body: { type: "api", key: "sk-..." }
})

// TUI control
await client.tui.appendPrompt({ body: { text: "Add" } })
await client.tui.submitPrompt()
await client.tui.showToast({ body: { message: "Done", variant: "success" } })
```

## Events (SSE)

```typescript
const events = await client.event.subscribe()
for await (const event of events.stream) {
  switch (event.type) {
    case "session.created":
    case "session.updated":
    case "session.idle":
    case "session.error":
    case "message.updated":
    case "file.edited":
    case "permission.updated":
      console.log(event.properties)
  }
}
```
