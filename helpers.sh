#!/usr/bin/env bash
set -euo pipefail

# -------------------------
# Choose user for git ops
# -------------------------
choose_user() {
  if [[ -n "${RUN_USER:-}" ]]; then
    :
  elif id immich &>/dev/null; then
    RUN_USER="immich"
  else
    RUN_USER="$(id -un)"
  fi

  # Export RUN_USER for callers that expect this environment variable
  export RUN_USER

  # Print the chosen user for compatibility with callers that capture output
  echo "$RUN_USER"
}

# -------------------------
# Core git logic (DESTROYS local state)
# -------------------------
git_force_checkout() {
  local repo="$1"
  local dir="$2"
  local ref="${3:-main}"

  mkdir -p "$(dirname "$dir")"

  if [[ ! -d "$dir/.git" ]]; then
    git clone "$repo" "$dir"
  fi

  cd "$dir"

  # Make workspace disposable
  git fetch --all --tags
  git reset --hard HEAD
  git clean -fdx

  if git rev-parse --verify "$ref^{commit}" >/dev/null 2>&1; then
    git checkout -f --detach "$ref"
  else
    git checkout -B "$ref" "origin/$ref"
    git reset --hard "origin/$ref"
  fi

  git clean -fdx
  git config --global --add safe.directory "$dir"

  echo "✅ Ready: $dir ($(id -un))"
}

# -------------------------
# Public entrypoint
# -------------------------
safe_git_checkout() {
  local repo="$1"
  local dir="$2"
  local ref="${3:-main}"

  local user
  user="$(choose_user)"

  if [[ "$(id -un)" == "$user" ]]; then
    git_force_checkout "$repo" "$dir" "$ref"
    return
  fi

  [[ "$(id -un)" == "root" ]] || {
    echo "❌ Must be root to switch user"
    exit 1
  }

  su "$user" -s /bin/bash -c \
    "$(declare -f git_force_checkout); git_force_checkout '$repo' '$dir' '$ref'"
}
