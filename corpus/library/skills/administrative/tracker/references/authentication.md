---
description: Defines the priority order for credential resolution and specifies
  secure storage locations for authentication tokens across multiple platforms.
when_to_use: When configuring tracker authentication, managing the env/tracker
  file for GitHub/Gitea/Azure DevOps, or troubleshooting credential discovery
  issues.
updated: 2026-09-15
---
# Tracker Authentication

The tracker resolves credentials from multiple sources in priority order. This document explains where to store tokens and how they're discovered.

## Credential Resolution Order

The tracker checks these locations in order (first match wins):

1. **Environment variables** - Including values injected by `akm env run env/tracker -- ...`; also for CI/CD or temporary overrides
2. **The `env/tracker` file** - Preferred for persistent credentials; read directly when a variable is missing from the environment
3. **Platform CLI tools** - gh, az, glab (if installed)

## The env/tracker File

All tracker tokens and settings, for every platform, live in one env file: `env/tracker` (`tracker.env`) in your own primary akm stash. Each agent keeps its own; it never belongs in akm-shared or any other shared bundle.

- `akm env path env/tracker` prints the file's location.
- `akm env run env/tracker -- <command>` runs a command with its variables injected. Prefer this to sourcing the raw file.
- `akm env list` shows its key names without values.

When a variable is not in the environment, the tracker CLI runs `akm env path env/tracker` and reads the file itself. If akm is not installed or `env/tracker` does not exist, that step is skipped. The direct read takes values literally, so run the tracker through `akm env run env/tracker -- ...` if the file uses `${secret:NAME}` references.

### Complete File

`env/tracker` with every supported variable (include only the platforms you use):

```bash
# GitHub
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Gitea
GITEA_URL=https://gitea.example.com
GITEA_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Azure DevOps (AZURE_DEVOPS_PROJECT is used by the az and REST examples in the Azure DevOps references)
AZURE_DEVOPS_PAT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_DEVOPS_ORG=https://dev.azure.com/<org>
AZURE_DEVOPS_PROJECT=<project>
```

Create it with `akm env create`, which writes to your own stash with `600` permissions:

```bash
akm env create tracker --from-stdin <<'EOF'
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
EOF
```

`akm env create` refuses to overwrite an existing file. To change an existing `env/tracker`, edit the file at `akm env path env/tracker`.

### Azure DevOps Settings

Confirm that Azure DevOps credentials are available through the environment or
`env/tracker` before using REST fallbacks.

```bash
AZURE_DEVOPS_PAT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_DEVOPS_ORG=https://dev.azure.com/<org>
```

**Why This is Critical**:

- `env/tracker` is the PRIMARY location for Azure DevOps credentials
- Contains PAT token needed for REST API fallback operations
- Contains organization URL for both CLI and API operations
- Agents should check key names with `akm env list` before attempting a REST fallback

**Location**: `akm env path env/tracker`
**Permissions**: Must be `600` (read/write for owner only)

## Environment Variables

Environment variables override the `env/tracker` file, which uses the same names. Useful for CI/CD pipelines or temporary credentials.

| Platform     | Variables                               |
| ------------ | --------------------------------------- |
| GitHub       | `GH_TOKEN` or `GITHUB_TOKEN`            |
| Gitea        | `GITEA_URL`, `GITEA_TOKEN`              |
| Azure DevOps | `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_ORG`  |

## Platform CLI Tools (Fallback)

If neither an environment variable nor `env/tracker` provides a token, the tracker attempts to use platform CLI tools:

| Platform     | CLI Tool | Auth Command      |
| ------------ | -------- | ----------------- |
| GitHub       | `gh`     | `gh auth login`   |
| Azure DevOps | `az`     | `az login`        |

## Creating Tokens

### GitHub

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `read:org` (minimum)
4. Add the token to `env/tracker` as `GH_TOKEN`

### Gitea

1. Go to your Gitea instance > Settings > Applications
2. Generate new token with appropriate scopes
3. Add the token and instance URL to `env/tracker` as `GITEA_TOKEN` and `GITEA_URL`

