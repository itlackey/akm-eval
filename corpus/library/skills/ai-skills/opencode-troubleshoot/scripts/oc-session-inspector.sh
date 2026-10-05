#!/usr/bin/env bash
# oc-session-inspector.sh — Inspect OpenCode session history and storage
# Shows session metadata, sizes, and optionally exports sessions for analysis.
#
# Usage:
#   ./oc-session-inspector.sh                  # Overview of all projects/sessions
#   ./oc-session-inspector.sh --project <slug> # Inspect a specific project
#   ./oc-session-inspector.sh --export <id>    # Export a session as JSON
#   ./oc-session-inspector.sh --stats          # Show token/cost stats
#   ./oc-session-inspector.sh --cleanup        # Show cleanup recommendations

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

DATA_DIR="${HOME}/.local/share/opencode"
PROJECT_DIR="${DATA_DIR}/project"

MODE="overview"
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      MODE="project"
      TARGET="${2:-}"
      shift 2
      ;;
    --export)
      MODE="export"
      TARGET="${2:-}"
      shift 2
      ;;
    --stats)
      MODE="stats"
      shift
      ;;
    --cleanup)
      MODE="cleanup"
      shift
      ;;
    -h|--help)
      echo "Usage: oc-session-inspector.sh [options]"
      echo ""
      echo "Options:"
      echo "  --project <slug>   Inspect a specific project"
      echo "  --export <id>      Export a session via opencode CLI"
      echo "  --stats            Show token/cost statistics"
      echo "  --cleanup          Show cleanup recommendations"
      echo "  -h, --help         Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

section() {
  echo ""
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
}

