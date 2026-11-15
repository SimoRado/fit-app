# Exercise library and gym-day planning foundation

## Catalog audit

- Upstream dataset: 1,324 source identifiers.
- App catalog: 1,321 canonical text records plus three source-ID aliases. The aliases preserve stable references for all 1,324 upstream identifiers while removing duplicate records.
- Included fields: stable source ID, name, category/body part, equipment, primary muscle group, target muscle, secondary muscles, localized instruction text, and localized instruction steps.
- Excluded fields: images, GIFs, media IDs, image paths, GIF paths, and media attribution fields. No exercise photos, GIFs, videos, media URLs, or media dependencies are used by the app.
- Attribution: `src/data/catalog/LICENSE` retains the upstream MIT license covering the text dataset. The app does not include the separately licensed Gym visual media.

## Storage architecture

The offline catalog is imported into each account's existing SQLite database by `src/data/exerciseCatalog.ts`.

- `exercises` retains stable exercise IDs and custom-exercise support.
- `exercise_catalog` stores catalog-only metadata and searchable normalized keys.
- `exercise_catalog_sources` maps all upstream IDs to their canonical local exercise IDs.
- User records remain in the existing `routines`, `routine_exercises`, `workouts`, `workout_exercises`, and `workout_sets` tables.
- Existing `catalog:<source_id>` IDs, including seed aliases such as Pull-Up, preserve routines, completed workouts, and progress history when metadata is refreshed.

No database was reset and no existing migration was rewritten.

## Exercise browser and routine flow

- The shared exercise picker searches names, muscle groups, equipment, and categories case-insensitively through SQLite.
- Muscle, equipment, and category filters can be cleared in one action.
- Exercise details show only dataset-backed fields: category, muscle group, equipment, target muscle, secondary muscles, and localized instruction steps.
- The picker is used by both routine creation and active/manual workout editing.
- Routine drafts prevent accidental duplicate exercises, preserve their draft while the picker is open, and now support Move up, Move down, remove, and replacement actions.

## Weekly gym-day planning

`src/core/gymSchedule.ts` adds a small, forward-compatible weekly-plan model without a new database family or backend endpoint.

- A weekday can have one reusable routine, a weekly rest day, or no plan.
- Plans are saved in the existing account-local `preferences` table under `training.weekly-plan.v1`.
- Existing preference synchronization carries the weekly plan through the established Convex sync path; no new Convex schema or cloud resource was required.
- Existing date-specific `rest_days` remain intact for one-off rest days. Weekly rest plans are displayed alongside them rather than overwriting them.
- The Train week strip is tappable and opens a plan sheet for assigning a routine, a weekly rest day, or clearing the plan.

## Offline, account, and media behavior

- Catalog import and search work from the bundled JSON after the initial local SQLite import; no network or R2 request is involved.
- Account-specific SQLite databases continue to isolate custom exercises, routines, history, and preferences.
- No media field is populated (`media_uri` remains null). Future media can be introduced by mapping an owned/licensed asset reference to that field, without changing exercise IDs or the routine/workout relationships.

## Verification

- TypeScript: passed (`npx tsc --noEmit`).
- ESLint: passed (`npx expo lint`).
- Automated tests: 37 files passed; 230 tests passed and 1 skipped.
- Added tests cover schedule parsing, persistence format, one-plan-per-weekday behavior, malformed data safety, and non-mutating routine reordering.
- Existing catalog tests cover canonical records, all source aliases, stable IDs, catalog search/filtering, instructions, absence of media fields, active-workout references, and account isolation.
- Expo Doctor: 19 of 20 checks passed. The only outstanding check is the pre-existing set of 13 Expo SDK 58 patch-version mismatches. Dependencies were deliberately not changed as part of this feature task.

## Data boundary and remaining device checks

- `.gitignore` contains a root rule that prevents the raw `exercises-dataset-main` source tree from being re-added after its existing tracked deletion is committed. The working tree already has its 2,656 raw image/video/source files removed; this report does not alter or restore those pre-existing deletions.
- Only the transformed text catalog and its required MIT license remain in Cubyfit's app source.
- No APK was built or installed, no Metro server was started, and no device database was changed.
- A future device pass should verify the picker inside both routine editing and active workout editing, the weekly planning sheet in Shore and Abyss, and persistence after an app restart.
