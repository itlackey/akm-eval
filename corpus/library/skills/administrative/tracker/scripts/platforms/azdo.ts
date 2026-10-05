/**
 * Azure DevOps Platform Adapter
 * Implements IssuePlatform interface by wrapping the az CLI
 *
 * CRITICAL: CLI-FIRST APPROACH
 * ============================
 * This adapter uses Azure CLI (`az boards`) as the PRIMARY method for all
 * Azure DevOps work item operations. The REST API is ONLY used as a fallback
 * when the CLI doesn't support specific functionality.
 *
 * Why CLI-First:
 * - Faster and more reliable
 * - Official Microsoft tooling with better support
 * - Automatic authentication via `az login`
 * - No manual PAT token management
 * - Better integration with development workflows
 * - Scriptable and automatable
 *
 * CLI Operations (PRIMARY):
 * - Create work items: `az boards work-item create`
 * - Update work items: `az boards work-item update`
 * - Query work items: `az boards query --wiql`
 * - Manage relationships: `az boards work-item relation`
 * - State changes, assignments, priorities
 *
 * REST API Operations (FALLBACK ONLY):
 * - Adding comments/discussion (CLI --discussion is limited)
 * - Complex custom fields not exposed by CLI
 * - Advanced JSON Patch operations
 * - Listing detailed comment history
 *
 * Setup:
 * 1. Install: `az extension add --name azure-devops`
 * 2. Login: `az devops login --org https://dev.azure.com/YOUR_ORG`
 * 3. Set defaults: `az devops configure --defaults organization=... project=...`
 *
 * For REST API fallback operations, set AZURE_DEVOPS_PAT environment variable.
 *
 * @see {@link https://learn.microsoft.com/en-us/cli/azure/boards CLI Documentation}
 */

import type {
  IssuePlatform,
  PlatformName,
  PlatformCredentials,
  Issue,
  IssueFilter,
  CreateIssueData,
  UpdateIssueData,
  Comment,
  PullRequest,
  PullRequestFilter,
  CreatePullRequestData,
  MergePullRequestOptions,
  Repository,
  User,
  Label,
  CliResult,
} from "../lib/types.js";

/**
 * Run az CLI command
 */
