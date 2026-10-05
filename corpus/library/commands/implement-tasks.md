---
name: implement-tasks
type: command
description: Dispatch agents to implement and review all tasks based.
  information provided.
when_to_use: Use when you already have a task plan or phase document and need a
  coordinated multi-agent implementation and review loop to execute it.
updated: 2026-05-11
---

# Implement Tasks

Dispatch agents to implement and review all tasks based on the information provided.

## When to use
Use when you already have a task plan or phase document and need a coordinated multi-agent implementation and review loop to execute it. Ensure the arguments include specific file paths, line numbers, or references to existing stash assets (e.g., `admin-refactor-tasks`) so agents can locate context immediately.

## Workflow

1. **Initialize**: Read the referenced task plan document(s) from `$ARGUMENTS`. Extract phases, specific tasks, file paths, and line numbers for each task item. If paths are relative, resolve them against the current working directory or the root of the repository defined in the environment.
2. **Dispatch Implementation Agents**: Assign development agents to complete all tasks identified in the plan. Provide them with the exact path and line numbers from the plan document to locate additional context. Inform them they can use the `akm CLI` to find resources, check status, or verify file existence as needed.
3. **Phase Review Loop**:
   - As each task is completed, dispatch review agents to review it immediately against the original requirements and code standards.
   - Work with development agents to correct any issues found during review until the review agent approves the changes.
4. **Phase Completion Gate**:
   - Once a phase is complete, deploy three diverse review agents to perform an end-to-end review of all changes in that phase.
   - Deploy development agents to iteratively correct all issues found by these three agents.
   - Repeat this iterative correction process until all three agents approve the phase.
   - **Commit and push** the changes immediately after approval of each phase to ensure state is preserved.
5. **Phase Iteration**: Once a phase is fully approved, repeat the entire process for the next phase until all phases are complete.
6. **Final End-to-End Review**:
   - After all phases pass, deploy five diverse review agents to perform a final end-to-end review of the complete changes, documentation, tests, and install scripts.
   - Repeat the iterative correction process until all five review agents approve the final changes.
7. **Documentation Maintenance**: Ensure the task document stays up to date throughout the process to ensure work is completed efficiently and completely.

## Task Details
$ARGUMENTS
