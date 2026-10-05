---
name: tracker
description: Issue and pull request tracker for GitHub, Gitea and Azure DevOps.
  Creates, lists, updates, closes and comments on issues, manages pull requests,
  and runs feature workflows through one CLI with state file integration.
updated: 2026-09-15
when_to_use: When you need to create, list, update, close, or comment on issues;
  manage pull requests; or execute feature workflows that bridge issue creation
  to PR generation on GitHub, Gitea or Azure DevOps.
---

# Tracker Skill

## Scope and Platform Support

The CLI detects the platform from the repository's git remote, or takes `--platform=X`.

- **Supported:** GitHub, Gitea and Azure DevOps issues and pull requests.
- **Not implemented:** GitLab. The CLI recognizes a GitLab remote but has no adapter, so it stops with "GitLab adapter not yet implemented". Use `glab` directly for GitLab.

## Running the Tracker

The tracker is implemented as a Bun TypeScript script in this skill's `scripts/` folder. Resolve that folder at run time and define a `tracker` shell function that injects `env/tracker` from your own stash (see Credential Setup), then run it from the project root:

```bash
TRACKER_CLI="$(dirname "$(akm show skills/administrative/tracker --format json | jq -r .path)")/scripts/tracker-cli.ts"
tracker() { akm env run env/tracker -- bun "$TRACKER_CLI" "$@"; }

tracker <resource> <action> [options]
```

The commands below use this `tracker` function. Without an `env/tracker` file (for example GitHub through `gh auth login` only), call `bun "$TRACKER_CLI"` directly instead.

## Issues

```bash
# List issues
tracker issue list [owner/repo]
tracker issue list --state=open|closed|all
tracker issue list --labels=bug,urgent

# Get issue details
tracker issue get [owner/repo] <number>

# Create issue
tracker issue create [owner/repo] --title="Title" --body="Description" [--labels=bug]

# Update issue
tracker issue update [owner/repo] <number> [--title="New Title"] [--body="New Body"] [--labels=l1,l2] [--assignees=u1,u2] [--state=open|closed]

# Close/reopen issue
tracker issue close [owner/repo] <number> [--comment="Closing reason"]
tracker issue reopen [owner/repo] <number>

# Comments
tracker issue comment [owner/repo] <number> --body="Comment text"
tracker issue comments [owner/repo] <number>
tracker issue update-comment [owner/repo] <issue-number> <comment-id> --body="Updated text"

# Start working on issue (creates branch)
tracker issue start [owner/repo] <number>
```

## Pull Requests

```bash
# List PRs
tracker pr list [owner/repo] --state=open|closed|all

# Get PR details
tracker pr get [owner/repo] <number>

# Create PR
tracker pr create [owner/repo] --title="Title" --head=feature-branch --base=main [--body="Description"]

# Merge PR
tracker pr merge [owner/repo] <number> [--method=squash|merge|rebase] [--delete-branch]
```

## Workflow Commands

```bash
# Start feature: creates branch, updates .workflow/state.yaml
tracker feature-start <issue-number>

# Complete feature: creates PR, updates state
tracker feature-complete [--title="PR Title"]
```

## Platform Detection

The tracker auto-detects the platform from your git remote URL. For most repositories this is automatic.

| Remote URL Pattern | Platform |
| ------------------ | -------- |
| `github.com`       | GitHub   |
| `dev.azure.com`, `*.visualstudio.com`, `ssh.dev.azure.com` | Azure DevOps |
| Any other HTTP(S), SCP-style SSH, or `ssh://` host | Gitea (self-hosted default) |
| `gitlab.com` | GitLab detected, then rejected because the adapter is not implemented |

Override with `--platform=github|gitea|azdo` when the host cannot be inferred
correctly. Do not use `--platform=gitlab`; there is no GitLab adapter.

## Global Options

| Option              | Description                     |
| ------------------- | ------------------------------- |
| `--json`            | Output raw JSON response        |
| `--platform=X`      | Override auto-detected platform |
| `--repo=owner/repo` | Specify repository explicitly   |

## Credential Setup

The tracker keeps every token and setting, for all platforms, in one env file: `env/tracker` (`tracker.env`) in your own primary akm stash. It never belongs in akm-shared or any other shared bundle.

Credentials are resolved in this order:

1. **Environment variables** (`GH_TOKEN`), including values injected by `akm env run env/tracker -- ...`
2. **The `env/tracker` file**, located with `akm env path env/tracker` when a variable is missing from the environment
3. **Platform CLI tools** (`gh`)

### GitHub Credentials

**Setup**:

```bash
# Create env/tracker in your own stash (akm creates it with 600 permissions)
printf 'GH_TOKEN=your_personal_access_token_here\n' | akm env create tracker --from-stdin

# If env/tracker already exists, add the line to the file this prints instead
akm env path env/tracker
```

**See [references/authentication.md](references/authentication.md) for complete documentation** on token creation, the `env/tracker` variables for every platform, and troubleshooting.

## Integration with .workflow/state.yaml

The tracker updates `.workflow/state.yaml` to coordinate with other skills:

```yaml
version: 1
issue:
  platform: github
  id: 34
  title: "feat: Unify Gitea skill into tracker"
  url: https://github.com/<owner>/<repo>/issues/34
  state: in-progress
  owner_skill: tracker
branch:
  name: feat/tracker-skill
pr:
  id: null
  state: not-created
```

## Examples

```bash
# List open issues on current repo
tracker issue list

# Get issue #34 details
tracker issue get 34

# Create a bug report
tracker issue create --title="Button not working" --body="Steps to reproduce..." --labels=bug

# Update issue #34 with new title and labels
tracker issue update 34 --title="Updated title" --labels=bug,priority-high

# Start working on issue #34
tracker issue start 34

# Create PR when done
tracker pr create --title="Fix button click handler" --head=fix/button --base=main

# Complete feature workflow
tracker feature-start 42
# ... do work ...
tracker feature-complete --title="Implement feature X"
```

## Development

To run tests or modify the tracker:

```bash
cd "$(dirname "$TRACKER_CLI")"

# Run tests
bun test

# Run with verbose output
bun tracker-cli.ts issue list --json
```