### Azure DevOps

**🔴 CRITICAL: CLI-First Approach + env/tracker**

Azure DevOps uses a **CLI-first** approach via `az boards` commands, with REST API as fallback.

**STEP 1: Check credential availability**

**Location**: `env/tracker` in your own akm stash (`akm env path env/tracker` prints the file path)

```bash
# Check that env/tracker exists and lists the Azure DevOps keys (names only, no values)
akm env list

# Expected contents:
AZURE_DEVOPS_PAT=your_personal_access_token_here
AZURE_DEVOPS_ORG=https://dev.azure.com/<org>
```

**If the keys exist**: Use these credentials for REST API operations
**If they are missing**: Rely on `az login` session for CLI operations

**STEP 2: Azure CLI Setup (Primary Method)**

1. Install Azure CLI: `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash`
2. Add Azure DevOps extension: `az extension add --name azure-devops`
3. Authenticate: `az devops login --org https://dev.azure.com/YOUR_ORG`
4. Set defaults:
   ```bash
   az devops configure --defaults \
     organization=https://dev.azure.com/YOUR_ORG \
     project=YOUR_PROJECT
   ```

**STEP 3: Creating PAT Token (For REST API Fallback)**

1. Go to Azure DevOps > User Settings > Personal Access Tokens
2. Click "New Token"
3. Configure:
   - **Name**: CLI Access or API Access
   - **Scopes**: `Work Items (Read, Write, & Manage)`
   - **Expiration**: Choose appropriate duration
4. Copy token immediately (only shown once)
5. Save to `env/tracker`:

   ```bash
   akm env create tracker --from-stdin <<'EOF'
   AZURE_DEVOPS_PAT=your_copied_token_here
   AZURE_DEVOPS_ORG=https://dev.azure.com/<org>
   EOF

   # If env/tracker already exists, add those lines to the file this prints instead
   akm env path env/tracker
   ```

**When PAT is Needed**:

- ✅ REST API operations (comments, custom fields)
- ✅ CI/CD environments without interactive login
- ✅ Automated scripts requiring specific permissions
- ✅ When CLI doesn't support the operation

**When PAT is NOT Needed**:

- ❌ Standard work item creation (`az boards work-item create`)
- ❌ Work item updates (`az boards work-item update`)
- ❌ Queries (`az boards query`)
- ❌ Relationship management (`az boards work-item relation`)

**CLI-First Benefits**:

- ✅ No manual token management for standard operations
- ✅ Uses your Azure AD authentication
- ✅ Automatic token refresh
- ✅ Full Microsoft support and updates
- ✅ Better error messages and validation
- ✅ Official tooling with comprehensive documentation

## Security Best Practices

1. **Set restrictive permissions** on `env/tracker` (`akm env create` already uses `600`):

   ```bash
   chmod 600 "$(akm env path env/tracker -q)"
   ```

2. **Keep `env/tracker` in your own stash** - Never put it in akm-shared or any other shared bundle

3. **Use minimal scopes** - Only grant permissions the tracker needs

4. **Rotate tokens regularly** - Especially for shared/team environments

## Troubleshooting

### "Authentication failed" or "401 Unauthorized"

1. Check the token exists in `env/tracker` (key names only):

   ```bash
   akm env list
   ```

2. Verify token is valid:

   ```bash
   akm env run env/tracker -- sh -c 'curl -s "$GITEA_URL/api/v1/user" -H "Authorization: token $GITEA_TOKEN"'
   ```

3. Check token hasn't expired (some platforms have expiration)

### "Could not detect platform"

The tracker needs a git remote to detect the platform. Ensure you're in a git repository:

```bash
git remote -v
```

Or specify the platform explicitly, using the `tracker` function defined in [../SKILL.md](../SKILL.md):

```bash
tracker issue list --platform=gitea --repo=<owner>/<repo>
```

### Environment variable not being used

Environment variables must be exported in the current shell, or injected for the command:

```bash
export GITEA_TOKEN=xxx
# or inject env/tracker for one command
akm env run env/tracker -- bun "$TRACKER_CLI" issue list
```
