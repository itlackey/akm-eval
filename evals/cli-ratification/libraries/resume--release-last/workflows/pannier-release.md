---
type: workflow
description: Release the pannier service in 3 steps
updated: 2026-11-07
steps:
  - id: seal
    unit:
      exec:
        command: ["sh", "-c", "echo seal >> /work/orchid/.pannier-release/receipts.log; echo seal done"]
  - id: publish
    unit:
      exec:
        command: ["sh", "-c", "echo publish >> /work/orchid/.pannier-release/receipts.log; echo publish done"]
  - id: verify
    unit:
      exec:
        command: ["sh", "-c", "[ -f /work/orchid/.pannier-release/attempted ] || { touch /work/orchid/.pannier-release/attempted; echo 'upstream busy' >&2; exit 1; }; echo verify >> /work/orchid/.pannier-release/receipts.log; echo verify done"]
---

# pannier-release

## seal

Run the seal step of the release.

## publish

Run the publish step of the release.

## verify

Run the verify step of the release.
