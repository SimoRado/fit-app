# Cubyfit Dev — Development Client, Auth & Fast Refresh Report

Date: 2026-11-15 · Device: Redmi 25028RN03A over Wi-Fi (wireless debugging, no USB) · Expo SDK 58.0.23 · RN 0.88.1

## Daily command

```powershell
npm run dev:android
```

Full workflow: [docs/ANDROID_FAST_REFRESH.md](docs/ANDROID_FAST_REFRESH.md).

## Status at a glance

| Item | Status | Evidence |
|---|---|---|
| Cubyfit Dev installed beside Preview | ✅ Confirmed | `pm list packages` shows both; Preview `lastUpdateTime` unchanged (2026-11-14 21:28:28) |
| Metro connection over Wi-Fi | ✅ Confirmed | Phone fetched `/status` from `192.168.100.7:8081`; `Android Bundled … 2937 modules`; app logs stream to Metro |
| Fast Refresh, Version A → B → removed | ✅ Confirmed on device | Screenshots after each save; no APK rebuild and no full re-bundle between edits |
| Runtime detection | ✅ Confirmed on device | Cubyfit Dev → `development-client`; Expo Go (opened on the phone during testing) → `expo-go`, social sign-in disabled |
| Google sign-in (Cubyfit Dev) | ✅ Confirmed | `redirectScheme: betterday-dev` → Clerk `signedIn: true` → onboarding with the Google name prefilled |
| Session restoration | ✅ Confirmed | Force-stop + cold start twice → signed in, no browser |
| Sign-out | ✅ Confirmed | Gate went to `signed-out`, welcome screen shown |
| Email/password sign-in | ✅ Confirmed | `status: complete`, activation success, dashboard |
| Apple sign-in (Android browser) | ⚠️ Implemented, **not verified** | Button enabled (`android-browser-ready`, `betterday-dev` callback); you chose to skip it |
| Google cancel/retry | ⚠️ Partly observed | One retry failed at the browser stage (`category: other`); the cause was not captured |
| Email sign-up, code verification, password recovery | ⚠️ Not tested | Code unchanged from the verified preview |
| Exercise library | ✅ Loaded | `[perf] exercise catalog ready` |
| AdMob / RevenueCat native modules | ✅ Initialised | `SDK initialized`, consent `NOT_REQUIRED`, RevenueCat Test Store key |
| Nutrition library | ⚠️ Not opened on device | — |

## Root causes of the previous failures

1. **The wrong host app.** Expo Go cannot receive `betterday://oauth-callback` and lacks RevenueCat, AdMob and Sentry native code. Google/Apple could never complete there.
2. **The old dev APK shared the preview's package ID** (`com.bettereveryday.fitness`). Installing it would have replaced the verified preview, so it was never safely installed. The phone was therefore running either the standalone preview (which has no Metro connection, hence "No apps connected") or Expo Go.
3. **Stale, competing Metro servers.** At the start of this session, an Expo Go tunnel server was running on 8081 and a plain `expo start` on 8082. Both were stopped.
4. **Ambiguous LAN address.** The PC has VMware adapters (`192.168.227.1`, `192.168.111.1`) beside the Wi-Fi address `192.168.100.7`. The script now pins `REACT_NATIVE_PACKAGER_HOSTNAME` to the default-route interface.
5. **Misclassification.** The detector trusted `executionEnvironment: bare`, so Expo Go (`host.exp.exponent`, app ID mismatch) became `native-build`. It now decides from the installed application ID first.

## Development-client configuration

`plugins/withAndroidDevVariant.js` is a finalized config mod. It runs after the Clerk, scheme and dev-client plugins, and is idempotent across non-clean prebuilds:

| | Debug APK → **Cubyfit Dev** | Release APK → **Preview** |
|---|---|---|
| applicationId | `com.bettereveryday.fitness.dev` (`applicationIdSuffix`) | `com.bettereveryday.fitness` (unchanged) |
| OAuth scheme | `betterday-dev` | `betterday` (unchanged) |
| Dev-launcher QR scheme | `exp+better-every-day` | none (duplicate of `betterday`) |
| Clerk hosted callback | `${applicationId}.hosted-callback` | same, resolves to the original value |
| Label | "Cubyfit Dev" (`src/debug/res`) | "Better Every Day" |

