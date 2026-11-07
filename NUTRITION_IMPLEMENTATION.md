# Nutrition implementation

## Scope

Nutrition is a local-first feature in the V4 Bloom application. It has a five-destination floating navigation bar, a daily diary, seven-day calendar, week view, manual targets, meals, a food sheet, local saved-food search, portion scaling, and a target-driven filling vessel. No external food database, barcode scanner, or AI estimate is used. The HTML's sample foods and statistics were not imported.

## Data and calculations

- `nutrition_preferences`: per-profile enabled flag. An absent row means tracking is on; turning it off does not delete history.
- `nutrition_targets`: dated manual calorie and macro targets with stable profile-and-day IDs. A day uses the latest target whose `effective_day` is on or before that day. Target edits on the same day update that day's row; later target changes do not rewrite earlier dates.
- `custom_foods`: user-entered values per 100 g.
- `food_entries`: diary entries with a meal, local `YYYY-MM-DD` date, exact user-supplied nutrients, optional grams, and an optional per-100 g reference snapshot. Deleting a custom food preserves diary entries.

The next SQLite migration creates the four tables and their indexes and adds their INSERT/UPDATE/DELETE triggers to the existing persistent sync outbox. Existing databases migrate in place; no reset or legacy upload is performed. Stable IDs are generated locally. Each account already uses a separate SQLite file, and every nutrition row references that file's profile ID. SQL mutations scope reads, updates and deletes to the active profile.

Daily calories and macros are sums of saved entries. Remaining calories are `target - consumed`; over-target days display a positive `KCAL OVER` amount. The vessel fill is clamped to its shape while the consumed total is not capped. A saved food with per-100 g values scales each nutrient by `grams / 100`, storing full numeric precision. Display rounding does not change saved values. Manual calories are never overwritten by the 4/4/9 kcal-per-gram macro estimate.

Week averages count only days with at least one entry, including an explicitly logged zero-calorie entry. Near-target means within 10% of that day's target. Unlogged days are excluded from near-target and protein-day counts. The seven-day window can page backward, and all date keys use local calendar days.

## Cloud synchronization and security

The existing `sync_outbox`, `sync_versions`, operation IDs, conflict handling, retry cycle, and restore path now include nutrition preferences, targets, custom foods, and entries. Parent-before-child uploads and child-before-parent deletions preserve references. The existing sync choice still controls whether local records upload; nutrition does not create a separate sync path. Failed uploads stay in SQLite for retry.

Convex `sync.apply` validates each new row, authenticates with Clerk, derives the owner from the verified identity, verifies that the profile and optional custom-food parent belong to that owner, and retains operation-ID deduplication and revision conflict checks. `sync.page` remains scoped to the authenticated owner. No client-supplied owner identity is trusted. The functions were updated on the configured **development** Convex deployment with `npx convex dev --once`; production was untouched.

## UI and settings

The Nutrition screen follows the final V4 source: large display heading, Today/Week pill, seven circular day indicators, rounded calorie hero, organic SVG fill, macro pebbles, expandable Breakfast/Lunch/Dinner/Snacks sections, and a rounded bottom sheet. Food search includes only saved custom foods and previously logged entries. A previous entry without a per-100 g reference can be reused as a serving. The target sheet also manages saved custom foods and the tracking toggle. The Home dashboard shows real nutrition values only when tracking is enabled and a target or entry exists. Profile links to Nutrition; its settings button opens the target sheet.

## Validation

The manual form requires a name, local date, meal, calorie value and all macro values (explicit zero is accepted). Inputs must be numeric, nonnegative and within limits; portions must be positive. Calorie targets must be positive. Custom-food reference values are validated before saving. Edit and delete actions update local rows and the screen state.

## Testing and limits

Automated tests cover daily totals, over-target behavior, portion scaling, local dates and month boundaries, unlogged-day statistics, numeric validation, migration, edits/deletes, account foreign keys, offline queue behavior, Convex authentication, owner isolation, and duplicate-operation handling. The final test run passed 89 tests; TypeScript and lint passed. Android and iOS JavaScript exports passed. Expo Doctor passed 19 of 20 checks; its remaining check flags pre-existing minor or patch version differences in Expo, Expo Router, Expo Notifications, and react-native-safe-area-context.

The desktop browser automation policy blocks direct inspection of the prototype's `file:` URL. The final Nutrition HTML/CSS source was inspected, but a visual screenshot comparison with the prototype and a Redmi device check remain pending. The Redmi must be connected for live add/edit/delete, persistence, offline/reconnect and fill-level verification. The development backend is updated, but live cloud restoration and retries still need device testing.

Future work: external food search from a properly sourced provider, barcode scanning, a reviewed optional calorie estimate, and the designer's animation phase. These are not implied to be working now.
