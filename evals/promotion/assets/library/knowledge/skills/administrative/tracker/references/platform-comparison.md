---
description: This reference guide outlines feature parity, authentication
  methods, and CLI capabilities across GitHub, Gitea, and Azure DevOps platforms
  for issue tracking and pull request management.
when_to_use: Use this guide when evaluating platform compatibility for issue
  tracking integrations, selecting a backend for development tools, or
  determining feature availability (such as time tracking) before implementing
  automation scripts that interact with these platforms.
updated: 2026-09-15
---
# Platform Comparison Reference

This document details feature parity and platform-specific capabilities across the supported issue tracking platforms.

## Supported Platforms

| Platform | Detection Pattern | Auth Method | CLI Wrapper |
|----------|-------------------|-------------|-------------|
| GitHub | `github.com` | GH_TOKEN or `gh auth` | `gh` CLI |
| Gitea | Configurable hosts | GITEA_TOKEN | Native fetch |
| Azure DevOps | `dev.azure.com`, `*.visualstudio.com` | AZURE_DEVOPS_PAT | `az` CLI |
| GitLab | `gitlab.com` (planned) | GITLAB_TOKEN | Planned |

## Feature Matrix

### Issue Operations

| Operation | GitHub | Gitea | Azure DevOps | Notes |
|-----------|--------|-------|--------------|-------|
| List issues | Yes | Yes | Yes | All support state filtering |
| Get issue | Yes | Yes | Yes | Full details with comments |
| Create issue | Yes | Yes | Yes | Title + body |
| Update issue | Yes | Yes | Yes | Title, body, state |
| Close issue | Yes | Yes | Yes | Optional comment |
| Reopen issue | Yes | Yes | Yes | |
| Add comment | Yes | Yes | Yes | |
| List comments | Yes | Yes | Partial | Azure requires REST API |
| Labels | Yes | Yes | Tags | Azure uses Tags field |
| Assignees | Yes | Yes | Yes | Single assignee on Azure |
| Milestones | Yes | Yes | Iterations | Azure uses Iteration Path |

### Pull Request Operations

| Operation | GitHub | Gitea | Azure DevOps | Notes |
|-----------|--------|-------|--------------|-------|
| List PRs | Yes | Yes | Yes | State filtering |
| Get PR | Yes | Yes | Yes | Full details |
| Create PR | Yes | Yes | Yes | Head → Base |
| Merge PR | Yes | Yes | Yes | |
| Delete source branch | Yes | Yes | Yes | On merge |
| Draft PRs | Yes | Yes | Yes | |
| Review status | Yes | Yes | Yes | |

### Timer / Time Tracking

| Operation | GitHub | Gitea | Azure DevOps | Notes |
|-----------|--------|-------|--------------|-------|
| Start timer | No | Yes | No | Gitea stopwatch feature |
| Stop timer | No | Yes | No | Records tracked time |
| List timers | No | Yes | No | User's active timers |
| Delete timer | No | Yes | No | Without recording |
| Time logging | Workaround | Yes | Yes | Azure via work item fields |

**Note**: GitHub does not have native time tracking. Use third-party integrations or manual logging.

### Workflow Commands

| Command | GitHub | Gitea | Azure DevOps | Notes |
|---------|--------|-------|--------------|-------|
| feature-start | Yes | Yes | Yes | Creates branch, updates state |
| feature-complete | Yes | Yes | Yes | Creates PR, updates state |
| Timer integration | No | Yes | No | Auto start/stop with feature commands |

## Platform-Specific Features

### Gitea

- **Time Tracking (Stopwatch)**: Native issue timer support
  ```bash
  tracker timer start 42    # Start stopwatch
  tracker timer stop 42     # Stop and record time
  tracker timer list        # List active timers
  ```

- **Repository Topics**: Full support for repository topics/tags

- **Self-hosted**: Fully supports self-hosted Gitea instances
  - Configure `GITEA_URL` in the environment or in `env/tracker`
  - Store `GITEA_TOKEN` in `env/tracker` in your own akm stash

### GitHub

- **gh CLI Integration**: Leverages authenticated `gh` CLI
  - Inherits authentication from `gh auth login`
  - Supports GitHub Enterprise with `GH_HOST`

- **Actions Integration**: Can query workflow runs (future feature)

- **Projects**: GitHub Projects integration (future feature)

### Azure DevOps

- **Work Item Types**: Issues mapped from User Story, Bug, Task, Issue
  - Type selection available on create
  - All types normalized to `Issue` interface

- **Area/Iteration Paths**: Full support for project organization
  - Maps to labels/milestones in normalized interface

- **Boards Integration**: Work items visible in Azure Boards

- **Pipeline Status**: Can query build/release status (future feature)

## Authentication

### Credential Resolution Order

1. Environment variables (highest priority)
2. The `env/tracker` file in your own akm stash (located with `akm env path env/tracker`)
3. CLI authentication (gh auth, az login)

### Environment Variables

| Platform | Token Variable | URL Variable |
|----------|----------------|--------------|
| GitHub | `GH_TOKEN`, `GITHUB_TOKEN` | `GH_HOST` |
| Gitea | `GITEA_TOKEN` | `GITEA_URL` |
| Azure DevOps | `AZURE_DEVOPS_PAT` | `AZURE_DEVOPS_ORG` |
| GitLab (adapter not implemented) | `GITLAB_TOKEN` | `GITLAB_URL` |

## State Mapping

### Issue States

| Tracker State | GitHub | Gitea | Azure DevOps |
|---------------|--------|-------|--------------|
| `open` | open | open | New, Active |
| `closed` | closed | closed | Resolved, Closed, Done |

### PR States

| Tracker State | GitHub | Gitea | Azure DevOps |
|---------------|--------|-------|--------------|
| `open` | open | open | active |
| `closed` | closed | closed | abandoned |
| `merged` | merged | merged | completed |

## Error Handling

All platforms follow consistent error patterns:

- **Authentication errors**: Clear message with credential setup instructions
- **Not found**: Issue/PR number not found on platform
- **Permission denied**: Token lacks required scopes
- **Rate limiting**: Supported adapters retry transient HTTP failures, including `429`, with exponential backoff

# New command (auto-detects platform from git remote)

```
tracker issue list

tracker issue list --repo=owner/repo
```