# ─── Overview Mode ─────────────────────────────────────────────────────
if [[ "$MODE" == "overview" ]]; then
  section "OpenCode Session Overview"

  if [[ ! -d "$PROJECT_DIR" ]]; then
    echo ""
    echo "  No project data found at ${PROJECT_DIR}"
    echo "  OpenCode may not have been used yet, or data was cleared."
    exit 0
  fi

  echo ""
  TOTAL_SIZE=0
  PROJECT_COUNT=0
  echo -e "  ${BOLD}Projects:${NC}"
  echo ""
  printf "  %-30s %-12s %-15s %s\n" "PROJECT" "SIZE" "LAST MODIFIED" "PATH"
  printf "  %-30s %-12s %-15s %s\n" "───────" "────" "─────────────" "────"

  for proj_dir in "${PROJECT_DIR}"/*/; do
    [[ ! -d "$proj_dir" ]] && continue
    PROJECT_COUNT=$((PROJECT_COUNT + 1))
    PROJ_NAME=$(basename "$proj_dir")
    PROJ_SIZE=$(du -sh "$proj_dir" 2>/dev/null | cut -f1)
    PROJ_SIZE_BYTES=$(du -sb "$proj_dir" 2>/dev/null | cut -f1 || echo "0")
    TOTAL_SIZE=$((TOTAL_SIZE + PROJ_SIZE_BYTES))

    # Get last modified time
    LAST_MOD=$(find "$proj_dir" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
    if [[ -n "$LAST_MOD" ]]; then
      LAST_MOD_FMT=$(date -d "@${LAST_MOD%%.*}" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "unknown")
    else
      LAST_MOD_FMT="unknown"
    fi

    printf "  %-30s %-12s %-15s %s\n" "$PROJ_NAME" "$PROJ_SIZE" "$LAST_MOD_FMT" "$proj_dir"
  done

  TOTAL_SIZE_H=$(echo "$TOTAL_SIZE" | awk '{printf "%.1f MB", $1/1048576}')
  echo ""
  echo -e "  ${BOLD}Total:${NC} ${PROJECT_COUNT} projects, ${TOTAL_SIZE_H}"

  # Session list via CLI if available
  if command -v opencode &>/dev/null; then
    echo ""
    echo -e "  ${BOLD}Recent Sessions (via CLI):${NC}"
    opencode session list --max-count 10 2>/dev/null | sed 's/^/    /' || echo "    (unable to list sessions via CLI)"
  fi
fi

# ─── Project Mode ─────────────────────────────────────────────────────
if [[ "$MODE" == "project" ]]; then
  if [[ -z "$TARGET" ]]; then
    echo "Usage: --project <slug>" >&2
    echo "Available projects:"
    ls "${PROJECT_DIR}/" 2>/dev/null | sed 's/^/  /'
    exit 1
  fi

  PROJ_PATH="${PROJECT_DIR}/${TARGET}"
  if [[ ! -d "$PROJ_PATH" ]]; then
    echo "Project not found: ${TARGET}" >&2
    echo "Available projects:"
    ls "${PROJECT_DIR}/" 2>/dev/null | sed 's/^/  /'
    exit 1
  fi

  section "Project: ${TARGET}"
  echo ""
  echo -e "  ${BOLD}Path:${NC} ${PROJ_PATH}"
  echo -e "  ${BOLD}Size:${NC} $(du -sh "$PROJ_PATH" 2>/dev/null | cut -f1)"
  echo ""

  echo -e "  ${BOLD}Directory structure:${NC}"
  find "$PROJ_PATH" -maxdepth 3 -type f 2>/dev/null | head -50 | sed "s|$PROJ_PATH/||" | sed 's/^/    /'

  echo ""
  echo -e "  ${BOLD}Storage contents:${NC}"
  STORAGE="${PROJ_PATH}/storage"
  if [[ -d "$STORAGE" ]]; then
    echo "    Files: $(find "$STORAGE" -type f 2>/dev/null | wc -l)"
    echo "    Size:  $(du -sh "$STORAGE" 2>/dev/null | cut -f1)"

    # Look for SQLite databases
    for db in "$STORAGE"/*.db "$STORAGE"/*.sqlite*; do
      if [[ -f "$db" ]]; then
        echo ""
        echo -e "    ${BOLD}Database: $(basename "$db")${NC}"
        echo "    Size: $(du -h "$db" | cut -f1)"
        if command -v sqlite3 &>/dev/null; then
          echo "    Tables:"
          sqlite3 "$db" ".tables" 2>/dev/null | sed 's/^/      /'
          echo "    Row counts:"
          for table in $(sqlite3 "$db" ".tables" 2>/dev/null); do
            COUNT=$(sqlite3 "$db" "SELECT COUNT(*) FROM \"$table\";" 2>/dev/null || echo "?")
            echo "      ${table}: ${COUNT} rows"
          done
        else
          echo "    (install sqlite3 for deeper inspection)"
        fi
      fi
    done
  else
    echo "    No storage directory found"
  fi
fi

# ─── Export Mode ───────────────────────────────────────────────────────
if [[ "$MODE" == "export" ]]; then
  if [[ -z "$TARGET" ]]; then
    echo "Usage: --export <session-id>" >&2
    echo "List sessions with: opencode session list"
    exit 1
  fi

  if ! command -v opencode &>/dev/null; then
    echo "opencode CLI not found in PATH" >&2
    exit 1
  fi

  EXPORT_FILE="session-${TARGET}-$(date +%Y%m%d-%H%M%S).json"
  echo "Exporting session ${TARGET} to ${EXPORT_FILE}..."
  opencode export "$TARGET" > "$EXPORT_FILE" 2>/dev/null

  if [[ -s "$EXPORT_FILE" ]]; then
    echo -e "${GREEN}Exported:${NC} ${EXPORT_FILE} ($(du -h "$EXPORT_FILE" | cut -f1))"

    if command -v jq &>/dev/null; then
      echo ""
      echo "Session summary:"
      jq '{
        id: .id,
        title: .title,
        createdAt: .createdAt,
        updatedAt: .updatedAt,
        messageCount: (.messages | length),
        model: .model
      }' "$EXPORT_FILE" 2>/dev/null | sed 's/^/  /'
    fi
  else
    echo -e "${RED}Export failed or empty${NC}" >&2
    rm -f "$EXPORT_FILE"
    exit 1
  fi
fi

# ─── Stats Mode ────────────────────────────────────────────────────────
if [[ "$MODE" == "stats" ]]; then
  if ! command -v opencode &>/dev/null; then
    echo "opencode CLI not found in PATH" >&2
    exit 1
  fi

  section "Token Usage & Cost Statistics"
  echo ""

  echo -e "  ${BOLD}All-time stats:${NC}"
  opencode stats 2>/dev/null | sed 's/^/    /' || echo "    (unable to retrieve stats)"

  echo ""
  echo -e "  ${BOLD}Last 7 days:${NC}"
  opencode stats --days 7 2>/dev/null | sed 's/^/    /' || echo "    (unable to retrieve stats)"

  echo ""
  echo -e "  ${BOLD}Model breakdown:${NC}"
  opencode stats --models 10 2>/dev/null | sed 's/^/    /' || echo "    (unable to retrieve stats)"

  echo ""
  echo -e "  ${BOLD}Tool usage:${NC}"
  opencode stats --tools 10 2>/dev/null | sed 's/^/    /' || echo "    (unable to retrieve stats)"
fi

# ─── Cleanup Mode ──────────────────────────────────────────────────────
if [[ "$MODE" == "cleanup" ]]; then
  section "Cleanup Recommendations"
  echo ""

  # Data directory size
  if [[ -d "$DATA_DIR" ]]; then
    DATA_SIZE=$(du -sm "$DATA_DIR" 2>/dev/null | cut -f1)
    echo -e "  ${BOLD}Data directory:${NC} ${DATA_SIZE}MB (${DATA_DIR})"
    if [[ $DATA_SIZE -gt 1000 ]]; then
      echo -e "    ${YELLOW}→ Consider exporting and archiving old sessions${NC}"
    fi
  fi

  # Cache size
  CACHE_DIR="${HOME}/.cache/opencode"
  if [[ -d "$CACHE_DIR" ]]; then
    CACHE_SIZE=$(du -sm "$CACHE_DIR" 2>/dev/null | cut -f1)
    echo -e "  ${BOLD}Cache:${NC} ${CACHE_SIZE}MB (${CACHE_DIR})"
    if [[ $CACHE_SIZE -gt 200 ]]; then
      echo -e "    ${YELLOW}→ Safe to clear: rm -rf ${CACHE_DIR}${NC}"
    fi
  fi

  # Log size
  if [[ -d "${DATA_DIR}/log" ]]; then
    LOG_SIZE=$(du -sm "${DATA_DIR}/log" 2>/dev/null | cut -f1)
    LOG_COUNT=$(ls "${DATA_DIR}/log/"*.log 2>/dev/null | wc -l)
    echo -e "  ${BOLD}Logs:${NC} ${LOG_SIZE}MB (${LOG_COUNT} files)"
    echo "    Note: OpenCode auto-retains only the 10 most recent log files"
  fi

  # Per-project sizes
  echo ""
  echo -e "  ${BOLD}Projects by size:${NC}"
  if [[ -d "$PROJECT_DIR" ]]; then
    du -sm "${PROJECT_DIR}"/*/ 2>/dev/null | sort -rn | head -10 | while read -r size dir; do
      NAME=$(basename "$dir")
      if [[ $size -gt 100 ]]; then
        echo -e "    ${YELLOW}${size}MB${NC}  ${NAME}"
      else
        echo "    ${size}MB  ${NAME}"
      fi
    done
  fi

  echo ""
  echo -e "  ${BOLD}Cleanup commands:${NC}"
  echo "    rm -rf ~/.cache/opencode              # Clear cache (safe, rebuilds automatically)"
  echo "    opencode uninstall --keep-config       # Remove data, keep config"
  echo "    opencode uninstall --dry-run           # Preview what would be removed"
fi

echo ""
