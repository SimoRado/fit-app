# Fitapp local-first synchronization

## Implemented behavior

SQLite remains the immediate source for every fitness screen. A versioned fourth migration adds `sync_control`, `sync_outbox`, and `sync_versions` to each Clerk account's existing database. The old guest `better-day.db` is separate. SQLite triggers cover profile, custom exercises, habits/completions, missions/completions, routines/exercises, workouts/exercises/sets, weights, measurements, rest days, favorites, and preferences. Device-specific `notification_schedules` are excluded. Triggers enqueue inside the same SQLite transaction as the local write, only when the account chose cloud backup. The queue survives app restarts.

Convex holds the authenticated `syncRecords` and `syncOperations` tables. Each record is scoped by the verified Clerk identity obtained from `ctx.auth.getUserIdentity()`. The sync mutation validates kind, record ID, size, value shape, parent ownership, expected server revision, and a stable operation ID. Retrying the same operation ID returns its prior result. Changing its payload under that ID is rejected. The query paginates records for the authenticated owner only. Existing protected domain tables remain present; this first sync format does not automatically import older records from those tables. No pre-existing cloud records are deleted or overwritten.

## Consent and account isolation

An existing account database starts with `choice=ask`; no existing records upload on sign-in. **Back up my data** seeds queued records and enables ongoing sync. **Keep it on this device** pauses upload and download; **Decide later** leaves the choice unchanged. On a new device, an account with no local profile can open **Restore from cloud** during onboarding and opt in. A preserved guest profile can be copied only after an explicit confirmation, only into an account without a profile, and only while cloud sync is paused. The guest file remains intact; importing it does not itself enable upload.

Each account has a distinct SQLite file. The sync provider is mounted inside the account-keyed app provider, checks the active Clerk user before and after each cloud call, and stops when that account unmounts or Convex authentication is unavailable. RevenueCat continues to use the Clerk user ID separately; subscription status is not synchronized into SQLite or Convex.

## Upload, download, and conflicts

The queue coalesces repeated edits to a record while retaining a new operation ID. Parent records upload before children; child tombstones upload before parent tombstones. A successful response stores the server revision and removes the outbox row only if its operation ID still matches, so a newer local edit cannot be acknowledged accidentally. Network errors leave the row intact for the next 20-second retry. The server rejects stale expected revisions. Identical duplicate habit or mission completion events use the parent/day key and are acknowledged without creating a second event.

Cloud pages are downloaded after upload. They are applied in a SQLite transaction in dependency order, with triggers temporarily disabled. A local pending edit, an unversioned local record, or a potentially destructive cloud deletion while pending work exists is preserved and reported as a conflict. The app does not silently pick a winner. **Manual conflict resolution is not yet implemented**; the privacy screen reports conflicts and the local rows remain available. Sync status reads real pending and conflict counts and says “Synced” only after an upload/download cycle finishes without pending work or conflicts. On a network or auth failure, local tracking continues.

## Limits requiring beta verification

The sync format stores one validated SQLite row per Convex `syncRecords` document. Existing `profiles`, `habits`, and `weights` Convex tables from the earlier backend foundation are separate and need an explicit migration strategy if they contain real user records. Large accounts and simultaneous edits on multiple physical devices have not been exercised end to end. Queue, transport, server-authorization, and conflict behavior have automated tests, but the full SQLite restore and offline/reconnect flow have not been exercised on a phone. Manual conflict resolution, a trusted account-deletion workflow, and a cloud-data export are still needed before public release. Do not interpret a JavaScript export as proof of live synchronization.

The development deployment `greedy-scorpion-117` accepted `npx convex dev --once`; an unauthenticated `sync:page` call returned `Authentication required`. This confirms deployment and one authentication boundary, not an authenticated end-to-end sync or two-device restore.

## Development verification

Use **Profile → Data & Privacy** after signing in. Choose backup, create a habit or workout offline, reconnect, and wait for the status to become **Synced**. On another device using the same Clerk account, choose **Restore from cloud** during onboarding. Use separate authorized test accounts to check isolation. Do not use production data for adversarial tests.
