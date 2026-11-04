---
description: "Status report on the Ulverston wiki style guide rollout as of late October 2026."
tags: [docs, style]
---

## Rollout Status: Ulverston Wiki Style Guide

**Date:** October 28, 2026

The implementation of the new Ulverston wiki formatting standards is currently in the **Staging** environment. We have successfully updated the parser to enforce sentence-case headings and PNG screenshot constraints (max 1200px width). The automated archiving logic for pages lacking an owner header is also deployed.

**Progress:** 45% of the documentation repository has been migrated to the new format. The remaining 55% requires manual review to ensure code fence language tags are correctly applied.

**Approval:** The rollout was approved by **Sarah Jenkins**, Lead Documentation Engineer, on October 25, 2026. She confirmed that the 1200px image limit does not break existing mobile layouts.

**Next Steps:**
- Resolve merge conflicts in the `legacy-api` branch.
- Commit the final batch of migrated pages.
- Target full production rollout by November 15, 2026.

**Recent Commit:** `a3f9c2b` updated the screenshot validation regex.
