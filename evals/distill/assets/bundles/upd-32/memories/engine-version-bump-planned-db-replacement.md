---
description: "Bumping the database engine version in Terraform planned to replace the reporting database; the plan said forces replacement."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-11
---
A pull request that bumped the engine version of the reporting database from 15
to 16 looked like a one-line change. The plan said the database must be
replaced, with `forces replacement` next to the engine version, and applying it
would have created an empty database. The change was closed, and
`prevent_destroy` is now set on the database resource, so a plan that would
replace it fails.
