---
type: command
name: validate-print
description: Validates print job configuration and environment before execution,
  redirecting to the preflight tool.
when_to_use: Use this command when you need to verify that all print
  dependencies, environment variables, and file paths are correctly configured
  before running a print task.
updated: 2026-06-19
---

**Note:** This command has been renamed to `preflight-print`.

This utility checks the validity of your current print configuration and environment state. It ensures that required arguments, file paths, and system dependencies are present before attempting to execute a print job.

### Usage

Follow `commands/print/preflight-print` with `$ARGUMENTS` as the PDF path.
