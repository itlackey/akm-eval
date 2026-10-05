#!/usr/bin/env bun
/**
 * tracker-cli.ts - Unified issue tracker CLI
 *
 * Supports GitHub, Gitea and Azure DevOps with auto-detection (GitLab is detected but not implemented)
 *
 * Usage: tracker <resource> <action> [options]
 */

import type { IssuePlatform, PlatformName } from "./lib/types.js";
import { detectPlatform, parseRepoString, supportsTimers, getPlatformDisplayName } from "./lib/platform-detector.js";
import { createAdapter, resolveCredentials, printTable, printJson, truncate, formatDate, runCli } from "./lib/base-adapter.js";
import { updateIssueState, updateBranchState, updatePrState, getCurrentIssue } from "./lib/workflow-state.js";

// ===== Argument Parsing =====

interface ParsedArgs {
  resource: string;
  action: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith("--")) {
          flags[key] = nextArg;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    resource: positional[0] || "",
    action: positional[1] || "",
    positional: positional.slice(2),
    flags,
  };
}

// ===== Platform Resolution =====

async function getAdapter(flags: Record<string, string | boolean>): Promise<IssuePlatform> {
  let platform: PlatformName | undefined;
  let repo: string | undefined;
  let baseUrl: string | undefined;

  // Check for explicit platform override
  if (flags.platform) {
    platform = flags.platform as PlatformName;
  }

  // Check for explicit repo
  if (flags.repo) {
    repo = flags.repo as string;
  }

  // Try to auto-detect from git remote
  if (!platform || !repo) {
    const detection = await detectPlatform();
    if (detection) {
      platform = platform || detection.platform;
      repo = repo || detection.fullName;
      baseUrl = detection.baseUrl;
    }
  }

  if (!platform) {
    throw new Error(
      "Could not detect platform. Use --platform=github|gitea|azdo|gitlab or --repo=owner/repo"
    );
  }

  if (!repo) {
    throw new Error(
      "Could not detect repository. Use --repo=owner/repo or run from a git repository"
    );
  }

  const credentials = await resolveCredentials(platform, baseUrl);
  return createAdapter(platform, repo, credentials);
}

// ===== Issue Commands =====

async function issueList(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const issues = await adapter.listIssues({
    state: args.flags.state as any,
    labels: args.flags.labels ? String(args.flags.labels).split(",") : undefined,
    assignee: args.flags.assignee as string,
    search: args.flags.search as string,
    limit: args.flags.limit ? parseInt(String(args.flags.limit)) : undefined,
  });

  if (args.flags.json) {
    printJson(issues);
    return;
  }

  if (issues.length === 0) {
    console.log("No issues found.");
    return;
  }

  const rows = issues.map((i) => [
    `#${i.number}`,
    i.state,
    truncate(i.title, 50),
    i.author.login,
    truncate(i.labels.map((l) => l.name).join(", "), 20),
  ]);

  printTable(["#", "State", "Title", "Author", "Labels"], rows);
}

async function issueGet(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  const issue = await adapter.getIssue(number);
  const comments = await adapter.listComments(number);

  if (args.flags.json) {
    printJson({ ...issue, comments });
    return;
  }

  console.log(`Issue #${issue.number}: ${issue.title}`);
  console.log(`State: ${issue.state}`);
  console.log(`Author: ${issue.author.login}`);
  console.log(`Created: ${formatDate(issue.createdAt)}`);
  console.log(`URL: ${issue.url}`);
  if (issue.labels.length > 0) {
    console.log(`Labels: ${issue.labels.map((l) => l.name).join(", ")}`);
  }
  if (issue.assignees.length > 0) {
    console.log(`Assignees: ${issue.assignees.map((a) => a.login).join(", ")}`);
  }
  console.log(`\n--- Description ---`);
  console.log(issue.body || "(No description)");

  if (comments.length > 0) {
    console.log(`\n--- Comments (${comments.length}) ---\n`);
    comments.forEach((c, i) => {
      console.log(`[${i + 1}] ${c.author.login} (${formatDate(c.createdAt)}):`);
      console.log(c.body);
      console.log("");
    });
  }
}

async function issueCreate(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const title = args.flags.title as string;
  if (!title) {
    throw new Error("--title is required");
  }

  const issue = await adapter.createIssue({
    title,
    body: args.flags.body as string,
    labels: args.flags.labels ? String(args.flags.labels).split(",") : undefined,
    assignees: args.flags.assignees ? String(args.flags.assignees).split(",") : undefined,
  });

  if (args.flags.json) {
    printJson(issue);
    return;
  }

  console.log(`Created issue #${issue.number}: ${issue.title}`);
  console.log(`URL: ${issue.url}`);
}

