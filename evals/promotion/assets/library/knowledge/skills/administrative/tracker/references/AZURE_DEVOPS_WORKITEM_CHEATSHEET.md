---
description: A quick reference guide for creating Azure DevOps work items (User
  Stories, Tasks, Bugs) using the az boards CLI extension. Includes setup
  commands, environment variable requirements, and templated command examples
  with structured description fields and priority settings.
when_to_use: Use when scripting backlog entry or integrating work item creation
  into CI/CD pipelines. Applicable for developers and QA engineers who need to
  create standardized work items programmatically without using the Azure DevOps
  web interface.
updated: 2026-05-15
---
# Azure DevOps Work Item Creation Cheatsheet

## Quick Reference

### Setup Commands
```bash
# Run with credentials from env/tracker injected (do not source the raw env file)
akm env run env/tracker -- bash -s <<'EOF'
# Set authentication token for Azure CLI extension
export AZURE_DEVOPS_EXT_PAT="$AZURE_DEVOPS_PAT"

# Configure defaults (one-time setup)
az devops configure --defaults \
  organization="$AZURE_DEVOPS_ORG" \
  project="$AZURE_DEVOPS_PROJECT"
EOF
```

The defaults persist, but the exported token does not: run later `az boards` commands the same way, or sign in once with `az devops login`.

### Environment Variables Required
- `AZURE_DEVOPS_EXT_PAT`: Personal Access Token for Azure DevOps CLI extension
- `AZURE_DEVOPS_PAT`: PAT stored in `env/tracker`
- `AZURE_DEVOPS_ORG`: Organization URL (`https://dev.azure.com/<org>`), stored in `env/tracker`
- `AZURE_DEVOPS_PROJECT`: Project name (`<project>`), stored in `env/tracker`

---

## Work Item Creation Templates

### User Story Template
```bash
az boards work-item create \
  --type "User Story" \
  --title "[FEATURE] Brief descriptive title" \
  --description "High-level description of the feature and its value to users.

## Implementation Requirements
- Requirement 1
- Requirement 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3" \
  --fields "Microsoft.VSTS.Common.Priority=2"
```

### Task Template
```bash
az boards work-item create \
  --type "Task" \
  --title "[PHASE] Specific task description" \
  --description "Detailed description of what needs to be done.

## Changes Required
- File: src/path/to/file.js (line ~123)
- Change: Description of modification

## Acceptance Criteria
- [ ] Specific, testable criterion 1
- [ ] Specific, testable criterion 2" \
  --fields "Microsoft.VSTS.Common.Priority=1"
```

### Bug Template
```bash
az boards work-item create \
  --type "Bug" \
  --title "[BUG] Brief description of issue" \
  --description "## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior  
What actually happens

## Environment
- Browser: Chrome/Firefox/etc
- OS: Windows/Mac/Linux
- Version: X.Y.Z" \
  --fields "Microsoft.VSTS.Common.Priority=1;Microsoft.VSTS.Common.Severity=2 - High"
```

---

## Common Field Values

### Priority Levels
- `1`: Highest (Critical)
- `2`: High (Important)
- `3`: Medium (Normal)  
- `4`: Low (Nice to have)

### Severity Levels (Bugs)
- `1 - Critical`: System down, security issue
- `2 - High`: Major functionality broken
- `3 - Medium`: Partial functionality broken
- `4 - Low`: Minor issue or cosmetic

### Work Item Types
- `User Story`: Feature requested by users
- `Task`: Specific implementation work
- `Bug`: Issue that needs fixing
- `Epic`: Large feature spanning multiple sprints
- `Product Backlog Item`: Small feature or improvement

---

## Work Item Management

### Update Work Item
```bash
# Change state
az boards work-item update --id 123 --state "Active"

# Change priority
az boards work-item update --id 123 --fields "Microsoft.VSTS.Common.Priority=1"

# Update description
az boards work-item update --id 123 --description "Updated description"

# Multiple fields at once
az boards work-item update --id 123 \
  --state "Active" \
  --fields "Microsoft.VSTS.Common.Priority=1;System.Tags=ui; backend"
```

### Work Item States
- `New`: Just created
- `Active`: Currently being worked on
- `Resolved`: Implementation complete, ready for testing
- `Closed`: Testing complete, item done
- `Removed`: No longer needed

### Create Work Items with Parent Link
```bash
# Create child task
az boards work-item create \
  --type "Task" \
  --title "[PHASE 1] Implementation" \
  --description "Task description" \
  --parent 123 \
  --fields "Microsoft.VSTS.Common.Priority=2"

# Link existing items
az boards work-item relation add \
  --id 456 \
  --relation-type parent \
  --target-id 123
```

### Work Item Relationships
- `parent`: Child → Parent (task belongs to user story)
- `related`: Related items (informal association)
- `predecessor`: Successor depends on predecessor
- `blocks`: This item blocks another item

---

## Querying Work Items

### Basic Queries
```bash
# Show specific work item
az boards work-item show --id 123

# List my assigned items
az boards query \
  --wiql "SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.AssignedTo] = @Me"

# List all active items
az boards query \
  --wiql "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.State] = 'Active'"

# List items by type
az boards query \
  --wiql "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.WorkItemType] = 'User Story'"
```

--

## Output Formats

