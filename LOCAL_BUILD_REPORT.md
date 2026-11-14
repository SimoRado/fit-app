# Cubyfit local preview build and folder audit

Date: 2026-11-14. Project: `C:\Fit`; branch: `working`; Android package: `com.bettereveryday.fitness`.

This report inventories the local artifacts observed before cleanup, records the build and verification, and lists cleanup decisions. The inventory is kept here outside `builds\local`; no extra inventory file was placed in the artifact folder.

## Initial build-folder inventory

The inventory contains each file present after the new preview build and before duplicate cleanup. Sizes are in bytes; timestamps are local filesystem timestamps. Screenshots and hierarchy dumps are diagnostic captures, not inputs to the build. The local build script writes `cubyfit-preview.apk`, `cubyfit-development.apk`, and timestamped files in `logs\`. Its optional `-CompareInstalled` mode writes `installed-cubyfit-base.apk`.

| File | Type | Bytes | Created | Modified | Purpose / role | Decision |
|---|---:|---:|---|---|---|---|
| `cubyfit-account-final.png` | `.png` | 114409 | 2026-11-13 18:49:10 | 2026-11-13 18:49:10 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-account-final.xml` | `.xml` | 27563 | 2026-11-13 18:49:09 | 2026-11-13 18:49:09 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-account-final2.png` | `.png` | 134399 | 2026-11-13 18:49:44 | 2026-11-13 18:49:44 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-account-final2.xml` | `.xml` | 16293 | 2026-11-13 18:49:43 | 2026-11-13 18:49:43 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-account-tap.png` | `.png` | 122154 | 2026-11-13 18:49:27 | 2026-11-13 18:49:27 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-account-tap.xml` | `.xml` | 14466 | 2026-11-13 18:49:30 | 2026-11-13 18:49:30 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-afterrefresh.xml` | `.xml` | 16656 | 2026-11-13 18:51:04 | 2026-11-13 18:51:04 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-buttons-current.xml` | `.xml` | 15939 | 2026-11-13 18:50:38 | 2026-11-13 18:50:38 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-current-diag.png` | `.png` | 148074 | 2026-11-13 18:43:54 | 2026-11-13 18:43:54 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-current-diag.xml` | `.xml` | 17013 | 2026-11-13 18:43:57 | 2026-11-13 18:43:57 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-current.png` | `.png` | 114302 | 2026-11-13 18:39:43 | 2026-11-13 18:39:43 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-current.xml` | `.xml` | 27563 | 2026-11-13 18:39:46 | 2026-11-13 18:39:46 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Exact duplicate identified; retained because the deletion action was blocked. |
| `cubyfit-current2.png` | `.png` | 154322 | 2026-11-13 18:50:27 | 2026-11-13 18:50:27 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-development.apk` | `.apk` | 109529769 | 2026-11-13 15:31:55 | 2026-11-13 15:31:53 | Native development client; output of the active dev build script for Metro testing. | Retain |
| `cubyfit-diag-refresh.xml` | `.xml` | 15590 | 2026-11-13 18:43:07 | 2026-11-13 18:43:07 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-diag-refresh2.xml` | `.xml` | 16638 | 2026-11-13 18:43:18 | 2026-11-13 18:43:18 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-diag-refreshed.xml` | `.xml` | 17013 | 2026-11-13 18:43:44 | 2026-11-13 18:43:44 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Exact duplicate identified; retained because the deletion action was blocked. |
| `cubyfit-diagnostics2.png` | `.png` | 153589 | 2026-11-13 18:41:21 | 2026-11-13 18:41:21 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-diagnostics2.xml` | `.xml` | 17198 | 2026-11-13 18:41:20 | 2026-11-13 18:41:20 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-final-refresh.xml` | `.xml` | 16903 | 2026-11-13 18:53:58 | 2026-11-13 18:53:58 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Exact duplicate identified; retained because the deletion action was blocked. |
| `cubyfit-home-final.xml` | `.xml` | 27563 | 2026-11-13 18:48:59 | 2026-11-13 18:48:59 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Exact duplicate identified; retained because the deletion action was blocked. |
| `cubyfit-now.png` | `.png` | 154283 | 2026-11-13 18:54:08 | 2026-11-13 18:54:08 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-now.xml` | `.xml` | 16903 | 2026-11-13 18:54:10 | 2026-11-13 18:54:10 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-preview-last-known-good-20261113.apk` | `.apk` | 146895761 | 2026-11-14 13:52:49 | 2026-11-13 19:18:53 | Preserved copy of the previous known-good preview for rollback until phone testing. | Retain |
| `cubyfit-preview.apk` | `.apk` | 146893685 | 2026-11-13 16:05:17 | 2026-11-14 14:06:35 | Current standalone preview; output of the active preview build script. | Retain |
| `cubyfit-profile.png` | `.png` | 122072 | 2026-11-13 18:40:06 | 2026-11-13 18:40:06 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-profile.xml` | `.xml` | 14466 | 2026-11-13 18:40:05 | 2026-11-13 18:40:05 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Exact duplicate identified; retained because the deletion action was blocked. |
| `cubyfit-profile2.png` | `.png` | 136817 | 2026-11-13 18:40:23 | 2026-11-13 18:40:23 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-profile2.xml` | `.xml` | 15622 | 2026-11-13 18:40:22 | 2026-11-13 18:40:22 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-refresh-latest.xml` | `.xml` | 16565 | 2026-11-13 18:50:20 | 2026-11-13 18:50:20 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-route.png` | `.png` | 153872 | 2026-11-13 18:40:56 | 2026-11-13 18:40:56 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-route.xml` | `.xml` | 17538 | 2026-11-13 18:40:55 | 2026-11-13 18:40:55 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Exact duplicate identified; retained because the deletion action was blocked. |
| `cubyfit-screen.png` | `.png` | 1264757 | 2026-11-13 18:36:10 | 2026-11-13 18:36:10 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-screen2.png` | `.png` | 1272662 | 2026-11-13 18:37:32 | 2026-11-13 18:37:32 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-state-back.png` | `.png` | 135505 | 2026-11-13 18:51:42 | 2026-11-13 18:51:42 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-state-refresh.png` | `.png` | 152779 | 2026-11-13 18:51:25 | 2026-11-13 18:51:25 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-state-refresh.xml` | `.xml` | 69502 | 2026-11-13 18:51:24 | 2026-11-13 18:51:24 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-testing-open.png` | `.png` | 152831 | 2026-11-13 18:50:01 | 2026-11-13 18:50:01 | Phone UI screenshot capture; diagnostic/baseline image, no active build-script reference. | Retain |
| `cubyfit-testing-open.xml` | `.xml` | 17538 | 2026-11-13 18:50:01 | 2026-11-13 18:50:01 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `cubyfit-window.xml` | `.xml` | 1470 | 2026-11-13 18:36:09 | 2026-11-13 18:36:09 | Phone UI hierarchy capture; diagnostic state, no active build-script reference. | Retain |
| `installed-after-final-update.apk` | `.apk` | 146891577 | 2026-11-13 18:48:09 | 2026-11-13 18:48:13 | Prior installed-package snapshot for update comparison. | Retain |
| `installed-before-final-update.apk` | `.apk` | 146890977 | 2026-11-13 18:47:55 | 2026-11-13 18:47:59 | Prior pre-update installed-package snapshot. | Retain |
| `installed-cubyfit-after-update.apk` | `.apk` | 146890977 | 2026-11-13 18:34:21 | 2026-11-13 18:34:25 | Prior installed-package snapshot; byte-identical to installed-cubyfit-base.apk. | Exact duplicate identified; retained because the deletion action was blocked. |
| `installed-cubyfit-base.apk` | `.apk` | 146890977 | 2026-11-13 18:33:52 | 2026-11-13 18:33:57 | Prior APK pulled by the optional installed-signature comparison; recovery snapshot. | Retain |
| `logs\dev-20261113-151934.log` | `.log` | 392 | 2026-11-13 15:19:41 | 2026-11-13 15:19:44 | Timestamped local build log; output of scripts/build-android-local.ps1. Incomplete/preflight diagnostic evidence. | Retain |
| `logs\dev-20261113-152008.log` | `.log` | 4552 | 2026-11-13 15:20:11 | 2026-11-13 15:20:20 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD FAILED in 5s | Retain |
| `logs\dev-20261113-152139.log` | `.log` | 164262 | 2026-11-13 15:21:41 | 2026-11-13 15:31:54 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 10m 15s | Retain |
| `logs\dev-20261113-153235.log` | `.log` | 106248 | 2026-11-13 15:32:37 | 2026-11-13 15:33:46 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 1m 10s | Retain |
| `logs\preview-20261113-155124.log` | `.log` | 644040 | 2026-11-13 15:51:25 | 2026-11-13 16:05:16 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 13m 51s | Retain |
| `logs\preview-20261113-162553.log` | `.log` | 252060 | 2026-11-13 16:25:57 | 2026-11-13 16:29:13 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD FAILED in 3m 7s | Retain |
| `logs\preview-20261113-163417.log` | `.log` | 646968 | 2026-11-13 16:34:19 | 2026-11-13 16:46:14 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 11m 56s | Retain |
| `logs\preview-20261113-172633.log` | `.log` | 647578 | 2026-11-13 17:26:37 | 2026-11-13 17:39:51 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 13m 9s | Retain |
| `logs\preview-20261113-180206.log` | `.log` | 125226 | 2026-11-13 18:02:09 | 2026-11-13 18:09:07 | Timestamped local build log; output of scripts/build-android-local.ps1. Incomplete/preflight diagnostic evidence. | Retain |
| `logs\preview-20261113-181738.log` | `.log` | 603572 | 2026-11-13 18:17:39 | 2026-11-13 18:25:40 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 8m 1s | Retain |
| `logs\preview-20261113-184420.log` | `.log` | 180866 | 2026-11-13 18:44:22 | 2026-11-13 18:47:09 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 2m 48s | Retain |
| `logs\preview-20261113-190629.log` | `.log` | 180850 | 2026-11-13 19:06:31 | 2026-11-13 19:09:12 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 2m 42s | Retain |
| `logs\preview-20261113-191622.log` | `.log` | 180866 | 2026-11-13 19:16:24 | 2026-11-13 19:18:54 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 2m 31s | Retain |
| `logs\preview-20261114-135258.log` | `.log` | 647608 | 2026-11-14 13:53:01 | 2026-11-14 14:06:37 | Timestamped local build log; output of scripts/build-android-local.ps1. BUILD SUCCESSFUL in 13m 32s | Retain |
| `preview-crash.txt` | `.txt` | 3707 | 2026-11-13 16:15:27 | 2026-11-13 16:15:46 | Historical Android startup crash evidence for the WorkManager/Room failure; retained as resolved-crash reference. | Retain |
| `verification-classes-796beb2190c94793ae8bbec303b7ba41.dex` | `.dex` | 10729236 | 2026-11-13 16:47:43 | 2026-11-13 16:47:43 | Generated DEX verification artifact; no active script reference found, provenance uncertain. | Retain |

## Validation and build

Pre-build source checks passed: TypeScript, ESLint, and the complete suite (203 passed, 1 skipped). The targeted SQLite recovery and AdMob SDK retry tests both passed. Expo Doctor remained at 19/20: 13 SDK 58 package patch mismatches and no other failed check. No dependency update was made because no mismatch-specific failure was established.

`npm run android:apk:preview` completed successfully once (13m 32s). The build script regenerated the ignored Android project because its stored native configuration fingerprint differed, then compiled the release APK. The CLI bundled JavaScript through its normal in-build Metro step. It did not start a separate development server.

| Check | Result |
|---|---|
| APK | `C:\Fit\builds\local\cubyfit-preview.apk` |
| Package / version | `com.bettereveryday.fitness`, version `1.0.0`, versionCode `1` |
| Size | 146,893,685 bytes (140.1 MiB) |
| SHA-256 | `A0A2CE91490B17A8A9B1BDEB8092474524BEECE0EDDABA184FC15DF2D5C91722` |
| Certificate SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`; matches the prior saved Cubyfit APK files |
| Internal / production flags | `internalBuild=true`, `productionBuild=false` in the APK embedded Expo config |
| AdMob | Android app ID metadata matches local configuration; Google Mobile Ads native package is linked; official Google test interstitial ID is present in the JS bundle; production ad requests remain disabled for this build |
| Navigation / authentication | AdMob Testing route and `betterday` OAuth scheme are present in the APK |
| Native modules | Google Mobile Ads and RevenueCat packages are in React Native autolinking output; SQLite native library is packaged |
| Nutrition | Full compressed catalog and starter SQLite asset are both in the APK; each asset hash matches its source file exactly |
| Source maps | The existing Sentry Gradle integration uploaded source maps to the configured Sentry project during this build |

