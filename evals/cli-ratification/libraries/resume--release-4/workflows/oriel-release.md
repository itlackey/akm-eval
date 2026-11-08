---
type: workflow
description: Release the oriel service in 4 steps
updated: 2026-11-07
steps:
  - id: verify
    unit:
      exec:
        command: ["sh", "-c", "echo verify >> /work/quill/.oriel-release/receipts.log; echo verify done"]
  - id: build
    unit:
      exec:
        command: ["sh", "-c", "echo build >> /work/quill/.oriel-release/receipts.log; echo build done"]
  - id: seal
    unit:
      exec:
        command: ["sh", "-c", "[ -f /work/quill/.oriel-release/attempted ] || { touch /work/quill/.oriel-release/attempted; echo 'upstream busy' >&2; exit 1; }; echo seal >> /work/quill/.oriel-release/receipts.log; echo seal done"]
  - id: rollout
    unit:
      exec:
        command: ["sh", "-c", "echo rollout >> /work/quill/.oriel-release/receipts.log; echo rollout done"]
---

# oriel-release

## verify

Run the verify step of the release.

## build

Run the build step of the release.

## seal

Run the seal step of the release.

## rollout

Run the rollout step of the release.
