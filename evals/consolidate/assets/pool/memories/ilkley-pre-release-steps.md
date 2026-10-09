---
description: The steps the Ilkley team runs before a release goes out.
tags: [release, checklist]
---

# Ilkley release checklist

The Ilkley release branch is cut from the main branch on Wednesday. The release candidate must pass the smoke suite named ik-smoke before sign-off. The changelog is written by the release manager and not by the authors of the changes. Database migrations ship a release before the code that needs them. A release is rolled back when the error rate remains above 2 percent for 10 minutes. The release is announced in #ilkley-ship at least 2 hours before it ships. The release manager closes the ticket after the 24 hour watch.
