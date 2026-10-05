/**
 * Mock Platform Adapter for Testing
 * Provides a fully controllable implementation of IssuePlatform
 */

import type {
  IssuePlatform,
  PlatformName,
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
} from "../lib/types.js";

export interface MockAdapterOptions {
  issues?: Issue[];
  pullRequests?: PullRequest[];
  comments?: Map<number, Comment[]>;
  timers?: Timer[];
  shouldFail?: boolean;
  failureMessage?: string;
}

export class MockAdapter implements IssuePlatform {
  readonly name: PlatformName = "gitea";
  readonly baseUrl: string = "https://mock.example.com";
  readonly repo: string;

  private issues: Map<number, Issue>;
  private pullRequests: Map<number, PullRequest>;
  private comments: Map<number, Comment[]>;
  private timers: Timer[];
  private nextIssueId: number;
  private nextPrId: number;
  private nextCommentId: number;
  private shouldFail: boolean;
  private failureMessage: string;

  constructor(repo: string, options: MockAdapterOptions = {}) {
    this.repo = repo;
    this.issues = new Map((options.issues || []).map((i) => [i.number, i]));
    this.pullRequests = new Map((options.pullRequests || []).map((pr) => [pr.number, pr]));
    this.comments = options.comments || new Map();
    this.timers = options.timers || [];
    this.shouldFail = options.shouldFail || false;
    this.failureMessage = options.failureMessage || "Mock failure";

    // Calculate next IDs
    this.nextIssueId = Math.max(0, ...[...this.issues.keys()]) + 1;
    this.nextPrId = Math.max(0, ...[...this.pullRequests.keys()]) + 1;
    this.nextCommentId = 1;
    for (const comments of this.comments.values()) {
      this.nextCommentId = Math.max(this.nextCommentId, ...comments.map((c) => c.id + 1));
    }
  }

  private checkFailure(): void {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
  }

  // ===== Issue Operations =====

  async listIssues(filter?: IssueFilter): Promise<Issue[]> {
    this.checkFailure();
    let issues = [...this.issues.values()];

    if (filter?.state && filter.state !== "all") {
      issues = issues.filter((i) => i.state === filter.state);
    }
    if (filter?.labels && filter.labels.length > 0) {
      issues = issues.filter((i) =>
        filter.labels!.some((l) => i.labels.some((il) => il.name === l))
      );
    }
    if (filter?.limit) {
      issues = issues.slice(0, filter.limit);
    }

    return issues;
  }

  async getIssue(number: number): Promise<Issue> {
    this.checkFailure();
    const issue = this.issues.get(number);
    if (!issue) {
      throw new Error(`Issue #${number} not found`);
    }
    return issue;
  }

  async createIssue(data: CreateIssueData): Promise<Issue> {
    this.checkFailure();
    const issue: Issue = {
      id: this.nextIssueId,
      number: this.nextIssueId,
      title: data.title,
      body: data.body || "",
      state: "open",
      url: `${this.baseUrl}/${this.repo}/issues/${this.nextIssueId}`,
      author: { id: 1, login: "mock-user", url: `${this.baseUrl}/mock-user` },
      labels: (data.labels || []).map((name, i) => ({
        id: i,
        name,
        color: "000000",
      })),
      assignees: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      platform: "gitea",
    };

    this.issues.set(this.nextIssueId, issue);
    this.nextIssueId++;
    return issue;
  }

  async updateIssue(number: number, data: UpdateIssueData): Promise<Issue> {
    this.checkFailure();
    const issue = await this.getIssue(number);

    if (data.title) issue.title = data.title;
    if (data.body) issue.body = data.body;
    if (data.state) issue.state = data.state;
    if (data.labels) {
      issue.labels = data.labels.map((name, i) => ({ id: i, name, color: "000000" }));
    }
    issue.updatedAt = new Date().toISOString();

    this.issues.set(number, issue);
    return issue;
  }

  async closeIssue(number: number, comment?: string): Promise<void> {
    this.checkFailure();
    if (comment) {
      await this.addComment(number, comment);
    }
    const issue = await this.getIssue(number);
    issue.state = "closed";
    issue.closedAt = new Date().toISOString();
    this.issues.set(number, issue);
  }

  async reopenIssue(number: number): Promise<void> {
    this.checkFailure();
    const issue = await this.getIssue(number);
    issue.state = "open";
    issue.closedAt = null;
    this.issues.set(number, issue);
  }

  // ===== Comment Operations =====

  async listComments(issueNumber: number): Promise<Comment[]> {
    this.checkFailure();
    return this.comments.get(issueNumber) || [];
  }

  async addComment(issueNumber: number, body: string): Promise<Comment> {
    this.checkFailure();
    const comment: Comment = {
      id: this.nextCommentId++,
      body,
      author: { id: 1, login: "mock-user", url: `${this.baseUrl}/mock-user` },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      url: `${this.baseUrl}/${this.repo}/issues/${issueNumber}#comment-${this.nextCommentId}`,
    };

    const comments = this.comments.get(issueNumber) || [];
    comments.push(comment);
    this.comments.set(issueNumber, comments);

    return comment;
  }

  // ===== Pull Request Operations =====

  async listPullRequests(filter?: PullRequestFilter): Promise<PullRequest[]> {
    this.checkFailure();
    let prs = [...this.pullRequests.values()];

    if (filter?.state && filter.state !== "all") {
      prs = prs.filter((pr) => pr.state === filter.state);
    }
    if (filter?.head) {
      prs = prs.filter((pr) => pr.head.ref === filter.head);
    }
    if (filter?.base) {
      prs = prs.filter((pr) => pr.base.ref === filter.base);
    }
    if (filter?.limit) {
      prs = prs.slice(0, filter.limit);
    }

    return prs;
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    this.checkFailure();
    const pr = this.pullRequests.get(number);
    if (!pr) {
      throw new Error(`PR #${number} not found`);
    }
    return pr;
  }

