---
name: cli-workflow-creator
description: "Creates reusable Claude Code slash commands from CLI workflows
  through iterative conversation. Use when: (1) User wants to automate a
  multi-step CLI process, (2) User says 'create a workflow' or 'automate this
  CLI task', (3) User describes a sequence of terminal commands they run
  repeatedly, (4) User wants to save a CLI pipeline as a reusable command.
  Outputs a .md slash command file that Claude Code can execute directly."
updated: 2026-03-15
when_to_use: Use this skill when you need to automate repetitive CLI tasks,
  standardize complex multi-step shell workflows, or create reusable commands
  for your team. Ideal for converting ad-hoc command sequences into documented,
  executable slash commands that handle variables, error states, and step
  dependencies automatically.
---

# CLI Workflow Creator

Create reusable Claude Code slash commands by iteratively gathering CLI workflow requirements through conversation.

## Output Format

The skill produces a markdown file that serves as a Claude Code custom slash command. Save to `.opencode/command/` for project-specific or `~/.config/opencode/command/` for global access.

### Slash Command Structure

```markdown
---
description: What this workflow does (shown in command list)
---

# Workflow Name

## Purpose
[What this workflow accomplishes and when to use it]

## Required Information
Before executing, confirm or ask for:
- **variable_name**: [description] (default: [value] if any)
- **another_var**: [description] (required, no default)

## Steps

### Step 1: [Name]
[What this step does and why]

Command:
\`\`\`bash
command --flag $ARGUMENTS
\`\`\`

[Instructions for handling output, what to look for, what indicates success/failure]

### Step 2: [Name]
[Description, noting any dependencies on previous steps]

Command:
\`\`\`bash
next-command [using output from step 1 if needed]
\`\`\`

[Continue for each step...]

## Error Handling
- **Step 1 fails**: [what to do - stop, retry, skip to step N]
- **Step 2 fails**: [what to do]

## Output
When complete, report:
- [What information to summarize]
- [What files were created/modified]
- [Any values the user needs to know]
```

## Creating a Workflow

Gather information through conversation. Ask only what's needed, 1-2 questions at a time.

### Phase 1: Purpose
Start with the goal:
- "What task does this workflow automate?"
- "What triggers you to run it?"

### Phase 2: Command Discovery
Map each step sequentially:
- "What's the first command you run?"
- "What happens next if that succeeds?"

For each command, determine:
- The exact CLI command and flags
- What changes between runs → becomes a variable to ask about
- What stays constant → hardcode in the command

### Phase 3: Data Flow
Identify step dependencies:
- "Does any command produce output the next step needs?"
- "How would you extract that value?" (grep pattern, jq query, etc.)

### Phase 4: Error Handling
For each step:
- "If this fails, should the workflow stop or continue?"
- "Any cleanup or rollback needed?"

### Phase 5: Outputs
- "What should be reported when complete?"
- "Any files or values the user needs?"

## Clarification Patterns

**During Creation:**
| Situation | Ask |
|-----------|-----|
| Unclear if value changes | "Does [value] change between runs, or always the same?" |
| Complex output parsing | "Can you show example output? What part do you need?" |
| Implicit ordering | "Does step B need anything from step A?" |
| Missing error handling | "If [step] fails, stop everything or try to continue?" |

## Example Conversation

```
User: I want to automate deploying containers to staging.

Claude: I'll help create a workflow for that. What's the first step - 
do you build locally or pull from a registry?

User: Build locally, tag it, push to ECR, then update the ECS service.

Claude: Got it - four steps. For the build:
- Where's your Dockerfile?
- Does the image tag change per deploy, or always use 'latest'?

User: Dockerfile is in ./docker/, tag should be the git commit SHA.

Claude: And for ECR - what's your registry URL? Does it vary or is it 
always the same account/region?

[...continues until all details gathered...]
```

## Generated Command Example

After gathering requirements, produce:

```markdown
---
description: Build and deploy container to staging ECS
---

# Deploy to Staging

## Purpose
Builds Docker image from local source, pushes to ECR, and updates the staging ECS service. Run after merging to main when ready to deploy.

## Required Information
Before executing, confirm:
- **commit_sha**: Git commit to deploy (default: current HEAD)
- **skip_build**: Set to true to deploy existing image (default: false)

## Steps

### Step 1: Get commit SHA
Capture the current git commit if not provided.

Command:
\`\`\`bash
git rev-parse --short HEAD
\`\`\`

Use output as the image tag for subsequent steps.

### Step 2: Build Docker image
Build from ./docker/ directory with commit SHA tag.

Command:
\`\`\`bash
docker build -t myapp:$COMMIT_SHA -f ./docker/Dockerfile .
\`\`\`

Success: "Successfully built" and "Successfully tagged" in output.
Failure: Stop workflow, report build errors.

### Step 3: Tag for ECR
Tag the local image for the ECR registry.

Command:
\`\`\`bash
docker tag myapp:$COMMIT_SHA 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:$COMMIT_SHA
\`\`\`

### Step 4: Push to ECR
Push the tagged image. Requires valid AWS credentials.

Command:
\`\`\`bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:$COMMIT_SHA
\`\`\`

Success: Shows layer push progress and digest.
Failure: Check AWS credentials and ECR permissions.

### Step 5: Update ECS service
Force new deployment with the updated image.

Command:
\`\`\`bash
aws ecs update-service --cluster staging --service myapp --force-new-deployment
\`\`\`

Success: Returns service description JSON with "desiredCount" matching "runningCount" eventually.

## Error Handling
- **Build fails**: Stop. Report error output. Check Dockerfile syntax and build context.
- **ECR push fails**: Stop. Verify AWS credentials: `aws sts get-caller-identity`
- **ECS update fails**: Report error but deployment may still be rolling out. Check console.

## Output
Report:
- Deployed commit SHA
- ECR image URI
- ECS service update status
- Time taken for full deployment
```

## Slash Command Best Practices

**File naming**: Use kebab-case matching the command name (`deploy-staging.md` → `/deploy-staging`)

**Description**: Keep frontmatter description under 80 chars - it's shown in command listings

**Variables**: Document all inputs in "Required Information" so Claude knows what to ask

**Commands**: Put each command in its own fenced code block so Claude can execute directly

**Context**: Include enough detail that Claude understands *why* each step happens, not just *what*

**Error handling**: Be specific about what failure looks like and what to do

**Idempotency**: Note if steps can be safely re-run or need special handling
