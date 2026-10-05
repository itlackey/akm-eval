/**
 * Platform detector - detects issue tracker platform from git remote URL
 * Supports GitHub, GitLab, Azure DevOps, and Gitea
 */

import type { PlatformName, PlatformDetection } from "./types.js";

/**
 * Known platform domains and their identifiers
 */
const KNOWN_PLATFORMS: Record<string, PlatformName> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "dev.azure.com": "azdo",
  "visualstudio.com": "azdo",
  "ssh.dev.azure.com": "azdo",
};

/**
 * Parse a git remote URL and extract platform, owner, and repo
 *
 * Supports formats:
 * - HTTPS: https://github.com/owner/repo.git
 * - SSH: git@github.com:owner/repo.git
 * - Azure: https://dev.azure.com/org/project/_git/repo
 * - Azure SSH: git@ssh.dev.azure.com:v3/org/project/repo
 */
export function parseGitRemoteUrl(url: string): PlatformDetection | null {
  // Normalize URL
  let normalized = url.trim();

  // Remove trailing .git
  if (normalized.endsWith(".git")) {
    normalized = normalized.slice(0, -4);
  }

  // Handle SSH format: git@host:path
  if (normalized.startsWith("git@")) {
    return parseSshUrl(normalized);
  }

  // Handle HTTPS format
  if (normalized.startsWith("https://") || normalized.startsWith("http://")) {
    return parseHttpsUrl(normalized);
  }

  // Handle ssh:// format
  if (normalized.startsWith("ssh://")) {
    return parseSshProtocolUrl(normalized);
  }

  return null;
}

/**
 * Parse SSH format URLs: git@host:path
 */
function parseSshUrl(url: string): PlatformDetection | null {
  // git@github.com:owner/repo
  // git@ssh.dev.azure.com:v3/org/project/repo
  const match = url.match(/^git@([^:]+):(.+)$/);
  if (!match) return null;

  const [, host, path] = match;
  const platform = detectPlatformFromHost(host);

  // Azure DevOps SSH has special format: v3/org/project/repo
  if (platform === "azdo" && path.startsWith("v3/")) {
    const parts = path.slice(3).split("/");
    if (parts.length >= 3) {
      const [org, project, repo] = parts;
      return {
        platform,
        owner: `${org}/${project}`,
        repo,
        fullName: `${org}/${project}/${repo}`,
        baseUrl: `https://dev.azure.com/${org}`,
      };
    }
  }

  // Standard format: owner/repo
  const parts = path.split("/");
  if (parts.length >= 2) {
    const owner = parts[0];
    const repo = parts.slice(1).join("/");
    return {
      platform,
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      baseUrl: getBaseUrl(host, platform),
    };
  }

  return null;
}

/**
 * Parse HTTPS format URLs
 */
function parseHttpsUrl(url: string): PlatformDetection | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const platform = detectPlatformFromHost(host);
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    // Azure DevOps: /org/project/_git/repo
    if (platform === "azdo" && pathParts.includes("_git")) {
      const gitIndex = pathParts.indexOf("_git");
      if (gitIndex >= 2) {
        const org = pathParts[0];
        const project = pathParts[1];
        const repo = pathParts[gitIndex + 1];
        return {
          platform,
          owner: `${org}/${project}`,
          repo,
          fullName: `${org}/${project}/${repo}`,
          baseUrl: `https://${host}/${org}`,
        };
      }
    }

    // Standard format: /owner/repo
    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts.slice(1).join("/");
      return {
        platform,
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        baseUrl: getBaseUrl(host, platform),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Parse ssh:// protocol URLs
 */
function parseSshProtocolUrl(url: string): PlatformDetection | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const platform = detectPlatformFromHost(host);
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts.slice(1).join("/");
      return {
        platform,
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        baseUrl: getBaseUrl(host, platform),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Detect platform from hostname
 */
function detectPlatformFromHost(host: string): PlatformName {
  const normalized = host.toLowerCase();

  // Check known platforms
  for (const [domain, platform] of Object.entries(KNOWN_PLATFORMS)) {
    if (normalized === domain || normalized.endsWith(`.${domain}`)) {
      return platform;
    }
  }

  // Default to Gitea for unknown hosts (self-hosted)
  return "gitea";
}

/**
 * Get base URL for API calls
 */
function getBaseUrl(host: string, platform: PlatformName): string {
  switch (platform) {
    case "github":
      return "https://api.github.com";
    case "gitlab":
      return "https://gitlab.com";
    case "azdo":
      return `https://${host}`;
    case "gitea":
    default:
      // Assume HTTPS for self-hosted Gitea
      return `https://${host}`;
  }
}

/**
 * Get the git remote URL from the current repository
 */
export async function getGitRemoteUrl(remoteName = "origin"): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "remote", "get-url", remoteName], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      return stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect platform from current git repository
 */
export async function detectPlatform(remoteName = "origin"): Promise<PlatformDetection | null> {
  const url = await getGitRemoteUrl(remoteName);
  if (!url) return null;
  return parseGitRemoteUrl(url);
}

/**
 * Parse a repo string (owner/repo) with optional platform override
 */
export function parseRepoString(
  repoString: string,
  platformOverride?: PlatformName
): { owner: string; repo: string; platform?: PlatformName } | null {
  const parts = repoString.split("/");
  if (parts.length < 2) return null;

  return {
    owner: parts[0],
    repo: parts.slice(1).join("/"),
    platform: platformOverride,
  };
}

/**
 * Check if a platform supports timer features
 */
export function supportsTimers(platform: PlatformName): boolean {
  return platform === "gitea";
}

/**
 * Get human-readable platform name
 */
export function getPlatformDisplayName(platform: PlatformName): string {
  const names: Record<PlatformName, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    azdo: "Azure DevOps",
    gitea: "Gitea",
  };
  return names[platform];
}
