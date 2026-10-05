---
description: Quick reference guide for managing Azure DevOps work items
  programmatically using the Azure CLI (az boards) as the primary method, with
  REST API fallbacks for unsupported operations.
when_to_use: Use when scripting Azure DevOps operations without GUI access.
  Prefer CLI for standard CRUD tasks; switch to REST API only for unsupported
  features like comment history or rich text comments.
updated: 2026-05-15
---
# Azure DevOps: CLI-First Approach - Quick Reference

## 🔴 CRITICAL: Credential Location

**ALWAYS check this location FIRST when working with Azure DevOps:**

`env/tracker` (`tracker.env`) in your own akm stash, which holds the tracker's settings for every platform:

```bash
# Print the file's location
akm env path env/tracker
```

**Expected contents:**

```bash
AZURE_DEVOPS_PAT=your_personal_access_token_here
AZURE_DEVOPS_ORG=https://dev.azure.com/<org>
AZURE_DEVOPS_PROJECT=<project>
```

## Priority Order for Operations

### 1️⃣ PRIMARY: Azure CLI (`az boards`)

Use for **ALL** standard work item operations:

```bash
# Create work item
az boards work-item create \
  --title "Fix login bug" \
  --type Bug \
  --description "Users cannot login with special chars" \
  --priority 1 \
  --org https://dev.azure.com/<org> \
  --project <project>

# Update work item
az boards work-item update \
  --id 42 \
  --state "Active" \
  --assigned-to "user@example.com" \
  --org https://dev.azure.com/<org>

# Query work items
az boards query \
  --wiql "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [State] = 'Active'" \
  --org https://dev.azure.com/<org> \
  --project <project>

# Add parent relationship
az boards work-item relation add \
  --id 4 \
  --relation-type parent \
  --target-id 3 \
  --org https://dev.azure.com/<org>

# Close work item
az boards work-item update \
  --id 42 \
  --state "Closed" \
  --org https://dev.azure.com/<org>
```

### 2️⃣ FALLBACK: REST API

**ONLY use when CLI doesn't support the operation.**

Known CLI limitations requiring REST API:

- Listing comment history
- Adding rich text comments
- Complex custom field operations
- Advanced JSON Patch operations

Run these with `env/tracker` injected so `$AZURE_DEVOPS_ORG`, `$AZURE_DEVOPS_PROJECT` and `$AZURE_DEVOPS_PAT` are set, for example inside `akm env run env/tracker -- bash -s <<'EOF'` ... `EOF`.

```bash
# Add comment (CLI has limited support)
curl -X POST \
  "$AZURE_DEVOPS_ORG/$AZURE_DEVOPS_PROJECT/_apis/wit/workitems/42/comments?api-version=7.0-preview.3" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n :$AZURE_DEVOPS_PAT | base64)" \
  -d '{"text": "Implementation complete. Ready for testing."}'

# List comments
curl -s \
  "$AZURE_DEVOPS_ORG/$AZURE_DEVOPS_PROJECT/_apis/wit/workitems/42/comments?api-version=7.0-preview.3" \
  -H "Authorization: Basic $(echo -n :$AZURE_DEVOPS_PAT | base64)" | jq

# Update custom field
curl -X PATCH \
  "$AZURE_DEVOPS_ORG/$AZURE_DEVOPS_PROJECT/_apis/wit/workitems/42?api-version=7.0" \
  -H "Content-Type: application/json-patch+json" \
  -H "Authorization: Basic $(echo -n :$AZURE_DEVOPS_PAT | base64)" \
  -d '[
    {
      "op": "add",
      "path": "/fields/Custom.BusinessValue",
      "value": 100
    }
  ]'
```

## Decision Matrix

| Operation                    | Method         | Command/API                                |
| ---------------------------- | -------------- | ------------------------------------------ |
| **Create work item**         | ✅ CLI         | `az boards work-item create`               |
| **Update title/description** | ✅ CLI         | `az boards work-item update`               |
| **Change state**             | ✅ CLI         | `az boards work-item update --state`       |
| **Assign to user**           | ✅ CLI         | `az boards work-item update --assigned-to` |
| **Set priority**             | ✅ CLI         | `az boards work-item update --priority`    |
| **Query work items**         | ✅ CLI         | `az boards query --wiql`                   |
| **Add parent relationship**  | ✅ CLI         | `az boards work-item relation add`         |
| **List work items**          | ✅ CLI         | `az boards work-item list`                 |
| **Show work item**           | ✅ CLI         | `az boards work-item show`                 |
| **Add simple comment**       | ⚠️ CLI Limited | `az boards work-item update --discussion`  |
| **List comments**            | ❌ REST API    | `GET .../comments`                         |
| **Add rich comment**         | ❌ REST API    | `POST .../comments`                        |
| **Update custom fields**     | ❌ REST API    | `PATCH .../workitems/{id}`                 |
| **Batch operations**         | ✅ CLI + Loop  | Shell loop with `az boards`                |

## Setup Instructions

### Step 1: Install Azure CLI

```bash
# Linux (Ubuntu/Debian)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# macOS
brew install azure-cli

# Windows
winget install Microsoft.AzureCLI
```

### Step 2: Install Azure DevOps Extension

```bash
az extension add --name azure-devops
```

### Step 3: Authenticate

```bash
# Interactive login (recommended)
az devops login --org https://dev.azure.com/<org>
```

### Step 4: Set Defaults (Optional but Recommended)

```bash
az devops configure --defaults \
  organization=https://dev.azure.com/<org> \
  project=<project>

# Verify configuration
az devops configure --list
```

### Step 5: Create PAT Token for REST API Fallback

