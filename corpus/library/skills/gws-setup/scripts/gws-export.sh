#!/usr/bin/env bash
# gws-export.sh — Export gws credentials for headless/CI environments
#
# Exports authenticated gws credentials from the host and saves a portable,
# plaintext credentials file to secrets/.gws/ in the selected stash for use in
# containers or CI pipelines.
#
# Usage:
#   ./scripts/gws-export.sh [--bundle-dir PATH]
#
# Prerequisites:
#   - gws CLI installed and authenticated (run 'gws auth login' first)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_bundle-dir.sh"

BUNDLE_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle-dir)
      [[ -n "${2:-}" ]] || { echo "ERROR: --bundle-dir requires a path" >&2; exit 2; }
      BUNDLE_DIR="$2"; shift 2 ;;
    --op-home)
      [[ -n "${2:-}" ]] || { echo "ERROR: --op-home requires a path" >&2; exit 2; }
      echo "NOTE: --op-home is deprecated; use --bundle-dir $2/knowledge" >&2
      BUNDLE_DIR="$2/knowledge"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--bundle-dir PATH]"
      echo ""
      echo "Exports gws CLI credentials to secrets/.gws/ in your stash for Docker/CI use."
      echo "Stash: --bundle-dir, else \$AKM_BUNDLE_DIR, else the default akm bundle."
      echo "Run 'gws auth login' on the host first."
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

BUNDLE_DIR="$(resolve_bundle_dir "$BUNDLE_DIR")"
GWS_DIR="${BUNDLE_DIR}/secrets/.gws"

# GWS_RESOLVE_ONLY=1 prints the credentials directory and exits (no gws calls).
if [[ "${GWS_RESOLVE_ONLY:-}" == 1 ]]; then echo "$GWS_DIR"; exit 0; fi

if ! command -v gws &>/dev/null; then
  echo "ERROR: gws CLI not found."
  exit 1
fi

mkdir -p "${GWS_DIR}"
chmod 700 "${GWS_DIR}"

echo "Exporting gws credentials..."
GWS_EXPORT_TMP="$(mktemp "${GWS_DIR}/credentials.json.tmp.XXXXXX")"
trap 'rm -f "$GWS_EXPORT_TMP"' EXIT
gws auth export --unmasked > "$GWS_EXPORT_TMP"
chmod 600 "$GWS_EXPORT_TMP"
mv "$GWS_EXPORT_TMP" "${GWS_DIR}/credentials.json"
trap - EXIT

echo "Credentials exported to: ${GWS_DIR}/credentials.json"

echo ""
echo "Verify: GOOGLE_WORKSPACE_CLI_CONFIG_DIR=${GWS_DIR} gws drive files list --params '{\"pageSize\": 1}'"
echo ""
echo "If the target is a container, recreate its service so updated environment"
echo "configuration is loaded; a simple container restart does not re-read env_file values."
