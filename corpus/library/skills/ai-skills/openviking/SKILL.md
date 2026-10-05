---
name: openviking
description: Interact with an OpenViking server for semantic search, resource
  management, session memory, and filesystem operations.
when_to_use: Use this skill when you need to index or semantically search
  documents, manage resources or sessions, or perform filesystem operations
  against an OpenViking instance.
allowed-tools:
  - Bash
  - Read
updated: 2026-03-15
---

# OpenViking API Skill

Interface with an OpenViking server to store, search, and retrieve knowledge using semantic vector search, text grep, file operations, and session-based memory.

## Setup

Set these environment variables before running any commands:

```bash
export OPENVIKING_URL="http://localhost:1933"    # Server URL
export OPENVIKING_API_KEY="<your-api-key>"       # User or root API key
```

Optional identity headers (when using a root API key to impersonate a user):

```bash
export OPENVIKING_ACCOUNT="<account-id>"
export OPENVIKING_USER="<user-id>"
export OPENVIKING_AGENT="<agent-id>"
```

The client script is at: `$SKILL_DIR/scripts/ov-client.ts`

Resolve the script path:

```bash
OV="$SKILL_DIR/scripts/ov-client.ts"
```

## Important Notes

- **Authentication**: Search requires a **user API key** (not root). Root key returns incomplete results for semantic search. Use `account-create` and `user-key` to provision a user key.
- **Embedding dimensions**: The server's `storage.vectordb.dimension` must match the embedding model output (e.g. `nomic-embed-text` = 768 dims).
- **Scoped search**: Broad semantic search returns mostly metadata abstracts. Always pass `--target-uri` to scope search to a specific resource path for best results.
- **Docker host access**: Containers need `extra_hosts: ["host.docker.internal:host-gateway"]` to reach host-bound services like Ollama.

## Commands

### Health & Status

```bash
# Server health check (no auth required)
bun run "$OV" health

# System status (initialized, current user)
bun run "$OV" status

# Full observer — queue, vectordb stats, VLM usage
bun run "$OV" observer
```

### Search

```bash
# Semantic vector search (best with --target-uri)
bun run "$OV" search "guardian security" --target-uri "viking://resources"

# Scoped to a specific resource
bun run "$OV" search "deployment steps" --target-uri "viking://resources/my-docs" --limit 5

# With score threshold
bun run "$OV" search "HMAC verification" --score-threshold 0.3

# Find (semantic search variant)
bun run "$OV" find "Docker orchestration" --limit 10

# Text grep (exact pattern matching)
bun run "$OV" grep "viking://resources" "Docker"

# Case-insensitive grep
bun run "$OV" grep "viking://resources" "guardian" --case-insensitive
```

### Filesystem

```bash
# List directory contents
bun run "$OV" ls "viking://resources"

# Full directory tree
bun run "$OV" tree "viking://resources/my-docs"

# Read file content
bun run "$OV" read "viking://resources/my-docs/architecture.md"
```

### Resource Upload

Upload a local file, index it with embeddings, and make it searchable:

```bash
# Upload and index (waits for embedding to complete)
bun run "$OV" upload /path/to/document.md "viking://resources/project-docs" --reason "Architecture documentation"

# With custom timeout (seconds)
bun run "$OV" upload /path/to/large-file.md "viking://resources/docs" --timeout 120
```

The upload command handles two steps automatically:
1. Temp upload of the file to the server
2. Adding it as an indexed resource (with `wait: true`)

Check the result's `queue_status.Embedding` for processed count and errors.

### Sessions & Memory

Sessions capture conversations and can extract memories for long-term recall.

```bash
# Create a new session
bun run "$OV" session-create

# Add messages to a session
bun run "$OV" session-message <session-id> user "How do I deploy the application?"
bun run "$OV" session-message <session-id> assistant "You need Docker and Docker Compose..."

# Extract memories from the session (requires VLM configured on server)
bun run "$OV" session-extract <session-id>

# Commit session (archives and processes)
bun run "$OV" session-commit <session-id>

# List and inspect sessions
bun run "$OV" session-list
bun run "$OV" session-get <session-id>
```

### Account Management (root key only)

```bash
# Create an account with admin user
bun run "$OV" account-create my-account admin-user

# List accounts
bun run "$OV" account-list

# Regenerate a user's API key
bun run "$OV" user-key my-account admin-user
```

## Typical Workflow

1. **Check health**: `bun run "$OV" health`
2. **Upload documents**: `bun run "$OV" upload ./docs/architecture.md "viking://resources/arch"`
3. **Search**: `bun run "$OV" search "security model" --target-uri "viking://resources/arch"`
4. **Read matches**: `bun run "$OV" read "viking://resources/arch/document.md"`
5. **Grep for specifics**: `bun run "$OV" grep "viking://resources" "HMAC"`

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection error` on embedding | Container can't reach Ollama | Add `extra_hosts: ["host.docker.internal:host-gateway"]` to compose |
| `dimension mismatch: expected 2048, got 768` | Vector DB created with wrong dims | Set `storage.vectordb.dimension` in config, wipe `vectordb/` dir, restart |
| Search returns only `.abstract.md` / `.overview.md` | Broad search hits metadata first | Use `--target-uri` to scope search |
| Search returns empty with root key | ROOT role skips directory roots | Use a user API key instead |
| `UNAUTHENTICATED` | Wrong key or header | Use `x-api-key` header (client does this); verify key with `account-list` |
