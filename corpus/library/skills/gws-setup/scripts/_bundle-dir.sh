# _bundle-dir.sh — sourced by the gws-setup scripts; not meant to be run.
#
# Credentials live in the consumer's own stash (its primary akm bundle),
# under secrets/.gws/. resolve_bundle_dir prints the stash directory:
#   1. its argument, when non-empty (--bundle-dir, or the deprecated --op-home)
#   2. $AKM_BUNDLE_DIR, when the runtime sets it
#   3. $OP_HOME/knowledge, when the deprecated OP_HOME variable is set
#   4. the path of the "default": true bundle in `akm bundle list --format json`

resolve_bundle_dir() {
  local override="${1:-}" json dir
  if [[ -n "$override" ]]; then echo "$override"; return; fi
  if [[ -n "${AKM_BUNDLE_DIR:-}" ]]; then echo "$AKM_BUNDLE_DIR"; return; fi
  if [[ -n "${OP_HOME:-}" ]]; then
    echo "NOTE: OP_HOME is deprecated; use --bundle-dir ${OP_HOME}/knowledge" >&2
    echo "${OP_HOME}/knowledge"; return
  fi

  if ! command -v akm &>/dev/null; then
    echo "ERROR: cannot find the stash: AKM_BUNDLE_DIR is unset and akm is not on PATH." >&2
    echo "Install akm, or pass --bundle-dir PATH." >&2
    return 1
  fi
  if ! json="$(akm bundle list --format json)"; then
    echo "ERROR: 'akm bundle list' failed (see its output above), so the stash could not be found." >&2
    echo "Create a primary bundle ('akm bundle create'), or pass --bundle-dir PATH." >&2
    return 1
  fi

  if command -v jq &>/dev/null; then
    dir="$(jq -r '.sources[] | select(.default == true) | .path' <<<"$json")"
  elif command -v node &>/dev/null; then
    dir="$(node -e 'const b=(JSON.parse(require("fs").readFileSync(0,"utf8")).sources||[]).find(s=>s.default===true); if(b) console.log(b.path)' <<<"$json")"
  elif command -v python3 &>/dev/null; then
    dir="$(python3 -c 'import json,sys; print(next((s["path"] for s in json.load(sys.stdin).get("sources",[]) if s.get("default") is True), ""))' <<<"$json")"
  else
    echo "ERROR: reading 'akm bundle list' output needs jq, node or python3; pass --bundle-dir PATH." >&2
    return 1
  fi
  if [[ -z "$dir" ]]; then
    echo "ERROR: 'akm bundle list' shows no default (primary) bundle; pass --bundle-dir PATH." >&2
    return 1
  fi
  echo "$dir"
}
