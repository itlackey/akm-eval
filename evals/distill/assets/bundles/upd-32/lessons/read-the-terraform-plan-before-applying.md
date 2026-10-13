---
description: "Read the whole Terraform plan before applying it, so a change that destroys a resource does not go through unseen."
when_to_use: "When applying a Terraform change to shared infrastructure."
type: lesson
tags:
  - infra
updated: 2026-09-11
---

Read the whole Terraform plan before applying it.
A plan can destroy a resource that the change did not seem to touch.
