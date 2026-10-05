---
description: Configure granular security controls for OpenCode tools including
  edit, bash, skill, webfetch, doom_loop, and external_directory. Define whether
  each tool requires user approval (ask), is allowed without consent (allow), or
  is disabled (deny). Supports command-specific rules and wildcards for bash
  operations.
when_to_use: Use when deploying agents in environments requiring
  human-in-the-loop verification before executing file edits, system commands,
  or external network requests to prevent unauthorized modifications.
updated: 2026-05-15
---

# Permissions

Control which actions require approval to run in OpenCode. By default, most operations are allowed, but `doom_loop` and `external_directory` default to `ask`. You can configure granular security controls using the `permission` option in `opencode.json`.

## Configuration

The `permission` object in `opencode.json` accepts the following top-level keys:

- `edit`: Control file editing operations.
- `bash`: Control shell command execution.
- `skill`: Control skill loading.
- `webfetch`: Control web fetching.
- `doom_loop`: Control infinite loop detection behavior.
- `external_directory`: Control access to files outside the working directory.

Each key can be set to:
- `"ask"`: Prompt for approval before running the tool.
- `"allow"`: Allow all operations without approval.
- `"deny"`: Disable the tool.

### Global Configuration Example

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "allow",
    "bash": "ask",
    "skill": "ask",
    "webfetch": "deny",
    "doom_loop": "ask",
    "external_directory": "ask"
  }
}
```

## Tool-Specific Permissions

### edit

Use `permission.edit` to control whether file editing operations require user approval.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "ask"
  }
}
```

### bash

Use `permission.bash` to control whether bash commands need user approval. You can set a global policy or define specific rules for individual commands.

#### Global Policy

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": "ask"
  }
}
```

#### Command-Specific Rules

You can target specific commands to set them to `allow`, `ask`, or `deny`.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "git push": "ask",
      "git status": "allow",
      "git diff": "allow",
      "npm run build": "allow",
      "ls": "allow",
      "pwd": "allow"
    }
  }
}
```

#### Wildcards

You can use wildcards to manage permissions for groups of commands. The wildcard uses simple regex globbing patterns:
- `*` matches zero or more of any character.
- `?` matches exactly one character.
- All other characters match literally.

**Example: Disable all Terraform commands**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "terraform *": "deny"
    }
  }
}
```

**Example: Deny all commands except specific ones**

A specific rule can override the `*` wildcard.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "*": "deny",
      "pwd": "allow",
      "git status": "ask"
    }
  }
}
```

#### Scope of the `"ask"` Option

When the agent asks for permission to run a particular bash command, it will request feedback with three options: "accept", "accept always", and "deny". The "accept always" answer applies for the rest of the current session.

Command permissions are applied to the first two elements of a command. So, an "accept always" response for `git log` would whitelist `git log *` but not `git commit ...`.

When an agent asks for permission to run a command in a pipeline, tree sitter parses each command in the pipeline. The "accept always" permission thus applies separately to each command in the pipeline.

### skill

Use `permission.skill` to control whether the model can load skills via the built-in `skill` tool.

You can apply a single rule to all skills:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "skill": "ask"
  }
}
```

Or configure per-skill rules (supports the same wildcard patterns as `permission.bash`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "skill": {
      "*": "deny",
      "git-*": "allow",
      "frontend/*": "ask"
    }
  }
}
```

### webfetch

Use `permission.webfetch` to control whether the LLM can fetch web pages.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "webfetch": "ask"
  }
}
```

### doom_loop

Use `permission.doom_loop` to control whether approval is required when a doom loop is detected. A doom loop occurs when the same tool is called 3 times in a row with identical arguments. This helps prevent infinite loops where the LLM repeatedly attempts the same action without making progress.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "doom_loop": "ask"
  }
}
```

### external_directory

Use `permission.external_directory` to control whether file operations require approval when accessing files outside the working directory. This provides an additional safety layer to prevent unintended modifications to files outside your project.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "external_directory": "ask"
  }
}
```

## Agent-Specific Permissions

You can also configure permissions per agent. Agent-specific configuration overrides the global configuration.

### JSON Configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "git push": "ask"
    }
  },
  "agent": {
    "build": {
      "permission": {
        "bash": {
          "git push": "allow"
        }
      }
    }
  }
}
```

In this example, the `build` agent overrides the global `bash` permission to allow `git push` commands.

### Markdown Configuration

You can also configure permissions for agents in Markdown files.

`~/.config/opencode/agent/review.md`

```markdown
