# Fitapp security audit — 2026-11-04

## Scope and status

**Partial, suitable for further beta hardening.** Inspected Expo Router access guards, Clerk session storage and custom auth screens, every registered Convex function, SQLite account selection, reminder scheduling, RevenueCat identity and entitlement state, environment files, and the local deletion flow. No production deployment, data deletion, credential rotation, commit, or push was performed.

## Findings and fixes

| Severity | Finding | Action |
| --- | --- | --- |
| HIGH | Several public Convex mutations accepted unlimited strings, impossible dates, invalid weekday arrays, and out-of-range numbers. This could corrupt cloud records or consume excessive storage. | Added shared server-side validation for client IDs, dates, timestamps, text, weights, profile metrics, habit weekdays and targets. Existing reads and stored records were not migrated. |
| MEDIUM | A second profile could be created for one authenticated owner by choosing a new client ID; `profile.current` would then return an arbitrary first profile. | `profile.save` now rejects a different client ID when a profile already exists. No existing profile was deleted. |
| MEDIUM | RevenueCat state could briefly render the previous user's CustomerInfo before the effect for a new Clerk account cleared it; overlapping identity transitions were not serialized. | CustomerInfo is now visible only when its recorded Clerk ID matches the current ID during render. RevenueCat identity transitions are serialized and rechecked before accepting offers or customer info. |
| MEDIUM | An in-flight reminder reconciliation could schedule a previous account's habit notification after sign-out or account switch. Direct account switching could also leave the prior account's OS reminders scheduled. | Reconciliation now captures the local account, checks it around asynchronous work, cancels a newly scheduled notification if the account changed, and queues reminder cancellation before mounting the next account's private app state. |
| LOW | The local deletion confirmation did not distinguish device data from cloud records, Clerk identity, and a RevenueCat subscription. | Updated the confirmation to name this account's local data and state what remains. The existing destructive action still requires user confirmation; it was not executed. |
| LOW | Auth screens could fall back to an arbitrary SDK exception message, potentially showing technical details. | Auth messaging now uses Clerk's structured errors or a generic fallback. |
| INFORMATIONAL | The `records.list` and `records.get` generic public queries expose all tables to their authenticated owner. They do not accept an owner ID or provide writes. | Reviewed ownership filtering; retained for the planned sync API. Consider dedicated paginated queries when sync is implemented. |

## Authentication and cloud authorization

`ClerkProvider` wraps `ConvexProviderWithClerk`; Clerk's recommended `tokenCache` uses Expo SecureStore. The root waits for Clerk's loading state, and Expo Router guards all private routes including the temporary paywall. Signing out unmounts the account-keyed local provider. An expired or invalid Clerk JWT cannot authenticate Convex functions because Convex validates the signed token against the configured Clerk issuer and `applicationID: "convex"`; the client-side route guard is not the server authorization boundary. A real expired-token case was not simulated in this audit.

All registered functions were reviewed:

| Function | Access and ownership |
| --- | --- |
| `health.ping` | Public, returns only `{ok:true}`. |
| `identity.current` | Requires `ctx.auth.getUserIdentity()`; returns subject and issuer, no fitness data. |
| `profile.current`, `profile.save` | Require verified identity; owner comes from token identifier; owner-indexed lookup and bounded writes. |
| `habits.list`, `habits.save`, `habits.setCompletion`, `habits.completions` | Require verified identity; list is owner-indexed; completion mutation verifies the parent habit belongs to the same owner. |
| `weights.history`, `weights.save`, `weights.remove` | Require verified identity; owner-indexed read, update and deletion. Matching client IDs across accounts do not grant access. |
| `records.list`, `records.get` | Require verified identity; owner-indexed generic read for allowlisted tables only. No generic mutation exists. |

There are no registered actions or HTTP actions. All listed private functions derive ownership from Convex auth, never a caller-provided owner. The `profiles`, `habits`, `habitCompletions`, `missions`, `missionCompletions`, `exercises`, `routines`, `workouts` (including nested exercise/set objects), `weights`, `measurements`, `restDays`, `favorites`, and `preferences` tables are reachable via owner-filtered generic reads. Only profiles, habits/completions, and weights currently have public writes. Thus, a client cannot currently attach a nested workout/set, mission completion, or routine exercise to any cloud parent. When those writes are implemented, each relationship needs an owner check on the parent record. The existing exercise templates in SQLite are local seed data; cloud `exercises` are owner-scoped and are not public shared data.

