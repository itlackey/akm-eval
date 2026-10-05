/**
 * Gitea Platform Adapter
 * Implements IssuePlatform interface using native fetch for Gitea API
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
  Timer,
  TimeLog,
  Repository,
  User,
  Label,
} from "../lib/types.js";

/**
 * Internal Gitea API response types
 */
interface GiteaUser {
  id: number;
  login: string;
  full_name?: string;
  avatar_url?: string;
  html_url?: string;
}

interface GiteaLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

interface GiteaIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  user: GiteaUser;
  labels: GiteaLabel[] | null;
  assignees: GiteaUser[] | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
}

interface GiteaComment {
  id: number;
  body: string;
  user: GiteaUser;
  created_at: string;
  updated_at: string;
  html_url?: string;
}

interface GiteaPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  user: GiteaUser;
  labels?: GiteaLabel[];
  head: { ref: string; sha: string; repo?: { full_name: string } };
  base: { ref: string; sha: string };
  mergeable: boolean;
  merged: boolean;
  merged_at: string | null;
  merged_by: GiteaUser | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
}

interface GiteaStopwatch {
  created: string;
  seconds: number;
  duration?: string;
  issue_index: number;
  issue_title: string;
  repo_owner_name: string;
  repo_name: string;
}

interface GiteaRepository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  private: boolean;
  fork: boolean;
  owner: GiteaUser;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Gitea Platform Adapter
 */
export class GiteaAdapter implements IssuePlatform {
  readonly name: PlatformName = "gitea";
  readonly baseUrl: string;
  readonly repo: string;

  private token: string;
  private owner: string;
  private repoName: string;

  constructor(repo: string, credentials: PlatformCredentials) {
    if (!credentials.baseUrl) {
      throw new Error("Gitea adapter requires baseUrl in credentials");
    }
    if (!credentials.token) {
      throw new Error("Gitea adapter requires token in credentials");
    }

    this.baseUrl = credentials.baseUrl.replace(/\/$/, "");
    this.token = credentials.token;
    this.repo = repo;

    const parts = repo.split("/");
    if (parts.length !== 2) {
      throw new Error(`Invalid repo format: ${repo}. Expected owner/repo`);
    }
    this.owner = parts[0];
    this.repoName = parts[1];
  }

  // ===== HTTP Client =====

  private async request<T>(
    method: string,
    endpoint: string,
    body?: object
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `token ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const options: RequestInit = { method, headers };

    if (body && ["POST", "PATCH", "PUT"].includes(method)) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      const status = response.status;

      if (status === 204) {
        return { status, data: undefined };
      }

      const text = await response.text();
      let data: T | undefined;

      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {
        if (!response.ok) {
          return { status, error: text || `HTTP ${status}` };
        }
      }

      if (!response.ok) {
        const errorMsg =
          (data as any)?.message || (data as any)?.error || `HTTP ${status}`;
        return { status, error: errorMsg };
      }

      return { status, data };
    } catch (err) {
      return { status: 0, error: String(err) };
    }
  }

  // ===== User/Label Normalization =====

  private normalizeUser(user: GiteaUser): User {
    return {
      id: user.id,
      login: user.login,
      name: user.full_name,
      avatarUrl: user.avatar_url,
      url: user.html_url || `${this.baseUrl}/${user.login}`,
    };
  }

  private normalizeLabel(label: GiteaLabel): Label {
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description,
    };
  }

  // ===== Issue Operations =====

  private normalizeIssue(issue: GiteaIssue): Issue {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || "",
      state: issue.state === "open" ? "open" : "closed",
      url: issue.html_url,
      author: this.normalizeUser(issue.user),
      labels: (issue.labels || []).map((l) => this.normalizeLabel(l)),
      assignees: (issue.assignees || []).map((u) => this.normalizeUser(u)),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at,
      platform: "gitea",
      rawData: issue,
    };
  }

  async listIssues(filter?: IssueFilter): Promise<Issue[]> {
    const params = new URLSearchParams();
    if (filter?.state && filter.state !== "all") {
      params.set("state", filter.state);
    }
    if (filter?.labels && filter.labels.length > 0) {
      params.set("labels", filter.labels.join(","));
    }
    if (filter?.page) params.set("page", String(filter.page));
    if (filter?.limit) params.set("limit", String(filter.limit));

    const query = params.toString() ? `?${params.toString()}` : "";
    const result = await this.request<GiteaIssue[]>(
      "GET",
      `/repos/${this.owner}/${this.repoName}/issues${query}`
    );

    if (result.error) {
      throw new Error(`Failed to list issues: ${result.error}`);
    }

    return (result.data || []).map((i) => this.normalizeIssue(i));
  }

  async getIssue(number: number): Promise<Issue> {
    const result = await this.request<GiteaIssue>(
      "GET",
      `/repos/${this.owner}/${this.repoName}/issues/${number}`
    );

    if (result.error) {
      throw new Error(`Failed to get issue #${number}: ${result.error}`);
    }

