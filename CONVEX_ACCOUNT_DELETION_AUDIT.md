# Cubyfit Convex and account deletion audit

**Date:** 2026-11-16. **Scope:** local source, prior audit reports, development deployment `greedy-scorpion-117`, read-only Redmi SQLite snapshots, and isolated tests. After explicit owner authorization, the reviewed action patch was deployed to development only. No real deletion, cloud record mutation, SQLite reset, app-data clear, sign-out, production access, commit, or push occurred.

## Status

| Area | Result | Evidence and limit |
| --- | --- | --- |
| Deletion root cause | **VERIFIED fixed for configuration gate** | The old deployed action emitted `Deletion verification is not configured` because `CLERK_JWT_KEY` was absent. All five names are now present; the reviewed patch is deployed. A synthetic invalid-token request reached `Recent authentication required`, and no deletion job exists. External deletion stages remain untested. |
| Normal Convex connection | **PASS** | `.env.local` selects `greedy-scorpion-117`; its client URL has the same deployment name. The running Cubyfit Dev account database matches 27 owner-filtered cloud records, and its completed cloud check advanced while the app was open. |
| Cloud backup completeness | **PARTIAL** | Backup consent is enabled. The active account has 27 cloud records (21 active, six tombstones), 57 operation acknowledgements, and 28 local revision markers. One `habit_progress` conflict remains locally; one completion's ID and creation-time metadata differ. Zero ordinary pending operations does not clear this conflict. |
| Legacy table population | **PASS** | All 13 legacy domain tables are empty on this development deployment. The active sync engine writes `syncRecords` and `syncOperations`. |
| Identity and ownership | **PASS in source/tests; PARTIAL on device** | Clerk is the identity store; no Convex `users` table is intended. The client uses `ConvexProviderWithClerk`; private functions derive owner from verified Convex identity and filter by owner. The active account has matching cloud data. A second real-device identity was not tested. |
| Deletion security | **PASS in source/tests; UNTESTED end to end** | The UI requires `DELETE-ACCOUNT` and a Clerk email code. The action requires an authenticated Convex identity, a separately verified, fresh Clerk session token, matching subject and issuer, and recent factor age. No destructive live test was performed. |
| Code fixes | **VERIFIED active in development** | The action preflights all dependencies and normalizes token rejection. The reviewed patch was deployed only to `greedy-scorpion-117`; isolated tests and synthetic remote rejection confirm the expected behavior. |

## Historical root cause and exact configuration

Before the owner configured the deployment, `accountDeletionActions:request` corresponded to the previous source version: after authenticating with Convex it read `CLERK_JWT_KEY` and `CLERK_FRONTEND_API_URL`, then threw `Deletion verification is not configured` when either was absent. The earlier read-only variable-name list returned only `CLERK_FRONTEND_API_URL`. The immediate original cause was missing **`CLERK_JWT_KEY`**. The action now deployed to development performs a wider preflight and rejects absent values before creating a job:

| Convex environment name | Source and purpose |
| --- | --- |
| `CLERK_JWT_KEY` | Clerk **development** instance → **API Keys** → **Show JWT public key** → **PEM Public Key**. This is the public verification key for the independently checked session token. [Clerk verification reference](https://clerk.com/docs/reference/backend/verify-token). |
| `CLERK_SECRET_KEY` | Matching Clerk development instance → **API Keys** → existing backend secret key. Used by the server to delete the Clerk user. Keep it in Convex only. |
| `REVENUECAT_SECRET_KEY` | Matching RevenueCat project → **Project settings → API keys** → an existing **v2 secret API key** with customer read and read/write permissions. This is distinct from the mobile SDK key. Do not create a new key without approval. [RevenueCat API keys](https://www.revenuecat.com/docs/projects/authentication), [v2 authentication](https://www.revenuecat.com/docs/api-v2). |
| `REVENUECAT_PROJECT_ID` | Same RevenueCat project → **Project settings → General → Project ID**. [RevenueCat project settings](https://www.revenuecat.com/docs/projects/overview). |

In Convex, select the **Fitapp project → development deployment `greedy-scorpion-117` → Settings / Deployment Settings → Environment Variables** and add those four names to that deployment only. Confirm the existing `CLERK_FRONTEND_API_URL` matches the same Clerk development instance. Convex environment variables are per deployment. [Convex environment documentation](https://docs.convex.dev/production/environment-variables). Never put the Clerk or RevenueCat secret in `EXPO_PUBLIC_` or the mobile `.env.local`. The PEM public key belongs in Convex configuration here because the action reads it there; do not print any values into logs or this report.

The UI passes a fresh normal Clerk session token obtained after `session.startVerification`, `prepareFirstFactorVerification`, and `attemptFirstFactorVerification` with an email code. The server verifies its signature with `CLERK_JWT_KEY`, compares subject and issuer to the separate Convex identity and configured issuer, and requires `fva` under 10 minutes. `DELETE-ACCOUNT` is a UI safety phrase; the server also requires its fixed confirmation argument. [Clerk session token claims](https://clerk.com/docs/guides/sessions/session-tokens), [reverification guidance](https://clerk.com/docs/guides/secure/reverification). This audit did not read or print a session token.

## Data architecture and dashboard location

The newer `CONVEX_SYNC_AUDIT_REPORT.md` supersedes the older pre-sync description in `CONVEX_INTEGRATION.md`. SQLite remains the device source of truth. Its triggers enqueue 21 record kinds after backup consent. The active Convex `sync:apply` mutation validates and stores each kind as a generic `syncRecords` document with `owner`, `kind`, `clientId`, `payload`, `revision`, `deleted`, and `updatedAt`; `syncOperations` stores idempotent operation acknowledgements. `sync:page` returns only the verified owner's records. Deletes are retained as `deleted: true` tombstones, with null payloads, until account deletion.

| Fitness data | Active `syncRecords.kind` | Older/separate Convex table |
| --- | --- | --- |
| Account fitness profile | `profile` | `profiles` |
| Habits, completions, progress | `habits`, `habit_completions`, `habit_progress` | `habits`, `habitCompletions`; no older progress table |
| Nutrition setting, targets, custom foods, logs | `nutrition_preferences`, `nutrition_targets`, `custom_foods`, `food_entries` | None |
| Workouts, exercise links, sets | `workouts`, `workout_exercises`, `workout_sets` | `workouts` embeds exercises and sets |
| Routines and exercise links | `routines`, `routine_exercises` | `routines` |
| Weights and measurements | `weights`, `measurements` | `weights`, `measurements` |
| Preferences, rest days, favorites | `preferences`, `rest_days`, `favorites` | `preferences`, `restDays`, `favorites` |
| Other synchronized entities | `exercises` (custom only), `missions`, `mission_completions` | `exercises`, `missions`, `missionCompletions` |

The 13 older domain tables were read-only checked and are empty. Do not delete or migrate them as part of this fix. There is no `users` table in `convex/schema.ts`: Clerk holds authentication identities, and Convex stores the verified token identifier as `owner`. The `profiles` table is a legacy fitness-profile table, not a user registry. Current fitness profile data is a `profile` kind in `syncRecords`.

Dashboard path: **Convex → Fitapp project → `greedy-scorpion-117` development deployment → Data → `syncRecords`**. Filter `kind` to inspect categories; avoid assuming an empty `profiles` or `habits` table means the backup is empty. Also inspect `syncOperations` for acknowledgement history and `deletionJobs` for job state. The development `deletionJobs` table was empty at audit time. Confirm the deployment selector reads `greedy-scorpion-117`; a production or another developer deployment can show different data. No new deployment was created.

## Current account: read-only cloud and Redmi checks

The active Redmi account was matched to its cloud owner without reporting its ID, email, records, token, or health values. The phone runs `com.bettereveryday.fitness.dev`; the installed app launched into the existing signed-in profile. Habits, Nutrition, and Workouts screens opened. The profile showed four habits and a routine was visible; two local food-entry rows exist, though the current day's Nutrition screen showed no meal. There are no completed local workout rows or workout-set rows to verify as backed up. The cloud has no workout kinds for this owner either.

| Measure | Read-only result |
| --- | --- |
| Active account cloud records | 27 total: 21 active, six tombstones |
| Active cloud kinds | `profile` 1; `habits` 4; `habit_completions` 3; `habit_progress` 2; `nutrition_preferences` 1; `nutrition_targets` 1; `food_entries` 2; `preferences` 4; `routines` 1; `routine_exercises` 1; `weights` 1 |
| Tombstone kinds | `habits` 3; `habit_completions` 2; `preferences` 1 |
| Cloud revisions | Maximum 6; 57 matching `syncOperations` in the sampled deployment data |
| Last cloud record write | 2026-11-15 21:57:31 UTC |
| Latest completed phone cloud check | 2026-11-16 18:41:28 UTC, advanced while Cubyfit Dev was open |
| Local backup consent / queue | `enabled`; zero non-conflict pending; zero failures; **one conflict** (`habit_progress`); 28 revision markers |
| Conflict revisions | Local known revision 4; cloud revision 5. Local change remains preserved and is **not confirmed backed up**. |

A second account SQLite file on the Redmi has backup choice `ask` and no matching cloud records in this read-only comparison. It was not signed in or modified. The deployment also contains two records for a different cloud owner; their identity was not investigated. The active account is demonstrably backed up for the matched records, but the unresolved progress conflict means the full current device state cannot be called completely synchronized. Do not clear the outbox or reset revisions to hide it.

## Connection, authorization, and deletion flow

`src/app/_layout.tsx` creates one `ConvexReactClient` from `EXPO_PUBLIC_CONVEX_URL`, then nests `ConvexProviderWithClerk` under `ClerkProvider`. `convex/auth.config.ts` accepts the configured Clerk development issuer with application ID `convex`. The sync provider waits for `useConvexAuth().isAuthenticated` and backup consent before uploading or downloading. `requireOwner` derives ownership from verified `ctx.auth.getUserIdentity()`, blocks access once a deletion job exists, and private queries use owner indexes. The account UI has a protected `identity.current` check. Isolated auth tests cover missing identity and cross-owner denial. The read-only owner match plus advancing cloud check supports a live authenticated connection; it does not replace a second-device or revoked-session test. The prior sync audit documented an authenticated device `sync:page` check and an owner-approved habit round trip.

Deletion stages already implemented: request → authenticated owner and fresh factor check → internal `deletionJobs` creation → bounded deletion of owned legacy tables, `syncRecords`, and `syncOperations` → RevenueCat customer search, alias safety check, v2 asynchronous delete and 404 confirmation → Clerk Backend API user delete → completed receipt → delayed local SQLite removal and sign-out. Retry stages keep the job and block further cloud writes. The UI only removes the account's local database after the backend reports `completed`. A 72-character random receipt permits post-session status checks and expires from `deletionJobs` after about 30 days. The real destructive path was **not run**.

The current design has important limits: it does not cancel an App Store or Google Play subscription; it does not call a Sentry or AdMob deletion API, remove Android OS backups, or prove deletion from third-party retention systems. RevenueCat documents asynchronous customer deletion; the code waits for 404. [RevenueCat customer API](https://www-docs.revenuecat.com/docs/api-v2/customer). Sentry's in-app integration strips user fields before sending and clears its user context on sign-out, but historical Sentry retention and any data-subject request require review in Sentry's own privacy workflow. [Sentry GDPR requests](https://sentry.io/contact/gdpr/). RevenueCat also provides a privacy contact for broader customer-data requests. [RevenueCat GDPR](https://www.revenuecat.com/gdpr). Store subscription cancellation remains the user's store action. A complete live deletion should use an owner-approved expendable identity only.

## Fixes, tests, and next action

**Development action deployed; mobile changes remain local:** `convex/accountDeletionActions.ts` preflights all five settings before a job can begin and names missing variables without exposing values. Invalid, expired, or malformed Clerk tokens now result in the existing actionable `Recent authentication required` response, with no job created. `tests/accountDeletion.test.ts` exercises rejected requests using isolated identities. `src/app/account.tsx` locally reports actual backup consent and pending/conflict counts instead of claiming upload is disabled. The existing uncommitted deletion UI preserves the exact `DELETE-ACCOUNT` phrase and shows safe server errors; its account name copy was corrected to Cubyfit.

**Tests:** TypeScript (`npx tsc --noEmit`) and ESLint (`npx expo lint`) passed after all edits. Focused deletion tests passed, 13/13. The final full regression suite passed: **373 passed, one skipped, 49 files**. `git diff --check` passed. The missing-config test confirms no deletion job is created. The prior audits contain broader sync, restore, and cross-owner tests; no destructive real-account test was added.

**Owner action completed:** the four missing variable names were added to **only** `greedy-scorpion-117`, and the reviewed action patch was deployed to development with explicit authorization. The remaining credential-association and permission checks are listed in the finalization section below. Do not test with the actual account's final Delete button. A complete external-service test needs an explicitly approved expendable Clerk/RevenueCat identity.

**Remaining risks/blockers:** the `habit_progress` conflict lacks a user-facing resolution flow; the active account's full local state is therefore not fully backed up. The end-to-end deletion and third-party retention behavior are not verified live. No production state was inspected or changed. An automatic approval check rejected removal of the temporary device screenshot at `C:\Fit\.audit-device-screen.png` and a copied SQLite snapshot in the user's temporary directory. They remain local and uncommitted; remove them when file removal is allowed.

## Historical follow-up before credentials were added: 2026-11-16

**Server settings — FAIL / still unconfigured.** Repeating `npx convex env list --names-only --deployment greedy-scorpion-117` returned only `CLERK_FRONTEND_API_URL`. The four settings `CLERK_JWT_KEY`, `CLERK_SECRET_KEY`, `REVENUECAT_SECRET_KEY`, and `REVENUECAT_PROJECT_ID` remain absent. No values were requested or displayed, and no configuration was changed. Account-deletion verification is therefore **not properly configured** on development.

**Pending development backend diff — approval required.** Only `convex/accountDeletionActions.ts` differs from the audited deployed baseline among backend source files. The observed deployed error is the old source's exact missing-key branch. The proposed patch adds a five-setting preflight, so no cleanup job starts when later service credentials are missing, and maps rejected Clerk token verification to the existing recent-authentication error. It does not change the confirmation, owner matching, factor-age requirement, schema, mutations, data, or production deployment. This is a source-to-last-audited-deployment comparison; the Convex CLI does not expose deployed action source as a read-only diff. No push was attempted.

```diff
@@
+export const deletionConfigKeys = ['CLERK_FRONTEND_API_URL', 'CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'REVENUECAT_SECRET_KEY', 'REVENUECAT_PROJECT_ID'] as const;
+export function missingDeletionConfig(env: Record<string, string | undefined>) {
+  return deletionConfigKeys.filter(key => !env[key]?.trim());
+}
@@ request
-  const jwtKey = process.env.CLERK_JWT_KEY;
-  const issuer = process.env.CLERK_FRONTEND_API_URL;
-  if (!jwtKey || !issuer) throw Error('Deletion verification is not configured');
-  const token = await verifyToken(args.sessionToken, { jwtKey });
+  const missing = missingDeletionConfig(process.env);
+  if (missing.length) throw Error(`Account deletion is not configured (missing: ${missing.join(', ')})`);
+  const jwtKey = process.env.CLERK_JWT_KEY!;
+  const issuer = process.env.CLERK_FRONTEND_API_URL!;
+  const token = await verifyToken(args.sessionToken, { jwtKey }).catch(() => { throw Error('Recent authentication required'); });
```

**`habit_progress` conflict — PARTIAL / preserved.** The local queued operation is a **delete** and the local progress row is absent. The phone's version marker is revision 4. The development cloud still has an active record at revision 5, and the local deletion operation ID does not appear in cloud `syncOperations`. The server's revision check correctly rejects a deletion based on revision 4 after revision 5 exists; the client marks the queued delete as a conflict and the restore path refuses to overwrite it. Cloud revisions 1→2 and 2→3 increased this progress amount; 3→4 and 4→5 decreased it. Revision 5 was acknowledged at 2026-11-15 21:49:33 UTC. The local queue has no creation timestamp, so the exact tap sequence or device responsible for the stale base cannot be established from retained metadata. The confirmed cause is a **stale local revision plus a later cloud revision**, not missing connectivity or lost ownership.

**Safe resolution proposal:** preserve the current queued delete and cloud revision 5 while the intended result is decided. First make separate, private, read-only backups of both variants and record their revision/operation IDs; do not clear the queue. Then provide a conflict review that presents the meaning of both states to the account owner. If the owner chooses to keep the cloud progress, apply revision 5 locally only after preserving the local deletion intent. If the owner chooses the local deletion, submit a new tombstone against revision 5 only after preserving the active cloud version. Either choice is a deliberate data change and requires separate approval. There is no honest way to report zero conflicts while keeping both divergent states as the same record.

**Supported-record backup — PARTIAL.** A private read-only comparison across all 21 supported SQLite kinds found 19 local active rows whose full payloads exactly match active `syncRecords` payloads. One additional `habit_completions` row has the same logical habit/day identity and revision 4 on both sides, but its local `id` and `created_at` metadata differ. The server intentionally acknowledges duplicate completion upserts by logical identity without replacing the existing cloud payload. Its completion meaning is present in cloud, but it is **not an exact row backup**. The cloud has one further active progress row corresponding to the conflicted local deletion. All other supported kinds have matching active counts, with no ordinary pending or failed operations. Thus the account has real cloud backup, but **not every local detail is confirmed backed up exactly**. No records or queue entries were changed during this comparison.

## Finalization after owner authorization: 2026-11-16

This section supersedes the earlier statements that the four variables were absent and the patch was undeployed. The owner stated that the variables had been added and explicitly approved a development-only push of the reviewed patch if no unrelated backend source changes were present.

### Configuration and secret handling

| Setting | Current development status | Validation limit |
| --- | --- | --- |
| `CLERK_FRONTEND_API_URL` | **VERIFIED present** | HTTPS development Clerk issuer; matches the mobile Clerk publishable key's issuer. |
| `CLERK_JWT_KEY` | **VERIFIED present and issuer-matched** | Valid base64-encoded DER RSA public key; its public numbers match the issuer's live JWKS. The installed `@clerk/backend` verifier accepted this format in an isolated signed-token test. Clerk's documentation illustrates PEM, but this project's installed verifier accepts both. No key bytes were printed. |
| `CLERK_SECRET_KEY` | **PARTIAL** | Present with development-secret prefix. Local read-only calls to Clerk's Backend API returned the same non-JSON HTTP 403 **with and without** the key, consistent with an upstream access restriction; this did not prove validity or instance association. A real Clerk deletion call was not made. |
| `REVENUECAT_SECRET_KEY` | **PARTIAL** | Present with secret-key prefix. A read-only customer search for the configured project returned 200. The key's customer **read/write** permission cannot be proven through a non-destructive call; project configuration read endpoints returned 403, so project name could not be confirmed through that key. |
| `REVENUECAT_PROJECT_ID` | **PARTIAL** | Present in project-ID format; the RevenueCat customer endpoint accepted it with the configured key. The project display name still needs dashboard confirmation. |

The only local environment files found in the project are `.env.local` and `.env.example`. `.env.local` is ignored by Git. It contains public mobile keys and a non-public `SENTRY_AUTH_TOKEN`, but **none** of the Clerk/RevenueCat server-side deletion credentials. Searches of `src/` and app configuration found no client reference to those four server-side names. The Sentry token is a build-time credential and is not `EXPO_PUBLIC_`; keep it ignored and out of public build variables. No credential was moved, overwritten, rotated, or printed.

### Development deployment

**DEPLOYED to development only:** `npx convex dev --once --typecheck enable --verbose` targeted `[Development] radouanmohammed654:fitapp:dev/radouanmohammed654`, URL `https://greedy-scorpion-117.convex.cloud`, and completed at 20:24:27 local development-host time. Before the push, `git status --short -- convex` and `git diff -- convex/accountDeletionActions.ts` showed only the previously reviewed backend source patch; no schema or other backend source edits were pending. The CLI's post-push diff reported no auth-provider, module-list, index, cron, or schema changes. It also reported a **Node.js action runtime-version metadata change** while pushing; this was not a separate source edit and was not visible in the pre-push Git diff. No production command was used. Generated bindings and existing unrelated uncommitted work were preserved.

The five variable names remained present after deployment. A development `health:ping` succeeded. A synthetic-identity request with a deliberately invalid token returned **`Recent authentication required`**, with neither the old nor new missing-configuration error. An unauthenticated request returned **`Authentication required`**. The development `deletionJobs` table remained empty. These checks establish that the new action is active, its configuration gate passes, and it has not initiated deletion. They do **not** establish that a valid real-account session or the Clerk/RevenueCat destructive API stages will succeed.

### Isolated verification and current data

Isolated tests now cover absent configuration, unauthenticated access, malformed and expired signed tokens, a recent-factor age outside the ten-minute window, wrong-account signed tokens, owner isolation, and no job creation on rejection. The real final deletion action was not invoked against a valid identity. TypeScript and ESLint passed after the final test edit. The full regression suite passed: **373 passed, one skipped, 49 files**. `git diff --check` passed. A bounded sample of 100 recent development log lines contained no schema-validation error text; the active phone SQLite snapshot had zero sync failure diagnostics. This is a sampled check, not a guarantee about every future sync.

The read-only comparison still found 29 total `syncRecords` in development across two owners, with 27 for the active Redmi owner (21 active and six tombstones). Backup consent remains `enabled`; there are zero non-conflict pending operations, zero failures, and one preserved `habit_progress` deletion conflict. The 19 exact local/cloud payload matches and the one habit-completion metadata difference remain. No local or cloud version was overwritten. Choosing the local progress deletion would eventually tombstone cloud revision 5 after explicit approval; choosing the cloud progress would eventually restore that active row locally after preserving the local deletion intent. Neither choice was made here.

### Remaining approvals and unverified stages

**Dashboard checks required:** In the Clerk **development** instance, confirm `CLERK_SECRET_KEY` belongs to the same instance as the configured issuer and that its Backend API access is allowed from Convex. In RevenueCat, confirm the configured Project ID is the intended Cubyfit project and the existing v2 secret key has `customer_information:customers:read` and `customer_information:customers:read_write` permissions. No replacement key is needed unless those checks fail; any creation or rotation requires separate approval. A valid fresh-authentication request and the Clerk/RevenueCat destructive stages remain untested because they could create a real deletion job. A full end-to-end test requires an explicitly approved expendable identity. The progress conflict requires an explicit owner choice before any resolution write.