async function issueClose(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  await adapter.closeIssue(number, args.flags.comment as string);
  console.log(`Closed issue #${number}`);
}

async function issueReopen(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  await adapter.reopenIssue(number);
  console.log(`Reopened issue #${number}`);
}

async function issueUpdate(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  // Build update data from provided flags
  const updateData: Record<string, unknown> = {};

  if (args.flags.title) {
    updateData.title = args.flags.title as string;
  }
  if (args.flags.body) {
    updateData.body = args.flags.body as string;
  }
  if (args.flags.labels) {
    updateData.labels = String(args.flags.labels).split(",");
  }
  if (args.flags.assignees) {
    updateData.assignees = String(args.flags.assignees).split(",");
  }
  if (args.flags.state) {
    updateData.state = args.flags.state as string;
  }
  if (args.flags.milestone !== undefined) {
    updateData.milestone = args.flags.milestone === "none" ? null : args.flags.milestone;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("At least one update flag is required: --title, --body, --labels, --assignees, --state, --milestone");
  }

  const issue = await adapter.updateIssue(number, updateData);

  if (args.flags.json) {
    printJson(issue);
    return;
  }

  console.log(`Updated issue #${issue.number}: ${issue.title}`);
  console.log(`State: ${issue.state}`);
  if (issue.labels.length > 0) {
    console.log(`Labels: ${issue.labels.map((l) => l.name).join(", ")}`);
  }
  if (issue.assignees.length > 0) {
    console.log(`Assignees: ${issue.assignees.map((a) => a.login).join(", ")}`);
  }
  console.log(`URL: ${issue.url}`);
}

async function issueComment(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  const body = args.flags.body as string;
  if (!body) {
    throw new Error("--body is required");
  }

  const comment = await adapter.addComment(number, body);

  if (args.flags.json) {
    printJson(comment);
    return;
  }

  console.log(`Added comment to issue #${number}`);
}

async function issueComments(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  const comments = await adapter.listComments(number);

  if (args.flags.json) {
    printJson(comments);
    return;
  }

  if (comments.length === 0) {
    console.log("No comments found.");
    return;
  }

  comments.forEach((c, i) => {
    console.log(`--- Comment ${i + 1} (ID: ${c.id}) by ${c.author.login} (${formatDate(c.createdAt)}) ---`);
    console.log(c.body);
    console.log("");
  });
}

async function issueUpdateComment(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const issueNumber = parseInt(args.positional[0]);
  const commentId = parseInt(args.positional[1]);

  if (!issueNumber) {
    throw new Error("Issue number is required");
  }
  if (!commentId) {
    throw new Error("Comment ID is required (use 'issue comments <number>' to see IDs)");
  }

  const body = args.flags.body as string;
  if (!body) {
    throw new Error("--body is required");
  }

  if (!adapter.updateComment) {
    throw new Error(`Comment updates are not supported on ${adapter.name}`);
  }

  const comment = await adapter.updateComment(issueNumber, commentId, body);

  if (args.flags.json) {
    printJson(comment);
    return;
  }

  console.log(`Updated comment #${comment.id} on issue #${issueNumber}`);
}

// ===== PR Commands =====

async function prList(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const prs = await adapter.listPullRequests({
    state: args.flags.state as any,
    head: args.flags.head as string,
    base: args.flags.base as string,
    limit: args.flags.limit ? parseInt(String(args.flags.limit)) : undefined,
  });

  if (args.flags.json) {
    printJson(prs);
    return;
  }

  if (prs.length === 0) {
    console.log("No pull requests found.");
    return;
  }

  const rows = prs.map((pr) => [
    `#${pr.number}`,
    pr.state,
    truncate(pr.title, 40),
    `${pr.head.ref} → ${pr.base.ref}`,
    pr.author.login,
  ]);

  printTable(["#", "State", "Title", "Branch", "Author"], rows);
}

async function prGet(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("PR number is required");
  }

  const pr = await adapter.getPullRequest(number);

  if (args.flags.json) {
    printJson(pr);
    return;
  }

  console.log(`PR #${pr.number}: ${pr.title}`);
  console.log(`State: ${pr.state}`);
  console.log(`Branch: ${pr.head.ref} → ${pr.base.ref}`);
  console.log(`Author: ${pr.author.login}`);
  console.log(`Created: ${formatDate(pr.createdAt)}`);
  console.log(`Mergeable: ${pr.mergeable ? "Yes" : "No"}`);
  console.log(`URL: ${pr.url}`);
  console.log(`\n${pr.body || "(No description)"}`);
}

