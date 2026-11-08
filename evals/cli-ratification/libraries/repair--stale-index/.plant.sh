#!/bin/bash
# The note is filed straight into the bundle after the last index.
set -euo pipefail
cat > "$AKM_BUNDLE_DIR/memories/key-rotation-3cfd.md" <<'NOTE'
---
description: How often the wicket gateway rotates its keys
tags: [deployment]
project: orchid
---
The wicket gateway rotates its keys every 22 days.
NOTE
