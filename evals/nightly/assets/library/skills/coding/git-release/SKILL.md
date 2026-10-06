---
name: git-release
description: Semantic versioning and release workflow for creating and
  publishing package releases.
when_to_use: Use this skill when preparing a new software release and you need a
  consistent semantic versioning and changelog workflow.
updated: 2026-05-17
---

# Git Release

This skill documents a small, repeatable release workflow using semantic versioning (SemVer) and a changelog. It focuses on the schema and structure of the release process so teams can follow a consistent pattern.

## When To Use
Use this when you are about to publish a new release (library, CLI, service) and need to:
- Choose the next SemVer number.
- Update the changelog with a short summary of notable changes under the new version heading.
- Update the project's version metadata (`package.json`, `pyproject.toml`, `go.mod`, etc.) if applicable.
- Tag the release in git and push artifacts/tags.

## Versioning (SemVer)
- **MAJOR**: Incompatible API changes or breaking changes.
- **MINOR**: Backwards-compatible new features or enhancements.
- **PATCH**: Backwards-compatible bug fixes and small tweaks.

Tag format recommendation: `vMAJOR.MINOR.PATCH` (for example `v1.2.3`).

## Release Process (Structured Steps)
1. Determine the next version (MAJOR.MINOR.PATCH) based on merged changes and SemVer rules.
2. Update the changelog with a short summary of notable changes under the new version heading.
3. Update the project's version metadata (`package.json`, `pyproject.toml`, `go.mod`, etc.) if applicable.
4. Commit the version and changelog changes to the release branch.
5. Create a signed or annotated git tag using the chosen tag format.
6. Push commits and tags to the remote repository.
7. Publish artifacts (package registry, container registry, GitHub Release) according to your release pipeline.

## Minimal Command Examples
- Commit and tag (example):
  - `git add CHANGELOG.md package.json && git commit -m "chore(release): v1.2.0"`
  - `git tag -a v1.2.0 -m "Release v1.2.0"`
  - `git push origin main --follow-tags`

- Using npm for version bump (example):
  - `npm version patch -m "chore(release): %s"` (creates only a tag)
  - `git push origin --follow-tags`

Adjust these commands to match your language/tooling conventions.

## Changelog Guidance
- Put a short, human-readable entry for each noteworthy change under the new version heading.
- Use categories if helpful (e.g., Added, Changed, Fixed, Security).
- Prefer linkable references to PR numbers or issue IDs for traceability.

## Notes & Conventions
- Keep tag names consistent (recommended: leading `v`).
- Prefer annotated tags when you want release messages and signing: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
- Ensure CI/CD or release automation uses the same version source (tag or file) to avoid drift.

## Minimal Checklist
- [ ] Version chosen and validated
- [ ] CHANGELOG updated
- [ ] Version metadata updated (if needed)
- [ ] Commit created with release changes
- [ ] Tag created (annotated or signed)
- [ ] Commits and tags pushed
- [ ] Artifacts published
