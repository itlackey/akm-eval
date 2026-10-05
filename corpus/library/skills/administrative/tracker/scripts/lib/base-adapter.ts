/**
 * Base Adapter - Shared functionality for platform adapters
 * Provides common utilities like error handling, retries, and timeouts
 */

import type { CliResult, PlatformCredentials, PlatformName } from "./types.js";
import { loadTrackerEnv } from "./credential-resolver.js";

/**
 * Default timeout for operations (30 seconds)
 */
export const DEFAULT_TIMEOUT = 30000;

/**
 * Maximum number of retries for transient failures
 */
export const MAX_RETRIES = 3;

/**
 * Delay between retries (exponential backoff base)
 */
export const RETRY_DELAY_BASE = 1000;

/**
 * Error codes that indicate transient failures worth retrying
 */
const RETRYABLE_ERROR_CODES = [
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
];

/**
 * HTTP status codes that indicate transient failures
 */
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return RETRYABLE_ERROR_CODES.some(
      (code) => message.includes(code.toLowerCase())
    );
  }
  return false;
}

/**
 * Check if an HTTP status code is retryable
 */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.includes(status);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
export function getBackoffDelay(attempt: number): number {
  return RETRY_DELAY_BASE * Math.pow(2, attempt);
}

/**
 * Wrap a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries && isRetryableError(error)) {
        const delay = getBackoffDelay(attempt);
        console.error(
          `Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`
        );
        await sleep(delay);
      } else {
        throw lastError;
      }
    }
  }

  throw lastError;
}

/**
 * Wrap a function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Run a CLI command with common handling
 */
export async function runCli(
  command: string[],
  options?: {
    env?: Record<string, string>;
    timeout?: number;
    cwd?: string;
  }
): Promise<CliResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  const proc = Bun.spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...options?.env },
    cwd: options?.cwd,
  });

  // Set up timeout
  const timeoutId = setTimeout(() => {
    proc.kill();
  }, timeout);

  try {
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Format a date string for display
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

/**
 * Parse owner/repo from a string
 */
export function parseOwnerRepo(
  ownerRepo: string
): { owner: string; repo: string } | null {
  const parts = ownerRepo.split("/");
  if (parts.length !== 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Create an adapter based on platform type
 */
export async function createAdapter(
  platform: PlatformName,
  repo: string,
  credentials: PlatformCredentials
): Promise<import("./types.js").IssuePlatform> {
  switch (platform) {
    case "github": {
      const { createGitHubAdapter } = await import("../platforms/github.js");
      return createGitHubAdapter(repo, credentials);
    }
    case "gitea": {
      const { createGiteaAdapter } = await import("../platforms/gitea.js");
      return createGiteaAdapter(repo, credentials);
    }
    case "azdo": {
      const { createAzureDevOpsAdapter } = await import("../platforms/azdo.js");
      return createAzureDevOpsAdapter(repo, credentials);
    }
    case "gitlab": {
      throw new Error("GitLab adapter not yet implemented");
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

/**
 * Credential resolution helper - gets credentials for a platform.
 * Each variable comes from process.env first, then from the consumer's
 * env/tracker file, which is read only when a variable is missing.
 */
export async function resolveCredentials(
  platform: PlatformName,
  baseUrl?: string
): Promise<PlatformCredentials> {
  const credentials: PlatformCredentials = {
    platform,
    baseUrl,
  };

  let fileVars: Record<string, string> | undefined;
  const lookup = (...names: string[]): string | undefined => {
    for (const name of names) if (process.env[name]) return process.env[name];
    fileVars ??= loadTrackerEnv();
    for (const name of names) if (fileVars[name]) return fileVars[name];
    return undefined;
  };

  switch (platform) {
    case "github":
      credentials.token = lookup("GH_TOKEN", "GITHUB_TOKEN");
      credentials.useCliAuth = !credentials.token;
      break;

    case "gitea":
      credentials.token = lookup("GITEA_TOKEN");
      credentials.baseUrl = baseUrl || lookup("GITEA_URL");
      break;

    case "azdo":
      credentials.token = lookup("AZURE_DEVOPS_PAT");
      credentials.baseUrl = baseUrl || lookup("AZURE_DEVOPS_ORG");
      break;

    case "gitlab":
      credentials.token = lookup("GITLAB_TOKEN");
      credentials.baseUrl = baseUrl || "https://gitlab.com";
      break;
  }

  return credentials;
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Print a simple table to console
 */
export function printTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
  );

  const separator = colWidths.map((w) => "-".repeat(w + 2)).join("+");
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell || "").padEnd(colWidths[i])} `).join("|");

  console.log(separator);
  console.log(formatRow(headers));
  console.log(separator);
  rows.forEach((row) => console.log(formatRow(row)));
  console.log(separator);
}

/**
 * Print JSON to stdout
 */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
