# Cubyfit security audit — 16 November 2026

## Executive summary

This is a source, configuration, isolated-test, installed-package metadata, and existing-APK review of `C:\Fit`. On 16 November, the owner approved deployment of the verified `records:list` fix to **development only**, `greedy-scorpion-117`; that deployment completed. No production deployment, credential rotation, data deletion, account change, APK rebuild, purchase, commit, or Git push occurred. The existing Convex sync audit was used as a baseline. **No confirmed critical or high severity cross-account authorization flaw or embedded privileged key was found in the inspected current source.** This does not establish that the production service or external dashboards are secure.

One confirmed medium resource-abuse weakness was corrected: the unused legacy `records:list` endpoint scanned and returned an unlimited owned table. It now rejects lists above 500. The change is deployed to development; the isolated 501-record boundary test passes. A remote unauthenticated call was rejected and a synthetic isolated identity received an empty list. A remote 501-record boundary test was not run because it would require adding test data to the live development deployment. A separate confirmed privacy exposure is that the installed Preview Android package advertises `ALLOW_BACKUP`; its account SQLite data may enter Android OS backup independently of the app's Convex backup choice. A native configuration change and new build require owner approval and a data-preservation decision.

## Prioritized findings

| Priority | Finding | Evidence and qualification | Action |
| --- | --- | --- | --- |
| CRITICAL | None confirmed | Scope includes source and isolated identities, not live hostile testing. | Keep release gate. |
| HIGH | None confirmed | All inspected private public Convex functions derive identity server-side; isolated cross-account tests pass. | Recheck after deployment. |
| MEDIUM | Legacy `records:list` unbounded owner-index scan | Confirmed source behavior; resource exhaustion from repeated calls is a plausible abuse scenario, not an observed attack. | Bounded to 500 and deployed to development with approval. |
| MEDIUM | Android OS backup includes app data by default | Installed Preview reports `ALLOW_BACKUP`; `app.json` has no `android.allowBackup` setting. Expo documents the default as true. This is distinct from opt-in Convex backup. No backup extraction was attempted. | Decide whether to set `android.allowBackup: false`, then approve native build and retention implications. On some Android 12+ devices, that flag alone does not stop device-to-device transfer; review data extraction rules too. |
| MEDIUM | Convex sync has no explicit per-owner mutation quota | Strict payload limits and authentication exist; the operation history can grow indefinitely. No evidence of active abuse. | Design a burst-tolerant server policy before scale; do not throttle normal offline replay blindly. |
| MEDIUM | Clerk dashboard protection state unknown | Code cannot prove compromised-password rejection, lockout, bot protection, or allowed redirect configuration. | Owner verifies settings below. |
| LOW | Dependency and SDK patch drift | `npm audit` reports 13 moderate findings, with advisory roots in `glob` and `minimatch` used by build tooling; Expo Doctor flags 13 SDK patch mismatches. No direct exploit of the shipped app was established. | Review compatible patch updates in a separate build-tested change; do not apply audit's suggested major downgrades. |
| LOW | Local SQLite is not application-encrypted | The account database is within Android's app sandbox and benefits from device encryption, but no SQLCipher layer exists. | Consider an encryption migration only with a tested preservation plan. |
| ALREADY SECURE | Authentication and ownership baseline | Clerk owns password verification, Expo SecureStore token cache is wired, protected routes depend on Clerk, and Convex filters by verified owner. | Preserve. |

## Area-by-area assessment

