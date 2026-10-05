#!/usr/bin/env bash
# oc-log-analyzer.sh — Parse and summarize OpenCode log files
# Extracts errors, warnings, session events, MCP issues, and provider failures.
#
# Usage:
#   ./oc-log-analyzer.sh                    # Analyze the most recent log
#   ./oc-log-analyzer.sh <logfile>          # Analyze a specific log
#   ./oc-log-analyzer.sh --today            # Analyze all logs from today
#   ./oc-log-analyzer.sh --all              # Analyze all available logs
#   ./oc-log-analyzer.sh --errors-only      # Only show errors and panics

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

LOG_DIR="${HOME}/.local/share/opencode/log"
ERRORS_ONLY=false
TARGET_FILES=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --today)
      TODAY=$(date +%Y-%m-%d)
      for f in "${LOG_DIR}"/*.log; do
        [[ -f "$f" ]] && [[ "$(basename "$f")" == "${TODAY}"* ]] && TARGET_FILES+=("$f")
      done
      shift
      ;;
    --all)
      for f in "${LOG_DIR}"/*.log; do
        [[ -f "$f" ]] && TARGET_FILES+=("$f")
      done
      shift
      ;;
    --errors-only)
      ERRORS_ONLY=true
      shift
      ;;
    *)
      if [[ -f "$1" ]]; then
        TARGET_FILES+=("$1")
      else
        echo "File not found: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

# Default: most recent log
if [[ ${#TARGET_FILES[@]} -eq 0 ]]; then
  LATEST=$(ls -t "${LOG_DIR}"/*.log 2>/dev/null | head -1)
  if [[ -n "$LATEST" ]]; then
    TARGET_FILES+=("$LATEST")
  else
    echo "No log files found in ${LOG_DIR}" >&2
    exit 1
  fi
fi

redact_keys() {
  sed -E \
    -e 's/(sk-ant-[a-zA-Z0-9_-]{4})[a-zA-Z0-9_-]+/\1***/g' \
    -e 's/(sk-[a-zA-Z0-9]{4})[a-zA-Z0-9]+/\1***/g' \
    -e 's/(Bearer )[a-zA-Z0-9_.-]+/\1***/g'
}

