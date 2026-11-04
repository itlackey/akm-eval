---
description: "Status update on Juniper glossary PR #412 waiting on legal review."
tags: [i18n, glossary]
---

## Status Report: PR #412 - Glossary Update

**Date:** November 14, 2026
**Ticket:** JPR-8891
**Status:** Blocked

Pull request #412, which adds 15 new product terms to the Juniper translation glossary, is currently stalled. The PR was opened on November 10, 2026, by @sarah_dev, but requires final sign-off from the Legal Compliance team before merging.

The changes include updates to the `keep` flag for three critical terms: "CloudSync," "DataVault," and "SecureLink." These terms must remain untranslated in all supported languages to maintain brand consistency. The initial review by @mike_translator confirmed the accuracy of the existing 240 terms, but Legal flagged a potential trademark conflict with "SecureLink" in the EU region.

We are waiting for @legal_eu to confirm the trademark status. Once cleared, the glossary repository will be updated, and translators will see the new terms in the tool within 24 hours. Current commit hash: `a1b2c3d`.

**Next Steps:**
1. Legal provides confirmation by Nov 16.
2. Merge PR #412.
3. Trigger glossary sync pipeline.
