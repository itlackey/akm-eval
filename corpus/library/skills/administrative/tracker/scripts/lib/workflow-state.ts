/**
 * Manages .workflow/state.yaml for cross-skill coordination by
 * parsing and writing workflow state data.
 *
 * @when_to_use When coordinating state across different skills or modules in a
 * project that uses the .workflow directory structure.
 */
/**
 * Workflow State Integration
 * Manages .workflow/state.yaml for cross-skill coordination
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { PlatformName, WorkflowState } from "./types.js";

const WORKFLOW_DIR = ".workflow";
const STATE_FILE = "state.yaml";

/**
 * Get the path to the workflow state file
 */
export function getWorkflowStatePath(projectDir = "."): string {
  return join(projectDir, WORKFLOW_DIR, STATE_FILE);
}

/**
 * Check if workflow state exists
 */
export function workflowStateExists(projectDir = "."): boolean {
  return existsSync(getWorkflowStatePath(projectDir));
}

/**
 * Simple YAML parser for workflow state
 * Only handles the specific format we use
 */
function parseYaml(content: string): WorkflowState {
  const state: WorkflowState = {
    version: 1,
    updated_at: new Date().toISOString(),
  };

  let currentSection: string | null = null;
  let sectionData: Record<string, any> = {};

  const lines = content.split("\n");
  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Check for section headers (no indentation)
    const sectionMatch = line.match(/^(\w+):$/);
    if (sectionMatch) {
      // Save previous section
      if (currentSection && Object.keys(sectionData).length > 0) {
        (state as any)[currentSection] = sectionData;
      }
      currentSection = sectionMatch[1];
      sectionData = {};
      continue;
    }

    // Check for top-level key-value
    const topLevelMatch = line.match(/^(\w+):\s*(.+)$/);
    if (topLevelMatch && !currentSection) {
      const [, key, value] = topLevelMatch;
      (state as any)[key] = parseValue(value);
      continue;
    }

    // Check for section properties (indented)
    const propMatch = line.match(/^\s+(\w+):\s*(.*)$/);
    if (propMatch && currentSection) {
      const [, key, value] = propMatch;
      sectionData[key] = parseValue(value);
    }
  }

  // Save last section
  if (currentSection && Object.keys(sectionData).length > 0) {
    (state as any)[currentSection] = sectionData;
  }

  return state;
}

/**
 * Parse a YAML value
 */
function parseValue(value: string): any {
  const trimmed = value.trim();

  // null
  if (trimmed === "null" || trimmed === "~" || trimmed === "") {
    return null;
  }

  // boolean
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // number
  if (/^-?\d+$/.test(trimmed)) {
    return parseInt(trimmed);
  }
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // quoted string
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // unquoted string
  return trimmed;
}

/**
 * Simple YAML serializer for workflow state
 */
function serializeYaml(state: WorkflowState): string {
  const lines: string[] = [];

  // Top-level properties
  lines.push(`version: ${state.version}`);
  lines.push(`updated_at: ${state.updated_at}`);
  lines.push("");

  // Issue section
  if (state.issue) {
    lines.push("issue:");
    lines.push(`  platform: ${state.issue.platform}`);
    lines.push(`  id: ${state.issue.id}`);
    lines.push(`  title: "${escapeYamlString(state.issue.title)}"`);
    lines.push(`  url: ${state.issue.url}`);
    lines.push(`  state: ${state.issue.state}`);
    if (state.issue.started_at) {
      lines.push(`  started_at: ${state.issue.started_at}`);
    }
    lines.push(`  owner_skill: ${state.issue.owner_skill}`);
    lines.push("");
  }

  // Branch section
  if (state.branch) {
    lines.push("branch:");
    lines.push(`  name: ${state.branch.name}`);
    lines.push(`  created_at: ${state.branch.created_at}`);
    lines.push("");
  }

  // PACE section
  if (state.pace) {
    lines.push("pace:");
    lines.push(`  workstream_id: ${state.pace.workstream_id}`);
    lines.push(`  features_total: ${state.pace.features_total}`);
    lines.push(`  features_complete: ${state.pace.features_complete}`);
    lines.push(`  owner_skill: ${state.pace.owner_skill}`);
    lines.push("");
  }

  // PR section
  if (state.pr) {
    lines.push("pr:");
    lines.push(`  id: ${state.pr.id ?? "null"}`);
    lines.push(`  state: ${state.pr.state}`);
    if (state.pr.url) {
      lines.push(`  url: ${state.pr.url}`);
    }
    lines.push(`  owner_skill: ${state.pr.owner_skill}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Escape special characters in YAML strings
 */
function escapeYamlString(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Read workflow state from file
 */
export function getWorkflowContext(projectDir = "."): WorkflowState | null {
  const statePath = getWorkflowStatePath(projectDir);

  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    return parseYaml(content);
  } catch (err) {
    console.error(`Warning: Failed to read workflow state: ${err}`);
    return null;
  }
}

/**
 * Write workflow state to file
 */
export function updateWorkflowState(
  state: WorkflowState,
  projectDir = "."
): void {
  const statePath = getWorkflowStatePath(projectDir);
  const dir = dirname(statePath);

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Update timestamp
  state.updated_at = new Date().toISOString();

  try {
    const content = serializeYaml(state);
    writeFileSync(statePath, content, "utf-8");
  } catch (err) {
    console.error(`Warning: Failed to write workflow state: ${err}`);
  }
}

/**
 * Update issue section in workflow state
 */
export function updateIssueState(
  platform: PlatformName,
  id: number,
  title: string,
  url: string,
  issueState: string,
  projectDir = "."
): void {
  const state = getWorkflowContext(projectDir) || {
    version: 1,
    updated_at: new Date().toISOString(),
  };

  state.issue = {
    platform,
    id,
    title,
    url,
    state: issueState,
    started_at: issueState === "in-progress" ? new Date().toISOString() : state.issue?.started_at,
    owner_skill: "tracker",
  };

  updateWorkflowState(state, projectDir);
}

/**
 * Update branch section in workflow state
 */
export function updateBranchState(name: string, projectDir = "."): void {
  const state = getWorkflowContext(projectDir) || {
    version: 1,
    updated_at: new Date().toISOString(),
  };

  state.branch = {
    name,
    created_at: new Date().toISOString(),
  };

  updateWorkflowState(state, projectDir);
}

/**
 * Update PR section in workflow state
 */
export function updatePrState(
  id: number | null,
  prState: string,
  url?: string,
  projectDir = "."
): void {
  const state = getWorkflowContext(projectDir) || {
    version: 1,
    updated_at: new Date().toISOString(),
  };

  state.pr = {
    id,
    state: prState,
    url,
    owner_skill: "tracker",
  };

  updateWorkflowState(state, projectDir);
}

/**
 * Clear issue and related state (when issue is completed)
 */
export function clearIssueState(projectDir = "."): void {
  const state = getWorkflowContext(projectDir);
  if (!state) return;

  delete state.issue;
  delete state.branch;
  delete state.pr;

  updateWorkflowState(state, projectDir);
}

/**
 * Get current issue from workflow state
 */
export function getCurrentIssue(projectDir = "."): WorkflowState["issue"] | null {
  const state = getWorkflowContext(projectDir);
  return state?.issue || null;
}

/**
 * Get current branch from workflow state
 */
export function getCurrentBranch(projectDir = "."): WorkflowState["branch"] | null {
  const state = getWorkflowContext(projectDir);
  return state?.branch || null;
}
