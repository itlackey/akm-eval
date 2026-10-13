---
description: "A helper used str.removeprefix, which needs Python 3.9; users on 3.8 got AttributeError, and CI now tests 3.8."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-02
---
Release 2.7 of the Finchley client added a helper that calls
`str.removeprefix`, which only exists from Python 3.9. CI ran only on 3.12, so
the tests passed, and users on Python 3.8, the oldest version the package still
claims to support, got `AttributeError` on import. The CI matrix now includes
3.8, and 2.7.1 replaced the call with a slice.
