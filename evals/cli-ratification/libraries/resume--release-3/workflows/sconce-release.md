---
type: workflow
description: Release the sconce service in 3 steps
updated: 2026-11-07
steps:
  - id: notify
    unit:
      exec:
        command: ["sh", "-c", "echo notify >> /work/orchid/.sconce-release/receipts.log; echo notify done"]
  - id: archive
    unit:
      exec:
        command: ["sh", "-c", "[ -f /work/orchid/.sconce-release/attempted ] || { touch /work/orchid/.sconce-release/attempted; echo 'upstream busy' >&2; exit 1; }; echo archive >> /work/orchid/.sconce-release/receipts.log; echo archive done"]
  - id: publish
    unit:
      exec:
        command: ["sh", "-c", "echo publish >> /work/orchid/.sconce-release/receipts.log; echo publish done"]
---

# sconce-release

## notify

Run the notify step of the release.

## archive

Run the archive step of the release.

## publish

Run the publish step of the release.
