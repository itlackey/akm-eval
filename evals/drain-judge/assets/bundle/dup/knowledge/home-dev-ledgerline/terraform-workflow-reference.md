---
description: "Guidelines for safe Terraform plan execution and reporting within the infra directory."
---

When working inside the `infra/terraform` folder, you are strictly prohibited from executing the `apply` command. This action must always be performed by the human operator. Instead, generate a plan file using `terraform plan -out=tfplan`. Afterward, provide a concise summary that includes the count of resources to be added, modified, or removed. Specifically, list the addresses of any items scheduled for destruction or replacement. Avoid dumping the entire plan output into the conversation. Focus solely on the high-level statistics and critical resource changes to keep the interaction efficient and safe.
