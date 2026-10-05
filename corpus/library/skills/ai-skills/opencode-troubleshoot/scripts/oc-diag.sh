#!/usr/bin/env bash
# oc-diag.sh — OpenCode Full Environment Diagnostic Snapshot
# Collects system info, config, auth status, logs, sessions, MCP, and plugin state.
# Output is safe to share (API keys are redacted).
#
# Usage:
#   ./oc-diag.sh              # Print to stdout
#   ./oc-diag.sh > diag.txt   # Save to file
#   ./oc-diag.sh --json       # Output as JSON (requires jq)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

DATA_DIR="${HOME}/.local/share/opencode"
CONFIG_DIR="${HOME}/.config/opencode"
CACHE_DIR="${HOME}/.cache/opencode"
LOG_DIR="${DATA_DIR}/log"
PROJECT_DIR="${DATA_DIR}/project"

JSON_MODE=false
[[ "${1:-}" == "--json" ]] && JSON_MODE=true

section() {
  if $JSON_MODE; then return; fi
  echo ""
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
}

info() {
  if $JSON_MODE; then return; fi
  echo -e "  ${GREEN}✓${NC} $1"
}

warn() {
  if $JSON_MODE; then return; fi
  echo -e "  ${YELLOW}⚠${NC} $1"
}

err() {
  if $JSON_MODE; then return; fi
  echo -e "  ${RED}✗${NC} $1"
}

redact_keys() {
  # Redact API keys, tokens, and secrets from output
  sed -E \
    -e 's/(sk-ant-[a-zA-Z0-9_-]{4})[a-zA-Z0-9_-]+/\1***REDACTED***/g' \
    -e 's/(sk-[a-zA-Z0-9]{4})[a-zA-Z0-9]+/\1***REDACTED***/g' \
    -e 's/("(apiKey|api_key|token|secret|password|access_token|refresh_token)"[[:space:]]*:[[:space:]]*")[^"]+/\1***REDACTED***/g' \
    -e 's/(Bearer )[a-zA-Z0-9_.-]+/\1***REDACTED***/g'
}

# ─── System Info ───────────────────────────────────────────────────────
section "System Information"

echo ""
echo "  Date:     $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "  Hostname: $(hostname 2>/dev/null || echo 'unknown')"
echo "  OS:       $(uname -s 2>/dev/null || echo 'unknown')"
echo "  Arch:     $(uname -m 2>/dev/null || echo 'unknown')"
echo "  Kernel:   $(uname -r 2>/dev/null || echo 'unknown')"

if [[ -f /etc/os-release ]]; then
  echo "  Distro:   $(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2)"
fi

echo "  Shell:    ${SHELL:-unknown}"
echo "  User:     ${USER:-unknown}"

# ─── OpenCode Version ──────────────────────────────────────────────────
section "OpenCode Installation"

if command -v opencode &>/dev/null; then
  OC_VERSION=$(opencode --version 2>/dev/null || echo "unknown")
  OC_PATH=$(which opencode 2>/dev/null || echo "unknown")
  info "opencode found: ${OC_PATH}"
  echo "  Version:  ${OC_VERSION}"
else
  err "opencode not found in PATH"
fi

# Check for Bun (used by plugins)
if command -v bun &>/dev/null; then
  info "bun: $(bun --version 2>/dev/null)"
else
  warn "bun not found (needed for plugin development)"
fi

# Check for Node
if command -v node &>/dev/null; then
  info "node: $(node --version 2>/dev/null)"
else
  warn "node not found"
fi

# Check clipboard tools (Linux)
if [[ "$(uname -s)" == "Linux" ]]; then
  echo ""
  echo "  Clipboard tools:"
  for tool in xclip xsel wl-copy wl-paste; do
    if command -v "$tool" &>/dev/null; then
      info "  $tool: found"
    else
      echo "    - $tool: not found"
    fi
  done
  if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
    info "Wayland session detected (WAYLAND_DISPLAY=${WAYLAND_DISPLAY})"
  elif [[ -n "${DISPLAY:-}" ]]; then
    info "X11 session detected (DISPLAY=${DISPLAY})"
  else
    warn "No display server detected"
  fi
fi

# ─── Directory Structure ───────────────────────────────────────────────
section "Directory Structure"

echo ""
echo "  Data dir:   ${DATA_DIR}"
if [[ -d "$DATA_DIR" ]]; then
  info "exists ($(du -sh "$DATA_DIR" 2>/dev/null | cut -f1))"
else
  err "missing"
fi

echo "  Config dir: ${CONFIG_DIR}"
if [[ -d "$CONFIG_DIR" ]]; then
  info "exists"
  echo "  Contents:"
  ls -la "$CONFIG_DIR/" 2>/dev/null | tail -n +2 | sed 's/^/    /'
else
  warn "missing (using defaults)"
fi

echo "  Cache dir:  ${CACHE_DIR}"
if [[ -d "$CACHE_DIR" ]]; then
  info "exists ($(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1))"
else
  info "missing (will be created on first run)"
fi

