/**
 * Shared TypeScript interfaces for the tracker skill
 * Unified types across GitHub, GitLab, Azure DevOps, and Gitea platforms
 */

// Platform identifiers
export type PlatformName = "github" | "gitlab" | "azdo" | "gitea";

// Issue states (normalized across platforms)
export type IssueState = "open" | "closed";

// PR states
export type PullRequestState = "open" | "closed" | "merged";

// Merge methods
export type MergeMethod = "merge" | "squash" | "rebase";

/**
 * Normalized Issue representation
 */
export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: IssueState;
  url: string;
  author: User;
  labels: Label[];
  assignees: User[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  // Platform-specific metadata
  platform: PlatformName;
  rawData?: unknown;
}

/**
 * Issue filter options for listing
 */
export interface IssueFilter {
  state?: IssueState | "all";
  labels?: string[];
  assignee?: string;
  author?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Data for creating a new issue
 */
export interface CreateIssueData {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number | string;
}

/**
 * Data for updating an issue
 */
export interface UpdateIssueData {
  title?: string;
  body?: string;
  state?: IssueState;
  labels?: string[];
  assignees?: string[];
  milestone?: number | string | null;
}

/**
 * Normalized Comment representation
 */
export interface Comment {
  id: number;
  body: string;
  author: User;
  createdAt: string;
  updatedAt: string;
  url: string;
}

/**
 * Data for creating a comment
 */
export interface CreateCommentData {
  body: string;
}

/**
 * Normalized User representation
 */
export interface User {
  id: number;
  login: string;
  name?: string;
  avatarUrl?: string;
  url: string;
}

/**
 * Normalized Label representation
 */
export interface Label {
  id: number;
  name: string;
  color: string;
  description?: string;
}

/**
 * Normalized Pull Request representation
 */
export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: PullRequestState;
  url: string;
  author: User;
  labels: Label[];
  head: BranchRef;
  base: BranchRef;
  mergeable: boolean | null;
  merged: boolean;
  mergedAt: string | null;
  mergedBy: User | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  // Platform-specific metadata
  platform: PlatformName;
  rawData?: unknown;
}

/**
 * Branch reference for PR head/base
 */
export interface BranchRef {
  ref: string;
  sha: string;
  repo?: string;
}

/**
 * Filter options for listing PRs
 */
export interface PullRequestFilter {
  state?: PullRequestState | "all";
  head?: string;
  base?: string;
  author?: string;
  page?: number;
  limit?: number;
}

/**
 * Data for creating a PR
 */
export interface CreatePullRequestData {
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
}

/**
 * Options for merging a PR
 */
export interface MergePullRequestOptions {
  method?: MergeMethod;
  commitTitle?: string;
  commitMessage?: string;
  deleteBranch?: boolean;
}

/**
 * Timer/Stopwatch entry (Gitea-specific, but normalized)
 */
export interface Timer {
  id: number;
  issueId: number;
  issueTitle: string;
  repo: string;
  startedAt: string;
  user: User;
}

/**
 * Time log entry
 */
export interface TimeLog {
  id: number;
  issueId: number;
  time: number; // seconds
  createdAt: string;
  user: User;
}

/**
 * Repository information
 */
export interface Repository {
  id: number;
  name: string;
  fullName: string;
  description: string;
  url: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  private: boolean;
  fork: boolean;
  owner: User;
  platform: PlatformName;
}

/**
 * Platform detection result
 */
export interface PlatformDetection {
  platform: PlatformName;
  owner: string;
  repo: string;
  fullName: string;
  baseUrl: string;
}

/**
 * Credentials for platform authentication
 */
export interface PlatformCredentials {
  platform: PlatformName;
  token?: string;
  baseUrl?: string;
  // Additional auth methods
  useCliAuth?: boolean;
}

/**
 * CLI execution result
 */
export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

/**
 * The unified platform adapter interface
 * All platform adapters must implement this interface
 */
export interface IssuePlatform {
  readonly name: PlatformName;
  readonly baseUrl: string;
  readonly repo: string;

  // Issue operations
  listIssues(filter?: IssueFilter): Promise<Issue[]>;
  getIssue(number: number): Promise<Issue>;
  createIssue(data: CreateIssueData): Promise<Issue>;
  updateIssue(number: number, data: UpdateIssueData): Promise<Issue>;
  closeIssue(number: number, comment?: string): Promise<void>;
  reopenIssue(number: number): Promise<void>;

  // Comment operations
  listComments(issueNumber: number): Promise<Comment[]>;
  addComment(issueNumber: number, body: string): Promise<Comment>;
  updateComment?(issueNumber: number, commentId: number, body: string): Promise<Comment>;

  // PR operations
  listPullRequests(filter?: PullRequestFilter): Promise<PullRequest[]>;
  getPullRequest(number: number): Promise<PullRequest>;
  createPullRequest(data: CreatePullRequestData): Promise<PullRequest>;
  mergePullRequest(number: number, options?: MergePullRequestOptions): Promise<void>;

  // Optional: Timer operations (Gitea-specific)
  startTimer?(issueNumber: number): Promise<void>;
  stopTimer?(issueNumber: number): Promise<TimeLog>;
  deleteTimer?(issueNumber: number): Promise<void>;
  listTimers?(): Promise<Timer[]>;

  // Optional: Repository operations
  getRepository?(): Promise<Repository>;
}

/**
 * Adapter factory function signature
 */
export type AdapterFactory = (
  repo: string,
  credentials: PlatformCredentials
) => IssuePlatform;

/**
 * Workflow state for .workflow/state.yaml integration
 */
export interface WorkflowState {
  version: number;
  updated_at: string;
  issue?: {
    platform: PlatformName;
    id: number;
    title: string;
    url: string;
    state: string;
    started_at?: string;
    owner_skill: string;
  };
  branch?: {
    name: string;
    created_at: string;
  };
  pace?: {
    workstream_id: string;
    features_total: number;
    features_complete: number;
    owner_skill: string;
  };
  pr?: {
    id: number | null;
    state: string;
    url?: string;
    owner_skill: string;
  };
}
