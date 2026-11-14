# Cubyfit codebase audit and stabilization

Date: 2026-11-13. Working tree: `C:\Fit`, branch `working`, starting commit `6441ea2` (`Before Hosting legal pages`). This report describes source-level work only. No APK was built or installed, no device or database was touched, and no commit or push was made.

## 1. Baseline and inventory

- Initial Git status: clean. Local `.env.local`, `node_modules`, generated Android and Expo output, build archives, and the Python R2 environment were ignored and left untouched. No untracked files existed at baseline.
- TypeScript (`npm run typecheck`): pass. ESLint (`npm run lint`): pass. Automated tests (`npm test -- --reporter=dot`): 33 files passed, 200 tests passed, 1 skipped.
- Expo public configuration parsed successfully: SDK 58, Android package `com.bettereveryday.fitness`, URI scheme `betterday`, 13 configured plugins, and an AdMob unit configured. The unprofiled local config command had both `internalBuild` and `productionBuild` false; the local build script explicitly sets its build channel. No credentials were printed.
- Expo Doctor: 19/20 checks passed. Its dependency-version check reported 13 Expo patch-version mismatches. This was present before the edits.
- Production-dependency `npm audit`: 8 moderate findings, 0 high, 0 critical. This was present before the edits; no automatic dependency repair was run.
- The existing native build history is in ignored `builds/` and `android/`. Prior documentation records the Windows CMake object-path fix and WorkManager/Room R8 keep rule. Neither was changed. No native build was run for this audit.

Inventory of tracked application files: 34 Expo Router route files under `src/app`, 21 core files, 22 data files, 12 service files, 5 state files, 21 UI files, 13 hand-written Convex files, 33 existing test files, 7 scripts, 2 native config plugins, and local assets. The 5 generated Convex files were excluded from the hand-written count. This is a structural inventory, not a claim that every dynamic path was executed.

The main flow is `src/app/_layout.tsx` (Clerk, Convex, local-account selection, subscriptions, sync, and ad bridge) into Expo Router screens. `src/data/db.ts` owns account-scoped SQLite connections and migrations; `src/data/syncLocal.ts` and `src/services/syncEngine.ts` exchange records with owner-scoped Convex functions. `src/data/foodCatalog.ts` installs and validates the bundled full SQLite catalog before offline search. `src/state/subscriptions.tsx` obtains RevenueCat CustomerInfo independently of offerings; `src/state/AdEligibilityBridge.tsx` passes entitlement and screen state to `src/services/interstitialManager.ts`. Authentication routes use Clerk and the existing native/browser OAuth utilities. The native plugins in `app.config.js` preserve the Android build path and R8 fixes. These indirectly used routes, plugins, catalog assets, and migrations were retained.

## 2. Findings by severity

| Severity | Finding | Status and evidence |
| --- | --- | --- |
| Critical | None confirmed | No critical issue established by this audit. |
| High | None confirmed | No high-severity issue established by this audit. |
| Medium | Failed SQLite account initialization was cached forever | Confirmed by a failing test: a second `db()` call for the same account returned the original rejection after a transient open failure. Fixed. |
| Medium | Failed AdMob SDK initialization was cached forever | Confirmed by a failing test: a later eligible opportunity did not retry SDK initialization. Fixed. Consent and entitlement gates remain in place. |
| Medium | Expo dependency patch drift | Expo Doctor identifies 13 mismatches; no compatibility or device failure was proven. Left unchanged to avoid native dependency churn without device testing. |
| Medium | Eight moderate dependency advisories | `npm audit --omit=dev` result; advisory reachability was not established. Left for targeted security review. |
| Low | Profile metric tuples contained an unused unit value | Confirmed by `tsc --noUnusedLocals --noUnusedParameters`; removed without changing rendered labels or values. |
| Low | AdMob consent diagnostic used an identical expression on both sides of a condition | Confirmed by source inspection; simplified without changing the result. |

## 3. Changes made and bugs fixed

1. `src/data/db.ts`: clear only the failed account's cached opening promise, allowing a later call to retry. If opening succeeded but initialization failed, close that connection before retrying. Existing migration SQL and account naming are unchanged. `tests/database-recovery.test.ts` covers transient open failure and initialization failure with connection closure. Both tests failed before the fix and pass after it.
2. `src/services/interstitialManager.ts`: release the cached SDK initialization promise after a failure. A later eligible ad opportunity can retry; simultaneous callers still share one attempt. `tests/ad-manager.test.ts` covers failure followed by successful retry. The test failed before the fix and passes after it. UMP, Premium, frequency, and official test-unit checks are unchanged.
3. `src/app/(tabs)/profile.tsx`: remove four unused metric-unit tuple entries and the unused destructured variable. Visible metric labels and values remain the same.
4. `src/services/interstitialManager.ts`: remove one redundant consent-status branch that returned the same expression in either case. The diagnostic value remains unchanged.

Removed code: one unused local binding, four unused tuple entries, and one redundant expression. Removed modules: **0**. Removed dependencies: **0**. Duplicated functions/utilities consolidated: **0**. Unnecessary code paths eliminated: **1** (the redundant diagnostic branch). Unused files safely removed: **0**. Confirmed bugs discovered and fixed: **2**.

## 4. Dependency and performance review

Static reference search found no direct source mention of `expo-linking`, `react-dom`, `react-native-screens`, `react-native-worklets`, or `@edge-runtime/vm`, but `npm explain` shows they serve Expo/Router, React Native, or test peer/transitive requirements. No package was proven safe to remove. The lockfile was not changed.