    return this.normalizeIssue(result.data!);
  }

  async createIssue(data: CreateIssueData): Promise<Issue> {
    const body: Record<string, unknown> = {
      title: data.title,
    };
    if (data.body) body.body = data.body;
    if (data.assignees) body.assignees = data.assignees;

    // Gitea requires label IDs, not names - resolve them
    if (data.labels && data.labels.length > 0) {
      const labelIds = await this.resolveLabelIds(data.labels);
      if (labelIds.length > 0) {
        body.labels = labelIds;
      }
    }

    const result = await this.request<GiteaIssue>(
      "POST",
      `/repos/${this.owner}/${this.repoName}/issues`,
      body
    );

    if (result.error) {
      throw new Error(`Failed to create issue: ${result.error}`);
    }

    return this.normalizeIssue(result.data!);
  }

  async updateIssue(number: number, data: UpdateIssueData): Promise<Issue> {
    const body: Record<string, unknown> = {};
    if (data.title) body.title = data.title;
    if (data.body) body.body = data.body;
    if (data.state) body.state = data.state;
    if (data.assignees) body.assignees = data.assignees;

    if (data.labels) {
      const labelIds = await this.resolveLabelIds(data.labels);
      body.labels = labelIds;
    }

    const result = await this.request<GiteaIssue>(
      "PATCH",
      `/repos/${this.owner}/${this.repoName}/issues/${number}`,
      body
    );

    if (result.error) {
      throw new Error(`Failed to update issue #${number}: ${result.error}`);
    }

    return this.normalizeIssue(result.data!);
  }

  async closeIssue(number: number, comment?: string): Promise<void> {
    if (comment) {
      await this.addComment(number, comment);
    }

    const result = await this.request<GiteaIssue>(
      "PATCH",
      `/repos/${this.owner}/${this.repoName}/issues/${number}`,
      { state: "closed" }
    );

    if (result.error) {
      throw new Error(`Failed to close issue #${number}: ${result.error}`);
    }
  }

  async reopenIssue(number: number): Promise<void> {
    const result = await this.request<GiteaIssue>(
      "PATCH",
      `/repos/${this.owner}/${this.repoName}/issues/${number}`,
      { state: "open" }
    );

    if (result.error) {
      throw new Error(`Failed to reopen issue #${number}: ${result.error}`);
    }
  }

  // ===== Comment Operations =====

  private normalizeComment(comment: GiteaComment): Comment {
    return {
      id: comment.id,
      body: comment.body,
      author: this.normalizeUser(comment.user),
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      url: comment.html_url || "",
    };
  }

  async listComments(issueNumber: number): Promise<Comment[]> {
    const result = await this.request<GiteaComment[]>(
      "GET",
      `/repos/${this.owner}/${this.repoName}/issues/${issueNumber}/comments`
    );

    if (result.error) {
      throw new Error(
        `Failed to list comments for issue #${issueNumber}: ${result.error}`
      );
    }

    return (result.data || []).map((c) => this.normalizeComment(c));
  }

  async addComment(issueNumber: number, body: string): Promise<Comment> {
    const result = await this.request<GiteaComment>(
      "POST",
      `/repos/${this.owner}/${this.repoName}/issues/${issueNumber}/comments`,
      { body }
    );

    if (result.error) {
      throw new Error(
        `Failed to add comment to issue #${issueNumber}: ${result.error}`
      );
    }

    return this.normalizeComment(result.data!);
  }

  async updateComment(issueNumber: number, commentId: number, body: string): Promise<Comment> {
    const result = await this.request<GiteaComment>(
      "PATCH",
      `/repos/${this.owner}/${this.repoName}/issues/comments/${commentId}`,
      { body }
    );

    if (result.error) {
      throw new Error(
        `Failed to update comment #${commentId} on issue #${issueNumber}: ${result.error}`
      );
    }

    return this.normalizeComment(result.data!);
  }

  // ===== Pull Request Operations =====

  private normalizePullRequest(pr: GiteaPullRequest): PullRequest {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body || "",
      state: pr.merged ? "merged" : pr.state === "open" ? "open" : "closed",
      url: pr.html_url,
      author: this.normalizeUser(pr.user),
      labels: (pr.labels || []).map((l) => this.normalizeLabel(l)),
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
        repo: pr.head.repo?.full_name,
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
      },
      mergeable: pr.mergeable,
      merged: pr.merged,
      mergedAt: pr.merged_at,
      mergedBy: pr.merged_by ? this.normalizeUser(pr.merged_by) : null,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      closedAt: pr.closed_at,
      platform: "gitea",
      rawData: pr,
    };
  }

  async listPullRequests(filter?: PullRequestFilter): Promise<PullRequest[]> {
    const params = new URLSearchParams();
    if (filter?.state && filter.state !== "all") {
      params.set("state", filter.state);
    }
    if (filter?.page) params.set("page", String(filter.page));
    if (filter?.limit) params.set("limit", String(filter.limit));

    const query = params.toString() ? `?${params.toString()}` : "";
    const result = await this.request<GiteaPullRequest[]>(
      "GET",
      `/repos/${this.owner}/${this.repoName}/pulls${query}`
    );

    if (result.error) {
      throw new Error(`Failed to list pull requests: ${result.error}`);
    }

    return (result.data || []).map((pr) => this.normalizePullRequest(pr));
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    const result = await this.request<GiteaPullRequest>(
      "GET",
      `/repos/${this.owner}/${this.repoName}/pulls/${number}`
    );

    if (result.error) {
      throw new Error(`Failed to get PR #${number}: ${result.error}`);
    }

    return this.normalizePullRequest(result.data!);
  }

  async createPullRequest(data: CreatePullRequestData): Promise<PullRequest> {
    const body: Record<string, unknown> = {
      title: data.title,
      head: data.head,
      base: data.base,
    };
    if (data.body) body.body = data.body;

    const result = await this.request<GiteaPullRequest>(
      "POST",
      `/repos/${this.owner}/${this.repoName}/pulls`,
      body
    );

    if (result.error) {
      throw new Error(`Failed to create pull request: ${result.error}`);
    }

    return this.normalizePullRequest(result.data!);
  }

  async mergePullRequest(
    number: number,
    options?: MergePullRequestOptions
  ): Promise<void> {
    const body: Record<string, unknown> = {
      Do: options?.method || "merge",
    };
    if (options?.commitTitle) body.MergeTitleField = options.commitTitle;
    if (options?.deleteBranch) body.delete_branch_after_merge = true;

    const result = await this.request<void>(
      "POST",
      `/repos/${this.owner}/${this.repoName}/pulls/${number}/merge`,
      body
    );

    if (result.error) {
      throw new Error(`Failed to merge PR #${number}: ${result.error}`);
    }
  }

  // ===== Timer Operations (Gitea-specific) =====

  async startTimer(issueNumber: number): Promise<void> {
    const result = await this.request<void>(
      "POST",
      `/repos/${this.owner}/${this.repoName}/issues/${issueNumber}/stopwatch/start`
    );

    if (result.error) {
      throw new Error(
        `Failed to start timer for issue #${issueNumber}: ${result.error}`
      );
    }
  }

  async stopTimer(issueNumber: number): Promise<TimeLog> {
    const result = await this.request<{ id: number; time: number; created: string; user: GiteaUser }>(
      "POST",
      `/repos/${this.owner}/${this.repoName}/issues/${issueNumber}/stopwatch/stop`
    );

    if (result.error) {
      throw new Error(
        `Failed to stop timer for issue #${issueNumber}: ${result.error}`
      );
    }

    return {
      id: result.data?.id || 0,
      issueId: issueNumber,
      time: result.data?.time || 0,
      createdAt: result.data?.created || new Date().toISOString(),
      user: result.data?.user ? this.normalizeUser(result.data.user) : { id: 0, login: "", url: "" },
    };
  }

  async deleteTimer(issueNumber: number): Promise<void> {
    const result = await this.request<void>(
      "DELETE",
      `/repos/${this.owner}/${this.repoName}/issues/${issueNumber}/stopwatch/delete`
    );

    if (result.error) {
      throw new Error(
        `Failed to delete timer for issue #${issueNumber}: ${result.error}`
      );
    }
  }

  async listTimers(): Promise<Timer[]> {
    const result = await this.request<GiteaStopwatch[]>(
      "GET",
      "/user/stopwatches"
    );

    if (result.error) {
      throw new Error(`Failed to list timers: ${result.error}`);
    }

    return (result.data || []).map((t) => ({
      id: 0, // Gitea doesn't return timer ID in list
      issueId: t.issue_index,
      issueTitle: t.issue_title,
      repo: `${t.repo_owner_name}/${t.repo_name}`,
      startedAt: t.created,
      user: { id: 0, login: "", url: "" }, // User is implied (current user)
    }));
  }

  // ===== Repository Operations =====

  async getRepository(): Promise<Repository> {
    const result = await this.request<GiteaRepository>(
      "GET",
      `/repos/${this.owner}/${this.repoName}`
    );

    if (result.error) {
      throw new Error(`Failed to get repository: ${result.error}`);
    }

    const repo = result.data!;
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || "",
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      defaultBranch: repo.default_branch,
      private: repo.private,
      fork: repo.fork,
      owner: this.normalizeUser(repo.owner),
      platform: "gitea",
    };
  }

  // ===== Helper Methods =====

  private async getRepoLabels(): Promise<GiteaLabel[]> {
    const result = await this.request<GiteaLabel[]>(
      "GET",
      `/repos/${this.owner}/${this.repoName}/labels`
    );
    return result.data || [];
  }

  private async resolveLabelIds(labelNames: string[]): Promise<number[]> {
    const allLabels = await this.getRepoLabels();
    const labelMap = new Map(
      allLabels.map((l) => [l.name.toLowerCase(), l.id])
    );

    const ids: number[] = [];
    for (const name of labelNames) {
      const id = labelMap.get(name.toLowerCase());
      if (id !== undefined) {
        ids.push(id);
      }
    }

    return ids;
  }
}

/**
 * Factory function to create Gitea adapter
 */
export function createGiteaAdapter(
  repo: string,
  credentials: PlatformCredentials
): IssuePlatform {
  return new GiteaAdapter(repo, credentials);
}
