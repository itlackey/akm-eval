#!/usr/bin/env bash
# oc-healthcheck.sh — Quick pass/fail health check for OpenCode
# Returns exit code 0 if all checks pass, 1 if any fail.
#
# Usage:
#   ./oc-healthcheck.sh           # Run all checks
#   ./oc-healthcheck.sh --quiet   # Only show failures

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
BOLD='\033[1m'

QUIET=false
[[ "${1:-}" == "--quiet" || "${1:-}" == "-q" ]] && QUIET=true

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

DATA_DIR="${HOME}/.local/share/opencode"
CONFIG_DIR="${HOME}/.config/opencode"
CACHE_DIR="${HOME}/.cache/opencode"

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  $QUIET || echo -e "  ${GREEN}PASS${NC}  $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo -e "  ${RED}FAIL${NC}  $1"
  [[ -n "${2:-}" ]] && echo -e "        ${YELLOW}Fix: $2${NC}"
}

warn_check() {
  WARN_COUNT=$((WARN_COUNT + 1))
  $QUIET || echo -e "  ${YELLOW}WARN${NC}  $1"
}

echo -e "${BOLD}OpenCode Health Check${NC}"
echo "──────────────────────────────────────"

# ─── Binary ────────────────────────────────────────────────────────────
if command -v opencode &>/dev/null; then
  pass "opencode binary found: $(which opencode)"
else
  fail "opencode not found in PATH" "curl -fsSL https://opencode.ai/install | bash"
fi

# ─── Data directory ────────────────────────────────────────────────────
if [[ -d "$DATA_DIR" ]]; then
  pass "Data directory exists: ${DATA_DIR}"
else
  fail "Data directory missing: ${DATA_DIR}" "Run opencode once to initialize"
fi

# ─── Auth ──────────────────────────────────────────────────────────────
AUTH_FILE="${DATA_DIR}/auth.json"
if [[ -f "$AUTH_FILE" ]]; then
  if python3 -c "import json; json.load(open('$AUTH_FILE'))" 2>/dev/null; then
    pass "auth.json exists and is valid JSON"
  else
    fail "auth.json exists but is corrupt" "rm ${AUTH_FILE} && opencode auth login"
  fi
else
  # Check if env vars provide auth instead
  if [[ -n "${ANTHROPIC_API_KEY:-}" || -n "${OPENAI_API_KEY:-}" || -n "${GOOGLE_API_KEY:-}" ]]; then
    pass "No auth.json but provider API key(s) found in environment"
  else
    fail "No authentication configured" "opencode auth login"
  fi
fi

# ─── Config validity ──────────────────────────────────────────────────
GLOBAL_CFG=""
for ext in json jsonc; do
  if [[ -f "${CONFIG_DIR}/opencode.${ext}" ]]; then
    GLOBAL_CFG="${CONFIG_DIR}/opencode.${ext}"
    break
  fi
done

if [[ -n "$GLOBAL_CFG" ]]; then
  if [[ "$GLOBAL_CFG" == *.json ]]; then
    if python3 -c "import json; json.load(open('$GLOBAL_CFG'))" 2>/dev/null; then
      pass "Global config is valid JSON: ${GLOBAL_CFG}"
    else
      fail "Global config has invalid JSON: ${GLOBAL_CFG}" "Validate with: cat ${GLOBAL_CFG} | python3 -m json.tool"
    fi
  else
    pass "Global config found (JSONC): ${GLOBAL_CFG}"
  fi
else
  pass "No global config (using defaults)"
fi

# Project config
if [[ -f "./opencode.json" ]]; then
  if python3 -c "import json; json.load(open('./opencode.json'))" 2>/dev/null; then
    pass "Project config is valid JSON"
  else
    fail "Project config has invalid JSON: ./opencode.json" "Validate with: cat opencode.json | python3 -m json.tool"
  fi
fi

