/**
 * GitHub Platform Adapter
 * Implements IssuePlatform interface by wrapping the gh CLI
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
 * GitHub CLI JSON response types
 */
interface GhUser {
  id: string;
  login: string;
  name?: string;
  avatarUrl?: string;
  url?: string;
}

interface GhLabel {
  id: string;
  name: string;
  color: string;
  description?: string;
}

interface GhIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  state: string;
  author: GhUser;
  labels: GhLabel[];
  assignees: GhUser[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  url: string;
}

interface GhComment {
  id: string;
  body: string;
  author: GhUser;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface GhPullRequest {
  id: string;
  number: number;
  title: string;
  body: string;
  state: string;
  author: GhUser;
  labels: GhLabel[];
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string;
  mergeable: string;
  merged: boolean;
  mergedAt: string | null;
  mergedBy: GhUser | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  url: string;
}

interface GhRepository {
  id: string;
  name: string;
  nameWithOwner: string;
  description: string;
  url: string;
  sshUrl: string;
  defaultBranchRef: { name: string };
  isPrivate: boolean;
  isFork: boolean;
  owner: GhUser;
}

/**
 * Run gh CLI command and return result
 */
async function runGh(
  args: string[],
  env?: Record<string, string>
): Promise<CliResult> {
  const proc = Bun.spawn(["gh", ...args], {
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
 * GitHub Platform Adapter
 */
export class GitHubAdapter implements IssuePlatform {
  readonly name: PlatformName = "github";
  readonly baseUrl: string = "https://api.github.com";
  readonly repo: string;

  private token?: string;

  constructor(repo: string, credentials: PlatformCredentials) {
    this.repo = repo;
    this.token = credentials.token;
  }

  // ===== CLI Wrapper =====

  private async gh(args: string[]): Promise<CliResult> {
    const env: Record<string, string> = {};
    if (this.token) {
      env.GH_TOKEN = this.token;
    }
    return runGh(["--repo", this.repo, ...args], env);
  }

  private async ghJson<T>(args: string[]): Promise<T> {
    const result = await this.gh(args);
    if (!result.success) {
      throw new Error(`gh command failed: ${result.stderr || result.stdout}`);
    }
    return JSON.parse(result.stdout) as T;
  }

  // ===== User/Label Normalization =====

  private normalizeUser(user: GhUser): User {
    return {
      id: parseInt(user.id) || 0,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      url: user.url || `https://github.com/${user.login}`,
    };
  }

  private normalizeLabel(label: GhLabel): Label {
    return {
      id: parseInt(label.id) || 0,
      name: label.name,
      color: label.color,
      description: label.description,
    };
  }

  // ===== Issue Operations =====

  private normalizeIssue(issue: GhIssue): Issue {
    return {
      id: parseInt(issue.id) || 0,
      number: issue.number,
      title: issue.title,
      body: issue.body || "",
      state: issue.state === "OPEN" ? "open" : "closed",
      url: issue.url,
      author: this.normalizeUser(issue.author),
      labels: (issue.labels || []).map((l) => this.normalizeLabel(l)),
      assignees: (issue.assignees || []).map((u) => this.normalizeUser(u)),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt,
      platform: "github",
      rawData: issue,
    };
  }

  async listIssues(filter?: IssueFilter): Promise<Issue[]> {
    const args = [
      "issue",
      "list",
      "--json",
      "id,number,title,body,state,author,labels,assignees,createdAt,updatedAt,closedAt,url",
    ];

    if (filter?.state && filter.state !== "all") {
      args.push("--state", filter.state);
    }
    if (filter?.labels && filter.labels.length > 0) {
      args.push("--label", filter.labels.join(","));
    }
    if (filter?.assignee) {
      args.push("--assignee", filter.assignee);
    }
    if (filter?.limit) {
      args.push("--limit", String(filter.limit));
    }
    if (filter?.search) {
      args.push("--search", filter.search);
    }

    const issues = await this.ghJson<GhIssue[]>(args);
    return issues.map((i) => this.normalizeIssue(i));
  }

  async getIssue(number: number): Promise<Issue> {
    const args = [
      "issue",
      "view",
      String(number),
      "--json",
      "id,number,title,body,state,author,labels,assignees,createdAt,updatedAt,closedAt,url",
    ];

    const issue = await this.ghJson<GhIssue>(args);
    return this.normalizeIssue(issue);
  }

  async createIssue(data: CreateIssueData): Promise<Issue> {
    const args = ["issue", "create", "--title", data.title];

    if (data.body) {
      args.push("--body", data.body);
    }
    if (data.labels && data.labels.length > 0) {
      args.push("--label", data.labels.join(","));
    }
    if (data.assignees && data.assignees.length > 0) {
      args.push("--assignee", data.assignees.join(","));
    }

    // Create returns the URL, need to fetch the full issue
    const result = await this.gh(args);
    if (!result.success) {
      throw new Error(`Failed to create issue: ${result.stderr}`);
    }

    // Extract issue number from URL
    const match = result.stdout.match(/\/issues\/(\d+)/);
    if (!match) {
      throw new Error(`Failed to parse issue URL from: ${result.stdout}`);
    }

    return this.getIssue(parseInt(match[1]));
  }

  async updateIssue(number: number, data: UpdateIssueData): Promise<Issue> {
    const args = ["issue", "edit", String(number)];

    if (data.title) {
      args.push("--title", data.title);
    }
    if (data.body) {
      args.push("--body", data.body);
    }
    if (data.labels) {
      // Remove all labels first, then add new ones
      args.push("--remove-label", "");
      if (data.labels.length > 0) {
        args.push("--add-label", data.labels.join(","));
      }
    }
    if (data.assignees) {
      if (data.assignees.length > 0) {
        args.push("--add-assignee", data.assignees.join(","));
      }
    }

    const result = await this.gh(args);
    if (!result.success) {
      throw new Error(`Failed to update issue #${number}: ${result.stderr}`);
    }

    return this.getIssue(number);
  }

  async closeIssue(number: number, comment?: string): Promise<void> {
    if (comment) {
      await this.addComment(number, comment);
    }

    const result = await this.gh(["issue", "close", String(number)]);
    if (!result.success) {
      throw new Error(`Failed to close issue #${number}: ${result.stderr}`);
    }
  }

  async reopenIssue(number: number): Promise<void> {
    const result = await this.gh(["issue", "reopen", String(number)]);
    if (!result.success) {
      throw new Error(`Failed to reopen issue #${number}: ${result.stderr}`);
    }
  }

  // ===== Comment Operations =====

  private normalizeComment(comment: GhComment): Comment {
    return {
      id: parseInt(comment.id) || 0,
      body: comment.body,
      author: this.normalizeUser(comment.author),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      url: comment.url,
    };
  }

  async listComments(issueNumber: number): Promise<Comment[]> {
    const args = [
      "issue",
      "view",
      String(issueNumber),
      "--json",
      "comments",
    ];

    const result = await this.ghJson<{ comments: GhComment[] }>(args);
    return (result.comments || []).map((c) => this.normalizeComment(c));
  }

  async addComment(issueNumber: number, body: string): Promise<Comment> {
    const result = await this.gh([
      "issue",
      "comment",
      String(issueNumber),
      "--body",
      body,
    ]);

    if (!result.success) {
      throw new Error(
        `Failed to add comment to issue #${issueNumber}: ${result.stderr}`
      );
    }

    // Return the latest comment
    const comments = await this.listComments(issueNumber);
    return comments[comments.length - 1];
  }

  // ===== Pull Request Operations =====

  private normalizePullRequest(pr: GhPullRequest): PullRequest {
    return {
      id: parseInt(pr.id) || 0,
      number: pr.number,
      title: pr.title,
      body: pr.body || "",
      state: pr.merged
        ? "merged"
        : pr.state === "OPEN"
        ? "open"
        : "closed",
      url: pr.url,
      author: this.normalizeUser(pr.author),
      labels: (pr.labels || []).map((l) => this.normalizeLabel(l)),
      head: {
        ref: pr.headRefName,
        sha: pr.headRefOid,
      },
      base: {
        ref: pr.baseRefName,
        sha: pr.baseRefOid,
      },
      mergeable: pr.mergeable === "MERGEABLE",
      merged: pr.merged,
      mergedAt: pr.mergedAt,
      mergedBy: pr.mergedBy ? this.normalizeUser(pr.mergedBy) : null,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      closedAt: pr.closedAt,
      platform: "github",
      rawData: pr,
    };
  }

  async listPullRequests(filter?: PullRequestFilter): Promise<PullRequest[]> {
    const args = [
      "pr",
      "list",
      "--json",
      "id,number,title,body,state,author,labels,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,merged,mergedAt,mergedBy,createdAt,updatedAt,closedAt,url",
    ];

    if (filter?.state && filter.state !== "all") {
      args.push("--state", filter.state);
    }
    if (filter?.head) {
      args.push("--head", filter.head);
    }
    if (filter?.base) {
      args.push("--base", filter.base);
    }
    if (filter?.limit) {
      args.push("--limit", String(filter.limit));
    }

    const prs = await this.ghJson<GhPullRequest[]>(args);
    return prs.map((pr) => this.normalizePullRequest(pr));
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    const args = [
      "pr",
      "view",
      String(number),
      "--json",
      "id,number,title,body,state,author,labels,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,merged,mergedAt,mergedBy,createdAt,updatedAt,closedAt,url",
    ];

    const pr = await this.ghJson<GhPullRequest>(args);
    return this.normalizePullRequest(pr);
  }

  async createPullRequest(data: CreatePullRequestData): Promise<PullRequest> {
    const args = [
      "pr",
      "create",
      "--title",
      data.title,
      "--head",
      data.head,
      "--base",
      data.base,
    ];

    if (data.body) {
      args.push("--body", data.body);
    }
    if (data.draft) {
      args.push("--draft");
    }

    const result = await this.gh(args);
    if (!result.success) {
      throw new Error(`Failed to create PR: ${result.stderr}`);
    }

    // Extract PR number from URL
    const match = result.stdout.match(/\/pull\/(\d+)/);
    if (!match) {
      throw new Error(`Failed to parse PR URL from: ${result.stdout}`);
    }

    return this.getPullRequest(parseInt(match[1]));
  }

  async mergePullRequest(
    number: number,
    options?: MergePullRequestOptions
  ): Promise<void> {
    const args = ["pr", "merge", String(number), "--auto"];

    if (options?.method === "squash") {
      args.push("--squash");
    } else if (options?.method === "rebase") {
      args.push("--rebase");
    } else {
      args.push("--merge");
    }

    if (options?.deleteBranch) {
      args.push("--delete-branch");
    }

    const result = await this.gh(args);
    if (!result.success) {
      throw new Error(`Failed to merge PR #${number}: ${result.stderr}`);
    }
  }

  // ===== Repository Operations =====

  async getRepository(): Promise<Repository> {
    const args = [
      "repo",
      "view",
      "--json",
      "id,name,nameWithOwner,description,url,sshUrl,defaultBranchRef,isPrivate,isFork,owner",
    ];

    const repo = await this.ghJson<GhRepository>(args);

    return {
      id: parseInt(repo.id) || 0,
      name: repo.name,
      fullName: repo.nameWithOwner,
      description: repo.description || "",
      url: repo.url,
      cloneUrl: `https://github.com/${repo.nameWithOwner}.git`,
      sshUrl: repo.sshUrl,
      defaultBranch: repo.defaultBranchRef?.name || "main",
      private: repo.isPrivate,
      fork: repo.isFork,
      owner: this.normalizeUser(repo.owner),
      platform: "github",
    };
  }

  // ===== Timer Operations (not supported on GitHub) =====
  // These are intentionally not implemented - GitHub doesn't have timers
}

/**
 * Factory function to create GitHub adapter
 */
export function createGitHubAdapter(
  repo: string,
  credentials: PlatformCredentials
): IssuePlatform {
  return new GitHubAdapter(repo, credentials);
}