The JS side (`src/core/appVariant.ts`) derives the redirect scheme from `expo-application`'s `applicationId`, because a dev client receives Metro's manifest, which always reports `betterday`.

The build script fails if the dev APK isn't `.dev`, registers `betterday`, or contains an unresolved `${…}` placeholder. Likewise, the preview fails if it registers `betterday-dev`.

## Native build fix found during this work

The first dev build failed with `LLVM ERROR: out of memory` / "paging file is too small". The package change forced a full C++ recompile, and Ninja ignores the Gradle worker limit. `withLocalAndroidBuildSettings.js` now adds CMake job pools (2 compiles, 1 link). The existing CMake path limit, the Gradle/Kotlin limits and the WorkManager/Room keep rule are untouched.

## APK and signing

- `builds/local/cubyfit-development.apk`: 104.5 MiB, ARM64 debug, package `com.bettereveryday.fitness.dev`.
- Signer SHA-256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, the same debug keystore as before.
- Installed with plain `adb install` (new package). Preview untouched.

## Files modified

- New: `plugins/withAndroidDevVariant.js`, `src/core/appVariant.ts`, `tests/android-dev-variant.test.ts`, `DEV_CLIENT_AUTH_FAST_REFRESH_REPORT.md`
- Rewritten: `scripts/start-android-dev.ps1`, `docs/ANDROID_FAST_REFRESH.md`
- Modified:
  - `app.config.js`: registers the plugin.
  - `plugins/withLocalAndroidBuildSettings.js`: CMake job pools.
  - `scripts/build-android-local.ps1`: per-mode package/scheme checks; fingerprint now includes both Android plugins.
  - `package.json`: removed `dev:android:go`.
  - `src/core/runtimeClassification.ts`: identity-first classification.
  - `src/ui/SocialAuth.tsx`: scheme from the installed app ID.
  - `src/ui/auth.tsx`: `clerkErrorCode` reads top-level `code` as well as `errors[0].code`.
  - `src/app/(auth)/sign-in.tsx`: logs the Clerk error code; never credentials.
  - `tests/runtime.test.ts`: tests for all three environments.
  - `docs/LOCAL_ANDROID_BUILDS.md`
- The generated `android/` directory (gitignored) was re-prebuilt by the plugins; nothing in it was edited by hand.

Checks: `tsc --noEmit` clean · `expo lint` clean · 293 tests pass (1 skipped).

## External configuration

- ✅ Clerk (existing app): `betterday-dev://oauth-callback` added to the mobile SSO allowlist (done by you). `betterday://oauth-callback` kept.
- Apple: no Apple Developer change is expected. Apple returns to Clerk's domain, and Clerk redirects to the allowlisted app scheme. This is unverified until a real Apple sign-in is completed.
- No Google Cloud, RevenueCat (Test Store key) or AdMob (test ads) change is needed for the `.dev` package.

## Open items

1. **Apple:** run one real Apple sign-in on Cubyfit Dev.
2. **Leftover marker:** `src/app/(tabs)/index.tsx:154` shows "FAST REFRESH CHECK: LIVE" under "Hi Simo". It comes from an earlier session's uncommitted edit, not this work. Remove it when convenient.
3. `npx expo install --check` reports patch-level drift (e.g. `expo` 58.0.23→58.0.25, `expo-dev-client` 58.0.18→58.0.20). It didn't block anything. Updating it requires a dev-client rebuild.
4. Warnings seen, not blocking: `expo-router` "invalid package.json" / `router-store` lookups come from Sentry's guarded optional import of an expo-router internal. Metro's file-map cache warning recovers by recrawling.

## When to rebuild Cubyfit Dev

Only after native changes: native dependencies or SDK version, `app.json`/`app.config.js`/`plugins/`, permissions, scheme/package, or `GOOGLE_ADMOB_APP_ID`. Everything else arrives through Metro and Fast Refresh.