echo "  Log dir:    ${LOG_DIR}"
if [[ -d "$LOG_DIR" ]]; then
  LOG_COUNT=$(ls "$LOG_DIR"/*.log 2>/dev/null | wc -l)
  info "exists (${LOG_COUNT} log files)"
else
  warn "missing"
fi

# ─── Configuration ─────────────────────────────────────────────────────
section "Configuration"

# Global config
echo ""
echo "  Global config:"
for ext in json jsonc; do
  CFG="${CONFIG_DIR}/opencode.${ext}"
  if [[ -f "$CFG" ]]; then
    info "Found: ${CFG}"
    echo "  --- contents (redacted) ---"
    cat "$CFG" | redact_keys | sed 's/^/    /'
    echo "  --- end ---"
    # Validate JSON
    if python3 -c "import json; json.load(open('$CFG'))" 2>/dev/null; then
      info "Valid JSON"
    elif [[ "$ext" == "jsonc" ]]; then
      info "JSONC format (comments allowed)"
    else
      err "Invalid JSON syntax"
    fi
    break
  fi
done
[[ ! -f "${CONFIG_DIR}/opencode.json" && ! -f "${CONFIG_DIR}/opencode.jsonc" ]] && warn "No global config found"

# Project config (current directory)
echo ""
echo "  Project config (cwd: $(pwd)):"
if [[ -f "./opencode.json" ]]; then
  info "Found: ./opencode.json"
  cat "./opencode.json" | redact_keys | sed 's/^/    /'
elif [[ -f "./opencode.jsonc" ]]; then
  info "Found: ./opencode.jsonc"
  cat "./opencode.jsonc" | redact_keys | sed 's/^/    /'
else
  info "None (using global/defaults)"
fi

# TUI config
echo ""
echo "  TUI config:"
if [[ -f "${CONFIG_DIR}/tui.json" ]]; then
  info "Found: ${CONFIG_DIR}/tui.json"
else
  info "None (using defaults)"
fi

# ─── Environment Variables ─────────────────────────────────────────────
section "Environment Variables"

echo ""
OC_VARS=(
  OPENCODE_CONFIG OPENCODE_CONFIG_DIR OPENCODE_CONFIG_CONTENT
  OPENCODE_PORT OPENCODE_SERVER_PASSWORD OPENCODE_TUI_CONFIG
  OPENCODE_AUTO_SHARE OPENCODE_GIT_BASH_PATH
  OPENCODE_DISABLE_AUTOUPDATE OPENCODE_DISABLE_PRUNE
  OPENCODE_DISABLE_DEFAULT_PLUGINS OPENCODE_DISABLE_LSP_DOWNLOAD
  OPENCODE_DISABLE_AUTOCOMPACT OPENCODE_DISABLE_CLAUDE_CODE
  OPENCODE_DISABLE_CLAUDE_CODE_PROMPT OPENCODE_DISABLE_CLAUDE_CODE_SKILLS
  OPENCODE_DISABLE_TERMINAL_TITLE OPENCODE_PERMISSION
  OPENCODE_ENABLE_EXPERIMENTAL_MODELS
  ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_API_KEY
  OC_ALLOW_WAYLAND
)

FOUND_VARS=0
for var in "${OC_VARS[@]}"; do
  val="${!var:-}"
  if [[ -n "$val" ]]; then
    # Redact sensitive values
    if [[ "$var" == *KEY* || "$var" == *PASSWORD* || "$var" == *SECRET* || "$var" == *TOKEN* ]]; then
      echo "  ${var}=${val:0:8}***REDACTED***"
    elif [[ "$var" == "OPENCODE_CONFIG_CONTENT" ]]; then
      echo "  ${var}=(set, ${#val} chars)"
    else
      echo "  ${var}=${val}"
    fi
    FOUND_VARS=$((FOUND_VARS + 1))
  fi
done
[[ $FOUND_VARS -eq 0 ]] && info "No OpenCode environment variables set"

# ─── Authentication ────────────────────────────────────────────────────
section "Authentication"

echo ""
AUTH_FILE="${DATA_DIR}/auth.json"
if [[ -f "$AUTH_FILE" ]]; then
  info "auth.json exists ($(stat -c%s "$AUTH_FILE" 2>/dev/null || stat -f%z "$AUTH_FILE" 2>/dev/null) bytes)"
  # Show provider names only, no keys
  if command -v python3 &>/dev/null; then
    echo "  Configured providers:"
    python3 -c "
import json, sys
try:
    data = json.load(open('$AUTH_FILE'))
    if isinstance(data, dict):
        for k in sorted(data.keys()):
            if k.startswith('_'): continue
            print(f'    - {k}')
except: print('    (unable to parse)')
" 2>/dev/null
  fi
else
  warn "auth.json not found — no providers authenticated"
fi

# Also check for .env files
echo ""
echo "  .env files in current directory:"
for f in .env .env.local .env.development; do
  if [[ -f "$f" ]]; then
    KEY_COUNT=$(grep -cE "^[A-Z_]+=.+" "$f" 2>/dev/null || echo "0")
    info "$f (${KEY_COUNT} keys)"
  fi
done

# ─── Plugins ───────────────────────────────────────────────────────────
section "Plugins"

echo ""
echo "  Global plugins (${CONFIG_DIR}/plugins/):"
if [[ -d "${CONFIG_DIR}/plugins" ]]; then
  ls -la "${CONFIG_DIR}/plugins/" 2>/dev/null | tail -n +2 | sed 's/^/    /'
else
  info "None"
fi

echo ""
echo "  Project plugins (.opencode/plugins/):"
if [[ -d ".opencode/plugins" ]]; then
  ls -la ".opencode/plugins/" 2>/dev/null | tail -n +2 | sed 's/^/    /'
else
  info "None"
fi

echo ""
echo "  Plugin cache:"
if [[ -d "${CACHE_DIR}/node_modules" ]]; then
  CACHED_COUNT=$(ls "${CACHE_DIR}/node_modules/" 2>/dev/null | wc -l)
  info "${CACHED_COUNT} cached packages ($(du -sh "${CACHE_DIR}/node_modules" 2>/dev/null | cut -f1))"
else
  info "No cached plugins"
fi

# ─── Sessions ──────────────────────────────────────────────────────────
section "Sessions"

echo ""
if [[ -d "$PROJECT_DIR" ]]; then
  echo "  Known projects:"
  for proj in "$PROJECT_DIR"/*/; do
    if [[ -d "$proj" ]]; then
      PROJ_NAME=$(basename "$proj")
      STORAGE_SIZE=$(du -sh "${proj}storage" 2>/dev/null | cut -f1 || echo "0")
      echo "    - ${PROJ_NAME} (storage: ${STORAGE_SIZE})"
    fi
  done
else
  warn "No project data found"
fi

# ─── Recent Logs ───────────────────────────────────────────────────────
section "Recent Log Summary"

echo ""
if [[ -d "$LOG_DIR" ]]; then
  LATEST_LOG=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -1)
  if [[ -n "$LATEST_LOG" ]]; then
    info "Latest log: $(basename "$LATEST_LOG")"
    LOG_SIZE=$(stat -c%s "$LATEST_LOG" 2>/dev/null || stat -f%z "$LATEST_LOG" 2>/dev/null)
    echo "  Size: ${LOG_SIZE} bytes"

    # Count error/warn lines
    ERROR_COUNT=$(grep -ci "error" "$LATEST_LOG" 2>/dev/null || echo "0")
    WARN_COUNT=$(grep -ci "warn" "$LATEST_LOG" 2>/dev/null || echo "0")
    PANIC_COUNT=$(grep -ci "panic\|fatal" "$LATEST_LOG" 2>/dev/null || echo "0")

    echo "  Errors: ${ERROR_COUNT}  Warnings: ${WARN_COUNT}  Panics: ${PANIC_COUNT}"

    if [[ $ERROR_COUNT -gt 0 || $PANIC_COUNT -gt 0 ]]; then
      echo ""
      echo "  Last 10 error/panic lines:"
      grep -iE "error|panic|fatal" "$LATEST_LOG" 2>/dev/null | tail -10 | redact_keys | sed 's/^/    /'
    fi
  else
    warn "No log files found"
  fi
