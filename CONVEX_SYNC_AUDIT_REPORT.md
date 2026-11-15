# Cubyfit Convex sync audit

Audit date: 2026-11-15. Scope: the existing Expo SDK 58 app, account SQLite files, and **development** Convex deployment `greedy-scorpion-117`. The owner approved one development backend deployment and one labeled real-device create/delete test. No production deployment, data reset, app uninstall, build, commit, or push was performed.

## Executive status

| Area | Status | Evidence and limit |
| --- | --- | --- |
| Development connection | **PASS** | `.env.local` selects `greedy-scorpion-117`, the public app URL has the same host, the Clerk key is a development key, and `health:ping` succeeded on that explicit deployment. The device logs show authenticated `sync:page` calls. |
| Historical food error | **PASS** | Current SQLite and source validator include `catalog_food_id`. A read-only cloud check found the current account's food entry with this field. Earlier `Invalid record fields` logs precede later successful sync calls; the device queue is now empty. No new food mutation was made during this audit. |
| Current workout schema | **PARTIAL** | SQLite's workout row has six session fields absent from the original backend validator source. The strict validator fix was deployed successfully and accepts a representative workout in isolated server tests. A real-device workout upload was not tested. |
| Queue isolation and retries | **PARTIAL** | The original engine stopped at the first rejected operation. Local changes now retain failure diagnostics, cap exponential retry delay at five minutes, preserve operation IDs and acknowledgements, and allow independent operations past a validation failure. Automated tests pass; the real-device create/delete cycle returned the queue to zero. A deliberately invalid real-device record was not introduced. |
| Offline persistence | **PASS for local queue / PARTIAL for reconnect** | SQLite triggers enqueue with the local write only after consent. A file-backed queue survives reopen in tests. Reconnect after a forced device network outage was not repeated during this audit. |
| Auth and account isolation | **PASS in code/tests / PARTIAL on device** | `ConvexProviderWithClerk`, the Clerk JWT issuer configuration, `requireOwner`, owner indexes, and separate Clerk-ID SQLite file names are present. Unauthenticated and second-identity tests reject cross-account access. A second real device/account was not used. |
| Cloud restore | **PARTIAL** | A focused test exposed and fixed a restore rejection for valid numeric field names such as `kcal_100`. Code pages only the authenticated owner's records and applies them in dependency order inside a local transaction with triggers disabled. Pending/unversioned local records are retained as conflicts; version checks make repeated pages idempotent. Full restore of a separate device and conflict resolution were not exercised. |
| Production | **NOT TESTED** | Intentionally excluded. |

## Connection and consent

The app creates one `ConvexReactClient` from `EXPO_PUBLIC_CONVEX_URL` in `src/app/_layout.tsx`, nested under `ClerkProvider` with `ConvexProviderWithClerk`. `convex/auth.config.ts` accepts the configured Clerk frontend issuer with application ID `convex`. All private sync functions call `requireOwner`, which obtains the verified Convex identity and uses its token identifier as the owner. The server does not trust an owner supplied in a payload. A read-only check of the selected development deployment found the current device profile and its one active food entry and nutrition target. No private record content was printed.

The account's SQLite file is derived from the verified Clerk user ID. The guest database and other account files are separate. Sign-out unmounts the account provider, clears reminders and monitoring user state, and keeps the local file. Upload and download run only while the account's `sync_control.choice` is `enabled` and Convex authentication is ready. Initial upload is explicitly seeded by **Back up my data**. Pausing backup prevents sync cycles. Deleting local data is blocked if pending changes or conflicts exist.

## Entity coverage

The authoritative coverage is the trigger list, outbox order, strict validator, and restore path, not the presence of a domain table in Convex. All listed kinds support local insert/update/delete triggers, queued upsert/tombstone, server validation and revision acknowledgment, and cloud restore. Composite keys are shown where used. A representative upsert and delete for every kind passed against `convex-test` with an isolated identity. This verifies the storage/transport operations, not a distinct create/edit/delete UI flow for every row type. Composite rows such as completions, rest days, and favorites are generally toggled or replaced rather than edited as standalone screens.