async function prCreate(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const title = args.flags.title as string;
  const head = args.flags.head as string;
  const base = args.flags.base as string;

  if (!title) throw new Error("--title is required");
  if (!head) throw new Error("--head is required (source branch)");
  if (!base) throw new Error("--base is required (target branch)");

  const pr = await adapter.createPullRequest({
    title,
    head,
    base,
    body: args.flags.body as string,
    draft: args.flags.draft === true,
  });

  if (args.flags.json) {
    printJson(pr);
    return;
  }

  console.log(`Created PR #${pr.number}: ${pr.title}`);
  console.log(`URL: ${pr.url}`);
}

async function prMerge(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("PR number is required");
  }

  await adapter.mergePullRequest(number, {
    method: args.flags.method as any,
    deleteBranch: args.flags["delete-branch"] === true || args.flags.deleteHead === "true",
  });

  console.log(`Merged PR #${number}`);
}

// ===== Timer Commands =====

async function timerStart(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  if (!supportsTimers(adapter.name)) {
    console.log(`Timer feature is not supported on ${getPlatformDisplayName(adapter.name)}`);
    return;
  }

  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  await adapter.startTimer!(number);
  console.log(`Timer started for issue #${number}`);
}

async function timerStop(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  if (!supportsTimers(adapter.name)) {
    console.log(`Timer feature is not supported on ${getPlatformDisplayName(adapter.name)}`);
    return;
  }

  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  const log = await adapter.stopTimer!(number);

  if (args.flags.json) {
    printJson(log);
    return;
  }

  console.log(`Timer stopped for issue #${number}`);
  console.log(`Time recorded: ${Math.round(log.time / 60)} minutes`);
}

async function timerList(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  if (!supportsTimers(adapter.name)) {
    console.log(`Timer feature is not supported on ${getPlatformDisplayName(adapter.name)}`);
    return;
  }

  const timers = await adapter.listTimers!();

  if (args.flags.json) {
    printJson(timers);
    return;
  }

  if (timers.length === 0) {
    console.log("No active timers.");
    return;
  }

  const rows = timers.map((t) => [
    t.repo,
    `#${t.issueId}`,
    truncate(t.issueTitle, 30),
    formatDate(t.startedAt),
  ]);

  printTable(["Repo", "#", "Issue", "Started"], rows);
}

async function timerDelete(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  if (!supportsTimers(adapter.name)) {
    console.log(`Timer feature is not supported on ${getPlatformDisplayName(adapter.name)}`);
    return;
  }

  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  await adapter.deleteTimer!(number);
  console.log(`Timer deleted for issue #${number}`);
}

// ===== Feature Workflow Commands =====

async function featureStart(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  const number = parseInt(args.positional[0]);
  if (!number) {
    throw new Error("Issue number is required");
  }

  // Get issue details
  const issue = await adapter.getIssue(number);
  console.log(`Starting work on: #${issue.number} - ${issue.title}`);

  // Create branch name from issue
  const branchName = args.flags.branch as string ||
    `feat/${number}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;

  // Create and checkout branch
  console.log(`Creating branch: ${branchName}`);
  const gitResult = await runCli(["git", "checkout", "-b", branchName]);
  if (!gitResult.success) {
    // Branch might exist, try to just checkout
    const checkoutResult = await runCli(["git", "checkout", branchName]);
    if (!checkoutResult.success) {
      throw new Error(`Failed to create/checkout branch: ${gitResult.stderr}`);
    }
  }

  // Start timer if supported
  if (supportsTimers(adapter.name) && adapter.startTimer) {
    await adapter.startTimer(number);
    console.log("Timer started");
  }

  // Update workflow state
  updateIssueState(adapter.name, issue.number, issue.title, issue.url, "in-progress");
  updateBranchState(branchName);
  updatePrState(null, "not-created");

  console.log(`\nWorkflow started! Now working on issue #${number}`);
  console.log(`Branch: ${branchName}`);
  console.log(`\nWhen done, run: tracker feature-complete`);
}

async function featureComplete(adapter: IssuePlatform, args: ParsedArgs): Promise<void> {
  // Get current issue from workflow state
  const currentIssue = getCurrentIssue();
  if (!currentIssue) {
    throw new Error("No active feature. Run 'tracker feature-start <issue-number>' first.");
  }

  // Get current branch
  const branchResult = await runCli(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branchResult.success) {
    throw new Error("Failed to get current branch");
  }
  const currentBranch = branchResult.stdout;

  // Stop timer if supported
  if (supportsTimers(adapter.name) && adapter.stopTimer) {
    try {
      const log = await adapter.stopTimer(currentIssue.id);
      console.log(`Timer stopped. Time recorded: ${Math.round(log.time / 60)} minutes`);
    } catch {
      // Timer might not be running
    }
  }

  // Get default branch for base
  const repo = await adapter.getRepository?.();
  const baseBranch = args.flags.base as string || repo?.defaultBranch || "main";

  // Create PR
  const title = args.flags.title as string || `feat: ${currentIssue.title}`;
  const body = args.flags.body as string || `Closes #${currentIssue.id}\n\n${currentIssue.title}`;

  console.log(`Creating PR: ${title}`);
  console.log(`  ${currentBranch} → ${baseBranch}`);

  // Push branch first
  const pushResult = await runCli(["git", "push", "-u", "origin", currentBranch]);
  if (!pushResult.success) {
    console.log(`Note: ${pushResult.stderr}`);
  }

  const pr = await adapter.createPullRequest({
    title,
    body,
    head: currentBranch,
    base: baseBranch,
  });

  // Update workflow state
  updatePrState(pr.number, "open", pr.url);

  console.log(`\nPR created: #${pr.number}`);
  console.log(`URL: ${pr.url}`);
}

