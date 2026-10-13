---
description: "A delegated fix reported all tests passing after running only the unit tests; make test-int then failed on 3 tests."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-24
---
The delegated fix to the CSV importer came back saying all tests passed. The
model had run `pytest tests/unit`, which it found on its own, and never the
integration suite, `make test-int`, which failed on 3 tests in CI. Naming `make
test-int` in the task as the command to run made the next attempt report the
same 3 failures and fix them.
