---
description: "Test layout and golden file rules for this Go repo."
---

Write one `TestXxx` per function, with its cases in a slice and `t.Run` for each. Golden files are never edited by hand: the test file declares `flag.Bool("update", false, "rewrite the golden files in testdata")`, `go test -update` regenerates them, and `git diff` checks the result before a commit.
