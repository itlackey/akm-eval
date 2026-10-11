# The .env loader every run, generate and label script shares. Source it from the repository root: `source lib/env.sh`.
# It reads .env at the repository root, whatever folder it is sourced from, and exports what it finds.
#
# Settings are KEY=value lines. A line may start with spaces and may start with `export `. A blank line and a line that
# starts with # are skipped. A value in "double" or 'single' quotes loses its quotes and is otherwise taken as it is, # included.
# An unquoted value ends at a # that has a space before it, so `MODEL_NAME=small # the local one` is `small`.
# A variable that is already set wins, so a setting given on the command line beats .env.

# Exports the settings of the file `$1`, if it exists.
load_env() {
  local file="$1" line key val stripped
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in '' | '#'*) continue ;; esac
    line="${line#export }"
    line="${line#"${line%%[![:space:]]*}"}"
    key="${line%%=*}"
    val="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$val" =~ ^\"(.*)\"$ ]] || [[ "$val" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    elif [[ "$val" != \"* && "$val" != \'* ]]; then
      stripped="${val%%[[:space:]]#*}"
      if [ "$stripped" != "$val" ]; then val="${stripped%"${stripped##*[![:space:]]}"}"; fi
    fi
    if [ -z "${!key+x}" ]; then export "$key=$val"; fi
  done < "$file"
}

load_env "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
