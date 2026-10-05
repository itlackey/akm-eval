/**
 * Tests for platform-detector.ts
 */

import { describe, test, expect } from "bun:test";
import {
  parseGitRemoteUrl,
  parseRepoString,
  supportsTimers,
  getPlatformDisplayName,
} from "../lib/platform-detector.js";

describe("parseGitRemoteUrl", () => {
  describe("GitHub URLs", () => {
    test("parses HTTPS URL", () => {
      const result = parseGitRemoteUrl("https://github.com/owner/repo.git");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("github");
      expect(result!.owner).toBe("owner");
      expect(result!.repo).toBe("repo");
      expect(result!.fullName).toBe("owner/repo");
    });

    test("parses HTTPS URL without .git", () => {
      const result = parseGitRemoteUrl("https://github.com/owner/repo");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("github");
      expect(result!.owner).toBe("owner");
      expect(result!.repo).toBe("repo");
    });

    test("parses SSH URL", () => {
      const result = parseGitRemoteUrl("git@github.com:owner/repo.git");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("github");
      expect(result!.owner).toBe("owner");
      expect(result!.repo).toBe("repo");
    });
  });

  describe("Azure DevOps URLs", () => {
    test("parses HTTPS URL with _git path", () => {
      const result = parseGitRemoteUrl(
        "https://dev.azure.com/org/project/_git/repo"
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("azdo");
      expect(result!.owner).toBe("org/project");
      expect(result!.repo).toBe("repo");
    });

    test("parses SSH URL with v3 path", () => {
      const result = parseGitRemoteUrl(
        "git@ssh.dev.azure.com:v3/org/project/repo"
      );
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("azdo");
      expect(result!.owner).toBe("org/project");
      expect(result!.repo).toBe("repo");
    });
  });

  describe("GitLab URLs", () => {
    test("parses HTTPS URL", () => {
      const result = parseGitRemoteUrl("https://gitlab.com/owner/repo.git");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("gitlab");
      expect(result!.owner).toBe("owner");
      expect(result!.repo).toBe("repo");
    });

    test("parses SSH URL", () => {
      const result = parseGitRemoteUrl("git@gitlab.com:owner/repo.git");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("gitlab");
      expect(result!.owner).toBe("owner");
      expect(result!.repo).toBe("repo");
    });
  });

  describe("Gitea URLs (self-hosted)", () => {
    test("parses HTTPS URL for unknown host as Gitea", () => {
      const result = parseGitRemoteUrl("https://code.example.com/owner/repo.git");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("gitea");
      expect(result!.owner).toBe("owner");
      expect(result!.repo).toBe("repo");
    });

    test("parses SSH URL for unknown host as Gitea", () => {
      const result = parseGitRemoteUrl("git@code.example.com:owner/repo.git");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("gitea");
      expect(result!.owner).toBe("owner");
      expect(result!.repo).toBe("repo");
    });
  });

  describe("edge cases", () => {
    test("returns null for empty string", () => {
      expect(parseGitRemoteUrl("")).toBeNull();
    });

    test("returns null for invalid URL", () => {
      expect(parseGitRemoteUrl("not-a-url")).toBeNull();
    });

    test("handles whitespace", () => {
      const result = parseGitRemoteUrl("  https://github.com/owner/repo.git  ");
      expect(result).not.toBeNull();
      expect(result!.platform).toBe("github");
    });
  });
});

describe("parseRepoString", () => {
  test("parses owner/repo format", () => {
    const result = parseRepoString("owner/repo");
    expect(result).not.toBeNull();
    expect(result!.owner).toBe("owner");
    expect(result!.repo).toBe("repo");
  });

  test("returns null for invalid format", () => {
    expect(parseRepoString("invalid")).toBeNull();
    expect(parseRepoString("")).toBeNull();
  });

  test("handles nested repos", () => {
    const result = parseRepoString("org/project/repo");
    expect(result).not.toBeNull();
    expect(result!.owner).toBe("org");
    expect(result!.repo).toBe("project/repo");
  });
});

describe("supportsTimers", () => {
  test("returns true for Gitea", () => {
    expect(supportsTimers("gitea")).toBe(true);
  });

  test("returns false for other platforms", () => {
    expect(supportsTimers("github")).toBe(false);
    expect(supportsTimers("gitlab")).toBe(false);
    expect(supportsTimers("azdo")).toBe(false);
  });
});

describe("getPlatformDisplayName", () => {
  test("returns correct display names", () => {
    expect(getPlatformDisplayName("github")).toBe("GitHub");
    expect(getPlatformDisplayName("gitlab")).toBe("GitLab");
    expect(getPlatformDisplayName("azdo")).toBe("Azure DevOps");
    expect(getPlatformDisplayName("gitea")).toBe("Gitea");
  });
});
