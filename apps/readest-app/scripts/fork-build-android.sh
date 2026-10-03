#!/usr/bin/env bash
# Fork helper: build an arm64 APK from the current worktree (Windows + Git Bash).
# Usage (from apps/readest-app): bash scripts/fork-build-android.sh [--skip-init] [--debug]
#   default: optimised release build signed with the fork key (fast on the e-ink device, ~40-60MB)
#   --debug: unoptimised debug build (~750MB, slow on device; only for native debugging)
# Output is copied to D:\dev\apks\readest-fork-<branch>[-debug].apk
set -euo pipefail

skip_init=0
profile=release
for arg in "$@"; do
  case "$arg" in
    --skip-init) skip_init=1 ;;
    --debug) profile=debug ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

export ANDROID_HOME="${ANDROID_HOME:-D:\\dev\\android-sdk}"
export NDK_HOME="${NDK_HOME:-D:\\dev\\android-sdk\\ndk\\28.2.13676358}"
export JAVA_HOME="${JAVA_HOME:-C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.16.8-hotspot}"
export RUSTUP_HOME="${RUSTUP_HOME:-D:\\dev\\rust\\rustup}"
export CARGO_HOME="${CARGO_HOME:-D:\\dev\\rust\\cargo}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-D:\\dev\\gradle}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-D:\\dev\\cargo-target\\readest}"
export PATH="/d/dev/rust/cargo/bin:$(cygpath -u "$JAVA_HOME")/bin:$PATH"
# Upstream release profile uses codegen-units=1 (smallest .so, single-threaded codegen):
# the main crate embeds the frontend, so every UI change recompiles it for ~6 min.
# Fork builds trade a few MB for parallel + incremental codegen.
export CARGO_PROFILE_RELEASE_CODEGEN_UNITS="${CARGO_PROFILE_RELEASE_CODEGEN_UNITS:-16}"
export CARGO_PROFILE_RELEASE_INCREMENTAL="${CARGO_PROFILE_RELEASE_INCREMENTAL:-true}"

# Signing key lives outside the repo; gradle picks up gen/android/keystore.properties.
keystore_props="/d/dev/keys/keystore.properties"

if [ "$skip_init" = 0 ]; then
  rm -rf src-tauri/gen/android
  pnpm tauri android init --ci
  pnpm tauri icon ../../data/icons/readest-book.png
  git checkout -- src-tauri/gen/android src-tauri/icons
  git checkout -- src-tauri/Cargo.toml 2>/dev/null || true
fi
# `tauri android build` already compiles the Rust lib and symlinks it into jniLibs, then
# gradle's rustBuild task runs `android-studio-script`, which recompiles the main crate a
# second time (different cargo config hash -> ~5 extra minutes). Skip that redundant pass.
export FORK_SKIP_GRADLE_RUST=1
export FORK_NO_MINIFY="${FORK_NO_MINIFY:-1}"   # R8 adds minutes; set 0 for a minified build
build_task=$(find src-tauri/gen/android/buildSrc -name BuildTask.kt | head -1)
if [ -n "$build_task" ] && ! grep -q FORK_SKIP_GRADLE_RUST "$build_task"; then
  sed -i 's|^    fun assemble() {|    fun assemble() {\n        if (System.getenv("FORK_SKIP_GRADLE_RUST") == "1") return|' "$build_task"
fi
if [ -f "$keystore_props" ]; then
  cp "$keystore_props" src-tauri/gen/android/keystore.properties
elif [ "$profile" = release ]; then
  echo "missing $keystore_props: a release APK would be unsigned" >&2; exit 1
fi

if [ "$profile" = debug ]; then
  pnpm tauri android build --debug --apk --target aarch64
else
  pnpm tauri android build --apk --target aarch64
fi

apk=$(ls -t src-tauri/gen/android/app/build/outputs/apk/*/"$profile"/*.apk | head -1)
branch=$(git rev-parse --abbrev-ref HEAD | sed 's|.*/||')
suffix=$([ "$profile" = debug ] && echo "-debug" || true)
mkdir -p /d/dev/apks
cp "$apk" "/d/dev/apks/readest-fork-${branch}${suffix}.apk"
echo "APK: D:\\dev\\apks\\readest-fork-${branch}${suffix}.apk"