async function runAz(
  args: string[],
  env?: Record<string, string>,
): Promise<CliResult> {
  const proc = Bun.spawn(["az", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
    success: exitCode === 0,
  };
}

/**
 * Azure DevOps work item types mapped to issue states
 */
type WorkItemState = "New" | "Active" | "Resolved" | "Closed";

/**
 * Azure DevOps Platform Adapter
 */
export class AzureDevOpsAdapter implements IssuePlatform {
  readonly name: PlatformName = "azdo";
  readonly baseUrl: string;
  readonly repo: string;

  private org: string;
  private project: string;
  private repoName: string;
  private token?: string;

  constructor(repo: string, credentials: PlatformCredentials) {
    this.repo = repo;
    this.token = credentials.token;

    // 🔴 CRITICAL: Credentials should be loaded from the consumer's env/tracker
    // file (tracker.env in their own akm stash). Expected keys:
    //   AZURE_DEVOPS_PAT=your_token_here
    //   AZURE_DEVOPS_ORG=https://dev.azure.com/<org>
    //
    // The credential resolver should have already loaded these from the
    // environment or from env/tracker.
    // If not present, CLI operations will use `az login` session.
    // PAT token is ONLY needed for REST API fallback operations.

    // Parse org/project/repo from the repo string
    const parts = repo.split("/");
    if (parts.length === 3) {
      this.org = parts[0];
      this.project = parts[1];
      this.repoName = parts[2];
    } else if (parts.length === 2) {
      // Assume org is in baseUrl
      this.org = credentials.baseUrl?.split("/").pop() || "";
      this.project = parts[0];
      this.repoName = parts[1];
    } else {
      throw new Error(`Invalid Azure DevOps repo format: ${repo}`);
    }

    this.baseUrl = credentials.baseUrl || `https://dev.azure.com/${this.org}`;
  }

  private async az(args: string[]): Promise<CliResult> {
    const env: Record<string, string> = {};
    if (this.token) {
      env.AZURE_DEVOPS_EXT_PAT = this.token;
    }
    return runAz(args, env);
  }

  private async azJson<T>(args: string[]): Promise<T> {
    const result = await this.az([...args, "-o", "json"]);
    if (!result.success) {
      throw new Error(`az command failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout) as T;
  }

  // ===== Normalization =====

  private normalizeUser(user: any): User {
    return {
      id: 0,
      login: user?.displayName || user?.uniqueName || "unknown",
      name: user?.displayName,
      url: user?.url || "",
    };
  }

  private normalizeWorkItem(item: any): Issue {
    const fields = item.fields || {};
    return {
      id: item.id,
      number: item.id,
      title: fields["System.Title"] || "",
      body: fields["System.Description"] || "",
      state: this.normalizeState(fields["System.State"]),
      url:
        item._links?.html?.href ||
        `${this.baseUrl}/${this.project}/_workitems/edit/${item.id}`,
      author: this.normalizeUser(fields["System.CreatedBy"]),
      labels: this.extractTags(fields["System.Tags"]),
      assignees: fields["System.AssignedTo"]
        ? [this.normalizeUser(fields["System.AssignedTo"])]
        : [],
      createdAt: fields["System.CreatedDate"] || "",
      updatedAt: fields["System.ChangedDate"] || "",
      closedAt: fields["Microsoft.VSTS.Common.ClosedDate"] || null,
      platform: "azdo",
      rawData: item,
    };
  }

  private normalizeState(state: string): "open" | "closed" {
    const closedStates = ["Resolved", "Closed", "Done", "Removed"];
    return closedStates.includes(state) ? "closed" : "open";
  }

  private extractTags(tags: string): Label[] {
    if (!tags) return [];
    return tags.split(";").map((tag, i) => ({
      id: i,
      name: tag.trim(),
      color: "0078D4", // Azure blue
    }));
  }

  private normalizePR(pr: any): PullRequest {
    return {
      id: pr.pullRequestId,
      number: pr.pullRequestId,
      title: pr.title || "",
      body: pr.description || "",
      state:
        pr.status === "completed"
          ? "merged"
          : pr.status === "active"
            ? "open"
            : "closed",
      url: `${this.baseUrl}/${this.project}/_git/${this.repoName}/pullrequest/${pr.pullRequestId}`,
      author: this.normalizeUser(pr.createdBy),
      labels: this.extractTags(
        pr.labels?.map((l: any) => l.name).join(";") || "",
      ),
      head: {
        ref: pr.sourceRefName?.replace("refs/heads/", "") || "",
        sha: pr.lastMergeSourceCommit?.commitId || "",
      },
      base: {
        ref: pr.targetRefName?.replace("refs/heads/", "") || "",
        sha: pr.lastMergeTargetCommit?.commitId || "",
      },
      mergeable: pr.mergeStatus === "succeeded",
      merged: pr.status === "completed",
      mergedAt: pr.closedDate || null,
      mergedBy: pr.closedBy ? this.normalizeUser(pr.closedBy) : null,
      createdAt: pr.creationDate || "",
      updatedAt: pr.creationDate || "",
      closedAt: pr.closedDate || null,
      platform: "azdo",
      rawData: pr,
    };
  }

  // ===== Issue Operations =====

  async listIssues(filter?: IssueFilter): Promise<Issue[]> {
    const args = [
      "boards",
      "work-item",
      "list",
      "--org",
      this.baseUrl,
      "--project",
      this.project,
    ];

    const items = await this.azJson<any[]>(args);
    let issues = items.map((item) => this.normalizeWorkItem(item));

    if (filter?.state && filter.state !== "all") {
      issues = issues.filter((i) => i.state === filter.state);
    }
    if (filter?.limit) {
      issues = issues.slice(0, filter.limit);
    }

    return issues;
  }

  async getIssue(number: number): Promise<Issue> {
    const args = [
      "boards",
      "work-item",
      "show",
      "--id",
      String(number),
      "--org",
      this.baseUrl,
    ];

    const item = await this.azJson<any>(args);
    return this.normalizeWorkItem(item);
  }

  async createIssue(data: CreateIssueData): Promise<Issue> {
    const args = [
      "boards",
      "work-item",
      "create",
      "--org",
      this.baseUrl,
      "--project",
      this.project,
      "--type",
      "Issue",
      "--title",
      data.title,
    ];

    if (data.body) {
      args.push("--description", data.body);
    }

    const item = await this.azJson<any>(args);
    return this.normalizeWorkItem(item);
  }

  async updateIssue(number: number, data: UpdateIssueData): Promise<Issue> {
    const args = [
      "boards",
      "work-item",
      "update",
      "--id",
      String(number),
      "--org",
      this.baseUrl,
    ];

    if (data.title) {
      args.push("--title", data.title);
    }
    if (data.body) {
      args.push("--description", data.body);
    }
    if (data.state) {
      args.push("--state", data.state === "closed" ? "Closed" : "Active");
    }

    const item = await this.azJson<any>(args);
    return this.normalizeWorkItem(item);
  }

  async closeIssue(number: number, comment?: string): Promise<void> {
    if (comment) {
      await this.addComment(number, comment);
    }
    await this.updateIssue(number, { state: "closed" });
  }

  async reopenIssue(number: number): Promise<void> {
    await this.updateIssue(number, { state: "open" });
  }

  // ===== Comment Operations =====
  // NOTE: This is one area where REST API may be preferred over CLI
  // The CLI --discussion flag adds discussion entries but doesn't provide
  // full comment management (listing, editing, deleting individual comments).
  // For advanced comment workflows, consider using REST API:
  //
  // List comments:
  //   GET https://dev.azure.com/{org}/{project}/_apis/wit/workItems/{id}/comments?api-version=7.0-preview.3
  //
  // Add comment:
  //   POST https://dev.azure.com/{org}/{project}/_apis/wit/workItems/{id}/comments?api-version=7.0-preview.3
  //   Body: {"text": "Comment text"}
  //
  // Requires: AZURE_DEVOPS_PAT environment variable

  async listComments(issueNumber: number): Promise<Comment[]> {
    // Azure DevOps work item comments require REST API for full listing
    // CLI doesn't provide comment listing functionality
    // TODO: Implement REST API fallback when AZURE_DEVOPS_PAT is available
    return [];
  }

  async addComment(issueNumber: number, body: string): Promise<Comment> {
    // Using CLI --discussion flag (LIMITED functionality)
    // For full comment management, REST API is required
    const args = [
      "boards",
      "work-item",
      "update",
      "--id",
      String(issueNumber),
      "--org",
      this.baseUrl,
      "--discussion",
      body,
    ];

    await this.az(args);

    return {
      id: Date.now(),
      body,
      author: { id: 0, login: "current-user", url: "" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      url: "",
    };
  }

  // ===== Pull Request Operations =====

  async listPullRequests(filter?: PullRequestFilter): Promise<PullRequest[]> {
    const args = [
      "repos",
      "pr",
      "list",
      "--org",
      this.baseUrl,
      "--project",
      this.project,
      "--repository",
      this.repoName,
    ];

    if (filter?.state && filter.state !== "all") {
      args.push("--status", filter.state === "open" ? "active" : "completed");
    }

    const prs = await this.azJson<any[]>(args);
    return prs.map((pr) => this.normalizePR(pr));
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    const args = [
      "repos",
      "pr",
      "show",
      "--id",
      String(number),
      "--org",
      this.baseUrl,
    ];

    const pr = await this.azJson<any>(args);
    return this.normalizePR(pr);
  }

  async createPullRequest(data: CreatePullRequestData): Promise<PullRequest> {
    const args = [
      "repos",
      "pr",
      "create",
      "--org",
      this.baseUrl,
      "--project",
      this.project,
      "--repository",
      this.repoName,
      "--title",
      data.title,
      "--source-branch",
      data.head,
      "--target-branch",
      data.base,
    ];

    if (data.body) {
      args.push("--description", data.body);
    }
    if (data.draft) {
      args.push("--draft");
    }

    const pr = await this.azJson<any>(args);
    return this.normalizePR(pr);
  }

  async mergePullRequest(
    number: number,
    options?: MergePullRequestOptions,
  ): Promise<void> {
    const args = [
      "repos",
      "pr",
      "update",
      "--id",
      String(number),
      "--org",
      this.baseUrl,
      "--status",
      "completed",
    ];

    if (options?.deleteBranch) {
      args.push("--delete-source-branch");
    }

    await this.az(args);
  }

  // ===== Repository Operations =====

  async getRepository(): Promise<Repository> {
    const args = [
      "repos",
      "show",
      "--org",
      this.baseUrl,
      "--project",
      this.project,
      "--repository",
      this.repoName,
    ];

    const repo = await this.azJson<any>(args);

    return {
      id: 0,
      name: repo.name,
      fullName: `${this.org}/${this.project}/${repo.name}`,
      description: "",
      url: repo.webUrl || `${this.baseUrl}/${this.project}/_git/${repo.name}`,
      cloneUrl: repo.remoteUrl || "",
      sshUrl: repo.sshUrl || "",
      defaultBranch: repo.defaultBranch?.replace("refs/heads/", "") || "main",
      private: true,
      fork: false,
      owner: { id: 0, login: this.org, url: this.baseUrl },
      platform: "azdo",
    };
  }
}

/**
 * Factory function
 */
export function createAzureDevOpsAdapter(
  repo: string,
  credentials: PlatformCredentials,
): IssuePlatform {
  return new AzureDevOpsAdapter(repo, credentials);
}
