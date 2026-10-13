---
description: Execute a database backup and upload to S3 with timestamp, or run
  tests followed by conditional deployment based on test results.
when_to_use: Use for nightly maintenance tasks, pre-deployment backups, CI/CD
  pipelines requiring test validation before production changes, or any workflow
  involving sequential operations with optional branching logic.
updated: 2026-05-12
---
# Example Slash Commands

Reference examples showing different workflow patterns as Claude Code slash commands.

## Simple Linear Workflow

```markdown
---
description: Backup database and upload to S3
---

# Database Backup

## Purpose
Creates a PostgreSQL dump and uploads to S3 with timestamp. Run nightly or before major changes.

## Required Information
- **db_name**: Database to backup (default: production)
- **s3_bucket**: S3 bucket for backups (default: company-backups)

## Steps

### Step 1: Create timestamp
Generate timestamp for backup filename.

Command:
\`\`\`bash
date +%Y%m%d_%H%M%S
\`\`\`

Store this value as TIMESTAMP for use in filenames.

### Step 2: Dump database
Create compressed SQL dump.

Command:
\`\`\`bash
pg_dump $DB_NAME | gzip > <temp-file>
\`\`\`

Success: File created with non-zero size.
Failure: Check database connectivity and permissions.

### Step 3: Upload to S3
Transfer backup to S3.

Command:
\`\`\`bash
aws s3 cp <temp-file> s3://$S3_BUCKET/db-backups/
\`\`\`

### Step 4: Cleanup
Remove local temp file.

Command:
\`\`\`bash
rm <temp-file>
\`\`\`

## Output
Report: backup filename, S3 URI, file size, time taken.
```

## Workflow with Conditional Steps

```markdown
---
description: Run tests and deploy if passing
---

# Test and Deploy

## Purpose
Runs test suite and only deploys if all tests pass. Use for CI/CD pipeline.

## Required Information
- **environment**: Target environment (staging/production)
- **skip_tests**: Set true to deploy without testing (default: false)

## Steps

### Step 1: Run test suite
Execute all tests. Skip if skip_tests is true.

Command:
\`\`\`bash
npm test
\`\`\`

Success: Exit code 0, "All tests passed" in output.
Failure: Stop workflow. Do not proceed to deployment.

### Step 2: Build for production
Create optimized build.

Command:
\`\`\`bash
npm run build
\`\`\`

### Step 3: Deploy
Deploy based on environment.

For staging:
\`\`\`bash
rsync -avz ./dist/ deploy@staging.example.com:(removed)
\`\`\`

For production:
\`\`\`bash
rsync -avz ./dist/ deploy@prod.example.com:(removed)
\`\`\`

## Error Handling
- **Tests fail**: Stop immediately. Report which tests failed.
- **Build fails**: Stop. Check for TypeScript/compilation errors.
- **Deploy fails**: Report but may need manual intervention.

## Output
Report: test results summary, build size, deployment target, completion status.
```

## Workflow with Output Parsing

```markdown
---
description: Find and kill process by port
---

# Kill Port

## Purpose
Finds process using a specific port and terminates it. Useful for freeing up ports during development.

## Required Information
- **port**: Port number to free (required, no default)
- **force**: Use SIGKILL instead of SIGTERM (default: false)

## Steps

### Step 1: Find process on port
Identify PID using the specified port.

Command:
\`\`\`bash
lsof -i :$PORT -t
\`\`\`

If no output: Port is already free. Report and stop (success).
If output: Capture the PID(s) for next step.

### Step 2: Show process details
Display what will be killed before proceeding.

Command:
\`\`\`bash
ps aux | grep $PID
\`\`\`

Ask user to confirm before proceeding to kill.

### Step 3: Terminate process
Kill the process using appropriate signal.

If force is false:
\`\`\`bash
kill $PID
\`\`\`

If force is true:
\`\`\`bash
kill -9 $PID
\`\`\`

### Step 4: Verify port is free
Confirm the port is now available.

Command:
\`\`\`bash
lsof -i :$PORT
\`\`\`

Success: No output (port is free).
Failure: Process may have respawned or multiple processes.

## Output
Report: what process was killed, port status after.
```

## Workflow with Rollback

```markdown
---
description: Database migration with rollback capability
---

# Run Migration

## Purpose
Applies database migrations with automatic rollback on failure.

## Required Information
- **migration_dir**: Path to migrations (default: ./migrations)
- **dry_run**: Show what would run without executing (default: false)

## Steps

### Step 1: Check pending migrations
List migrations that will be applied.

Command:
\`\`\`bash
ls $MIGRATION_DIR/*.sql | sort
\`\`\`

If no files: Report "No pending migrations" and stop (success).

### Step 2: Create backup point
Snapshot current state for potential rollback.

Command:
\`\`\`bash
pg_dump $DATABASE > <temp-file>
\`\`\`

### Step 3: Apply migrations
Run each migration file in order.

For each .sql file:
\`\`\`bash
psql $DATABASE < $MIGRATION_FILE
\`\`\`

On failure: Immediately proceed to rollback step.

### Step 4: Verify migration
Run sanity checks on migrated database.

Command:
\`\`\`bash
psql $DATABASE -c "SELECT COUNT(*) FROM schema_migrations;"
\`\`\`

### Rollback (on failure only)
Restore from backup point.

Command:
\`\`\`bash
psql $DATABASE < <temp-file>
\`\`\`

Report which migration failed and that rollback completed.

## Error Handling
- **Backup fails**: Stop before any migrations. Cannot proceed safely.
- **Migration fails**: Automatic rollback, report failed migration.
- **Rollback fails**: CRITICAL - manual intervention required.

## Output
Report: migrations applied, before/after row counts for affected tables, time taken.
```

## Interactive Workflow

```markdown
---
description: Initialize new project from template
---

# New Project

## Purpose
Scaffolds a new project with customizable options. Interactive - asks questions during execution.

## Required Information
Gather interactively:
- **project_name**: Name for new project
- **template**: Template type (api/web/cli)
- **git_init**: Initialize git repository (default: true)
- **install_deps**: Run npm install after scaffolding (default: true)

## Steps

### Step 1: Validate project name
Ensure name is valid for npm package.

Check:
- Lowercase only
- No spaces (use hyphens)
- Doesn't already exist in current directory

### Step 2: Create from template
Clone or copy appropriate template.

For api template:
\`\`\`bash
cp -r ~/.templates/api-starter ./$PROJECT_NAME
\`\`\`

For web template:
\`\`\`bash
cp -r ~/.templates/web-starter ./$PROJECT_NAME
\`\`\`

For cli template:
\`\`\`bash
cp -r ~/.templates/cli-starter ./$PROJECT_NAME
\`\`\`

### Step 3: Customize package.json
Update project metadata.

\`\`\`bash
cd $PROJECT_NAME
sed -i "s/TEMPLATE_NAME/$PROJECT_NAME/g" package.json
\`\`\`

### Step 4: Initialize git (if requested)
\`\`\`bash
git init
git add .
git commit -m "Initial commit from $TEMPLATE template"
\`\`\`

### Step 5: Install dependencies (if requested)
\`\`\`bash
npm install
\`\`\`

## Output
Report: project location, template used, next steps to get started.
```