1. Go to: https://dev.azure.com/<org>/_usersSettings/tokens
2. Click "New Token"
3. Configure:
   - **Name**: "CLI/API Access"
   - **Scopes**: Select "Work Items" → "Read, Write, & Manage"
   - **Expiration**: Choose appropriate duration
4. Click "Create"
5. **Copy token immediately** (only shown once)

### Step 6: Save to env/tracker

```bash
# Save credentials to env/tracker in your own stash (akm creates it with 600 permissions)
akm env create tracker --from-stdin <<'EOF'
AZURE_DEVOPS_PAT=your_copied_token_here
AZURE_DEVOPS_ORG=https://dev.azure.com/<org>
AZURE_DEVOPS_PROJECT=<project>
EOF

# If env/tracker already exists, add these lines to the file this prints instead
akm env path env/tracker

# Verify (key names only, no values)
akm env list
```

## Credential Verification

### Check CLI Authentication

```bash
# Test CLI authentication
az account show

# Test Azure DevOps CLI
az boards work-item show --id 3 --org https://dev.azure.com/<org>
```

### Check env/tracker

```bash
# Verify env/tracker exists and has correct permissions
ls -la "$(akm env path env/tracker -q)"

# Should show: -rw------- (600 permissions)

# Check contents
akm env run env/tracker -- bash -s <<'EOF'
echo "PAT set: ${AZURE_DEVOPS_PAT:0:10}..." # Shows first 10 chars
echo "Org: $AZURE_DEVOPS_ORG"
EOF
```

### Test REST API with PAT

```bash
# Test API access with env/tracker injected
akm env run env/tracker -- bash -s <<'EOF'
curl -s \
  "$AZURE_DEVOPS_ORG/$AZURE_DEVOPS_PROJECT/_apis/wit/workitems/3?api-version=7.0" \
  -H "Authorization: Basic $(echo -n :$AZURE_DEVOPS_PAT | base64)" | jq '.fields."System.Title"'
EOF
```

## Common Patterns

### Pattern 1: Create Work Item with CLI

```bash
# Create user story
STORY_ID=$(az boards work-item create \
  --title "Implement feature X" \
  --type "User Story" \
  --description "As a user, I want..." \
  --priority 2 \
  --org https://dev.azure.com/<org> \
  --project <project> \
  --query id -o tsv)

echo "Created User Story #$STORY_ID"
```

### Pattern 2: Create Child Tasks

```bash
# Create 5 tasks under story
for phase in "Design" "Implementation" "Testing" "Documentation" "Deployment"
do
  TASK_ID=$(az boards work-item create \
    --title "Phase: $phase" \
    --type Task \
    --parent $STORY_ID \
    --priority 1 \
    --org https://dev.azure.com/<org> \
    --project <project> \
    --query id -o tsv)

  echo "Created Task #$TASK_ID: $phase"
done
```

### Pattern 3: Update State Workflow

```bash
# Move work item through states
WORK_ITEM=42

# Start work
az boards work-item update --id $WORK_ITEM --state "Active"

# Mark for review
az boards work-item update --id $WORK_ITEM --state "Resolved"

# Complete
az boards work-item update --id $WORK_ITEM --state "Closed"
```

### Pattern 4: Query and Process

```bash
# Get all active items assigned to current user
az boards query \
  --wiql "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [State] = 'Active' AND [Assigned To] = @Me" \
  --org https://dev.azure.com/<org> \
  --project <project> \
  -o table
```

### Pattern 5: Add Comment via REST API

```bash
# Run with credentials from env/tracker injected
akm env run env/tracker -- bash -s <<'EOF'
WORK_ITEM=42
COMMENT="Implementation complete. Ready for testing."

curl -s -X POST \
  "$AZURE_DEVOPS_ORG/$AZURE_DEVOPS_PROJECT/_apis/wit/workitems/$WORK_ITEM/comments?api-version=7.0-preview.3" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n :$AZURE_DEVOPS_PAT | base64)" \
  -d "{\"text\": \"$COMMENT\"}" | jq
EOF
```

## Troubleshooting

### CLI Authentication Failed

```bash
# Re-authenticate
az devops login --org https://dev.azure.com/<org>

# Check current login status
az account show
```

### REST API 401 Unauthorized

```bash
# Check if env/tracker exists
akm env path env/tracker

# Verify PAT is loaded, then test it with a simple API call
akm env run env/tracker -- bash -s <<'EOF'
echo "PAT: ${AZURE_DEVOPS_PAT:0:10}..."
curl -s "$AZURE_DEVOPS_ORG/_apis/projects?api-version=7.0" \
  -H "Authorization: Basic $(echo -n :$AZURE_DEVOPS_PAT | base64)" | jq
EOF
```

### Work Item Not Found

```bash
# Verify organization and project
az devops configure --list

# Try with explicit org/project
az boards work-item show \
  --id 42 \
  --org https://dev.azure.com/<org> \
  --project <project>
```

## Best Practices

1. **✅ Always use CLI first** - Only fallback to REST API when necessary
2. **✅ Set CLI defaults** - Reduces command verbosity
3. **✅ Use env/tracker for PAT** - Don't hardcode tokens in scripts
4. **✅ Test authentication** - Verify both CLI and API access work
5. **✅ Use query output** - Extract IDs with `--query id -o tsv` for scripting
6. **✅ Check env/tracker first** - Before making API calls, ensure credentials exist
7. **❌ Don't put PAT tokens in shared bundles** - `env/tracker` belongs in your own stash, never in akm-shared
8. **❌ Don't use REST API for standard operations** - CLI is faster and more reliable

## Reference Links

- Azure CLI Documentation: https://learn.microsoft.com/en-us/cli/azure/boards
- Azure DevOps REST API: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/
- Work Items API: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items
- Comments API: https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/comments