| Security area | Previous condition | Risk severity | Finding | Fix applied | Verification method | Current status | Remaining action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Clerk passwords and recovery | `signIn.password`, `signUp.password`, Clerk email codes and reset API | Low | No custom password database or hashing found; schema has no password field. Passwords remain in transient form state. Dashboard policy unknown. | None | Source and schema review; auth tests | PARTIAL | Verify dashboard settings and a test-account reset. |
| Session storage | `@clerk/expo/token-cache` in `ClerkProvider` | Low | SecureStore-backed cache is used; no token in AsyncStorage or SQLite found. | None | Source and Expo SecureStore documentation | PASS | Test revoked-session behavior on an isolated device/account before release. |
| Protected navigation | Clerk `isLoaded`, `isSignedIn`, and `userId`; protected Expo Router stack | Low | A local navigation state alone cannot unlock screens. | None | Source and route tests | PASS | Real-device sign-out test with isolated identity. |
| Convex authorization | `requireOwner` and owner indexes in sync and legacy APIs | Low | Private reads/writes use verified identity; client IDs alone do not select another owner's record. Deletion action verifies a fresh session token and factor age. | None | 2-identity tests, direct entry-point review | PASS | Retest against the approved deployment. |
| Legacy records list | Authenticated but unlimited `collect()` | Medium | Owned-table scan and response had no bound. | Source now uses `take(501)` and rejects over 500; deployed to development. | 501-row isolated test; dev deployment unauthenticated denial and synthetic-identity empty read | FIXED | Keep production out of scope; remote 501-row boundary untested. |
| Sync validation and restore | Strict 21-kind contracts, parent checks, 20 KB payload limit, revision and operation-ID checks | Low | No arbitrary field acceptance or cross-owner lookup found. Local restore uses allowlisted columns and a transaction. | None | Existing sync/restore tests and code review | PASS | Full second-device restore and conflict resolution remain untested. |
| Sync consent and pause | `sync_control` gates upload and restore; user explicitly chooses backup | Low | New cycles stop when paused; an already in-flight network operation may finish. | None | Code review and existing sync tests | PARTIAL | Verify pause/reconnect timing with isolated account. |
| SQLite account isolation | One filename per validated Clerk ID; guest file separate | Low | Local account switch unmounts providers and checks account during open/restore. No direct cross-account file read found. | None | Source and account isolation tests | PASS | Hardware account-switch test with two isolated identities. |
| SQLite at rest and OS backup | Unencrypted SQLite; app sandbox and device encryption; Preview `ALLOW_BACKUP` | Medium | OS backup can copy local data independently of in-app cloud consent. SecureStore's own entries are excluded by its plugin; SQLite is not. | None, pending approval | Expo docs; installed package flags; app config | BLOCKED | Decide and approve `android.allowBackup: false` plus new APK verification. |
| Secret handling | `.env.local` ignored; build secrets not in `EXPO_PUBLIC_` | Low | A Sentry auth token exists only in ignored local environment; no privileged pattern found in current inspected source or two existing APKs. Public Clerk/Convex/RevenueCat SDK values are expected in a mobile bundle. | None | Git tracking check, environment key classification, APK pattern scan | PARTIAL | Complete historical blob review and inspect EAS environment visibility. Rotate only if a real exposure is confirmed and approved. |
| Network and OAuth | HTTPS service URLs; distinct `betterday` and `betterday-dev` callbacks | Low | No production cleartext service endpoint found. The HTTP Metro URL is development only. Callback route does not activate a session; Clerk flow does. | None | Source, scripts and installed intent filter inspection | PARTIAL | Verify Clerk redirect allowlists for both schemes and inspect release manifest. |
| RevenueCat and ads | CustomerInfo entitlements tied to current Clerk user | Low | Premium state is not a local preference. Test key is rejected in release path. Production entitlement configuration and real purchases untested. | None | Source and subscription tests | PARTIAL | Verify production entitlement ID and store linkage in RevenueCat dashboard. |
| Sentry and logging | PII, request, context, extra and breadcrumbs stripped; synthetic handled errors | Low | No password/token logging found in app diagnostics; development logs describe status only. | None | Source review and existing monitoring tests | PASS | Verify dashboard data scrubbing and retention. |
| Account deletion and privacy | Recent email factor, explicit DELETE, private server job, delayed local cleanup | Low | Owner-only deletion process and a capability receipt for post-sign-out status. No destructive test performed. | None | Source and isolated deletion tests | PARTIAL | Test full deletion with an expendable account and inspect third-party retention. |
| Android build and signing | Separate Dev/Preview IDs and schemes; ignored keystores | Low | Dev launcher is in the debug package; Preview package is separate. Signing and exported components were not fully audited from a final release artifact. | None | Config, build script and package metadata | PARTIAL | Review release AAB manifest/signing before public upload. |
| Dependencies | Expo SDK 58; package-lock | Low | 13 moderate audit entries, 0 high/critical. Doctor flags SDK patch drift. | None | `npm audit --json`; `npx expo-doctor` | PARTIAL | Apply only Expo-compatible, tested patch updates after evaluating rebuild need. |

## Modified files and fixes

- `convex/records.ts`: bounded the authenticated legacy list query to 500 records, rejecting larger results.
- `tests/security.test.ts`: added authorized small-list and oversized-list coverage.
- `SECURITY_AUDIT_REPORT.md`: this report.

The query was **confirmed unbounded**. An actual resource-exhaustion attack was **not observed**. The fix is active in the development deployment only. The deployment reported no auth, schema, index, cron, or exported-function changes. The CLI also reported a Node.js action runtime-version change while pushing; no Node action source was modified. The development push was mistakenly started before the remote diff review was complete; this sequencing error was reported immediately and the resulting diff inspected. No production target was used.

## Secrets and credentials

