# Local Android APK builds

This is the repeatable Windows workflow for Cubyfit at C:\Fit. It creates APKs locally and never starts an Expo cloud build or installs an APK automatically.

## One-time setup

Install the versions already used by this project:

- Node.js and npm. The current project is verified with Node 24 and npm 11.
- JDK 17 or later. Set JAVA_HOME to that JDK. The build script prepends JAVA_HOME\bin, so an older Java executable earlier in PATH cannot affect the build.
- Android SDK Platform Tools, Build Tools, NDK 27.1.12297006, and CMake 3.22.1 including Ninja.

Use C:\Fit, not the old Desktop copy. Run npm install once after checking out the project. Create the ignored .env.local from .env.example and set the local public configuration values. Do not place server credentials in an EXPO_PUBLIC_ variable.

The script validates Clerk, Convex, AdMob, and the applicable RevenueCat key before it builds. The App ID and interstitial ID remain local configuration values. It forces local development and preview builds to use Google test ads.

The Android build also requires a Clerk publishable key and `EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED=true`; this prevents a missing `.env.local` value from silently producing a preview with Apple sign-in disabled. The value is embedded in the APK JavaScript bundle. EAS internal profiles set the Apple browser flag and AdMob testing controls; their Clerk publishable key and Convex URL must be configured in the EAS `development` environment. The Clerk dashboard must allow `betterday://oauth-callback` under **Native applications → Allowlist for mobile SSO redirect**, and have Google and Apple enabled under **SSO connections**.

## Build commands

For the Metro-connected development client, run:

    npm run android:apk:dev

This writes [cubyfit-development.apk](/C:/Fit/builds/local/cubyfit-development.apk). It is an ARM64 debug APK containing Expo Dev Client. Start Metro after installing it:

    npx expo start --dev-client

For a self-contained preview APK, run:

    npm run android:apk:preview

This writes [cubyfit-preview.apk](/C:/Fit/builds/local/cubyfit-preview.apk). It embeds JavaScript and the complete food catalog, so it launches without Metro.

Both commands build ARM64 by default because Cubyfit is tested on physical ARM64 Android devices. To build another ABI, set CUBYFIT_ANDROID_ABIS before running the command. This changes only the package ABI; React Native’s New Architecture and Hermes remain enabled.

Preview is a non-debuggable release APK. RevenueCat Test Store keys intentionally fail in this build type, so it requires EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY from the existing Android RevenueCat app. Test purchases use Google Play sandbox. The preview still uses Google’s AdMob test interstitial and does not enable live ads.

## What the script does

scripts/build-android-local.ps1 loads .env.local only into its own process, checks the JDK/SDK/NDK/CMake prerequisites, and invokes one bounded Gradle build. It regenerates Android native configuration only when the app configuration, package list, local build plugin, or Android AdMob App ID changes. Logs are saved under builds/local/logs/.

On this Windows environment, Expo SDK 58 passed CMAKE_OBJECT_PATH_MAX=1024, allowing generated gesture-handler object paths to reach 263 characters. The bundled CMake 3.22.1 Ninja then failed creating those paths. The local config plugin sets the supported expo.android.cmakeObjectPathMax=240, which makes CMake hash deep object paths. It also limits Gradle to two workers and Kotlin to 1 GB on this 8 GB machine. If an old CMake cache still records the former value, the script removes only android/app/.cxx and android/app/build/intermediates/cxx and regenerates them.

The generated Android project continues to include the existing Clerk deep links (betterday://oauth-callback and Clerk callback), secure storage, RevenueCat, AdMob/UMP, SQLite, food assets, notifications, Convex, Sentry, animations, and Expo modules. The build checks the generated React Native package list for AdMob, RevenueCat, and Sentry. The development build additionally checks Expo Dev Client; preview checks its embedded JavaScript and food catalog asset.

## Signing and installation

Local debug and preview APKs use the generated Android debug keystore unless configured otherwise. An EAS APK may have a different certificate, so an APK with the same package ID cannot update it in place when certificates differ.

The build output prints its SHA-256 signer digest. Before manually installing, compare it with the installed APK:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-local.ps1 dev -CompareInstalled

This only reads the connected app’s base APK and compares certificate digests. It never installs, uninstalls, clears data, or changes the device.

After confirming compatible signing and choosing to install manually:

    adb install -r builds/local/cubyfit-development.apk

If the signer differs, do not use adb install -r, and do not uninstall simply to make it work. Use the matching existing signing credentials for an update, or install under a separately approved application ID. The local scripts neither download nor regenerate production signing credentials.

## Catalog behavior

The preview build bundles assets/foods-full-v4.sqlite.gz and assets/foods-starter-v4.db. Cubyfit validates and installs its catalog into its own local app storage, reuses it across launches, and keeps personal meal data separately. It does not download the bundled full catalog from R2. Optional future catalog updates remain an explicit, authenticated user action through the configured gateway.

The development APK loads JavaScript and its static assets through Metro, including the food archive. The preview APK embeds them. A JavaScript or TypeScript change only needs Metro. Build a new APK after changing native dependencies, Expo configuration, config plugins, Android permissions, App IDs, or native source.

## Troubleshooting

- JAVA_HOME or JDK error: point JAVA_HOME at JDK 17+ and reopen the terminal.
- SDK/NDK/CMake error: install the named component through Android Studio’s SDK Manager.
- Ninja path error: rerun the command. The script detects the stale 1024-path CMake cache and regenerates only native intermediate caches.
- Memory pressure: close Android Studio and other heavy programs. The script limits Gradle concurrency; do not raise workers on this machine without observing stable builds.
- RevenueCat preview error: use the Android public SDK key, never a Test Store key, for a non-debuggable APK.
- Need an app-store binary: use the existing matching upload signing credentials and the established EAS workflow when required. The local preview APK is for installation testing, not store submission.

The detailed AdMob behavior and test flow are documented in [admob-interstitials.md](/C:/Fit/docs/admob-interstitials.md).

In internal builds, open **Profile → AdMob Testing** for UMP, SDK, native module, interstitial, Premium, and frequency diagnostics. Load/Show use Google's official Android test unit, require permitted consent and a confirmed Free entitlement, and do not change automatic frequency caps. Production builds hide the Settings row and reject the internal controls.
