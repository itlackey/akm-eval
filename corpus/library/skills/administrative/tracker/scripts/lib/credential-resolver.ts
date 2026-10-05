/**
 * Credential Resolver - Multi-host authentication for tracker platforms
 *
 * Resolution order:
 * 1. Environment variables (GITEA_TOKEN, GH_TOKEN, AZURE_DEVOPS_PAT)
 * 2. The consumer's env/tracker file (tracker.env in their own akm stash)
 * 3. CLI auth status (gh auth, az account)
 */

import { readFileSync } from "node:fs";
import type { PlatformName, PlatformCredentials } from "./types.js";

/**
 * akm env ref holding every tracker token and setting
 */
const TRACKER_ENV_REF = "env/tracker";

/**
 * Platform-specific environment variable names
 */
const ENV_VARS: Record<PlatformName, { token: string[]; url?: string[] }> = {
  github: { token: ["GH_TOKEN", "GITHUB_TOKEN"] },
  gitlab: { token: ["GITLAB_TOKEN"], url: ["GITLAB_URL"] },
  azdo: { token: ["AZURE_DEVOPS_PAT", "AZDO_PAT"], url: ["AZURE_DEVOPS_ORG"] },
  gitea: { token: ["GITEA_TOKEN"], url: ["GITEA_URL"] },
};

/**
 * Look up credentials in a set of variables (process.env or the env/tracker file)
 */
function getFromVars(
  platform: PlatformName,
  vars: Record<string, string | undefined>
): Partial<PlatformCredentials> {
  const config = ENV_VARS[platform];
  const result: Partial<PlatformCredentials> = {};

  // Check token env vars
  for (const varName of config.token) {
    const value = vars[varName];
    if (value) {
      result.token = value;
      break;
    }
  }

  // Check URL env vars
  if (config.url) {
    for (const varName of config.url) {
      const value = vars[varName];
      if (value) {
        result.baseUrl = value;
        break;
      }
    }
  }

  return result;
}

/**
 * Parse a .env file and return key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Handle export VAR=value format
    const exportMatch = trimmed.match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (exportMatch) {
      const [, key, value] = exportMatch;
      result[key] = value.replace(/^["']|["']$/g, ""); // Remove quotes
      continue;
    }

    // Handle VAR=value format
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (match) {
      const [, key, value] = match;
      result[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return result;
}

/**
 * Read the consumer's env/tracker file, located with `akm env path env/tracker`.
 * Returns {} when akm is not installed, the ref does not exist, or the file
 * cannot be read.
 */
export function loadTrackerEnv(): Record<string, string> {
  try {
    // Pass env explicitly: without it Bun looks up akm in the PATH from process start
    const proc = Bun.spawnSync(
      ["akm", "env", "path", TRACKER_ENV_REF, "--format", "text", "-q"],
      { stdout: "pipe", stderr: "pipe", env: process.env }
    );
    if (proc.exitCode !== 0) return {};
    return parseEnvFile(readFileSync(proc.stdout.toString().trim(), "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Check if CLI auth is available
 */
async function checkCliAuth(platform: PlatformName): Promise<boolean> {
  try {
    let proc: ReturnType<typeof Bun.spawn>;

    switch (platform) {
      case "github":
        proc = Bun.spawn(["gh", "auth", "status"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        break;
      case "azdo":
        proc = Bun.spawn(["az", "account", "show"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        break;
      default:
        return false;
    }

    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Resolve credentials for a platform
 *
 * @param platform - The platform to get credentials for
 * @param baseUrl - Optional base URL override (for self-hosted instances)
 * @returns Resolved credentials
 */
export async function resolveCredentials(
  platform: PlatformName,
  baseUrl?: string
): Promise<PlatformCredentials> {
  const credentials: PlatformCredentials = {
    platform,
    baseUrl,
  };

  // 1. Check environment variables
  const envCreds = getFromVars(platform, process.env);
  if (envCreds.token) credentials.token = envCreds.token;
  if (envCreds.baseUrl && !credentials.baseUrl) credentials.baseUrl = envCreds.baseUrl;

  // 2. Check the env/tracker file if no token found
  if (!credentials.token) {
    const fileCreds = getFromVars(platform, loadTrackerEnv());
    if (fileCreds.token) credentials.token = fileCreds.token;
    if (fileCreds.baseUrl && !credentials.baseUrl) credentials.baseUrl = fileCreds.baseUrl;
  }

  // 3. Check CLI auth if no token found
  if (!credentials.token) {
    const hasCliAuth = await checkCliAuth(platform);
    if (hasCliAuth) {
      credentials.useCliAuth = true;
    }
  }

  // Set default base URLs for known platforms
  if (!credentials.baseUrl) {
    switch (platform) {
      case "github":
        credentials.baseUrl = "https://api.github.com";
        break;
      case "gitlab":
        credentials.baseUrl = "https://gitlab.com";
        break;
    }
  }

  return credentials;
}

/**
 * Validate that credentials are sufficient for API calls
 */
export function validateCredentials(credentials: PlatformCredentials): boolean {
  // GitHub and Azure DevOps can use CLI auth
  if (credentials.useCliAuth && (credentials.platform === "github" || credentials.platform === "azdo")) {
    return true;
  }

  // All platforms need a token for direct API access
  if (!credentials.token) {
    return false;
  }

  // Gitea needs a base URL
  if (credentials.platform === "gitea" && !credentials.baseUrl) {
    return false;
  }

  return true;
}

/**
 * Get a helpful error message for missing credentials
 */
export function getCredentialHelpMessage(platform: PlatformName): string {
  switch (platform) {
    case "github":
      return `GitHub credentials not found. Options:
  1. Run: gh auth login
  2. Set GH_TOKEN environment variable
  3. Add GH_TOKEN=your-token to env/tracker in your own akm stash
     (or run via: akm env run env/tracker -- <command>)`;

    case "gitlab":
      return `GitLab credentials not found. Options:
  1. Set GITLAB_TOKEN environment variable
  2. Add GITLAB_TOKEN=your-token to env/tracker in your own akm stash
     (or run via: akm env run env/tracker -- <command>)`;

    case "azdo":
      return `Azure DevOps credentials not found. Options:
  1. Run: az login
  2. Set AZURE_DEVOPS_PAT environment variable
  3. Add AZURE_DEVOPS_PAT=your-pat to env/tracker in your own akm stash
     (or run via: akm env run env/tracker -- <command>)`;

    case "gitea":
      return `Gitea credentials not found. Options:
  1. Set GITEA_URL and GITEA_TOKEN environment variables
  2. Add these lines to env/tracker in your own akm stash
     (or run via: akm env run env/tracker -- <command>):
     GITEA_URL=https://gitea.example.com
     GITEA_TOKEN=your-token`;

    default:
      return `Credentials not found for platform: ${platform}`;
  }
}