// ===== Help =====

function printHelp(): void {
  console.log(`
tracker - Unified issue tracker CLI

USAGE:
  tracker <resource> <action> [options]

RESOURCES:
  issue    Manage issues
  pr       Manage pull requests
  timer    Time tracking (Gitea only)

ISSUE COMMANDS:
  tracker issue list [--state=open|closed|all] [--labels=l1,l2]
  tracker issue get <number>
  tracker issue create --title="Title" [--body="Body"] [--labels=l1,l2]
  tracker issue update <number> [--title="New Title"] [--body="New Body"]
                       [--labels=l1,l2] [--assignees=u1,u2] [--state=open|closed]
  tracker issue close <number> [--comment="Reason"]
  tracker issue reopen <number>
  tracker issue comment <number> --body="Comment"
  tracker issue comments <number>
  tracker issue update-comment <issue> <comment-id> --body="New body"

PR COMMANDS:
  tracker pr list [--state=open|closed|all]
  tracker pr get <number>
  tracker pr create --title="Title" --head=branch --base=main [--body="Body"]
  tracker pr merge <number> [--method=squash|merge|rebase] [--delete-branch]

TIMER COMMANDS (Gitea only):
  tracker timer start <number>
  tracker timer stop <number>
  tracker timer list
  tracker timer delete <number>

WORKFLOW COMMANDS:
  tracker feature-start <number>     Start working on issue (branch + timer)
  tracker feature-complete           Create PR and stop timer

GLOBAL OPTIONS:
  --json              Output as JSON
  --repo=owner/repo   Specify repository explicitly
  --platform=X        Override platform (github|gitea|azdo|gitlab)

EXAMPLES:
  tracker issue list
  tracker issue get 42
  tracker issue create --title="Bug: X not working"
  tracker pr create --title="Feature X" --head=feature --base=main
  tracker timer start 42
`);
}

// ===== Main =====

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const parsed = parseArgs(args);
  const { resource, action, flags } = parsed;

  try {
    const adapter = await getAdapter(flags);

    switch (resource) {
      case "issue":
        switch (action) {
          case "list":
            await issueList(adapter, parsed);
            break;
          case "get":
            await issueGet(adapter, parsed);
            break;
          case "create":
            await issueCreate(adapter, parsed);
            break;
          case "close":
            await issueClose(adapter, parsed);
            break;
          case "reopen":
            await issueReopen(adapter, parsed);
            break;
          case "update":
            await issueUpdate(adapter, parsed);
            break;
          case "comment":
            await issueComment(adapter, parsed);
            break;
          case "comments":
            await issueComments(adapter, parsed);
            break;
          case "update-comment":
            await issueUpdateComment(adapter, parsed);
            break;
          default:
            console.error(`Unknown issue action: ${action}`);
            process.exit(1);
        }
        break;

      case "pr":
        switch (action) {
          case "list":
            await prList(adapter, parsed);
            break;
          case "get":
            await prGet(adapter, parsed);
            break;
          case "create":
            await prCreate(adapter, parsed);
            break;
          case "merge":
            await prMerge(adapter, parsed);
            break;
          default:
            console.error(`Unknown pr action: ${action}`);
            process.exit(1);
        }
        break;

      case "timer":
        switch (action) {
          case "start":
            await timerStart(adapter, parsed);
            break;
          case "stop":
            await timerStop(adapter, parsed);
            break;
          case "list":
            await timerList(adapter, parsed);
            break;
          case "delete":
            await timerDelete(adapter, parsed);
            break;
          default:
            console.error(`Unknown timer action: ${action}`);
            process.exit(1);
        }
        break;

      case "feature-start":
        // Treat action as the issue number for feature-start
        parsed.positional = [action, ...parsed.positional];
        await featureStart(adapter, parsed);
        break;

      case "feature-complete":
        await featureComplete(adapter, parsed);
        break;

      default:
        console.error(`Unknown resource: ${resource}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