| Entity | Sync kind | Notes |
| --- | --- | --- |
| Profile | `profile` | One active profile per cloud owner. |
| Custom exercises | `exercises` | Only `custom=1`; seed/catalog exercises are local catalog data. |
| Habits, completions, measured progress | `habits`, `habit_completions`, `habit_progress` | Completion/progress identity is habit ID plus day. |
| Missions and completions | `missions`, `mission_completions` | Completion identity is mission ID plus day. |
| Routines and exercise links | `routines`, `routine_exercises` | Parent and exercise references are checked. |
| Workouts, exercise links and sets | `workouts`, `workout_exercises`, `workout_sets` | Local source includes session/timer state; backend update awaits approval. |
| Weights, measurements | `weights`, `measurements` | Profile ownership is checked. |
| Rest days and favorites | `rest_days`, `favorites` | Composite owner/day and owner/card keys. |
| General preferences | `preferences` | Includes calorie display and per-entry food-unit settings as preference rows. |
| Nutrition enabled flag and targets | `nutrition_preferences`, `nutrition_targets` | Target ID is owner plus effective day. |
| Custom foods and logged food | `custom_foods`, `food_entries` | Food entries include nullable `food_id`, `catalog_food_id`, grams and macros. Custom-food references are checked. |

Device notification schedules, downloaded catalog metadata/media, subscription state, authentication state, and transient workout UI draft state are **not** synchronized. Some preferences refer to local-only device behavior; they are still carried as generic preference rows. Domain tables such as Convex `profiles`/`weights` from the older API are separate from `syncRecords` and are not migrated automatically.

## Schema findings

- The original reported food failure is consistent with the app sending `catalog_food_id` before the development backend accepted it. The current local schema, payload serializer (`SELECT *`), validator, persisted cloud payload, and restore SQL include the field. Food edit keeps it and deletion produces a tombstone; a cloud record containing it was verified read-only.
- **Confirmed source defect:** SQLite migration 6 added `session_status`, `elapsed_seconds`, `running_since_ms`, `paused_since_ms`, `paused_seconds`, and `finished_at_ms` to workouts, while the server still required exactly the older columns. The local patch explicitly validates these fields, including nullable millisecond values and the four allowed statuses. It does not allow arbitrary columns.
- **Confirmed source defect:** habit reminder time validation used an escaped digit pattern that rejected valid nonempty times. The local patch accepts `HH:MM` within the existing six-reminder limit. It also checks progress `updated_at` as a timestamp.
- A test now compares every SQLite synchronized table column with the server's explicit contract. This catches future local field additions before deployment. Legacy habit and food-entry formats remain accepted by the existing server code.

## Queue, offline behavior, and recovery

SQLite remains the primary store. Triggers write the outbox in the same local transaction when backup consent is enabled. Each record has a stable queued operation ID until a newer local edit replaces it. The server records operation IDs, rejects reuse with different payloads, and returns the prior revision on retry. Acknowledgment updates `sync_versions` and deletes the queue row only when its operation ID still matches. Conflicts retain the outbox row.

Previously, any `sync:apply` exception aborted the whole cycle. The local patch stores a diagnostic by kind, record ID and operation ID in `sync_failures`, leaving the source row and outbox untouched. Validation/auth failures wait for explicit retry or a new local edit. Network/dependency/other temporary failures use 5, 10, 20… seconds capped at 300 seconds. Independent records can continue after a validation failure; table-level parent/child barriers conservatively hold dependent records and parent deletions. The Data & Privacy screen shows pending/failed/conflict counts, a safe operation prefix, an actionable category message, next retry, and last completed cloud check. **Retry sync** re-enables failed operations without clearing local data. The diagnostic table is a non-destructive migration; stale diagnostics for replaced operation IDs are pruned.

The limitation is conservative ordering: one failed parent may delay unrelated children of the same table, and one failed child deletion may delay other parent deletions. This favors referential safety. Unknown server failures are treated as temporary and capped for retry; a permanently failing unknown error can still keep its own operation pending, but cannot be acknowledged silently.

## Restore and conflicts

`sync:page` uses the authenticated owner index. The client gathers all pages, ensures the local exercise catalog, then applies cloud records inside a transaction with sync triggers disabled. Upserts are ordered parent first and deletes child first. Existing unversioned local rows, pending edits, and potentially destructive cloud deletes during pending work are retained as conflicts. A repeated revision is skipped. The audit found that the old cloud-column name regex rejected valid fields containing digits (`kcal_100`, `protein_100`, etc.); that would roll back a food restore. The fix checks names against the 21 explicit server field lists, retaining a strict allowlist. An isolated test now calls the actual restore function and verifies food dates, meal, quantity, macros, catalog ID, nutrition targets, preferences, workout session state, repeated restore, pending-edit preservation, and deletion. A full second-device restore, concurrent editing, and resolution of conflicts remain **NOT TESTED** on hardware. There is no manual conflict-resolution flow.