Warnings were non-fatal: Expo Router reported a package export resolution fallback; Expo noted that `expo-system-ui` is absent for `userInterfaceStyle`; Gradle/native dependencies emitted deprecation and unchecked-operation warnings; R8 warned about stack-map metadata in the optional Amazon Appstore SDK. Gradle also notes future incompatibility with Gradle 10. No warning prevented APK packaging.

## Cleanup

The folder had 58 files before this build (823.37 MiB). The retained fallback APK and new timestamped build log brought the inventory to 60 files and 1,010,904,583 bytes (964.07 MiB). **No files were deleted; 0 bytes were recovered.**

SHA-256 comparison identified seven exact duplicates: one installed APK copy and six UI hierarchy XML captures. Their retained counterparts are recorded in the inventory. The user authorized deletion, but the automatic file-operation review rejected both the scoped cleanup batch and a single exact-path deletion with `blocked by policy`. No deletion was attempted through another tool. The remaining captures, logs, old APK snapshots, and crash report were retained. The folder still has diagnostic PNG/XML files at its root; `logs\` contains all 14 useful historical/current build logs.

The previous working APK is preserved at `cubyfit-preview-last-known-good-20261113.apk`; the primary path remains `cubyfit-preview.apk`. The saved development APK and prior installed APK snapshots are retained. No keystore or signing key is stored in this folder.

## Device verification

ADB started, but `adb devices -l` returned no devices both before and after the build. The Redmi is therefore disconnected or unauthorized in this session. No install command was run. The current phone package/version, installed certificate, app launch, Clerk session, Profile, and AdMob Testing navigation cannot be verified. The new APK certificate matches the local prior Cubyfit APKs, but that does not substitute for comparing against the phone before an in-place update.

UMP's European consent message is still unpublished, per the project configuration described for this task. No consent request was bypassed and no ad request was forced. A real test ad was not loaded or shown.

The local `.env.local` does not define `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`. The app's existing code reports active entitlement IDs as unverified when this is absent and suppresses ads whenever any RevenueCat entitlement is active. This missing identifier prevents confirmed Premium labeling. RevenueCat Offering/product availability was not checkable without running the app or dashboard access; the preview build used a configured non-Test-Store Android public key.

## Git

Only the prior audit changes remain in source: `src/app/(tabs)/profile.tsx`, `src/data/db.ts`, `src/services/interstitialManager.ts`, `tests/ad-manager.test.ts`, `tests/database-recovery.test.ts`, and `REFACTOR_AUDIT_REPORT.md`. This task added `LOCAL_BUILD_REPORT.md` and ignored local build outputs. `git status` is on branch `working`; nothing was committed or pushed.
