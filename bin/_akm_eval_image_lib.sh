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
      [ -e "$repo_root/$file" ] || [ -L "$repo_root/$file" ] || continue
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

akm_eval_source_fingerprint() {
  local source_root="$1"
  local files file
  files="$(git -C "$source_root" ls-files -co --exclude-standard)" || return 1
  [ -n "$files" ] || return 1
  {
    while IFS= read -r file; do
      [ -e "$source_root/$file" ] || [ -L "$source_root/$file" ] || continue
      printf '%s\t' "$file"
      git -C "$source_root" hash-object -- "$file" || return 1
    done <<<"$files"
  } | git hash-object --stdin
}

# Materialize only git-tracked and untracked-nonignored files. Docker never
# receives ignored files (credentials, local state, node_modules), regardless
# of what the source checkout's own .dockerignore happens to contain.
akm_eval_prepare_source_context() {
  local source_root="$1"
  local destination="$2"
  local file target_dir
  while IFS= read -r -d '' file; do
    [ -e "$source_root/$file" ] || [ -L "$source_root/$file" ] || continue
    target_dir="$destination/${file%/*}"
    if [ "${file%/*}" != "$file" ]; then
      mkdir -p -- "$target_dir" || return 1
    fi
    cp -P -- "$source_root/$file" "$destination/$file" || return 1
  done < <(git -C "$source_root" ls-files -co --exclude-standard -z)
}

akm_eval_prepared_context_fingerprint() {
  local source_root="$1"
  local prepared_root="$2"
  local file
  {
    while IFS= read -r -d '' file; do
      [ -e "$source_root/$file" ] || [ -L "$source_root/$file" ] || continue
      printf '%s\t' "$file"
      git hash-object -- "$prepared_root/$file" || return 1
    done < <(git -C "$source_root" ls-files -co --exclude-standard -z)
  } | git hash-object --stdin
}

akm_eval_source_image_tag() {
  local source_sha="$1"
  local source_fingerprint="$2"
  local runtime_fingerprint="$3"
  printf 'akm-eval-core:akm-source-%s-%s-%s\n' \
    "${source_sha:0:12}" "${source_fingerprint:0:12}" "${runtime_fingerprint:0:12}"
}