The eight audit entries are `@clerk/expo`, `@expo/cli`, `@expo/fingerprint`, `@sentry/bundler-plugins`, `@sentry/react-native`, `expo`, `glob`, and `minimatch`. The named root advisories concern `glob` cancellation bypass and `minimatch` glob-pattern amplification; the other entries inherit transitive exposure. These appear principally in tooling dependency chains, but mobile-runtime reachability was not proven or excluded. npm's suggested automatic fixes include major-version downgrades of Expo/Clerk/Sentry, so applying them here would be unsafe without a separate compatibility review.

No runtime performance benchmark was run and no performance gain is claimed. The two fixes improve recovery from transient failures. The full 326,759-food catalog and starter asset remain intact, as do local SQLite data, optional catalog-update paths, account isolation, owner checks in Convex, and Sentry's existing data filtering. The ad manager's five-minute startup wait, eight-minute cooldown, three-per-day cap, consent gate, entitlement gate, and workout-completion placement were not changed.

## 5. Files and storage comparison

Measurement method: sum byte lengths of tracked files present in the working tree plus newly added files, excluding dependencies, caches, `android/`, build/export output, and generated Convex files. This includes the intentionally bundled food catalog, the tracked exercise source archive, and this newly created report. The same exclusion rule was used before and after.

| Measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| Counted files | 2,888 | 2,890 | +1 test file and +1 report |
| Counted bytes | 289,020,138 | 289,036,303 | +16,165 bytes |
| Disk space recovered | — | — | 0 bytes |

The small size increase is from regression coverage and recovery code; fewer bytes were not a goal.

Cleanup proposal only; nothing below was deleted:

| Item | Observed size | Why it may be removable | Regeneration / risk |
| --- | ---: | --- | --- |
| Ignored `.expo-*android*` export folders | 650.6 MiB combined (13 folders, 729 files) | Old generated JavaScript/asset exports | Regenerable, but may contain useful prior diagnostics; approval needed for bulk deletion. |
| Ignored `builds/` | 1,388.8 MiB | Old APKs, copied installed APKs, screenshots, logs | Some are unique build evidence; approval needed. |
| Ignored `build/catalog/` | 310.5 MiB | Generated uncompressed full and starter catalog databases | Rebuildable from source assets, but these are databases; approval needed. |
| Ignored `dist-android/` and `dist-ios/` | 19.8 MiB combined | Generated exports | Regenerable; retained. |
| Tracked `exercises-dataset-main/` | 2,656 files, 163.59 MiB | Source archive used by `scripts/build-exercise-catalog.mjs`, apparently outside the app bundle | `.gitignore` does not untrack it. Removal or archival needs approval because it is a large source input and may carry licensed media. |

These are candidate sizes, not verified recoverable space. No generated APK was created.

## 6. Remaining technical debt, in priority order

| Priority | Issue and impact | Why unchanged | Recommended future action |
| --- | --- | --- | --- |
| Medium | 13 Expo patch mismatches; potential stability/compatibility impact | Updating native packages without a device build would extend this cleanup's risk | Review `npx expo install --check`, apply a controlled SDK 58 patch update separately, then validate on a device. |
| Medium | 8 moderate npm advisories; potential security impact | Package reachability and safe patch versions need individual review; blanket upgrades could affect native integrations | Triage advisories by affected code path and apply targeted compatible fixes. |
| Medium | `runSyncCycle` accumulates all cloud pages before applying them; potential memory pressure for very large histories | No measured bottleneck or safe streaming design was established | Benchmark with a large synthetic account and add data-integrity tests before changing sync batching. |
| Medium | Native startup, OAuth, purchases, AdMob/UMP, and real catalog extraction were not rechecked on device; stability verification gap | Device/Metro/APK activity was expressly excluded from this task | On a later approved device-testing day, build once and exercise the critical flows without clearing data. |
| Low | Tracked raw exercise dataset inflates repository size and clone time; maintainability/performance of repository operations | Large source/media deletion requires approval and a preservation plan | Decide whether to archive the source outside Git, then remove from tracking only after confirming reproducibility and license obligations. |
| Low | Many default React imports are flagged by optional `noUnusedLocals` checking; maintainability noise | Bulk import edits would create a large cosmetic diff | Handle in a separate automated cleanup with JSX/typecheck validation. |
| Low | One gzip-transport test is skipped when its optional compressed fixture is absent; test coverage gap | The fixture is not part of the current checkout; the full catalog tests still run | Add a small generated fixture in a future test-only change. |

## 7. Verification and final review

- Final TypeScript: pass. Final ESLint: pass. Final automated tests: 34 files passed, **203 passed and 1 skipped**. Focused AdMob and database recovery tests: 18 passed.
- Expo configuration: parsed; package ID, scheme, plugin chain, AdMob config, and catalog references inspected. Expo Doctor's one existing patch-version check failure remains.
- Android export: not completed. The Expo export CLI began its in-process Metro bundler, so it was stopped to honor the stricter instruction not to start Metro. The partial export had zero files. No APK build, install, ADB call, emulator, or EAS build occurred.
- `git diff --check`: pass. Complete source diff reviewed: only the two recovery fixes, corresponding tests, unused Profile values, and the redundant diagnostic expression changed. No migration, native plugin, app ID, redirect scheme, production ad setting, UI styling, navigation, or credentials changed. No generated APK exists from this task.
- Current work remains uncommitted on `working`. Do not push until it has been reviewed.

## 8. Recommended next steps

1. Review the two recovery changes and tests in this working tree.
2. Schedule separate Expo patch and npm-advisory triage with a device-validation window.
3. Decide whether the large tracked exercise source archive and ignored build artifacts should be retained or archived; approve any deletion explicitly.
