---
description: "Turning on the French translation broke 18 end-to-end tests that found buttons by their English text."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-09
---
When the French translation was switched on for the test environment, 18
end-to-end tests failed at once, because they found buttons by their English
text: Save had become Enregistrer. Moving those selectors to the `data-testid`
attributes the components already had made them pass in both languages. The
tests that check the wording itself still read the text, on purpose.