# ─── Log directory ─────────────────────────────────────────────────────
if [[ -d "${DATA_DIR}/log" ]]; then
  LOG_COUNT=$(ls "${DATA_DIR}/log/"*.log 2>/dev/null | wc -l)
  if [[ $LOG_COUNT -gt 0 ]]; then
    pass "Log directory has ${LOG_COUNT} log files"
    # Check latest log for panics
    LATEST=$(ls -t "${DATA_DIR}/log/"*.log 2>/dev/null | head -1)
    PANIC_COUNT=$(grep -ci "panic\|fatal" "$LATEST" 2>/dev/null || echo "0")
    if [[ $PANIC_COUNT -gt 0 ]]; then
      fail "Latest log contains ${PANIC_COUNT} panic/fatal entries" "Run: grep -i 'panic\|fatal' ${LATEST}"
    else
      pass "Latest log has no panics"
    fi
  else
    warn_check "Log directory exists but is empty"
  fi
else
  warn_check "Log directory not found (opencode may not have run yet)"
fi

# ─── Cache ─────────────────────────────────────────────────────────────
if [[ -d "$CACHE_DIR" ]]; then
  CACHE_SIZE=$(du -sm "$CACHE_DIR" 2>/dev/null | cut -f1)
  if [[ $CACHE_SIZE -gt 500 ]]; then
    warn_check "Cache is ${CACHE_SIZE}MB (consider clearing: rm -rf ${CACHE_DIR})"
  else
    pass "Cache size: ${CACHE_SIZE}MB"
  fi
fi

# ─── Plugins ───────────────────────────────────────────────────────────
PLUGIN_DIRS=(
  "${CONFIG_DIR}/plugins"
  ".opencode/plugins"
)
for pdir in "${PLUGIN_DIRS[@]}"; do
  if [[ -d "$pdir" ]]; then
    PCOUNT=$(ls "$pdir"/*.ts "$pdir"/*.js 2>/dev/null | wc -l)
    if [[ $PCOUNT -gt 0 ]]; then
      pass "Plugins found in ${pdir}: ${PCOUNT} files"
    fi
  fi
done

# ─── Port conflicts ───────────────────────────────────────────────────
if [[ -n "${OPENCODE_PORT:-}" ]]; then
  if lsof -i ":${OPENCODE_PORT}" &>/dev/null 2>&1 || ss -tlnp 2>/dev/null | grep -q ":${OPENCODE_PORT}"; then
    warn_check "OPENCODE_PORT=${OPENCODE_PORT} is set and port is in use"
  else
    pass "OPENCODE_PORT=${OPENCODE_PORT} is set and available"
  fi
fi

# ─── Network (quick check) ────────────────────────────────────────────
if curl -s --max-time 3 -o /dev/null "https://opencode.ai" 2>/dev/null; then
  pass "Network: opencode.ai reachable"
else
  fail "Network: cannot reach opencode.ai" "Check internet connection and firewall"
fi

# ─── Running processes ─────────────────────────────────────────────────
OC_PROCS=$(pgrep -c -f "opencode" 2>/dev/null || echo "0")
if [[ $OC_PROCS -gt 0 ]]; then
  pass "OpenCode processes running: ${OC_PROCS}"
else
  pass "No stale OpenCode processes"
fi

# ─── Linux-specific ───────────────────────────────────────────────────
if [[ "$(uname -s)" == "Linux" ]]; then
  HAS_CLIPBOARD=false
  for tool in xclip xsel wl-copy; do
    command -v "$tool" &>/dev/null && HAS_CLIPBOARD=true && break
  done
  if $HAS_CLIPBOARD; then
    pass "Clipboard utility available"
  else
    warn_check "No clipboard utility (install xclip, xsel, or wl-clipboard)"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  ${GREEN}${PASS_COUNT} passed${NC}  ${RED}${FAIL_COUNT} failed${NC}  ${YELLOW}${WARN_COUNT} warnings${NC}  (${TOTAL} total)"

if [[ $FAIL_COUNT -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✓ OpenCode environment looks healthy${NC}"
  exit 0
else
  echo -e "  ${RED}${BOLD}✗ ${FAIL_COUNT} issue(s) need attention${NC}"
  exit 1
fi
