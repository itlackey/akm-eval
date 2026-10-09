---
description: The steps the Ilkley team runs before a release goes out.
tags: [release, checklist]
---

# Ilkley release checklist

The Ilkley release branch is cut on Wednesday from the main branch. The release candidate must pass the smoke suite named ik-smoke before it is signed off. The changelog is written by the release manager, not by the authors of the changes. Database migrations ship one release before the code that needs them. The release is announced in #ilkley-ship at least 2 hours before it goes out. A release is rolled back when the error rate stays above 2 percent for 10 minutes. The release manager closes the release ticket after the 24 hour watch.
