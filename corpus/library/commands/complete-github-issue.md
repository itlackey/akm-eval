---
name: complete-github-issue
type: command
description: Drive a GitHub issue from intake through implementation, review.
  verification, issue updates, and draft PR creation.
when_to_use: Use when you need to drive a single GitHub issue through
  implementation, iterative review, verification, and draft PR creation.
updated: 2026-05-11
---

# GitHub Issue Completion Protocol

## Objective
Drive a single GitHub issue from intake through implementation, iterative review, verification, and draft PR creation. The goal is to produce a high-quality, reviewed branch ready for submission.

## Prerequisites & Context Discovery
1. **Fetch Issue State**: Use `gh issue view <number>` to retrieve the latest description, comments, and labels. Do not rely on stale context.
2. **AKM Discovery**: Immediately use `akm CLI` to discover relevant skills, knowledge bases, existing workflows, and specialized agents. Prioritize repo-specific guidance over generic patterns.
3. **Plan**: Break the issue into discrete, sequential tasks. Identify dependencies and potential risks.

## Execution Workflow

### Phase 1: Implementation & Iterative Review
For each task in the plan:
1. **Implement**: Dispatch a developer agent to write the code. Adhere to the Coding Constitution (KISS, DRY, SOLID).
2. **Review**: Assign reviewer agents to inspect the changes immediately. Focus on correctness, clarity, and adherence to standards.
3. **Fix**: If issues are found, instruct the developer to fix them. Repeat until approved.
4. **Update**: Once a task is approved, update the GitHub issue description and task list to reflect progress.

### Phase 2: Final Quality Gate
After all individual tasks are approved:
1. **Holistic Review**: Deploy 5 reviewer agents working in concert with developer agents to review the entire branch.
2. **Focus Areas**: Check for integration issues, complexity creep, and edge cases. Ensure code quality is high and complexity is low.
3. **Approval**: The issue is only considered complete when all 5 reviewers approve the final state.

## Completion
1. **Draft PR**: Submit a draft Pull Request referencing the original issue number.
2. **Summary**: Include a summary of changes, testing performed, and any known limitations in the PR description.

## GitHub Issue Details

$ARGUMENTS
