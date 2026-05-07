# Wrapper-First Operator Transition Plan

## Goal

Make the wrapper command surface the primary operator UX for `akm-eval`, while keeping truthful blocker messaging and demoting the guided setup helper to a legacy path.

## Scope

- [x] Prefer the existing wrapper binaries and package scripts as the operator entrypoint.
- [x] Update README, operator docs, and pack docs to start from wrapper-first commands.
- [x] Demote guided setup to `setup:legacy` instead of presenting it as the default path.
- [x] Rename the generated starter config and output path so setup artifacts are explicitly legacy.
- [x] Preserve explicit blocker messaging for external prerequisites.
- [x] Run targeted verification for wrapper commands and legacy setup config generation.

## Notes

- `setup` remains available through `bun run setup:legacy` and `bun bin/setup`, but operator-facing docs should treat committed example configs plus direct wrapper commands as the default path.
- This transition changes the user-facing workflow only. It does not claim any external dependency or blocked benchmark path is newly solved.
