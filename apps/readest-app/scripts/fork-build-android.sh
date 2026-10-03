#!/usr/bin/env bash
# Fork helper: build an arm64 debug APK from the current worktree (Windows + Git Bash).
# Usage (from apps/readest-app): bash scripts/fork-build-android.sh [--skip-init]
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-D:\\dev\\android-sdk}"
export NDK_HOME="${NDK_HOME:-D:\\dev\\android-sdk\\ndk\\28.2.13676358}"
export JAVA_HOME="${JAVA_HOME:-C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.16.8-hotspot}"
export RUSTUP_HOME="${RUSTUP_HOME:-D:\\dev\\rust\\rustup}"
export CARGO_HOME="${CARGO_HOME:-D:\\dev\\rust\\cargo}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-D:\\dev\\gradle}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-D:\dev\cargo-target\readest}"
export PATH="/d/dev/rust/cargo/bin:$(cygpath -u "$JAVA_HOME")/bin:$PATH"

if [ "${1:-}" != "--skip-init" ]; then
  rm -rf src-tauri/gen/android
  pnpm tauri android init --ci
  pnpm tauri icon ../../data/icons/readest-book.png
  git checkout -- src-tauri/gen/android src-tauri/icons
  git checkout -- src-tauri/Cargo.toml 2>/dev/null || true
fi

pnpm tauri android build --debug --apk --target aarch64

apk=$(ls -t src-tauri/gen/android/app/build/outputs/apk/*/debug/*.apk | head -1)
echo "APK: $(cygpath -w "$(pwd)/$apk")"
