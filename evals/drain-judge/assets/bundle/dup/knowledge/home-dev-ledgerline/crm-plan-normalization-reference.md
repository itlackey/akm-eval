---
description: "Standardize CRM export plan names for billing consistency"
---

The CRM export feature currently generates plan identifiers with mixed capitalization, such as 'pro' and 'Pro', alongside the outdated 'legacy-2019' label. To align with Finance dashboard standards, all entries must be converted to lowercase. Additionally, any record containing 'legacy-2019' should be remapped to 'starter'. This normalization step is critical for ensuring accurate aggregation of plan-level data across both CRM exports and internal billing systems. Without this transformation, discrepancies in casing and outdated labels will cause errors in financial reporting and data integration processes. Implementing these changes guarantees uniformity in how plan categories are interpreted and processed throughout the organization's data pipeline.
