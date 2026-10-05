---
description: Amazon Q CLI — AWS's AI coding agent CLI with Claude Sonnet, MCP tools, and AWS API integration
when_to_use: When working in AWS environments, needing AWS resource access from an agent, or wanting a Claude-powered agent via Amazon
updated: 2026-09-15
---

# Amazon Q CLI Reference

## What It Is

Amazon Q Developer CLI is AWS's AI coding agent. It uses Claude 3.7 Sonnet by default, supports
native MCP tools, can read/write files and run bash commands, and has direct access to AWS APIs
and resources. Granular approval modes: automated or step-by-step review.

## Setup Checklist

Follow these steps in order. Choose **Path A** (AWS Builder ID, free) or **Path B** (AWS IAM).

```bash
# 1. Install (choose platform)
# macOS:
brew install amazon-q
# Linux (deb):
curl -fsSL https://desktop-release.codewhisperer.us-east-1.amazonaws.com/latest/linux/x86_64/amazon-q.deb \
  -o <temp-file> && sudo dpkg -i <temp-file>

# 2. Verify install
q --version

# --- PATH A: AWS Builder ID (free tier, no AWS account required) ---
# 3a. Interactive OAuth login
q login
# Browser opens — create or sign in with AWS Builder ID

# --- PATH B: AWS IAM credentials (enterprise) ---
# 3b. Ensure AWS credentials are configured (see Credential Security)
aws sts get-caller-identity   # verify credentials work
# Then login using AWS credentials:
q login --use-aws-credentials

# 4. Verify login
q --version   # should not prompt for login

# 5. Smoke test
q chat --no-interactive "say hello"
```

## Install

```bash
# macOS
brew install amazon-q

# Linux (deb)
curl -fsSL https://desktop-release.codewhisperer.us-east-1.amazonaws.com/latest/linux/x86_64/amazon-q.deb \
  -o <temp-file> && sudo dpkg -i <temp-file>

# npm (alternative)
npm install -g @aws/amazon-q-developer-cli

# Verify
q --version
```

## Authentication

```bash
# Option 1: AWS Builder ID (free — no AWS account required)
q login
# Completes via browser; token stored securely by q CLI

# Option 2: AWS IAM credentials
# Set up standard AWS credential chain first (never hardcode keys):
#   ~/.aws/credentials, ~/.aws/config, or environment variables
export AWS_PROFILE=my-profile
export AWS_REGION=us-east-1
q login --use-aws-credentials
```

Free tier available with AWS Builder ID.

## Credential Security

Amazon Q uses two credential types with different security profiles.

### Builder ID / OAuth (no API key)

```bash
# Auth managed by q CLI — no env var to protect
q login   # one-time browser flow
q --version   # confirm session is active

# If session expires: q login again
# Token stored at: ~/.local/share/amazon-q/ (do not log or print the token value)
```

### AWS IAM credentials

```bash
# Use the AWS credential chain — NEVER hardcode keys in scripts
# Priority order (highest to lowest):
#   1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
#   2. ~/.aws/credentials file
#   3. ~/.aws/config with profiles
#   4. IAM role (EC2/ECS/Lambda — preferred in production)

# Set up a named profile (stored in ~/.aws/credentials — file-level protected)
aws configure --profile my-q-profile

# Or use temporary credentials (preferred — short-lived)
eval "$(aws sts assume-role \
  --role-arn arn:aws:iam::123456789:role/QDeveloperRole \
  --role-session-name q-session \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
  --output text | awk '{print "export AWS_ACCESS_KEY_ID="$1"\nexport AWS_SECRET_ACCESS_KEY="$2"\nexport AWS_SESSION_TOKEN="$3}')"

# Verify without revealing keys
aws sts get-caller-identity
```

Rules:
- **Never** hardcode `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in scripts
- **Never** `echo $AWS_SECRET_ACCESS_KEY` or log it
- **In CI/CD**: use IAM roles with OIDC federation (GitHub Actions, etc.) — no long-lived keys
- **With akm**: keep `AWS_PROFILE`/`AWS_REGION` (or short-lived keys) in your own `env/aws` and run `akm env run env/aws -- q chat ...`
- Prefer IAM roles over access keys wherever possible (EC2, ECS, Lambda auto-assume roles)

## Headless / Non-Interactive Mode

```bash
# Run a task inline
q chat --no-interactive "Add error handling to src/server.ts"

# Trust all tools (equivalent to --yolo / full-auto)
q chat --trust-all-tools "Refactor the auth module"

# Pipe prompt
echo "Fix the failing tests" | q chat --no-interactive --trust-all-tools
```

## Core Commands

### `q chat`

```bash
q chat                                    # interactive
q chat "Fix the TypeScript errors"        # inline prompt, interactive loop
q chat --no-interactive "List TODOs"      # fully headless
q chat --trust-all-tools "Refactor auth"  # auto-approve all tool calls
```

### `q translate`
Translate natural language to a shell command.

```bash
q translate "list all S3 buckets older than 30 days"
q translate "find all EC2 instances in us-east-1 with tag Env=prod"
```

## Core Flags

| Flag | Description |
|---|---|
| `--no-interactive` | Fully non-interactive |
| `--trust-all-tools` | Auto-approve all tool calls |
| `--profile` | AWS profile to use |
| `--region` | AWS region |

## AWS Integration

```bash
# AWS credentials must be valid before running AWS-specific tasks
aws sts get-caller-identity || { echo "ERROR: AWS credentials not configured" >&2; exit 1; }

# Query AWS resources
q chat "List all Lambda functions in us-east-1 that haven't been invoked in 30 days"

# Infrastructure tasks
q chat --trust-all-tools "Create a CloudFormation template for a serverless API with DynamoDB"

# CloudWatch logs
q chat "Analyze the last 100 error lines from /aws/lambda/my-function logs"
```

## MCP Integration

MCP config must not contain secrets — servers should read them from env:

```bash
# ~/.aws/amazonq/mcp.json
cat > ~/.aws/amazonq/mcp.json << 'EOF'
{
  "mcpServers": {
    "sqlite": { "command": "npx", "args": ["-y", "mcp-server-sqlite", "db.sqlite"] }
  }
}
EOF

q chat --trust-all-tools "Add validation using the database schema"
```

## Scripting

```bash
# Verify auth before scripted use
q --version 2>/dev/null || { echo "ERROR: q CLI not authenticated. Run: q login" >&2; exit 1; }

# Fully headless
q chat --no-interactive --trust-all-tools "Fix all lint errors in src/" < /dev/null

# Capture output
RESULT=$(q chat --no-interactive "Summarize the architecture" 2>&1)
```

## Troubleshooting

**`q: command not found`**
→ Install via brew/deb/npm (see above); verify: `which q`

**`Authentication failed`**
→ `q login` and complete the browser flow
→ For AWS credentials: `aws sts get-caller-identity` to verify they're valid

**Tool calls blocked in non-interactive mode**
→ Add `--trust-all-tools`

**AWS permissions errors during agent run**
→ `aws sts get-caller-identity` to confirm identity
→ Check IAM permissions: `aws iam simulate-principal-policy` for the relevant actions

**Rate limits**
→ Free Builder ID tier has usage limits; AWS account tier has higher quotas
→ Avoid parallel q chat invocations exceeding rate limits
