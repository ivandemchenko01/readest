# Readest fork — agent notes

Personal fork of [readest/readest](https://github.com/readest/readest) for an Android e-ink reader (arm64).
Upstream project conventions live in `apps/readest-app/AGENTS.md` — read it first; everything there applies.

@apps/readest-app/AGENTS.md

## Fork-specific facts

- **Android package**: `applicationId = "io.github.ivandemchenko01.readest"` (`apps/readest-app/src-tauri/gen/android/app/build.gradle.kts`),
  label "Readest Fork" (`src-tauri/tauri.android.conf.json`). Installs next to the official `com.bilingify.readest`.
  - Do NOT change `identifier` in `tauri.conf.json`, gradle `namespace` or the Kotlin package `com.bilingify.readest`:
    Tauri derives JNI symbol names and generated Kotlin classes from `identifier`; changing it breaks the app.
  - Deep-link schemes (`readest://`, OAuth) are shared with the official app — Android shows a chooser. Intentional (OAuth redirects are whitelisted upstream).
- **Fork features** (each in its own branch off `fork-base`): book reading statuses, rating/review, reading-statistics screen.
  Reuse existing data (`Book.readingStatus`, `statistics.db` KOReader schema) instead of parallel storage.
- **Performance on the reader is the #1 rule** (Onyx Boox Go 7: weak CPU, slow e-ink refresh). New features must not
  add lag to the library or the reader:
  - nothing heavy on app start or page turn; compute lazily, only when a screen is opened;
  - aggregate in SQL (`statistics.db`), never load raw events or every book config into JS in a loop;
  - memoise derived lists; avoid re-rendering the whole bookshelf on unrelated state changes;
  - no chart libraries — hand-rolled static SVG; no animations, transitions, spinners that redraw e-ink.
- **E-ink first**: high contrast, no animations/transitions. Use `eink:` / `not-eink:` Tailwind variants and `[data-eink]` styles from `src/styles/globals.css`.

## Workspace layout (Windows)

Claude Code cannot write `.git/HEAD` / `.git/config` of the main checkout, so branches live in worktrees:

| Path | Branch |
|---|---|
| `D:\git_repos\readest-enchanced` | `main` (mirror of upstream, untouched) |
| `D:\git_repos\readest-wt\base` | `fork-base` (app id, docs) |
| `D:\git_repos\readest-wt\<feature>` | `feat/<feature>`, branched from `fork-base` |

**Don't duplicate installs/builds — the user's PC is slow and Defender scans every file** (do NOT add Defender exclusions).
New worktree, reusing what's already on disk (no network, no rebuild):

```bash
bash apps/readest-app/scripts/fork-new-worktree.sh <name> [base-branch]
# = worktree add + submodules borrowed from main clone's .git/modules (--reference)
#   + pnpm install --offline (hardlinks from D:\.pnpm-store) + copy public/vendor from base
```

Never copy `node_modules` between worktrees: pnpm uses absolute junctions on Windows, a copy silently
points at the source worktree's packages. Build APKs one at a time (shared `CARGO_TARGET_DIR`);
run only the targeted vitest files, not the full suite.

## Toolchain

Installed under `D:\dev` (C: is nearly full):

```
ANDROID_HOME=D:\dev\android-sdk            (platform 36, build-tools 36, platform-tools)
NDK_HOME=D:\dev\android-sdk\ndk\28.2.13676358
RUSTUP_HOME=D:\dev\rust\rustup  CARGO_HOME=D:\dev\rust\cargo   (stable + *-linux-android targets)
JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot   (PATH `java` is 1.8 — always rely on JAVA_HOME)
```

Shells started before the env vars were persisted won't see them — export them explicitly in Bash.

## Build a debug APK (arm64)

From `apps/readest-app` in a worktree:

```bash
rm -rf src-tauri/gen/android
pnpm tauri android init --ci
pnpm tauri icon ../../data/icons/readest-book.png
git checkout -- src-tauri/gen/android src-tauri/icons   # restore tracked customisations (incl. applicationId)
pnpm tauri android build --debug --apk --target aarch64
```

Output: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.
Re-run init after switching branches or after a `tauri android dev` session (it bakes the dev URL in).

## Testing loop

1. **Unit tests first** (repo rule: test-first): `pnpm test -- <file>`; stats DB tests use real migrations on
   `NodeDatabaseService.open(':memory:')` — see `src/__tests__/statistics/statisticsDb.test.ts`.
2. **Type/lint**: `pnpm lint` (tsc + biome). `pnpm format` from the repo root.
3. **UI check in a browser**: `pnpm dev-web` (http://localhost:3000) and drive it with Chrome automation
   (claude-in-chrome). Toggle e-ink mode in settings to check contrast.
4. **Device**: `adb install -r <apk>` to the e-ink reader over USB; `pnpm test:android` drives the installed
   app over CDP (package taken from `READEST_ANDROID_PKG`, defaults to the fork id).
5. Add new UI strings with `_()`; run `pnpm i18n:extract` and fill at least `ru` + `en`.
