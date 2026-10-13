---
description: "Run the tests on the oldest language version the project supports, so code that needs a newer one is caught before release."
when_to_use: "When setting up CI for a library that supports several language versions."
type: lesson
tags:
  - testing
  - ci
updated: 2026-07-02
---

Run the tests on the oldest version of the language the project supports.
Code that needs a newer version passes on a new interpreter and fails for some users.
