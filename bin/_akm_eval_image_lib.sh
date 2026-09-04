#!/usr/bin/env bash

# Shared, host-safe image selection helpers. Keep this file limited to Bash
# builtins plus git: operator machines should not need a language runtime just
# to decide which Docker image to run.

akm_eval_validate_version() {
  case "$1" in
    *[!A-Za-z0-9._-]*) return 1 ;;
  esac
}

akm_eval_canonical_path() {
  local input="$1"
  local directory basename

  if [ -d "$input" ]; then
    (cd -- "$input" && pwd -P)
    return
  fi
  if [ ! -e "$input" ]; then
    return 1
  fi
  case "$input" in
    */*)
      directory="${input%/*}"
      basename="${input##*/}"
      [ -n "$directory" ] || directory="/"
      ;;
    *)
      directory="."
      basename="$input"
      ;;
  esac
  (cd -- "$directory" && printf '%s/%s\n' "$(pwd -P)" "$basename")
}

akm_eval_runtime_fingerprint() {
  local repo_root="$1"
  local flavor="$2"
  local files file

  files="$(
    git -C "$repo_root" ls-files -co --exclude-standard -- \
      .dockerignore package.json bun.lock requirements-smoke.txt requirements-beam.txt \
      tsconfig.json bin config docker scripts src
  )" || return 1
  [ -n "$files" ] || return 1

  {
    printf 'flavor=%s\n' "$flavor"
    while IFS= read -r file; do
      printf '%s\t' "$file"
      git -C "$repo_root" hash-object -- "$file" || return 1
    done <<<"$files"
  } | git hash-object --stdin
}

akm_eval_default_image_tag() {
  local flavor="$1"
  local version="$2"
  local fingerprint="$3"
  local short_fingerprint="${fingerprint:0:12}"

  if [ -n "$version" ]; then
    printf 'akm-eval-%s:akm-%s-%s\n' "$flavor" "$version" "$short_fingerprint"
  else
    printf 'akm-eval-%s:runtime-%s\n' "$flavor" "$short_fingerprint"
  fi
}