### Common Output Formats
```bash
# Table format (default, human readable)
az boards work-item show --id 123 --output table

# JSON format (script friendly)
az boards work-item show --id 123 --output json

# TSV format (tab separated, easy to parse)
az boards work-item show --id 123 --output tsv

# Extract specific field
az boards work-item show --id 123 --output tsv --query "fields[System.Title]"
```

### Query Examples with Output
```bash
# Get just IDs for scripting
az boards query --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'" --output tsv --query "value[].id"

# Get titles and states
az boards query --wiql "SELECT [System.Title], [System.State] FROM WorkItems WHERE [System.AssignedTo] = @Me" --output table
```

---

## Bulk Operations

### Create Multiple Work Items
```bash
#!/bin/bash
# Create user story with multiple phases
STORY_ID=$(az boards work-item create \
  --type "User Story" \
  --title "Implement Feature X" \
  --description "Description" \
  --query id -o tsv)

echo "Created User Story #$STORY_ID"

# Create phases as child tasks
for PHASE in "Type Definitions" "Business Logic" "UI Implementation" "Testing"
do
  TASK_ID=$(az boards work-item create \
    --type "Task" \
    --title "[PHASE] $PHASE" \
    --parent $STORY_ID \
    --query id -o tsv)
  
  echo "Created Task #$TASK_ID: $PHASE"
done
```

### Bulk Update States
```bash
#!/bin/bash
# Close all resolved items
RESOLVED_IDS=$(az boards query \
  --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Resolved'" \
  --output tsv --query "value[].id")

for ID in $RESOLVED_IDS; do
  az boards work-item update --id $ID --state "Closed"
  echo "Closed Work Item #$ID"
done
```

---

## Adding Comments (REST API)

### When CLI Doesn't Support Comments
```bash
# Run with credentials from env/tracker injected
akm env run env/tracker -- bash -s <<'EOF'
# Get work item ID
WORK_ITEM_ID=123

# Add comment using REST API
curl -X POST \
  "$AZURE_DEVOPS_ORG/$AZURE_DEVOPS_PROJECT/_apis/wit/workitems/$WORK_ITEM_ID/comments?api-version=7.0-preview.3" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n :$AZURE_DEVOPS_PAT | base64)" \
  -d "{
    \"text\": \"Updated implementation status. Ready for review.\"
  }"
EOF
```

---

## URL Patterns

### Work Item URLs
```
Direct Edit: https://dev.azure.com/<org>/<project>/_workitems/edit/{ID}
View Only: https://dev.azure.com/<org>/<project>/_workitems/{ID}
```

### Repository URLs
```
Repository (<repo>): https://dev.azure.com/<org>/<project>/_git/index?repo=<repo>&ref=branch-name
```

---

## Troubleshooting

### Common Errors and Solutions

**"Before you can run Azure DevOps commands, you need to run the login command"**
```bash
# Solution: Set PAT environment variable
export AZURE_DEVOPS_EXT_PAT="$AZURE_DEVOPS_PAT"
```

**"invalid literal for int() with base 10"**
```bash
# Solution: Use different output format
az boards work-item show --id 123 --output table  # instead of json
```

**"unrecognized identity for field 'Assigned To'"**
```bash
# Solution: Omit assignment during creation, update later
az boards work-item create --title "Title" --type "Task"  # no assignment
az boards work-item update --id 123 --assigned-to "user@domain.com"  # update after
```

**Timeouts with queries**
```bash
# Solution: Use simpler queries or specific fields
az boards work-item show --id 123  # instead of complex queries
```

---

## Best Practices

### Do ✅
1. **Set defaults once**: Use `az devops configure --defaults`
2. **Create with descriptions**: Add detailed descriptions during creation
3. **Link items**: Use parent-child relationships for tasks
4. **Set priorities**: Always specify priority (1-4)
5. **Use scripts**: For repetitive operations, create shell scripts
6. **Test commands**: Try on single item before bulk operations
7. **Version control scripts**: Keep work item scripts in git

### Don't ❌
1. **Skip descriptions**: Empty descriptions make items hard to understand
2. **Forget links**: Related items should be linked
3. **Ignore priorities**: All items need priority for sprint planning
4. **Create generic titles**: Use specific, descriptive titles
5. **Mix formats**: Be consistent with title patterns
6. **Ignore dependencies**: Mark blockers explicitly

---

## Quick Commands Summary

```bash
# Setup (run once)
akm env run env/tracker -- bash -s <<'EOF'
export AZURE_DEVOPS_EXT_PAT="$AZURE_DEVOPS_PAT"
az devops configure --defaults organization="$AZURE_DEVOPS_ORG" project="$AZURE_DEVOPS_PROJECT"
EOF

# Create work item
az boards work-item create --type "Task" --title "Title" --description "Desc"

# Update work item  
az boards work-item update --id 123 --state "Active"

# Show work item
az boards work-item show --id 123

# Query work items
az boards query --wiql "SELECT [Id], [Title] FROM WorkItems WHERE [State] = 'Active'"

# Link work items
az boards work-item relation add --id 456 --relation-type parent --target-id 123
```

---

## Environment File

`env/tracker` (`tracker.env`) in your own akm stash. `akm env path env/tracker` prints its location; see [authentication.md](authentication.md) for every variable it holds.