## SQLite and account changes

The active Clerk user selects `better-day-user_….db`; the original guest `better-day.db` remains separate and untouched. The database open now captures the requested account and rejects completion if account selection changed meanwhile. On sign-out, local account selection is cleared; a different account gets a different file and fresh account-keyed app state. The next account's private state waits for OS reminder cancellation; if cancellation fails, the app offers a retry. No data is automatically imported or uploaded. A future guest-history import must require explicit consent and should copy, not relabel, records. SQLite files are not encrypted by this implementation; device backup and physical-access policy need review before public release.

## RevenueCat

The SDK is configured only after Clerk has a user ID and receives that ID as its App User ID. Switching to another identified account uses `logIn` directly, with serialized transitions and an ID check before results are shown. Sign-out hides CustomerInfo and blocks the protected paywall. Premium is derived from RevenueCat CustomerInfo and a configured entitlement ID, never a SQLite boolean. Missing entitlement configuration does not grant Premium. The current Test Store key is a public SDK key, and development/release guards remain in place. Purchases are not initiated automatically. Restore behavior in the RevenueCat dashboard can transfer purchases between identified accounts; verify that policy before two-account testing. If Convex later serves Premium content, use RevenueCat webhooks or a trusted server API to verify entitlement and bind it to the Clerk subject on the server; never accept a client premium flag.

## Credentials, deletion, and remaining risks

`.env.local` is Git-ignored; `.env.example` contains placeholders. Client code references only Expo public Clerk, Convex and RevenueCat configuration. Convex's Clerk issuer is server-side configuration. No tracked private key was found in the project scan. The local deletion button removes this account's SQLite profile and cascaded fitness records and does **not** delete a Clerk account, cloud profile, other accounts' local files, the guest database, or a RevenueCat subscription. Complete account deletion is not implemented and must coordinate Clerk, Convex, RevenueCat subscription guidance, and local data, with explicit approval before destructive operations.

Remaining work before public release: verify RevenueCat's exact entitlement ID and restore policy; test sign-out, expiry, account switching and purchases on physical devices; add consent-based guest import; design pagination and relationship checks for future Convex sync mutations; review OS backup and at-rest protection for fitness SQLite files; define an end-to-end account deletion process. The current local-first app remains available offline; cloud authorization still requires a valid Clerk token.

## Verification boundaries

Automated Convex tests use `convex-test` identities to exercise the function handlers and ownership logic. These tests do **not** prove JWT signature or expiration verification by the deployed service. The existing development deployment `greedy-scorpion-117` was verified before synchronization; one live unauthenticated `identity.current` request was rejected. No disposable second Clerk account or personal data was used for live cross-user testing. JavaScript exports do not establish native device security or RevenueCat purchase success.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass. |
| `npx expo lint` | Pass. |
| `npm test` | Pass: 49 tests in 8 files, including 5 new security tests. |
| `npx convex codegen --typecheck enable` | Pass. |
| `npx convex dev --once --typecheck enable` | Pass against `greedy-scorpion-117` development deployment only. |
| `npx convex run identity:current '{}'` without auth | Rejected with `Authentication required`, as intended. |
| `npx expo-doctor` | 19/20 checks. One pre-existing dependency-version check fails for six Expo packages; no unrelated upgrades made. |
| `npx expo export --platform android --output-dir dist-android --no-bytecode` | Pass. |
| `npx expo export --platform ios --output-dir dist-ios --no-bytecode` | Pass. |
| `adb devices` | No device attached; no device behavior claimed. |

References: [Convex Clerk integration](https://docs.convex.dev/auth/clerk), [Clerk Expo token cache](https://clerk.com/docs/expo/reference/components/clerk-provider), [Expo SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/), [RevenueCat customer identity](https://www.revenuecat.com/docs/customers/identifying-customers), and [RevenueCat restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior).
