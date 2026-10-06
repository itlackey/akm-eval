---
description: Sort a batch of reported symptoms into priority tiers so the most time-critical cases are addressed first
---
Given a list of reported symptoms from multiple people, sort them into
priority tiers using a simple, general-education triage framework (not a
clinical protocol):

1. **Immediate** — signs of airway compromise, absent/agonal breathing,
   uncontrolled severe bleeding, altered consciousness, stroke symptoms.
2. **Urgent** — significant pain, moderate bleeding that is controlled,
   suspected fractures, persistent vomiting, high fever with lethargy.
3. **Delayed** — minor cuts/bruises, mild symptoms, stable vitals, able to
   walk and communicate normally.

For each case, output: the tier, a one-line reason citing the specific
reported symptom(s) that drove the classification, and whether emergency
services should be contacted. Do not attempt to diagnose a specific
condition — the goal is prioritization, not diagnosis.