  async createPullRequest(data: CreatePullRequestData): Promise<PullRequest> {
    this.checkFailure();
    const pr: PullRequest = {
      id: this.nextPrId,
      number: this.nextPrId,
      title: data.title,
      body: data.body || "",
      state: "open",
      url: `${this.baseUrl}/${this.repo}/pulls/${this.nextPrId}`,
      author: { id: 1, login: "mock-user", url: `${this.baseUrl}/mock-user` },
      labels: [],
      head: { ref: data.head, sha: "abc123" },
      base: { ref: data.base, sha: "def456" },
      mergeable: true,
      merged: false,
      mergedAt: null,
      mergedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      platform: "gitea",
    };

    this.pullRequests.set(this.nextPrId, pr);
    this.nextPrId++;
    return pr;
  }

  async mergePullRequest(number: number, options?: MergePullRequestOptions): Promise<void> {
    this.checkFailure();
    const pr = await this.getPullRequest(number);
    pr.state = "merged";
    pr.merged = true;
    pr.mergedAt = new Date().toISOString();
    this.pullRequests.set(number, pr);
  }

  // ===== Timer Operations =====

  async startTimer(issueNumber: number): Promise<void> {
    this.checkFailure();
    const issue = await this.getIssue(issueNumber);
    this.timers.push({
      id: this.timers.length + 1,
      issueId: issueNumber,
      issueTitle: issue.title,
      repo: this.repo,
      startedAt: new Date().toISOString(),
      user: { id: 1, login: "mock-user", url: `${this.baseUrl}/mock-user` },
    });
  }

  async stopTimer(issueNumber: number): Promise<TimeLog> {
    this.checkFailure();
    const timerIndex = this.timers.findIndex((t) => t.issueId === issueNumber);
    if (timerIndex === -1) {
      throw new Error(`No active timer for issue #${issueNumber}`);
    }

    const timer = this.timers.splice(timerIndex, 1)[0];
    return {
      id: 1,
      issueId: issueNumber,
      time: 3600, // 1 hour
      createdAt: new Date().toISOString(),
      user: timer.user,
    };
  }

  async deleteTimer(issueNumber: number): Promise<void> {
    this.checkFailure();
    const timerIndex = this.timers.findIndex((t) => t.issueId === issueNumber);
    if (timerIndex !== -1) {
      this.timers.splice(timerIndex, 1);
    }
  }

  async listTimers(): Promise<Timer[]> {
    this.checkFailure();
    return this.timers;
  }

  // ===== Repository Operations =====

  async getRepository(): Promise<Repository> {
    this.checkFailure();
    const [owner, name] = this.repo.split("/");
    return {
      id: 1,
      name,
      fullName: this.repo,
      description: "Mock repository",
      url: `${this.baseUrl}/${this.repo}`,
      cloneUrl: `${this.baseUrl}/${this.repo}.git`,
      sshUrl: `git@mock.example.com:${this.repo}.git`,
      defaultBranch: "main",
      private: false,
      fork: false,
      owner: { id: 1, login: owner, url: `${this.baseUrl}/${owner}` },
      platform: "gitea",
    };
  }

  // ===== Test Helpers =====

  setFailure(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    if (message) this.failureMessage = message;
  }

  addIssue(issue: Partial<Issue>): Issue {
    const fullIssue: Issue = {
      id: this.nextIssueId,
      number: this.nextIssueId,
      title: issue.title || `Issue #${this.nextIssueId}`,
      body: issue.body || "",
      state: issue.state || "open",
      url: issue.url || `${this.baseUrl}/${this.repo}/issues/${this.nextIssueId}`,
      author: issue.author || { id: 1, login: "mock-user", url: `${this.baseUrl}/mock-user` },
      labels: issue.labels || [],
      assignees: issue.assignees || [],
      createdAt: issue.createdAt || new Date().toISOString(),
      updatedAt: issue.updatedAt || new Date().toISOString(),
      closedAt: issue.closedAt || null,
      platform: "gitea",
    };

    this.issues.set(this.nextIssueId, fullIssue);
    this.nextIssueId++;
    return fullIssue;
  }

  addPullRequest(pr: Partial<PullRequest>): PullRequest {
    const fullPr: PullRequest = {
      id: this.nextPrId,
      number: this.nextPrId,
      title: pr.title || `PR #${this.nextPrId}`,
      body: pr.body || "",
      state: pr.state || "open",
      url: pr.url || `${this.baseUrl}/${this.repo}/pulls/${this.nextPrId}`,
      author: pr.author || { id: 1, login: "mock-user", url: `${this.baseUrl}/mock-user` },
      labels: pr.labels || [],
      head: pr.head || { ref: "feature", sha: "abc123" },
      base: pr.base || { ref: "main", sha: "def456" },
      mergeable: pr.mergeable ?? true,
      merged: pr.merged || false,
      mergedAt: pr.mergedAt || null,
      mergedBy: pr.mergedBy || null,
      createdAt: pr.createdAt || new Date().toISOString(),
      updatedAt: pr.updatedAt || new Date().toISOString(),
      closedAt: pr.closedAt || null,
      platform: "gitea",
    };

    this.pullRequests.set(this.nextPrId, fullPr);
    this.nextPrId++;
    return fullPr;
  }

  getIssueCount(): number {
    return this.issues.size;
  }

  getPrCount(): number {
    return this.pullRequests.size;
  }
}

/**
 * Create a mock adapter for testing
 */
export function createMockAdapter(
  repo: string = "owner/repo",
  options: MockAdapterOptions = {}
): MockAdapter {
  return new MockAdapter(repo, options);
}
