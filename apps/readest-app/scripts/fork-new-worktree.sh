#!/usr/bin/env bash
# Fork helper: create a worktree that reuses everything already on disk.
# Usage (from any worktree): bash apps/readest-app/scripts/fork-new-worktree.sh <name> [base-branch]
# Creates D:\git_repos\readest-wt\<name> on branch feat/<name> from fork-base (or [base-branch]).
set -euo pipefail

name="$1"
base_branch="${2:-fork-base}"
main_repo="/d/git_repos/readest-enchanced"
wt_root="/d/git_repos/readest-wt"
dest="$wt_root/$name"

git -C "$main_repo" worktree add "$dest" -b "feat/$name" "$base_branch"
cd "$dest"

# Submodules: borrow objects from the main clone's .git/modules (no re-download).
git config -f .gitmodules --get-regexp '^submodule\..*\.path$' | while read -r _ path; do
  ref="$main_repo/.git/modules/$path"
  if [ -d "$ref" ]; then
    git submodule update --init --reference "$ref" -- "$path"
  else
    git submodule update --init -- "$path"
  fi
  # Nested submodules (e.g. simplecc-wasm/OpenCC) are small; init them normally.
  git -C "$path" submodule update --init --recursive 2>/dev/null || true
done

# JS deps: hardlinks from the shared pnpm store, no network.
pnpm install --offline --frozen-lockfile

# Vendored pdfjs/simplecc assets: copy instead of rebuilding.
cp -r "$wt_root/base/apps/readest-app/public/vendor" apps/readest-app/public/

echo "Worktree ready: $(cygpath -w "$dest")"