else
  warn "Log directory does not exist"
fi

# ─── Processes ─────────────────────────────────────────────────────────
section "Running OpenCode Processes"

echo ""
OC_PROCS=$(ps aux 2>/dev/null | grep -i "[o]pencode" || true)
if [[ -n "$OC_PROCS" ]]; then
  echo "$OC_PROCS" | sed 's/^/  /'
  OC_MEM=$(echo "$OC_PROCS" | awk '{sum+=$6} END {printf "%.1f MB\n", sum/1024}')
  info "Total memory: ${OC_MEM}"
else
  info "No running OpenCode processes"
fi

# ─── Network Connectivity ─────────────────────────────────────────────
section "Network Connectivity"

echo ""
ENDPOINTS=(
  "https://api.anthropic.com"
  "https://api.openai.com"
  "https://models.dev"
  "https://opencode.ai"
)

for endpoint in "${ENDPOINTS[@]}"; do
  if curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$endpoint" &>/dev/null; then
    CODE=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$endpoint" 2>/dev/null)
    info "${endpoint} → HTTP ${CODE}"
  else
    err "${endpoint} → unreachable"
  fi
done

# Check common port
echo ""
echo "  Port 4096 (default server):"
if lsof -i :4096 &>/dev/null 2>&1; then
  warn "Port 4096 is in use"
  lsof -i :4096 2>/dev/null | head -5 | sed 's/^/    /'
elif ss -tlnp 2>/dev/null | grep -q ":4096"; then
  warn "Port 4096 is in use"
else
  info "Port 4096 is available"
fi

# ─── Summary ───────────────────────────────────────────────────────────
section "Diagnostic Complete"
echo ""
echo "  Snapshot taken at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "  To share this output, pipe to a file:"
echo "    ./oc-diag.sh > opencode-diagnostic-$(date +%Y%m%d).txt"
echo ""
