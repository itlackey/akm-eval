---
description: "How to clean the plan column of the CRM export."
---

Plan names in the CRM export are not consistent: the same plan appears as pro, Pro and pro with a space after it, and some rows say legacy-2019. Lowercase and trim the value, and count legacy-2019 as starter, which is how Finance's dashboard groups plans, so totals per plan agree with billing.