## Real-device and cloud observations

Read-only ADB access to the separate Cubyfit Dev package found one account SQLite database, schema version 10, backup `enabled`, zero pending operations, zero failed operations, zero conflict operations, one local food entry, and eight stored cloud revision markers before the test. The last completed cloud check then was `2026-11-15T18:49:16.598Z`. A matching profile was found in development `syncRecords`; that owner has one active food entry, one active nutrition target, and the food payload has `catalog_food_id`. Recent development logs contained the historical validation error and later authenticated successful sync calls.

After owner approval, `npx convex dev --once --typecheck enable` completed against `greedy-scorpion-117` at 19:50:51 local development-host time, and `health:ping` returned `{ "ok": true }`. Cubyfit Dev opened normally with existing data visible. One habit named **Sync audit test** was created through the app. A read-only SQLite check found it with zero pending/failed operations; a development-admin read-only query matched the cloud habit to the same owner and ID. The same test habit was then deleted through the app. It disappeared locally, the outbox and failure counts returned to zero, and the matching cloud record became a deletion tombstone at revision 2. No other record was created, edited, or deleted. No LogBox validation error appeared during this test. After a later Metro Fast Refresh, an immediate tap briefly showed a “session is still starting” alert and a navigation development message; this was not a Convex validation error, and that navigation flow was not retested. The habit test proves the tested create/delete path, not every entity or a full restore. Forced offline/reconnect and second-device restore were not performed.

## Error reporting

Convex's browser logger, React Native LogBox, and Sentry are reporting a real server rejection; they are not the cause. Logging remains enabled. The new queue diagnostic uses only entity, action, a random operation-ID prefix, category, retry/blocked state and a generic message; it does not log auth tokens or record contents. Sentry's existing reporting policy remains unchanged and rate limited. The UI shows persistent errors without repeated modal alerts.

## Files changed for this audit

- Backend deployed to development with approval: `convex/sync.ts`, new `convex/syncContract.ts`, and CLI-regenerated `convex/_generated/api.d.ts`.
- Local queue, restore and UI: `src/data/schema.ts`, `src/data/syncOrder.ts`, `src/data/syncLocal.ts`, `src/services/syncEngine.ts`, new `src/services/syncFailures.ts`, `src/state/sync.tsx`, `src/app/cloud-sync.tsx`.
- Tests: `tests/sync.test.ts`, `tests/sync-engine.test.ts`, new `tests/sync-restore.test.ts`.
- This report.

Pre-existing unrelated working-tree edits, including changes already present in `src/data/db.ts` and `src/state/sync.tsx`, were preserved. No files were reset.

## Verification and development commands

At audit time, the focused sync/food/auth/restore tests passed. The final full suite passed **314 tests in 44 files**, with one pre-existing skip. `npx tsc --noEmit`, `npx expo lint`, and `git diff --check` passed after the final test fix. Tests used isolated SQLite databases and Convex test identities; the only live development mutations were the owner-approved app habit create/delete.

After **any** change under `convex/` or any synchronized SQLite column, run `npx vitest run tests/sync.test.ts tests/sync-engine.test.ts`, then review and explicitly deploy the development backend with `npx convex dev --once --typecheck enable`. Confirm `.env.local` points to `greedy-scorpion-117` before running it. This command targets the configured development deployment and was run once in this audit after owner approval. Do not assume Metro redeploys Convex functions. Run `npx tsc --noEmit` and `npx expo lint` before handing off an app change. Production deployment is outside this workflow.

### Exact approved backend deployment

Two backend source files differed from the pre-audit baseline: `convex/sync.ts` and new `convex/syncContract.ts`. The latter holds the existing 21 explicit row field lists, with the six workout fields added. `sync.ts` imports that list, validates workout session values and millisecond timestamps, fixes habit reminder time validation, and checks progress `updated_at` timestamps. The mutation's authentication, owner checks, operation ID deduplication, parent checks, revision rules, and delete behavior are unchanged. No Convex schema table/index change or data migration was required. The Convex CLI deployed the functions from the current `convex/` directory to `greedy-scorpion-117` after explicit owner approval. It did not target production. The CLI regenerated `convex/_generated/api.d.ts` to include the helper module's type import.
