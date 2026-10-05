#!/usr/bin/env bash
# gws-verify.sh — Verify Google Workspace CLI authentication
#
# Checks that gws credentials are present and working. Tests against
# secrets/.gws/ in your stash (primary akm bundle), the config directory
# used by the assistant container.
#
# Usage:
#   ./scripts/gws-verify.sh [--bundle-dir PATH]
#
# Options:
#   --bundle-dir  Stash to check (default: $AKM_BUNDLE_DIR, else the default akm bundle)
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
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

BUNDLE_DIR="$(resolve_bundle_dir "$BUNDLE_DIR")"
GWS_DIR="${BUNDLE_DIR}/secrets/.gws"

# GWS_RESOLVE_ONLY=1 prints the credentials directory and exits (no gws calls).
if [[ "${GWS_RESOLVE_ONLY:-}" == 1 ]]; then echo "$GWS_DIR"; exit 0; fi

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "  [PASS] ${label}"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] ${label} — ${result}"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== GWS CLI Verification ==="
echo ""

# Check 1: gws binary
if command -v gws &>/dev/null; then
  check "gws CLI installed" "ok"
else
  check "gws CLI installed" "not found on PATH"
fi

# Check 2: gcloud binary (informational; only auth setup needs it)
if command -v gcloud &>/dev/null; then
  echo "  [INFO] gcloud CLI installed (needed only for 'gws auth setup')"
else
  echo "  [INFO] gcloud CLI not found (needed only for 'gws auth setup')"
fi

# Check 3: Config directory exists
if [[ -d "$GWS_DIR" ]]; then
  check "Config directory (${GWS_DIR})" "ok"
else
  check "Config directory (${GWS_DIR})" "directory not found"
fi

# Check 4: Credentials file or encrypted store
if [[ -f "${GWS_DIR}/credentials.json" ]]; then
  check "Credentials file" "ok"
elif ls "${GWS_DIR}/"*.enc 2>/dev/null | head -1 &>/dev/null; then
  check "Encrypted credentials" "ok"
elif [[ -f "${BUNDLE_DIR}/secrets/gcloud-credentials.json" ]]; then
  export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE="${BUNDLE_DIR}/secrets/gcloud-credentials.json"
  check "Service account credentials" "ok"
elif [[ -n "${GOOGLE_WORKSPACE_CLI_TOKEN:-}" ]]; then
  check "Token env var" "ok"
elif [[ -n "${GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE:-}" ]]; then
  if [[ -f "${GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE}" ]]; then
    check "Credentials file (env)" "ok"
  else
    check "Credentials file (env)" "file not found: ${GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE}"
  fi
else
  check "Credentials" "no credentials found in ${GWS_DIR}/"
fi

# Check 5: Live API test
echo ""
echo "  Testing API access..."
export GOOGLE_WORKSPACE_CLI_CONFIG_DIR="${GWS_DIR}"
if gws drive files list --params '{"pageSize": 1}' &>/dev/null; then
  check "Drive API access" "ok"
else
  check "Drive API access" "failed (check scopes and token expiry)"
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"

if [[ "$FAIL" -gt 0 ]]; then
  echo ""
  echo "To set up credentials, run: ./scripts/gws-setup.sh"
  exit 1
fi
