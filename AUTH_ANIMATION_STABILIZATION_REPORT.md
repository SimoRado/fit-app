# Cubyfit authentication and animation stabilization

Date: 2026-11-14. Branch: `working`. Latest committed checkpoint: `d7670a2` (`First design prototype implemented`). The working tree already contained Volt, workout, database, and catalog changes; none were reset or discarded.

## Button animation

- Root cause: `MotionPressable` combined a 12% selection pop with low-damping press and release springs. Some callers also requested scales as low as 0.86. The five-tab bar used a spring for both selection width and release, allowing overshoot. The switch knob used another spring.
- Changed the shared press motion to a 0.97–0.98 scale range with 70 ms press-in and 110 ms return timing. Selection no longer adds a second scale animation. Tab selection uses 170 ms timing without overshoot. The switch knob uses 170 ms timing.
- Reduced-motion and disabled controls stay at scale 1. Press handlers and double-tap guards were not changed. Colors, dimensions, and layout were not changed.
- Added focused tests for the scale range, disabled and reduced-motion behavior, and timing limits. Native feel still needs visual inspection on a device.

## Clerk authentication

- **Observed Metro environment:** ADB initially listed the connected Redmi as authorized. It had Expo Go (`host.exp.exponent`, version 58.0.5) and no installed `com.bettereveryday.fitness` package. The user confirmed the failed tests were run through Expo/Metro. Metro is only the JavaScript server; Expo Go cannot register the Cubyfit native callback scheme. The app deliberately disables Google and Apple browser OAuth in Expo Go. This explains why those providers could not complete on this phone in that test environment. The other tester's Apple runtime and provider configuration remain unconfirmed.
- **Native configuration:** Expo config declares `com.bettereveryday.fitness`, `betterday`, the Clerk plugin, and the WebBrowser plugin. The built APK manifest includes the `betterday` scheme. The existing redirect remains `betterday://oauth-callback`; Google and Android Apple still use Clerk `startSSOFlow`, and successful sessions still use Clerk `setActive`.
- **Navigation correction:** `SocialAuth` previously called `router.replace('/')` immediately after `setActive`, while the root stack was still guarded by asynchronous Clerk state. The explicit replace was removed. Expo Router's protected route guard now handles the transition when Clerk reports the signed-in user. This removes a plausible race; it is not evidence that every reported live OAuth failure had that cause.
- **Google:** Native build capability and redirect are verified on the installed Redmi. The user personally completed Google sign-in and reported reaching their account. ADB confirmed Cubyfit in the foreground with Home visible and no sign-in screen. After a process-only force-stop and relaunch, Home was visible again without a sign-in prompt, confirming session restoration for this account. This verifies a returning Google account, not new-account sign-up.
- **Apple:** Android browser flow remains configured by the existing build flag; the native iOS flow was not changed. Apple Developer and Clerk dashboard settings were not accessible here. Live Apple sign-up/login were not completed.
- **Email:** Sign-up, six-digit verification, login, MFA email code, password reset, token cache, and sign-out paths were reviewed. Focused automated tests pass. The user personally signed out of the Google session and completed email/password login with an existing account, reporting that Home opened. ADB confirmed Home and no sign-in screen. After a process-only force-stop and relaunch, Home reappeared without a sign-in prompt. Existing-account email login and session restoration therefore passed. New email sign-up, code verification, and password reset completion were not exercised.
- **Diagnostics:** Existing developer diagnostics record safe stages and categories without passwords, codes, or tokens. The user-facing failure messages remain in place.

Clerk's OAuth documentation requires the redirect URL to be registered in the Clerk Dashboard. Confirm `betterday://oauth-callback` is allowed for the Clerk instance used by the APK and that Google and Apple social connections are enabled for sign-up and sign-in. If Apple uses browser OAuth, confirm the corresponding Apple Services ID, key, and redirect setup. No dashboard settings or credentials were changed.

## Validation

- TypeScript: passed (`npx tsc --noEmit`).
- ESLint: passed (`npm run lint`).
- Automated tests: 40 files passed, 278 tests passed, 1 skipped (`npx vitest run --maxWorkers 2 --no-file-parallelism`). Existing focused auth baseline: 8 files and 33 tests passed.
- Expo public configuration: SDK 58.0.0, package and scheme correct, Clerk and WebBrowser plugins present.
- Expo Doctor: 19/20 checks passed. It reported 13 Expo SDK 58 patch-version mismatches. Dependencies were left unchanged because no mismatch was established as the cause of the auth report. Metro also emitted an existing expo-router package export warning during bundling.
- `git diff --check`: no patch whitespace errors (Git emitted only line-ending normalization notices).

## Local APK build

- First preview attempt failed during Metro bundling with `RangeError: Failed to allocate memory` while reading an asset. A concurrent Sentry upload task then failed because the bundle was absent.
- Focused build fix: local APK builds set `CUBYFIT_LOCAL_APK_BUILD=true`; Metro uses one transform worker only for that mode. The full 85,427,860-byte compressed food catalog remains bundled.
- Retry: `BUILD SUCCESSFUL` in 3m 12s. Output: `C:\Fit\builds\local\cubyfit-preview.apk`, 140.23 MiB. SHA-256: `7427E869F64256DC3FF61283135FB21BE0041524D5A83BB9A8961927523D700F`.
- APK package: `com.bettereveryday.fitness`, version 1.0.0 (code 1), launch activity `.MainActivity`. It contains `assets/index.android.bundle` and the full catalog as `res/_C.gz` (85,427,860 bytes). Existing build verification reported signer SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- The existing build sent a release source map to the configured Sentry project. No EAS build or dependency upgrade was performed.

## Device and remaining verification

The Redmi briefly disconnected before installation, then reconnected as an authorized ADB device. With the user's explicit permission for phone control, `adb install -r` succeeded. Before installation the phone had Expo Go but no Cubyfit package, so no Cubyfit data was removed or replaced. The installed package is `com.bettereveryday.fitness`, version 1.0.0 (code 1), last updated 2026-11-14 21:28:28 on the device.

The standalone APK launched with no Metro connection and stayed running. The Shore welcome screen showed enabled Google and Apple buttons. Each opened a Chrome Custom Tab; pressing Back returned to Cubyfit without a crash. The email sign-up, email sign-in, and password-recovery screens opened. A direct Android VIEW intent to `betterday://oauth-callback` was delivered to Cubyfit's running `.MainActivity` and displayed its callback route; its Return to sign in action worked. This verifies native link registration and route accessibility, not a completed Clerk OAuth exchange.

After this entry-point check, the user personally completed Google sign-in and reported reaching their account. ADB verified that Cubyfit was foregrounded with Home visible and no sign-in screen. The app process was force-stopped and relaunched without clearing storage; Home reappeared with no sign-in prompt. Google returning-user login and session restoration therefore passed on this Redmi. The user then signed out and completed email/password login with an existing account; Home was again verified before and after a process-only restart. Apple completion, new-user social sign-up, new email sign-up, verification code, and password reset completion remain unverified. Capture sanitized error codes if a provider fails in the native APK. The phone was left signed in to the user's email account.

Files changed for this task: `src/core/pressMotion.ts`, `src/ui/MotionPressable.tsx`, `src/ui/MotionBlocks.tsx`, `src/app/(tabs)/_layout.tsx`, `src/ui/SocialAuth.tsx`, `metro.config.js`, `scripts/build-android-local.ps1`, `tests/press-motion.test.ts`, and this report. Other pre-existing working-tree changes were preserved. No commit or push was made.