for LOG_FILE in "${TARGET_FILES[@]}"; do
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  Analyzing: $(basename "$LOG_FILE")${NC}"
  echo -e "${BOLD}${CYAN}  Size: $(du -h "$LOG_FILE" | cut -f1) | Lines: $(wc -l < "$LOG_FILE")${NC}"
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
  echo ""

  # ─── Severity counts ────────────────────────────────────────────────
  ERROR_COUNT=$(grep -ci "error" "$LOG_FILE" 2>/dev/null || echo "0")
  WARN_COUNT=$(grep -ci "warn" "$LOG_FILE" 2>/dev/null || echo "0")
  PANIC_COUNT=$(grep -ci "panic\|fatal" "$LOG_FILE" 2>/dev/null || echo "0")
  DEBUG_COUNT=$(grep -ci "debug" "$LOG_FILE" 2>/dev/null || echo "0")
  INFO_COUNT=$(grep -ci "info" "$LOG_FILE" 2>/dev/null || echo "0")

  echo -e "  ${BOLD}Severity Summary:${NC}"
  [[ $PANIC_COUNT -gt 0 ]] && echo -e "    ${RED}PANIC/FATAL: ${PANIC_COUNT}${NC}" || echo "    PANIC/FATAL: 0"
  [[ $ERROR_COUNT -gt 0 ]] && echo -e "    ${RED}ERROR: ${ERROR_COUNT}${NC}" || echo "    ERROR: 0"
  [[ $WARN_COUNT -gt 0 ]] && echo -e "    ${YELLOW}WARN: ${WARN_COUNT}${NC}" || echo "    WARN: 0"
  echo "    INFO: ${INFO_COUNT}"
  echo "    DEBUG: ${DEBUG_COUNT}"
  echo ""

  # ─── Panics (always show) ───────────────────────────────────────────
  if [[ $PANIC_COUNT -gt 0 ]]; then
    echo -e "  ${RED}${BOLD}╔═ PANICS / FATALS ═══════════════════════════════╗${NC}"
    grep -in "panic\|fatal" "$LOG_FILE" 2>/dev/null | head -20 | redact_keys | sed 's/^/  ║ /'
    echo -e "  ${RED}${BOLD}╚═══════════════════════════════════════════════════╝${NC}"
    echo ""
  fi

  # ─── Errors ─────────────────────────────────────────────────────────
  if [[ $ERROR_COUNT -gt 0 ]]; then
    echo -e "  ${RED}${BOLD}── Errors (last 20) ──${NC}"
    grep -in "error" "$LOG_FILE" 2>/dev/null | tail -20 | redact_keys | sed 's/^/    /'
    echo ""

    # Categorize errors
    echo -e "  ${BOLD}Error Categories:${NC}"

    PROV_ERRORS=$(grep -ci "provider\|api.*call\|apikey\|ProviderInit\|ProviderModel" "$LOG_FILE" 2>/dev/null || echo "0")
    MCP_ERRORS=$(grep -ci "mcp.*error\|mcp.*fail\|mcp.*timeout" "$LOG_FILE" 2>/dev/null || echo "0")
    PLUGIN_ERRORS=$(grep -ci "plugin.*error\|plugin.*fail\|hook.*error" "$LOG_FILE" 2>/dev/null || echo "0")
    SESSION_ERRORS=$(grep -ci "session.*error\|session.*fail\|context.*overflow" "$LOG_FILE" 2>/dev/null || echo "0")
    NET_ERRORS=$(grep -ci "connection.*refused\|timeout\|ECONNREFUSED\|ETIMEDOUT\|dns" "$LOG_FILE" 2>/dev/null || echo "0")
    AUTH_ERRORS=$(grep -ci "401\|403\|unauthorized\|forbidden\|auth.*error\|token.*expired" "$LOG_FILE" 2>/dev/null || echo "0")

    [[ $PROV_ERRORS -gt 0 ]]    && echo -e "    ${RED}Provider errors: ${PROV_ERRORS}${NC}"
    [[ $MCP_ERRORS -gt 0 ]]     && echo -e "    ${RED}MCP errors: ${MCP_ERRORS}${NC}"
    [[ $PLUGIN_ERRORS -gt 0 ]]  && echo -e "    ${RED}Plugin errors: ${PLUGIN_ERRORS}${NC}"
    [[ $SESSION_ERRORS -gt 0 ]] && echo -e "    ${RED}Session errors: ${SESSION_ERRORS}${NC}"
    [[ $NET_ERRORS -gt 0 ]]     && echo -e "    ${RED}Network errors: ${NET_ERRORS}${NC}"
    [[ $AUTH_ERRORS -gt 0 ]]    && echo -e "    ${RED}Auth errors: ${AUTH_ERRORS}${NC}"
    echo ""
  fi

  if $ERRORS_ONLY; then
    continue
  fi

  # ─── Warnings ───────────────────────────────────────────────────────
  if [[ $WARN_COUNT -gt 0 ]]; then
    echo -e "  ${YELLOW}${BOLD}── Warnings (last 10) ──${NC}"
    grep -in "warn" "$LOG_FILE" 2>/dev/null | tail -10 | redact_keys | sed 's/^/    /'
    echo ""
  fi

  # ─── Session Events ─────────────────────────────────────────────────
  SESSION_EVENTS=$(grep -ciE "session\.(created|idle|error|compacted|deleted)" "$LOG_FILE" 2>/dev/null || echo "0")
  if [[ $SESSION_EVENTS -gt 0 ]]; then
    echo -e "  ${MAGENTA}${BOLD}── Session Events ──${NC}"
    CREATED=$(grep -ci "session.*created\|session\.created" "$LOG_FILE" 2>/dev/null || echo "0")
    IDLE=$(grep -ci "session.*idle\|session\.idle" "$LOG_FILE" 2>/dev/null || echo "0")
    COMPACTED=$(grep -ci "session.*compacted\|session\.compacted" "$LOG_FILE" 2>/dev/null || echo "0")
    S_ERRORS=$(grep -ci "session.*error\|session\.error" "$LOG_FILE" 2>/dev/null || echo "0")
    echo "    Created: ${CREATED}  Completed: ${IDLE}  Compacted: ${COMPACTED}  Errors: ${S_ERRORS}"
    echo ""
  fi

  # ─── MCP Activity ───────────────────────────────────────────────────
  MCP_LINES=$(grep -ci "mcp" "$LOG_FILE" 2>/dev/null || echo "0")
  if [[ $MCP_LINES -gt 0 ]]; then
    echo -e "  ${MAGENTA}${BOLD}── MCP Activity (${MCP_LINES} entries) ──${NC}"
    grep -in "mcp" "$LOG_FILE" 2>/dev/null | tail -10 | redact_keys | sed 's/^/    /'
    echo ""
  fi

  # ─── Unique Error Messages ──────────────────────────────────────────
  if [[ $ERROR_COUNT -gt 5 ]]; then
    echo -e "  ${BOLD}── Unique Error Patterns ──${NC}"
    grep -i "error" "$LOG_FILE" 2>/dev/null \
      | sed -E 's/[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}[^ ]*/TIMESTAMP/g' \
      | sed -E 's/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/UUID/g' \
      | sort | uniq -c | sort -rn | head -10 \
      | redact_keys | sed 's/^/    /'
    echo ""
  fi

done

echo -e "${BOLD}Analysis complete.${NC}"
echo "For live debugging: opencode --log-level DEBUG --print-logs"
