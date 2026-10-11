# The .env loader every run, generate and label script shares. Source it from the repository root: `source lib/env.sh`.
# It reads .env at the repository root, whatever folder it is sourced from, and exports what it finds.
#
# Settings are KEY=value lines. A line may start with spaces and may start with `export `, and a key may be followed by spaces
# before the `=`. A blank line, a line that starts with # and a line with no = are skipped. A value in "double" or 'single'
# quotes loses its quotes and is otherwise taken as it is, # included.
# An unquoted value ends at a # that has a space before it, so `MODEL_NAME=small # the local one` is `small`.
# A variable that is already set wins, so a setting given on the command line beats .env.

# Exports the settings of the file `$1`, if it exists. Its locals start with _env_, so a setting never hides behind one.
load_env() {
  local _env_file="$1" _env_line _env_key _env_val _env_stripped
  [ -f "$_env_file" ] || return 0
  while IFS= read -r _env_line || [ -n "$_env_line" ]; do
    _env_line="${_env_line%$'\r'}"
    _env_line="${_env_line#"${_env_line%%[![:space:]]*}"}"
    case "$_env_line" in '' | '#'*) continue ;; esac
    _env_line="${_env_line#export }"
    _env_line="${_env_line#"${_env_line%%[![:space:]]*}"}"
    case "$_env_line" in *=*) ;; *) continue ;; esac
    _env_key="${_env_line%%=*}"
    _env_key="${_env_key%"${_env_key##*[![:space:]]}"}"
    _env_val="${_env_line#*=}"
    [[ "$_env_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$_env_val" =~ ^\"(.*)\"$ ]] || [[ "$_env_val" =~ ^\'(.*)\'$ ]]; then
      _env_val="${BASH_REMATCH[1]}"
    elif [[ "$_env_val" != \"* && "$_env_val" != \'* ]]; then
      _env_stripped="${_env_val%%[[:space:]]#*}"
      if [ "$_env_stripped" != "$_env_val" ]; then _env_val="${_env_stripped%"${_env_stripped##*[![:space:]]}"}"; fi
    fi
    if [ -z "${!_env_key+x}" ]; then export "$_env_key=$_env_val"; fi
  done < "$_env_file"
}

load_env "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
