---
description: "Guidelines for concise pull request feedback"
---

To maintain efficiency and clarity, all code reviews within this repository must adhere to a rigid, minimalist structure. The goal is to eliminate fluff and ensure that every comment is immediately actionable. Reviewers should list each observation on a separate line, avoiding any introductory summaries, complimentary remarks, or redundant descriptions of the changes made. Each entry must follow the pattern: `file_path:line_number severity_level: concise_problem_and_solution_statement`. The severity categories are strictly defined as `blocker`, `major`, or `nit`. When ordering these findings, prioritize critical issues first, followed by significant concerns, and finally minor suggestions. This approach ensures that the most important feedback is seen first and that the entire review process remains rapid and focused on substantive improvements rather than verbose commentary.
