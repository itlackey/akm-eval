/**
 * Tests for workflow-state.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getWorkflowStatePath,
  workflowStateExists,
  getWorkflowContext,
  updateWorkflowState,
  updateIssueState,
  updateBranchState,
  updatePrState,
  clearIssueState,
  getCurrentIssue,
  getCurrentBranch,
} from "../lib/workflow-state.js";

describe("workflow-state", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getWorkflowStatePath", () => {
    test("returns correct path", () => {
      const path = getWorkflowStatePath(tempDir);
      expect(path).toBe(join(tempDir, ".workflow", "state.yaml"));
    });
  });

  describe("workflowStateExists", () => {
    test("returns false when file does not exist", () => {
      expect(workflowStateExists(tempDir)).toBe(false);
    });

    test("returns true after state is created", () => {
      updateWorkflowState({ version: 1, updated_at: new Date().toISOString() }, tempDir);
      expect(workflowStateExists(tempDir)).toBe(true);
    });
  });

  describe("updateWorkflowState and getWorkflowContext", () => {
    test("creates and reads basic state", () => {
      const state = {
        version: 1,
        updated_at: new Date().toISOString(),
      };

      updateWorkflowState(state, tempDir);
      const read = getWorkflowContext(tempDir);

      expect(read).not.toBeNull();
      expect(read!.version).toBe(1);
    });

    test("handles full state with all sections", () => {
      const state = {
        version: 1,
        updated_at: new Date().toISOString(),
        issue: {
          platform: "gitea" as const,
          id: 42,
          title: "Test Issue",
          url: "https://example.com/issues/42",
          state: "open",
          owner_skill: "tracker",
        },
        branch: {
          name: "feat/test",
          created_at: new Date().toISOString(),
        },
        pr: {
          id: null,
          state: "not-created",
          owner_skill: "tracker",
        },
      };

      updateWorkflowState(state, tempDir);
      const read = getWorkflowContext(tempDir);

      expect(read).not.toBeNull();
      expect(read!.issue?.id).toBe(42);
      expect(read!.issue?.title).toBe("Test Issue");
      expect(read!.branch?.name).toBe("feat/test");
      expect(read!.pr?.state).toBe("not-created");
    });
  });

  describe("updateIssueState", () => {
    test("creates issue section", () => {
      updateIssueState(
        "github",
        123,
        "Test Issue",
        "https://github.com/test/repo/issues/123",
        "open",
        tempDir
      );

      const state = getWorkflowContext(tempDir);
      expect(state?.issue?.platform).toBe("github");
      expect(state?.issue?.id).toBe(123);
      expect(state?.issue?.title).toBe("Test Issue");
      expect(state?.issue?.owner_skill).toBe("tracker");
    });

    test("sets started_at when state is in-progress", () => {
      updateIssueState(
        "gitea",
        42,
        "In Progress Issue",
        "https://example.com/issues/42",
        "in-progress",
        tempDir
      );

      const state = getWorkflowContext(tempDir);
      expect(state?.issue?.started_at).toBeDefined();
    });
  });

  describe("updateBranchState", () => {
    test("creates branch section", () => {
      updateBranchState("feat/new-feature", tempDir);

      const state = getWorkflowContext(tempDir);
      expect(state?.branch?.name).toBe("feat/new-feature");
      expect(state?.branch?.created_at).toBeDefined();
    });
  });

  describe("updatePrState", () => {
    test("creates PR section", () => {
      updatePrState(456, "open", "https://github.com/test/repo/pull/456", tempDir);

      const state = getWorkflowContext(tempDir);
      expect(state?.pr?.id).toBe(456);
      expect(state?.pr?.state).toBe("open");
      expect(state?.pr?.url).toBe("https://github.com/test/repo/pull/456");
    });

    test("handles null PR id", () => {
      updatePrState(null, "not-created", undefined, tempDir);

      const state = getWorkflowContext(tempDir);
      expect(state?.pr?.id).toBeNull();
      expect(state?.pr?.state).toBe("not-created");
    });
  });

  describe("clearIssueState", () => {
    test("removes issue, branch, and PR sections", () => {
      // Set up full state
      updateIssueState("github", 1, "Test", "https://example.com", "open", tempDir);
      updateBranchState("feat/test", tempDir);
      updatePrState(2, "open", "https://example.com/pr", tempDir);

      // Clear
      clearIssueState(tempDir);

      const state = getWorkflowContext(tempDir);
      expect(state?.issue).toBeUndefined();
      expect(state?.branch).toBeUndefined();
      expect(state?.pr).toBeUndefined();
    });
  });

  describe("getCurrentIssue and getCurrentBranch", () => {
    test("returns null when no state exists", () => {
      expect(getCurrentIssue(tempDir)).toBeNull();
      expect(getCurrentBranch(tempDir)).toBeNull();
    });

    test("returns current values when set", () => {
      updateIssueState("gitea", 100, "Current Issue", "https://example.com", "open", tempDir);
      updateBranchState("dev/feature", tempDir);

      expect(getCurrentIssue(tempDir)?.id).toBe(100);
      expect(getCurrentBranch(tempDir)?.name).toBe("dev/feature");
    });
  });
});