No private key or administrator credential was found in the current tracked source or the two existing local development APKs by pattern scan. `.env.local` is ignored and untracked. Its `SENTRY_AUTH_TOKEN` is set and must remain a build-only secret. The scan intentionally did not print any value. `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CONVEX_URL`, RevenueCat mobile SDK keys, Sentry DSN, and AdMob IDs are public identifiers, not administrator secrets. Backend `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, and `REVENUECAT_SECRET_KEY` are read only in server-side Convex action code.

No `.env`, `.env.local`, keystore, or private-key filename appeared in Git's tracked history. The historical `.env.example` patch review found no nonempty Sentry, Clerk, or RevenueCat secret assignment. These are targeted checks, not an exhaustive forensic scan of every historical binary and log.

The current scan is not proof that all repository history, cloud build logs, prior distributed APKs, and dashboard variables are clean. If an actual privileged key is found there, record its location and exposure window, then rotate it in the issuing dashboard **after owner approval**; rebuild or redeploy consumers only as required.

## Dashboard checks for the owner

1. In each Clerk instance (development and future production), open **User & authentication → Password → Update password requirements**. Confirm **Reject compromised passwords** is enabled. Clerk documents this control [here](https://clerk.com/docs/guides/secure/password-protection-and-rules).
2. Open **Clerk → Protections**. Confirm **Lock accounts after failed sign-ins** is enabled and review its threshold/cooldown; verify **Challenge suspicious sign-ups** or the legacy bot protection applicable to this instance. Clerk documents current defaults and the settings [here](https://clerk.com/docs/guides/protect/user-lockout) and [here](https://clerk.com/docs/guides/protect/bot-protection). Test custom mobile sign-up challenge behavior before enabling or changing it.
3. In Clerk's allowed redirect URLs for the mobile application, confirm precisely `betterday://oauth-callback` and `betterday-dev://oauth-callback` for the appropriate instances. Review email verification, Device Trust and multifactor requirements, and the compromised-password session-task behavior for the custom sign-in UI.
4. In Convex, confirm the development deployment's Clerk issuer environment (`CLERK_FRONTEND_API_URL`) and auth provider match the intended Clerk instance. Check server-only secrets and deployment access controls. **Do not deploy this patch to production as part of this report.**
5. In RevenueCat, verify the production Android/iOS public SDK keys, entitlement ID, customer identity mapping, and store product links. Keep the secret API key server-side.
6. In EAS and Sentry, verify `SENTRY_AUTH_TOKEN` is a build secret and excluded from client-facing `EXPO_PUBLIC_` values; review Sentry retention and server-side scrubbing.

## Verification executed

- `npx vitest run`: **338 passed, 1 skipped, 46 files**; repeated after the development deployment with the same result.
- Focused security, Convex auth, sync, account isolation and subscription tests: **27 passed**.
- `npx tsc --noEmit`: passed before and after the development deployment.
- `npx expo lint`: passed before and after the development deployment.
- `git diff --check`: passed.
- `npx expo-doctor`: 19/20 checks passed; 13 SDK patch mismatches.
- `npm audit --json`: 13 moderate, 0 high, 0 critical; no automatic fix applied.
- ADB confirmed wireless Redmi connection and separate Preview/Dev callback schemes. Installed Preview reports `ALLOW_BACKUP`.
- Read-only deployment checks on `greedy-scorpion-117`: `health:ping` returned OK; unauthenticated `records:list` rejected access; a synthetic isolated identity read zero records. No live 501-row test was performed.
- Existing local APKs were scanned for several privileged-key patterns; no hits. No APK was rebuilt.

No real user records were accessed, displayed, edited, or deleted. Google/email login, revoked sessions, sign-out, two-account switching, live sync, Nutrition/Habits/Workouts UI, Fast Refresh, and full account deletion were **not retested on Redmi in this pass**; the earlier sync audit contains a limited prior device create/delete test. The test identities above are isolated `convex-test` identities, not live Clerk users.

## Practical pre-release checklist

- [x] Deploy the bounded legacy query to development and verify unauthenticated denial and an isolated empty read. Retest the 501-row remote boundary only in a disposable environment.
- [ ] Decide whether Android OS backup should be disabled for the local SQLite data; approve native config/build only after reviewing device migration implications.
- [ ] Confirm Clerk password, lockout, bot, MFA/Device Trust, and OAuth redirect settings for each instance.
- [ ] Test sign-in, verification, reset, Google/Apple callback, session restore/revocation, sign-out, and two-account isolation using expendable identities on Cubyfit Dev.
- [ ] Test consent, pause, reconnect, conflict, and second-device restore without touching real data.
- [ ] Inspect final release AAB for debuggable, cleartext, exported components, permissions, and secret patterns; verify protected signing credentials.
- [ ] Review Expo-compatible security patches and rebuild Cubyfit Dev if native packages change.
- [ ] Publish a privacy policy and accurate app-store data disclosures; define deletion and retention for Clerk, Convex, RevenueCat, Sentry, AdMob, and Android OS backup. Code inspection alone is not a legal compliance determination.
